import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Workspace } from "@/modules/workspaces";
import { focusedTabId } from "@/modules/workspaces";
import { routeAgentNotification } from "../lib/route";
import type { AgentSignal } from "../lib/types";
import { invoke } from "@tauri-apps/api/core";
import type { AgentSession } from "../lib/types";
import { isHibernating } from "../lib/hibernatingTabs";
import { clearOscTitle } from "@/modules/terminal/lib/oscTitleStore";
import { useAgentStore } from "../store/agentStore";
import { handleSessionMeta, handleSignal, type Ctx } from "./AgentNotificationsBridge";

const UNKNOWN_PTY = vi.hoisted(() => 999);

vi.mock("@/modules/workspaces", () => ({
  findTabPane: () => ({ tab: { kind: "terminal", cwd: "/p/proj", title: "" } }),
  focusedTabId: vi.fn(() => null),
}));
vi.mock("@/modules/terminal", () => ({
  leafIdForPty: (id: number) => (id === UNKNOWN_PTY ? null : `tab-${id}`),
}));
vi.mock("@/modules/terminal/lib/oscTitleStore", () => ({
  getOscTitle: () => undefined,
  setOscTitle: vi.fn(),
  clearOscTitle: vi.fn(),
}));
vi.mock("@/lib/native", () => ({
  native: { gitResolveRepo: vi.fn(() => Promise.resolve(null)) },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/useTauriListen", () => ({ useTauriListen: vi.fn() }));
vi.mock("../lib/route", () => ({ routeAgentNotification: vi.fn() }));
vi.mock("../lib/hibernatingTabs", () => ({ isHibernating: vi.fn(() => false) }));
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

describe("handleSignal tab resolution", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
    vi.mocked(focusedTabId).mockReturnValue(null);
  });

  test("a hook signal whose PTY the frontend does not know yet reaches the tab it names", () => {
    handleSignal(sig("UserPromptSubmit", { id: UNKNOWN_PTY, tabId: "tab-7" }), ctx());
    expect(useAgentStore.getState().sessions["tab-7"]?.status).toBe("working");
  });

  test("the tab a hook signal names wins over the one its PTY id maps to", () => {
    handleSignal(sig("UserPromptSubmit", { id: 1, tabId: "tab-7" }), ctx());
    expect(useAgentStore.getState().sessions["tab-7"]?.status).toBe("working");
    expect(useAgentStore.getState().sessions["tab-1"]).toBeUndefined();
  });

  test("a PTY reader signal without a tab still resolves by its PTY id", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    expect(session()?.status).toBe("working");
  });

  test("a signal with neither a tab nor a known PTY is dropped", () => {
    handleSignal(sig("UserPromptSubmit", { id: UNKNOWN_PTY }), ctx());
    expect(useAgentStore.getState().sessions).toEqual({});
  });
});

describe("handleSignal PostCompact", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
    vi.mocked(routeAgentNotification).mockClear();
    vi.mocked(focusedTabId).mockReturnValue(null);
  });

  test("a manual compact leaves a working tab idle without notifying", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("PostCompact", { trigger: "manual" }), ctx());
    expect(session().status).toBe("idle");
    expect(routeAgentNotification).not.toHaveBeenCalled();
  });

  test("a compact whose trigger is empty behaves like a manual one", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("PostCompact", { trigger: "" }), ctx());
    expect(session().status).toBe("idle");
  });

  test("an automatic compact inside a turn keeps the tab working", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("PostCompact", { trigger: "auto" }), ctx());
    expect(session().status).toBe("working");
  });

  test("a compact with a live subagent stays working", () => {
    handleSignal(sig("UserPromptSubmit"), ctx());
    handleSignal(sig("SubagentStart", { agentId: "a1", agentType: "Explore" }), ctx());
    handleSignal(sig("PostCompact", { trigger: "manual" }), ctx());
    expect(session().status).toBe("working");
  });

  test("a compact with no session on the tab does nothing", () => {
    handleSignal(sig("PostCompact", { trigger: "manual" }), ctx());
    expect(session()).toBeUndefined();
  });
});

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

  test("a Stop from an agent that does not list its subagents keeps the ones it reported", () => {
    handleSignal(sig("UserPromptSubmit", { agent: "omp" }), ctx());
    handleSignal(sig("SubagentStart", { agent: "omp", agentId: "Saludar", agentType: "task", agentDescription: "Saludar" }), ctx());
    handleSignal(sig("Stop", { agent: "omp" }), ctx());
    expect(Object.keys(session().subagents)).toEqual(["Saludar"]);
    expect(session().status).toBe("working");
    expect(routeAgentNotification).not.toHaveBeenCalled();
    handleSignal(sig("SubagentStop", { agent: "omp", agentId: "Saludar" }), ctx());
    expect(session().subagents).toEqual({});
  });

  test("Codex subagents go through the same gate as Claude's", () => {
    handleSignal(sig("UserPromptSubmit", { agent: "codex" }), ctx());
    handleSignal(sig("SubagentStart", { agent: "codex", agentId: "c1", agentType: "worker" }), ctx());
    expect(session().agent).toBe("codex");
    expect(Object.keys(session().subagents)).toEqual(["c1"]);
    handleSignal(sig("Stop", { agent: "codex" }), ctx());
    expect(session().status).toBe("working");
    expect(routeAgentNotification).not.toHaveBeenCalled();
    handleSignal(sig("SubagentStop", { agent: "codex", agentId: "c1" }), ctx());
    expect(session().subagents).toEqual({});
    handleSignal(sig("UserPromptSubmit", { agent: "codex" }), ctx());
    handleSignal(sig("Stop", { agent: "codex" }), ctx());
    expect(session().status).toBe("attention");
    expect(routeAgentNotification).toHaveBeenCalledTimes(1);
  });

  test("a subagent description reaches the row label", () => {
    handleSignal(sig("SubagentStart", { agent: "omp", agentId: "a1", agentType: "task", agentDescription: "Contar archivos" }), ctx());
    expect(session().subagents.a1.description).toBe("Contar archivos");
  });

  test("Claude still reconciles against the list its Stop carries", () => {
    handleSignal(sig("UserPromptSubmit", { agent: "claude" }), ctx());
    handleSignal(sig("SubagentStart", { agent: "claude", agentId: "ghost", agentType: "Explore" }), ctx());
    handleSignal(sig("Stop", { agent: "claude" }), ctx());
    expect(session().subagents).toEqual({});
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

  test("a session reported at startup, before any prompt, already has the agent and the transcript", () => {
    handleSessionMeta(
      { ...meta(true), tabId: "tab-1", transcriptPath: "/p/omp/s.jsonl", model: "" },
      ctx(),
    );
    expect(session().agent).toBe("claude");
    handleSessionMeta({ ...meta(true), agent: "omp", transcriptPath: "/p/omp/s.jsonl", model: "" }, ctx());
    expect(session().meta?.transcriptPath).toBe("/p/omp/s.jsonl");
  });

  test("an omp session reported before its first prompt is tagged omp and keeps the launch command", () => {
    handleSessionMeta({ ...meta(true), agent: "omp", transcriptPath: "/p/omp/s.jsonl", model: "" }, ctx());
    expect(session().agent).toBe("omp");
    expect(session().status).toBe("idle");
    expect(session().meta?.launchKnown).toBe(true);
    expect(session().meta?.transcriptPath).toBe("/p/omp/s.jsonl");
  });
});

const agentSession = (): AgentSession => ({
  tabId: "tab-1",
  workspaceId: "ws-1",
  agent: "omp",
  status: "idle",
  startedAt: 0,
  lastActivityAt: 0,
  attentionSince: null,
  restored: false,
  restoreError: false,
  subagents: {},
  meta: {},
});

describe("handleSignal: the tab title when the agent ends", () => {
  beforeEach(() => {
    useAgentStore.setState({ sessions: {}, notifications: [] });
    vi.mocked(clearOscTitle).mockClear();
    vi.mocked(invoke).mockClear();
    vi.mocked(isHibernating).mockReturnValue(false);
  });

  test("the exit of a non-hibernating agent clears the OSC title of the tab", () => {
    useAgentStore.setState({ sessions: { "tab-1": agentSession() } });
    handleSignal(sig("exited"), ctx());
    expect(session()).toBeUndefined();
    expect(clearOscTitle).toHaveBeenCalledWith("tab-1");
    expect(invoke).toHaveBeenCalledWith("agent_detach_session", { tabId: "tab-1" });
  });

  test("a hibernating agent keeps the title the wake will need", () => {
    vi.mocked(isHibernating).mockReturnValue(true);
    useAgentStore.setState({ sessions: { "tab-1": agentSession() } });
    handleSignal(sig("exited"), ctx());
    expect(session()).toBeUndefined();
    expect(clearOscTitle).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("agent_detach_session", { tabId: "tab-1" });
  });
});
