// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ destroy: vi.fn() }) }));
vi.mock("./workspaceState", () => ({ claimClose: () => false, flushWorkspaceState: async () => {} }));
vi.mock("@/modules/agents/lib/agentSessionRestore", () => ({
  previewResumeCmd: vi.fn(async () => null),
  seedRestorePlan: vi.fn(),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: {
    getState: () => ({ autofocusMode: "off", randomWorkspaceColor: false, workspacePaneLimit: 8 }),
  },
}));

import {
  previewResumeCmd,
  seedRestorePlan,
  type RestorePlan,
} from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { AgentNotification, AgentSession } from "@/modules/agents/lib/types";
import { useWorkspaces } from "./useWorkspaces";
import { allPanes } from "./splitNode";
import type { Tab, Workspace } from "./types";

type Hook = ReturnType<typeof useWorkspaces>;

const term = (id: string, restoreOnRestart?: boolean): Tab => ({ id, kind: "terminal", restoreOnRestart });
const sleeping = (id: string): Tab => ({ id, kind: "terminal", hibernation: { at: 1, agent: "claude" } });
const editor = (id: string): Tab => ({ id, kind: "editor", path: `/tmp/${id}`, dirty: false, preview: false });

const planFor = (tabId: string): RestorePlan => ({
  tabId,
  agent: "claude",
  resumeCmd: `claude --resume ${tabId}`,
  attemptedCmd: "",
  cwdLaunch: "/tmp/project",
  errorReason: "",
});

const session = (tabId: string, status: "attention" | "idle" = "attention"): AgentSession => ({
  tabId,
  workspaceId: "b",
  agent: "claude",
  status,
  startedAt: 1,
  lastActivityAt: 2,
  attentionSince: status === "attention" ? 3 : null,
  restored: false,
  restoreError: false,
  subagents: {},
});

const attentionNote = (tabId: string): AgentNotification => ({
  id: `n-${tabId}`,
  source: "terminal",
  tabId,
  workspaceId: "b",
  agent: "claude",
  kind: "attention",
  at: 1,
  read: false,
});
const makeWs = (id: string, tabs: Tab[], over: Partial<Workspace> = {}): Workspace => ({
  id,
  title: "",
  paneTree: { kind: "pane", id: `p-${id}`, tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: `p-${id}`,
  ...over,
});
const tabIds = (ws: Workspace | undefined) => allPanes(ws!.paneTree).flatMap((p) => p.tabs.map((t) => t.id));

function mount(initialWorkspaces: Workspace[]) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let latest: Hook | undefined;
  function Harness() {
    latest = useWorkspaces({ initialWorkspaces });
    return null;
  }
  act(() => root.render(createElement(Harness)));
  return {
    get h(): Hook {
      return latest!;
    },
    unmount: () => act(() => root.unmount()),
  };
}

describe("undo close workspace", () => {
  let view: ReturnType<typeof mount> | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(previewResumeCmd).mockResolvedValue(null);
    useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
  });
  afterEach(() => view?.unmount());

  it("brings back a workspace that folded away with its last tab, in its position and selected", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1")]), makeWs("c", [term("c1")])]);
    act(() => view!.h.setActiveWorkspaceId("b"));

    act(() => view!.h.closeTab("b", "b1"));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "c"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });

    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b", "c"]);
    expect(view.h.activeWorkspaceId).toBe("b");
    const restored = view.h.workspaces[1];
    expect(tabIds(restored)).toHaveLength(1);
    expect(tabIds(restored)[0]).not.toBe("b1");
  });

  it("restores everything the workspace held after an explicit close", async () => {
    const rich = makeWs("b", [term("b1"), term("b2")], {
      title: "Backend",
      color: "#ff0000",
      icon: "rocket",
      groupId: "g1",
      actions: [{ id: "ac-1", name: "dev", kind: "script", command: "pnpm dev", ownButton: false }],
    });
    view = mount([makeWs("a", [term("a1")]), rich]);

    act(() => view!.h.closeWorkspace("b"));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });

    const restored = view.h.workspaces[1]!;
    expect(restored).toMatchObject({ id: "b", title: "Backend", color: "#ff0000", icon: "rocket", groupId: "g1" });
    expect(tabIds(restored)).toHaveLength(2);
    expect(restored.actions?.map((a) => a.id)).toEqual(["ac-1"]);
  });

  it("returns tabs closed earlier into the restored workspace on later undos", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1"), term("b2")])]);

    act(() => view!.h.closeTab("b", "b2"));
    act(() => view!.h.closeTab("b", "b1"));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(tabIds(view.h.workspaces[1])).toHaveLength(1);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
    expect(tabIds(view.h.workspaces[1])).toHaveLength(2);
  });

  it("returns every tab of one bulk close with a single undo, in their old order", async () => {
    view = mount([makeWs("a", [term("a1"), term("a2"), term("a3"), term("a4")])]);

    act(() => {
      view!.h.closeTab("a", "a2", "cb-1");
      view!.h.closeTab("a", "a3", "cb-1");
    });
    act(() => view!.h.closeTab("a", "a4"));
    expect(tabIds(view.h.workspaces[0])).toEqual(["a1"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(tabIds(view.h.workspaces[0])).toHaveLength(2);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(tabIds(view.h.workspaces[0])).toHaveLength(4);
    expect(tabIds(view.h.workspaces[0])[0]).toBe("a1");
  });

  it("returns a workspace and the tabs of the bulk close that emptied it with one undo", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1"), term("b2")])]);

    act(() => {
      view!.h.closeTab("b", "b1", "cb-1");
      view!.h.closeTab("b", "b2", "cb-1");
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
    expect(tabIds(view.h.workspaces[1])).toHaveLength(2);
  });

  it("can undo closing a workspace without tabs or actions that the user closed", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [], { title: "Notes" })]);

    act(() => view!.h.closeWorkspace("b", true));
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("does not offer a workspace that is already open again", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1")])]);
    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });
    await act(async () => {
      await view!.h.reopenClosed();
    });
    expect(view.h.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("restores a workspace with a hibernated tab still asleep and with the same id", async () => {
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [sleeping("b1"), term("b2")])]);
    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });
    const restored = view.h.workspaces[1]!;
    const [first, second] = allPanes(restored.paneTree)[0]!.tabs;
    expect(first).toMatchObject({ id: "b1", hibernation: { at: 1, agent: "claude" } });
    expect(second!.id).not.toBe("b2");
    expect((second as { hibernation?: unknown }).hibernation).toBeUndefined();
  });

  it("moves the agent session and its resume plan to the reopened tab's new id", async () => {
    const plan = planFor("b1");
    vi.mocked(previewResumeCmd).mockResolvedValue(plan);
    useAgentStore.setState({
      sessions: { b1: session("b1") },
      notifications: [attentionNote("b1")],
      closedSessions: {},
    });
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1"), editor("b2")])]);

    act(() => view!.h.closeTab("b", "b1"));
    await act(async () => {
      await view!.h.reopenClosed();
    });

    const restored = view.h.workspaces[1]!;
    const newId = tabIds(restored).find((id) => id !== "b2")!;
    expect(newId).not.toBe("b1");

    expect(previewResumeCmd).toHaveBeenCalledWith("b1");
    expect(seedRestorePlan).toHaveBeenCalledWith(newId, plan);

    const store = useAgentStore.getState();
    expect(store.closedSessions).toEqual({});
    expect(store.sessions[newId]).toMatchObject({
      tabId: newId,
      workspaceId: "b",
      status: "attention",
      attentionSince: 3,
    });
    expect(store.notifications).toEqual([
      expect.objectContaining({ tabId: newId, workspaceId: "b", kind: "attention" }),
    ]);
  });

  it("seeds a plan and moves each session to the new id of every terminal of a reopened workspace", async () => {
    vi.mocked(previewResumeCmd).mockImplementation(async (tabId) => planFor(tabId));
    useAgentStore.setState({
      sessions: { b1: session("b1"), b2: session("b2", "idle") },
      notifications: [attentionNote("b1")],
      closedSessions: {},
    });
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1"), term("b2")])]);

    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });

    const restored = view.h.workspaces[1]!;
    const [newB1, newB2] = tabIds(restored);
    expect(newB1).not.toBe("b1");
    expect(newB2).not.toBe("b2");

    expect(previewResumeCmd).toHaveBeenCalledWith("b1");
    expect(previewResumeCmd).toHaveBeenCalledWith("b2");
    expect(seedRestorePlan).toHaveBeenCalledWith(newB1, expect.objectContaining({ tabId: "b1" }));
    expect(seedRestorePlan).toHaveBeenCalledWith(newB2, expect.objectContaining({ tabId: "b2" }));

    const store = useAgentStore.getState();
    expect(store.closedSessions).toEqual({});
    expect(store.sessions[newB1!]).toMatchObject({ tabId: newB1, status: "attention", attentionSince: 3 });
    expect(store.notifications).toEqual([
      expect.objectContaining({ tabId: newB1, workspaceId: "b" }),
    ]);
  });

  it("does not fetch or seed a resume plan for a terminal with Run on start off", async () => {
    vi.mocked(previewResumeCmd).mockImplementation(async (tabId) => planFor(tabId));
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [term("b1", false), term("b2")])]);

    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });

    const restored = view.h.workspaces[1]!;
    const [newB1, newB2] = tabIds(restored);
    expect(previewResumeCmd).toHaveBeenCalledTimes(1);
    expect(previewResumeCmd).toHaveBeenCalledWith("b2");
    expect(seedRestorePlan).toHaveBeenCalledTimes(1);
    expect(seedRestorePlan).toHaveBeenCalledWith(newB2, expect.objectContaining({ tabId: "b2" }));
    expect(seedRestorePlan).not.toHaveBeenCalledWith(newB1, expect.anything());
  });

  it("keeps the id of a hibernated tab and does not look up or seed a plan for it", async () => {
    useAgentStore.setState({
      sessions: { b1: session("b1") },
      notifications: [attentionNote("b1")],
      closedSessions: {},
    });
    view = mount([makeWs("a", [term("a1")]), makeWs("b", [sleeping("b1")])]);

    act(() => view!.h.closeWorkspace("b"));
    await act(async () => {
      await view!.h.reopenClosed();
    });

    expect(tabIds(view.h.workspaces[1])).toEqual(["b1"]);
    expect(previewResumeCmd).not.toHaveBeenCalled();
    expect(seedRestorePlan).not.toHaveBeenCalled();

    const store = useAgentStore.getState();
    expect(store.sessions.b1).toMatchObject({ tabId: "b1", status: "attention" });
    expect(store.notifications).toEqual([expect.objectContaining({ tabId: "b1" })]);
  });
});

describe("undo close of a hibernated tab", () => {
  let view: ReturnType<typeof mount> | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({ sessions: {}, notifications: [], closedSessions: {} });
  });
  afterEach(() => view?.unmount());

  it("closes it without a session to stash and reopens it awake with a new id and a seeded plan", async () => {
    vi.mocked(previewResumeCmd).mockResolvedValue(planFor("b1"));
    view = mount([makeWs("b", [sleeping("b1"), term("b2")])]);

    act(() => view!.h.closeTab("b", "b1"));
    expect(tabIds(view.h.workspaces[0])).toEqual(["b2"]);

    await act(async () => {
      await view!.h.reopenClosed();
    });
    const ids = tabIds(view.h.workspaces[0]);
    expect(ids).toHaveLength(2);
    const reopened = allPanes(view.h.workspaces[0]!.paneTree)[0]!.tabs.find((t) => t.id !== "b2")!;
    expect(reopened.id).not.toBe("b1");
    expect((reopened as { hibernation?: unknown }).hibernation).toBeUndefined();
    expect(previewResumeCmd).toHaveBeenCalledWith("b1");
    expect(seedRestorePlan).toHaveBeenCalledWith(reopened.id, expect.objectContaining({ tabId: "b1" }));
  });
});
