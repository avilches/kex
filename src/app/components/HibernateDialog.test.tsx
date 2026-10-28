// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import { HibernateDialog, type DialogMode } from "./HibernateDialog";

vi.mock("@/modules/theme/ThemeProvider", () => ({ useTheme: () => ({ resolvedMode: "dark" }) }));
vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  previewResumeCmd: vi.fn(async () => null),
}));
vi.mock("@/modules/workspaces/WorkspaceMark", () => ({ WorkspaceMark: () => null }));
vi.mock("@/modules/workspaces/lib/useAgentTabTitle", () => ({
  useAgentTabTitle: (tab: Tab) => ({ displayTitle: tab.kind === "terminal" ? (tab.title ?? "shell") : "", isRunning: false }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const term = (id: string, over: Record<string, unknown> = {}): Tab => ({ id, kind: "terminal", title: id, ...over }) as Tab;
const doc = (id: string): Tab => ({ id, kind: "editor", path: `/a/${id}.ts`, dirty: true, preview: false }) as Tab;
const ws = (tabs: Tab[], over: Partial<Workspace> = {}): Workspace =>
  ({
    id: "w1",
    title: "W",
    paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
    activePaneId: "p1",
    ...over,
  }) as Workspace;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

function render(props: { mode: DialogMode; workspace: Workspace; tabIds?: string[] }) {
  const onConfirm = vi.fn();
  act(() => {
    root.render(
      <HibernateDialog
        workspace={props.workspace}
        mode={props.mode}
        tabIds={props.tabIds}
        onClose={() => {}}
        onConfirm={onConfirm}
        onSaveTab={async () => null}
        onGoToTab={() => {}}
        onStopBusy={() => {}}
      />,
    );
  });
  return onConfirm;
}

function mount(props: { mode: DialogMode; tabs: Tab[] }) {
  const tabIds = props.mode === "close" ? undefined : props.tabs.map((t) => t.id);
  return render({ mode: props.mode, workspace: ws(props.tabs), tabIds });
}

const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

function workingAgent(tabId: string) {
  useAgentStore.setState({
    sessions: { [tabId]: { tabId, workspaceId: "w1", agent: "claude", status: "working", restoreError: false, meta: { sessionId: "s" } } },
  } as never);
}

describe("HibernateDialog", () => {
  it("titles and labels itself after the mode", () => {
    workingAgent("t1");
    mount({ mode: "close-tab", tabs: [term("t1")] });
    expect(text()).toContain("Close tab?");
    expect(button("Close")).toBeDefined();
    expect(button("Cancel")).toBeDefined();
  });

  it("has no Don't ask me again checkbox, no process or script sections and no Run on start button", () => {
    workingAgent("t1");
    mount({ mode: "close-tab", tabs: [term("t1")] });
    expect(text()).not.toContain("Don't ask me again");
    expect(text()).not.toContain("Running processes");
    expect(text()).not.toContain("Running scripts");
    expect(button("Run on start")).toBeUndefined();
    expect(document.body.querySelector('[role="checkbox"]')).toBeNull();
  });

  it("confirms with the button", () => {
    workingAgent("t1");
    const onConfirm = mount({ mode: "close-tab", tabs: [term("t1")] });
    act(() => button("Close")!.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("tells a working agent that closing kills it and suggests waiting", () => {
    workingAgent("t1");
    mount({ mode: "close-tab", tabs: [term("t1")] });
    expect(text()).toContain("Agents that are working and will be killed");
    expect(text()).toContain("Consider waiting");
    expect(button("Kill")).toBeUndefined();
  });

  it("lists an unsaved document when closing a workspace", () => {
    mount({ mode: "close", tabs: [doc("e1"), term("t1")] });
    expect(text()).toContain("Unsaved documents that will be discarded");
  });

  it("mentions the Actions a closed workspace deletes", () => {
    const actions = [{ id: "ac-1", name: "dev", kind: "script", command: "pnpm dev", ownButton: false }];
    render({ mode: "close", workspace: ws([term("t1")], { actions } as Partial<Workspace>) });
    expect(text()).toContain("1 action will be deleted.");
  });

  describe("hibernate mode", () => {
    it("says it waits for a working agent and offers Kill, which closing does not", () => {
      workingAgent("t1");
      mount({ mode: "hibernate", tabs: [term("t1")] });
      expect(text()).toContain("Waiting for these agents to finish");
      expect(text()).toContain("will hibernate as soon as the agents are done");
      expect(button("Kill")).toBeDefined();
      expect(button("Hibernate now")).toBeDefined();
    });

    it("hibernates by itself once there is nothing left to ask", () => {
      const onConfirm = mount({ mode: "hibernate", tabs: [term("t1")] });
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe("close modes", () => {
    it("never confirms by itself, even with nothing to ask", () => {
      const onConfirm = mount({ mode: "close-tab", tabs: [term("t1")] });
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
