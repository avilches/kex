import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Workspace } from "@/modules/workspaces";
import { focusedTabId } from "@/modules/workspaces";
import { routeAgentNotification } from "../lib/route";
import type { AgentSignal } from "../lib/types";
import { useAgentStore } from "../store/agentStore";
import { handleSessionMeta, handleSignal, type Ctx } from "./AgentNotificationsBridge";

vi.mock("@/modules/workspaces", () => ({
  findTabPane: () => ({ tab: { kind: "terminal", cwd: "/p/proj", title: "" } }),
  focusedTabId: vi.fn(() => null),
}));
vi.mock("@/modules/terminal", () => ({
  leafIdForPty: (id: number) => `tab-${id}`,
}));
vi.mock("@/modules/terminal/lib/oscTitleStore", () => ({
  getOscTitle: () => undefined,
}));
vi.mock("@/lib/native", () => ({
  native: { gitResolveRepo: vi.fn(() => Promise.resolve(null)) },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/useTauriListen", () => ({ useTauriListen: vi.fn() }));
vi.mock("../lib/route", () => ({ routeAgentNotification: vi.fn() }));
vi.mock("../lib/hibernatingTabs", () => ({ isHibernating: () => false }));
vi.mock("../lib/agentSessionRestore", () => ({
  applyStagedSnapshot: () => false,
}));
vi.mock("../lib/agentSnapshotSync", () => ({
  startAgentSnapshotSync: vi.fn(),
}));
vi.mock("../lib/useWindowFocus", () => ({ useWindowFocus: () => false }));

const ws = {
  id: "ws-1",
  title: "proj",
  paneTree: {},
  activePaneId: "pane-1",
} as unknown as Workspace;

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    workspaces: [ws],
    activeWorkspaceId: "ws-1",
    focused: false,
    onActivate: vi.fn(),
    ...over,
  };
}

function sig(kind: AgentSignal["kind"], extra: Partial<AgentSignal> = {}): AgentSignal {
  return { id: 1, kind, agent: null, ...extra };
}

const session = () => useAgentStore.getState().sessions["tab-1"];
const sub = (id: string) => ({ id, agentType: "Explore", description: "" });

describe("handleSignal with background subagents", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
    vi.mocked(routeAgentNotification).mockClear();
    vi.mocked(focusedTabId).mockReturnValue(null);
  });

  test("a Stop with a live subagent stays working and does not notify", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("SubagentStart", { agentId: "a1", agentType: "Explore" }), ctx());
    handleSignal(sig("Stop", { backgroundSubagents: [sub("a1")] }), ctx());
    expect(session().status).toBe("working");
    expect(routeAgentNotification).not.toHaveBeenCalled();
  });

  test("the Stop of the turn opened after the last subagent raises attention once", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("SubagentStart", { agentId: "a1", agentType: "Explore" }), ctx());
    handleSignal(sig("Stop", { backgroundSubagents: [sub("a1")] }), ctx());
    handleSignal(sig("SubagentStop", { agentId: "a1", agentType: "Explore" }), ctx());
    expect(session().status).toBe("working");
    expect(routeAgentNotification).not.toHaveBeenCalled();
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("Stop", { backgroundSubagents: [] }), ctx());
    expect(session().status).toBe("attention");
    expect(routeAgentNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(routeAgentNotification).mock.calls[0][0].kind).toBe("attention");
  });

  test("a Stop with no subagents and the tab in view goes idle without notifying", () => {
    vi.mocked(focusedTabId).mockReturnValue("tab-1");
    handleSignal(sig("UserPromptSubmit"), ctx({ focused: true }));
    handleSignal(sig("Stop"), ctx({ focused: true }));
    expect(session().status).toBe("idle");
    expect(routeAgentNotification).not.toHaveBeenCalled();
  });

  test("a Stop without the subagent list behaves like the old Stop", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("Stop"), ctx());
    expect(session().status).toBe("attention");
    expect(routeAgentNotification).toHaveBeenCalledTimes(1);
  });

  test("a final Stop with an empty list clears a record left by a lost SubagentStop", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("SubagentStart", { agentId: "ghost", agentType: "Explore" }), ctx());
    handleSignal(sig("Stop", { backgroundSubagents: [] }), ctx());
    expect(session().subagents).toEqual({});
    expect(session().status).toBe("attention");
  });

  test("a SubagentStart before any session creates it", () => {
    handleSignal(sig("SubagentStart", { agentId: "a1", agentType: "Explore" }), ctx());
    expect(Object.keys(session().subagents)).toEqual(["a1"]);
  });

  test("a SubagentStart or SubagentStop without an agent id is ignored", () => {
    handleSignal(sig("SubagentStart"), ctx());
    handleSignal(sig("SubagentStop"), ctx());
    expect(session()).toBeUndefined();
  });

  test("a SubagentStop for an unknown agent or tab does nothing", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("SubagentStop", { agentId: "nope" }), ctx());
    handleSignal(sig("SubagentStop", { id: 9, agentId: "a1" }), ctx());
    expect(session().subagents).toEqual({});
    expect(session().status).toBe("working");
  });

  test("SessionEnd forgets the subagents and stops the spinner they were keeping", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("SubagentStart", { agentId: "a1", agentType: "Explore" }), ctx());
    handleSignal(sig("Stop", { backgroundSubagents: [sub("a1")] }), ctx());
    handleSignal(sig("SessionEnd"), ctx());
    expect(session().subagents).toEqual({});
    expect(session().status).toBe("idle");
  });
});

describe("handleSessionMeta", () => {
  const meta = (launchKnown: boolean) => ({
    tabId: "tab-1",
    sessionId: "s-1",
    cwdLaunch: "/p/proj",
    sessionTitle: "",
    model: "opus",
    transcriptPath: "/p/t.jsonl",
    launchKnown,
  });

  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
  });

  test("creates an idle session at SessionStart when no shell line named the agent", () => {
    handleSessionMeta(meta(false), ctx());
    expect(session().status).toBe("idle");
    expect(session().meta?.launchKnown).toBe(false);
    expect(session().meta?.sessionId).toBe("s-1");
  });

  test("a recognised launcher keeps its session and only records the metadata", () => {
    handleSignal(sig("started", { agent: "claude" }), ctx());
    const startedAt = session().startedAt;
    handleSessionMeta(meta(true), ctx());
    expect(session().startedAt).toBe(startedAt);
    expect(Object.keys(useAgentStore.getState().sessions)).toEqual(["tab-1"]);
    expect(session().meta?.launchKnown).toBe(true);
  });

  test("an empty model from a later event keeps the one already known", () => {
    handleSessionMeta(meta(false), ctx());
    handleSessionMeta({ ...meta(false), model: "" }, ctx());
    expect(session().meta?.model).toBe("opus");
  });

  test("a later prompt on the session created by SessionStart does not duplicate it", () => {
    handleSessionMeta(meta(false), ctx());
    handleSignal(sig("UserPromptSubmit"), ctx());
    expect(Object.keys(useAgentStore.getState().sessions)).toEqual(["tab-1"]);
    expect(session().status).toBe("working");
    expect(session().meta?.launchKnown).toBe(false);
  });
});
