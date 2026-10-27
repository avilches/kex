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
const ws = (tabs: Tab[]): Workspace =>
  ({
    id: "w1",
    title: "W",
    paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
    activePaneId: "p1",
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

function mount(props: { mode: DialogMode; tabs: Tab[]; processes?: { tabId: string; label: string }[] }) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  act(() => {
    root.render(
      <HibernateDialog
        workspace={ws(props.tabs)}
        mode={props.mode}
        tabIds={props.mode === "close" ? undefined : props.tabs.map((t) => t.id)}
        processes={props.processes ?? []}
        onClose={onClose}
        onConfirm={onConfirm}
        onSaveTab={async () => null}
        onGoToTab={() => {}}
        onStopBusy={() => {}}
      />,
    );
  });
  return { onConfirm, onClose };
}

const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const checkbox = () => document.body.querySelector('[role="checkbox"]') as HTMLElement | null;

function workingAgent(tabId: string) {
  useAgentStore.setState({
    sessions: { [tabId]: { tabId, workspaceId: "w1", agent: "claude", status: "working", restoreError: false, meta: { sessionId: "s" } } },
  } as never);
}

describe("HibernateDialog", () => {
  it("titles and labels itself after the mode", () => {
    mount({ mode: "close-tab", tabs: [term("t1")], processes: [{ tabId: "t1", label: "vim" }] });
    expect(text()).toContain("Close tab?");
    expect(button("Close")).toBeDefined();
    expect(button("Cancel")).toBeDefined();
  });

  it("lists the running processes that will be killed", () => {
    mount({ mode: "close-tab", tabs: [term("t1")], processes: [{ tabId: "t1", label: "vim" }] });
    expect(text()).toContain("Running processes that will be killed");
    expect(text()).toContain("vim");
  });

  it("never offers Run on start: it is always saved", () => {
    mount({ mode: "hibernate", tabs: [term("t1")], processes: [{ tabId: "t1", label: "vim" }] });
    expect(button("Run on start")).toBeUndefined();
    expect(text()).not.toContain("will not come back");
  });

  describe("Don't ask me again", () => {
    it("is offered for a running process and sent on confirm when checked", () => {
      const { onConfirm } = mount({ mode: "close-tab", tabs: [term("t1")], processes: [{ tabId: "t1", label: "vim" }] });
      expect(text()).toContain("Don't ask me again");
      act(() => checkbox()!.click());
      act(() => button("Close")!.click());
      expect(onConfirm).toHaveBeenCalledWith(true);
    });

    it("is sent as false when left unchecked", () => {
      const { onConfirm } = mount({ mode: "close-tab", tabs: [term("t1")], processes: [{ tabId: "t1", label: "vim" }] });
      act(() => button("Close")!.click());
      expect(onConfirm).toHaveBeenCalledWith(false);
    });

    it("is not offered while a working agent is in the review, and it suggests waiting", () => {
      workingAgent("t1");
      mount({ mode: "close-tab", tabs: [term("t1")] });
      expect(text()).toContain("Agents that are working and will be killed");
      expect(text()).toContain("Consider waiting");
      expect(text()).not.toContain("Don't ask me again");
    });

    it("is not offered when an unsaved document is in the review", () => {
      mount({ mode: "close", tabs: [doc("e1"), term("t1")], processes: [{ tabId: "t1", label: "vim" }] });
      expect(text()).toContain("Unsaved documents that will be discarded");
      expect(text()).not.toContain("Don't ask me again");
    });

    it("is not offered when closing a workspace that also deletes Actions", () => {
      const actions = [{ id: "ac-1", name: "dev", kind: "script", command: "pnpm dev", ownButton: false }];
      act(() => {
        root.render(
          <HibernateDialog
            workspace={{ ...ws([term("t1")]), actions } as Workspace}
            mode="close"
            processes={[{ tabId: "t1", label: "vim" }]}
            onClose={() => {}}
            onConfirm={() => {}}
            onSaveTab={async () => null}
            onGoToTab={() => {}}
            onStopBusy={() => {}}
          />,
        );
      });
      expect(text()).toContain("1 action will be deleted.");
      expect(text()).not.toContain("Don't ask me again");
    });
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
      const { onConfirm } = mount({ mode: "hibernate", tabs: [term("t1")] });
      expect(onConfirm).toHaveBeenCalledWith(false);
    });
  });

  describe("close modes", () => {
    it("never confirms by itself, even with nothing to ask", () => {
      const { onConfirm } = mount({ mode: "close-tab", tabs: [term("t1")] });
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("offers no Kill on a working agent", () => {
      workingAgent("t1");
      mount({ mode: "close-tab", tabs: [term("t1")] });
      expect(button("Kill")).toBeUndefined();
    });

    it("keeps the checkbox across re-renders that hand a new tabIds array", () => {
      const tabs = [term("t1")];
      const render = () =>
        act(() => {
          root.render(
            <HibernateDialog
              workspace={ws(tabs)}
              mode="close-tab"
              tabIds={tabs.map((t) => t.id)}
              processes={[{ tabId: "t1", label: "vim" }]}
              onClose={() => {}}
              onConfirm={() => {}}
              onSaveTab={async () => null}
              onGoToTab={() => {}}
              onStopBusy={() => {}}
            />,
          );
        });
      render();
      act(() => checkbox()!.click());
      expect(checkbox()!.getAttribute("aria-checked")).toBe("true");
      render();
      expect(checkbox()!.getAttribute("aria-checked")).toBe("true");
    });
  });
});
