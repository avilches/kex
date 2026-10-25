// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/native", () => ({ native: { fsStat: vi.fn(() => Promise.resolve({})) } }));
vi.mock("@/modules/explorer/lib/contextActions", () => ({ revealInFinder: vi.fn() }));
const writeClipboardText = vi.fn((_value: string) => Promise.resolve(true));
vi.mock("@/lib/clipboard", () => ({ writeClipboardText: (v: string) => writeClipboardText(v) }));

const agentStatus = vi.fn((_agent: string) => Promise.resolve("installed" as string));
vi.mock("@/modules/agents/lib/agentIntegration", () => ({
  agentStatus: (a: string) => agentStatus(a),
  installAgent: vi.fn(() => Promise.resolve()),
}));
const installWithToast = vi.fn((_agent: string) => Promise.resolve());
vi.mock("@/modules/agents/components/IntegrationSuggestionToast", () => ({
  installWithToast: (a: string) => installWithToast(a),
}));

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { native } from "@/lib/native";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { SidebarTabMenuProvider, type SidebarTabMenuActions } from "./SidebarTabMenuContext";
import { CopyTabIdItem, TabAgentMenuItems } from "./TabAgentMenuItems";

const noop = () => {};

function open(onRevealInExplorer: (p: string) => void = noop, extra?: React.ReactNode) {
  const actions: SidebarTabMenuActions = {
    paneTabCount: () => 1,
    onClose: noop,
    onCloseOtherTabs: noop,
    onRenameTab: noop,
    onUpdateTab: noop,
    onSaveTab: noop,
    onRevealInExplorer,
    workspaceRoot: () => null,
  };
  render(
    <SidebarTabMenuProvider value={actions}>
      <ContextMenu>
        <ContextMenuTrigger>target</ContextMenuTrigger>
        <ContextMenuContent>
          <CopyTabIdItem tabId="tab-1" />
          <TabAgentMenuItems tabId="tab-1">{extra}</TabAgentMenuItems>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarTabMenuProvider>,
  );
  act(() => {
    fireEvent.contextMenu(screen.getByText("target"));
  });
}

describe("TabAgentMenuItems", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
    writeClipboardText.mockClear();
    agentStatus.mockClear();
    agentStatus.mockImplementation(() => Promise.resolve("installed"));
    installWithToast.mockClear();
  });
  afterEach(cleanup);

  it("offers only Copy Tab ID for a tab without an agent session", () => {
    open();
    expect(screen.getByText("Copy Tab ID")).toBeTruthy();
    const id = screen.getByText("tab-1");
    expect(id.className).toContain("ml-auto");
    expect(id.parentElement?.textContent).toContain("Copy Tab ID");
    expect(screen.queryByText("Claude")).toBeNull();
    expect(screen.queryByText("Copy Session ID")).toBeNull();
    expect(screen.queryByText("Transcript not created yet")).toBeNull();
  });

  it("shows the agent header and a placeholder while the transcript does not exist", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { model: "claude-opus-4" });
    open();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText("claude-opus-4")).toBeTruthy();
    expect(screen.getByText("Transcript not created yet")).toBeTruthy();
    expect(screen.queryByText("Copy Session ID")).toBeNull();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
    expect(screen.queryByText("Reveal Transcript in Finder")).toBeNull();
  });

  it("swaps the transcript actions for the placeholder when the file is missing on disk", async () => {
    vi.mocked(native.fsStat).mockRejectedValueOnce(new Error("missing"));
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { transcriptPath: "/t/dir/s.jsonl" });
    open();
    expect(await screen.findByText("Transcript not created yet")).toBeTruthy();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
  });

  it("shows the copied id under its label but no path under the transcript actions", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", {
      sessionId: "sess-9",
      transcriptPath: "/t/dir/sess-9.jsonl",
    });
    const reveal = vi.fn();
    open(reveal);
    expect(screen.getByText("Copy Session ID")).toBeTruthy();
    expect(screen.getByText("sess-9")).toBeTruthy();
    expect(screen.getByText("Open Transcript Folder")).toBeTruthy();
    expect(screen.queryByText("/t/dir")).toBeNull();
    expect(screen.queryByText("/t/dir/sess-9.jsonl")).toBeNull();

    fireEvent.click(screen.getByText("Copy Session ID"));
    expect(writeClipboardText).toHaveBeenCalledWith("sess-9");
  });

  it("opens the transcript folder through the explorer callback", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { transcriptPath: "/t/dir/s.jsonl" });
    const reveal = vi.fn();
    open(reveal);
    fireEvent.click(screen.getByText("Open Transcript Folder"));
    expect(reveal).toHaveBeenCalledWith("/t/dir");
  });

  it("places the extra items inside the agent block, right after the process entry", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "omp");
    open(noop, <div>Run on Start</div>);
    const html = document.body.innerHTML;
    expect(html.indexOf("Run on Start")).toBeLessThan(html.indexOf("Transcript not created yet"));
    expect(screen.getByText("Run on Start")).toBeTruthy();
  });

  it("still shows the extra items for a tab without an agent session", () => {
    open(noop, <div>Run on Start</div>);
    expect(screen.getByText("Run on Start")).toBeTruthy();
    expect(screen.queryByText("Transcript not created yet")).toBeNull();
  });

  it("shows OpenCode's block with its session id and no transcript actions", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "opencode");
    useAgentStore.getState().setMeta("tab-1", { sessionId: "ses_abc" });
    open(noop, <div>Run on Start</div>);
    expect(screen.getByText("OpenCode")).toBeTruthy();
    expect(screen.queryByText("Transcript not created yet")).toBeNull();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
    expect(screen.getByText("Run on Start")).toBeTruthy();

    fireEvent.click(screen.getByText("Copy Session ID"));
    expect(writeClipboardText).toHaveBeenCalledWith("ses_abc");
  });

  it("shows Codex's block with its session id and transcript actions for a rollout", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "codex");
    useAgentStore.getState().setMeta("tab-1", {
      sessionId: "019a-codex",
      transcriptPath: "/c/sessions/2026/10/23/rollout-x-019a-codex.jsonl",
    });
    const reveal = vi.fn();
    open(reveal, <div>Run on Start</div>);
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByText("Run on Start")).toBeTruthy();
    fireEvent.click(screen.getByText("Open Transcript Folder"));
    expect(reveal).toHaveBeenCalledWith("/c/sessions/2026/10/23");
  });

  it("offers no transcript actions for a Codex session without a rollout path", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "codex");
    useAgentStore.getState().setMeta("tab-1", { sessionId: "019a-codex" });
    open(noop, <div>Run on Start</div>);
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.queryByText("Transcript not created yet")).toBeNull();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
    expect(screen.getByText("Run on Start")).toBeTruthy();

    fireEvent.click(screen.getByText("Copy Session ID"));
    expect(writeClipboardText).toHaveBeenCalledWith("019a-codex");
  });
});

describe("TabAgentMenuItems without the integration", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
    agentStatus.mockClear();
    installWithToast.mockClear();
    writeClipboardText.mockClear();
  });
  afterEach(cleanup);

  function withoutIntegration(status: string) {
    agentStatus.mockImplementation(() => Promise.resolve(status));
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", {
      model: "claude-opus-4",
      sessionId: "sess-1",
      transcriptPath: "/t/dir/s.jsonl",
    });
    open(noop, <div>Run on Start</div>);
  }

  it("offers Install in place of what only the integration can fill, and keeps Run on Start", async () => {
    withoutIntegration("missing");
    expect(await screen.findByText(/Install Claude Code integration/)).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText("Run on Start")).toBeTruthy();
    expect(screen.queryByText("claude-opus-4")).toBeNull();
    expect(screen.queryByText("Copy Session ID")).toBeNull();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
    expect(screen.queryByText("Transcript not created yet")).toBeNull();
  });

  it("installs through the shared install path when chosen", async () => {
    withoutIntegration("missing");
    fireEvent.click(await screen.findByText(/Install Claude Code integration/));
    expect(installWithToast).toHaveBeenCalledWith("claude");
  });

  it("never offers to install what is already installed", async () => {
    withoutIntegration("installed");
    expect(await screen.findByText("Copy Session ID")).toBeTruthy();
    expect(screen.queryByText(/integration/)).toBeNull();
    expect(screen.getByText("claude-opus-4")).toBeTruthy();
  });

  it("shows the usual block until the status is known, without offering Install", () => {
    agentStatus.mockImplementation(() => new Promise(() => {}));
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", { sessionId: "sess-1" });
    open();
    expect(screen.getByText("Copy Session ID")).toBeTruthy();
    expect(screen.queryByText(/Install/)).toBeNull();
  });

  it("hides the dead entries and offers nothing when Install cannot run", async () => {
    withoutIntegration("malformed");
    await screen.findByText("Run on Start");
    expect(screen.queryByText(/Install/)).toBeNull();
    expect(screen.queryByText("Copy Session ID")).toBeNull();
    expect(screen.queryByText("Transcript not created yet")).toBeNull();
  });

  it("does not read the status of an agent that has no integration", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "gemini");
    open();
    expect(agentStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Gemini")).toBeTruthy();
    expect(screen.queryByText(/Install/)).toBeNull();
  });
});
