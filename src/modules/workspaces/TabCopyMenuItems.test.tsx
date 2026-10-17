// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/native", () => ({ native: { fsStat: vi.fn(() => Promise.resolve({})) } }));
vi.mock("@/modules/explorer/lib/contextActions", () => ({ revealInFinder: vi.fn() }));
const writeClipboardText = vi.fn((_value: string) => Promise.resolve(true));
vi.mock("@/lib/clipboard", () => ({ writeClipboardText: (v: string) => writeClipboardText(v) }));

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { SidebarTabMenuProvider, type SidebarTabMenuActions } from "./SidebarTabMenuContext";
import { TabCopyMenuItems } from "./TabCopyMenuItems";

const noop = () => {};

function open(onRevealInExplorer: (p: string) => void = noop) {
  const actions: SidebarTabMenuActions = {
    paneTabCount: () => 1,
    onClose: noop,
    onCloseOtherTabs: noop,
    onCloseAllTabs: noop,
    onRenameTab: noop,
    onUpdateTab: noop,
    onSaveTab: noop,
    onRevealInExplorer,
  };
  render(
    <SidebarTabMenuProvider value={actions}>
      <ContextMenu>
        <ContextMenuTrigger>target</ContextMenuTrigger>
        <ContextMenuContent>
          <TabCopyMenuItems tabId="tab-1" />
        </ContextMenuContent>
      </ContextMenu>
    </SidebarTabMenuProvider>,
  );
  act(() => {
    fireEvent.contextMenu(screen.getByText("target"));
  });
}

describe("TabCopyMenuItems", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {} });
    writeClipboardText.mockClear();
  });
  afterEach(cleanup);

  it("offers only Copy Tab ID for a tab without an agent session", () => {
    open();
    expect(screen.getByText("Copy Tab ID")).toBeTruthy();
    expect(screen.getByText("tab-1")).toBeTruthy();
    expect(screen.queryByText("Copy Session ID")).toBeNull();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
  });

  it("hides the session and transcript entries while the agent has not reported them", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    open();
    expect(screen.getByText("Copy Tab ID")).toBeTruthy();
    expect(screen.queryByText("Copy Session ID")).toBeNull();
    expect(screen.queryByText("Open Transcript Folder")).toBeNull();
  });

  it("shows the session id and transcript actions with the value under each label", () => {
    useAgentStore.getState().start("tab-1", "ws-1", "claude");
    useAgentStore.getState().setMeta("tab-1", {
      sessionId: "sess-9",
      transcriptPath: "/t/dir/sess-9.jsonl",
    });
    const reveal = vi.fn();
    open(reveal);
    expect(screen.getByText("Copy Session ID")).toBeTruthy();
    expect(screen.getByText("sess-9")).toBeTruthy();
    expect(screen.getByText("/t/dir")).toBeTruthy();
    expect(screen.getByText("/t/dir/sess-9.jsonl")).toBeTruthy();

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
});
