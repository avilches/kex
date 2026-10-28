import { describe, expect, it } from "vitest";
import {
  busyTabIds,
  canSilenceWarning,
  hibernateReview,
  isBlockedByFailures,
  isReviewEmpty,
  liveAgent,
  needsConfirmation,
  staysBehind,
  tabsReview,
  type ForegroundProcesses,
  type HibernateLive,
} from "./hibernateReview";
import type { Tab, Workspace } from "./types";

const ws = (tabs: Tab[], over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: "p1",
  ...over,
});
const term = (id: string, over: Record<string, unknown> = {}): Tab =>
  ({ id, kind: "terminal", ...over }) as Tab;
type Terminal = Extract<Tab, { kind: "terminal" }>;
const terminal = (id: string, over: Record<string, unknown> = {}) => term(id, over) as Terminal;
const live = (
  agents: Record<string, { agent: string; status: "working" | "attention" | "idle"; resumable?: boolean }> = {},
  scripts: Record<string, "running" | "waiting"> = {},
  actions: Record<string, { name: string; command: string }> = {},
): HibernateLive => ({
  agentOf: (id) => (agents[id] ? { resumable: true, ...agents[id] } : undefined),
  scriptState: (id) => scripts[id],
  actionOf: (id) => actions[id],
});
const procs = (o: Record<string, string> = {}): ForegroundProcesses => new Map(Object.entries(o));
const dev = { t1: { name: "dev", command: "npm run dev" } };

describe("hibernateReview agents", () => {
  it("lists an agent that is working", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "working" } }));
    expect(r.busy).toEqual([expect.objectContaining({ tabId: "t1", kind: "agent", agent: "claude" })]);
  });

  it("does not list an idle agent", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "idle" } }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("does not list an agent waiting for the user as busy", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "attention" } }));
    expect(r.busy).toEqual([]);
  });

  it("names a working agent after its tab title, falling back to the agent", () => {
    const r = hibernateReview(
      ws([term("t1", { title: "fix layout" }), term("t2")]),
      live({ t1: { agent: "claude", status: "working" }, t2: { agent: "codex", status: "working" } }),
    );
    expect(r.busy.map((b) => b.name)).toEqual(["fix layout", "codex"]);
  });

  it("never lists the foreground process of an agent tab as a process", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "idle" } }), procs({ t1: "claude" }));
    expect(r.processes).toEqual([]);
  });
});

describe("hibernateReview processes", () => {
  it("lists a plain terminal with a foreground process", () => {
    const r = hibernateReview(ws([term("t1", { title: "api" })]), live(), procs({ t1: "npm run dev" }));
    expect(r.processes).toEqual([{ tabId: "t1", title: "api", command: "npm run dev" }]);
  });

  it("lists a process whether or not the tab already has a saved Restore Command", () => {
    for (const persistentCommand of [undefined, "make"]) {
      const r = hibernateReview(ws([term("t1", { persistentCommand })]), live(), procs({ t1: "make" }));
      expect(r.processes.map((p) => p.tabId)).toEqual(["t1"]);
    }
  });

  it("does not list an empty shell", () => {
    expect(isReviewEmpty(hibernateReview(ws([term("t1")]), live()))).toBe(true);
  });

  it("does not list a sleeping tab", () => {
    const r = hibernateReview(ws([term("t1", { hibernation: { at: 1 } })]), live(), procs({ t1: "make" }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("lists a running script as busy, not as a process too", () => {
    const r = hibernateReview(ws([term("t1")]), live({}, { t1: "running" }, dev), procs({ t1: "npm" }));
    expect(r.busy).toEqual([expect.objectContaining({ tabId: "t1", kind: "script", name: "dev", command: "npm run dev" })]);
    expect(r.processes).toEqual([]);
  });

  it("marks a script whose stop was requested as stopping", () => {
    const r = hibernateReview(ws([term("t1")]), live({}, { t1: "waiting" }, dev));
    expect(r.busy[0]).toMatchObject({ kind: "script", stopping: true });
  });

  it("ignores a script Action whose run has ended and nothing else is running", () => {
    expect(isReviewEmpty(hibernateReview(ws([term("t1")]), live({}, {}, dev)))).toBe(true);
  });

  it("lists a process in a tab whose script already ended, since the question was asked about it", () => {
    const r = hibernateReview(ws([term("t1")]), live({}, {}, dev), procs({ t1: "vim" }));
    expect(r.processes).toEqual([{ tabId: "t1", title: undefined, command: "vim" }]);
  });
});

describe("hibernateReview docs", () => {
  it("lists dirty editor and markdown tabs only", () => {
    const tabs: Tab[] = [
      { id: "e1", kind: "editor", path: "/a.ts", dirty: true, preview: false },
      { id: "e2", kind: "editor", path: "/b.ts", dirty: false, preview: false },
      { id: "m1", kind: "markdown", path: "/c.md", dirty: true },
      { id: "m2", kind: "markdown", path: "/d.md" },
    ];
    const r = hibernateReview(ws(tabs), live());
    expect(r.docs.map((d) => d.tabId)).toEqual(["e1", "m1"]);
    expect(r.docs[0]).toMatchObject({ path: "/a.ts" });
  });
});

describe("needsConfirmation", () => {
  const working = { t1: { agent: "claude", status: "working" as const } };
  const doc: Tab = { id: "e1", kind: "editor", path: "/a.ts", dirty: true, preview: false };

  it("always asks about a working agent, even with the warning off", () => {
    const r = tabsReview([term("t1")], live(working));
    expect(needsConfirmation(r, true)).toBe(true);
    expect(needsConfirmation(r, false)).toBe(true);
  });

  it("always asks about an unsaved document, even with the warning off", () => {
    const r = hibernateReview(ws([doc]), live());
    expect(needsConfirmation(r, false)).toBe(true);
  });

  it("asks about a process or a script only while the warning is on", () => {
    const process = tabsReview([term("t1")], live(), procs({ t1: "vim" }));
    const script = tabsReview([term("t1")], live({}, { t1: "running" }, dev));
    for (const r of [process, script]) {
      expect(needsConfirmation(r, true)).toBe(true);
      expect(needsConfirmation(r, false)).toBe(false);
    }
  });

  it("does not ask about an empty shell, an idle agent or one waiting for the user", () => {
    const cases: Parameters<typeof live>[0][] = [{}, { t1: { agent: "claude", status: "idle" } }, { t1: { agent: "claude", status: "attention" } }];
    for (const agents of cases) {
      expect(needsConfirmation(tabsReview([term("t1")], live(agents)), true)).toBe(false);
    }
  });

  it("asks when a busy agent comes with a process, whatever the warning", () => {
    const r = tabsReview([term("t1"), term("t2")], live(working), procs({ t2: "vim" }));
    expect(needsConfirmation(r, false)).toBe(true);
  });
});

describe("canSilenceWarning", () => {
  it("is offered for processes and scripts alone", () => {
    expect(canSilenceWarning(tabsReview([term("t1")], live(), procs({ t1: "vim" })))).toBe(true);
    expect(canSilenceWarning(tabsReview([term("t1")], live({}, { t1: "running" }, dev)))).toBe(true);
  });

  it("is not offered when a working agent or an unsaved document is in the review", () => {
    const agent = tabsReview([term("t1"), term("t2")], live({ t1: { agent: "claude", status: "working" } }), procs({ t2: "vim" }));
    expect(canSilenceWarning(agent)).toBe(false);
    const doc: Tab = { id: "e1", kind: "editor", path: "/a.ts", dirty: true, preview: false };
    expect(canSilenceWarning(hibernateReview(ws([doc, term("t2")]), live(), procs({ t2: "vim" })))).toBe(false);
  });
});

describe("isBlockedByFailures", () => {
  const docs = [
    { tabId: "a", title: undefined, path: "/a" },
    { tabId: "b", title: undefined, path: "/b" },
  ];

  it("is not blocked when no save failed", () => {
    expect(isBlockedByFailures(docs, {}, new Set())).toBe(false);
  });

  it("is blocked by a failed document that is still listed", () => {
    expect(isBlockedByFailures(docs, { a: "conflict" }, new Set())).toBe(true);
  });

  it("is released once the failed document is discarded", () => {
    expect(isBlockedByFailures(docs, { a: "conflict" }, new Set(["a"]))).toBe(false);
  });

  it("ignores a stale failure for a document that is no longer listed", () => {
    expect(isBlockedByFailures(docs, { gone: "conflict" }, new Set())).toBe(false);
  });
});

describe("liveAgent", () => {
  it("ignores the placeholder session of a failed restore", () => {
    const placeholder = { agent: "claude", status: "working" as const, restoreError: true };
    expect(liveAgent(placeholder)).toBeUndefined();
    const review = hibernateReview(ws([term("t1")]), { ...live(), agentOf: () => liveAgent(placeholder) });
    expect(review.busy).toEqual([]);
  });

  it("keeps a real agent session", () => {
    expect(liveAgent({ agent: "claude", status: "working", restoreError: false })).toMatchObject({ agent: "claude", status: "working" });
  });
});

describe("tabsReview", () => {
  const editor = { id: "e1", kind: "editor", path: "/a.ts", dirty: true, preview: false } as Tab;

  it("reviews only the tabs it is given, never documents", () => {
    const tabs = [term("t1"), term("t2"), editor];
    const r = tabsReview(tabs, live({ t1: { agent: "claude", status: "working" } }), procs({ t2: "npm run dev" }));
    expect(r.busy.map((b) => b.tabId)).toEqual(["t1"]);
    expect(r.processes.map((c) => c.tabId)).toEqual(["t2"]);
    expect(r.docs).toEqual([]);
  });

  it("is empty for a shell with nothing running, which sleeps without asking", () => {
    expect(isReviewEmpty(tabsReview([term("t1")], live()))).toBe(true);
  });

  it("lists a running script as busy with the Action it belongs to", () => {
    const r = tabsReview([term("t1")], live({}, { t1: "running" }, dev));
    expect(r.busy).toEqual([expect.objectContaining({ tabId: "t1", kind: "script", name: "dev", stopping: false })]);
  });
});

describe("busyTabIds", () => {
  it("includes working agents, running scripts and agents waiting for the user", () => {
    const tabs = [term("t1"), term("t2"), term("t3"), term("t4")];
    const ids = busyTabIds(
      tabs,
      live(
        { t1: { agent: "claude", status: "working" }, t3: { agent: "claude", status: "attention" }, t4: { agent: "claude", status: "idle" } },
        { t2: "running" },
        { t2: { name: "dev", command: "pnpm dev" } },
      ),
    );
    expect([...ids].sort()).toEqual(["t1", "t2", "t3"]);
  });
});

describe("staysBehind", () => {
  it("keeps an empty shell out of the way: nothing to lose", () => {
    expect(staysBehind(terminal("t1"), live(), procs())).toBe(false);
  });

  it("leaves a plain process that was never saved, since an unattended hibernation does not decide for the user", () => {
    expect(staysBehind(terminal("t1"), live(), procs({ t1: "make" }))).toBe(true);
  });

  it("takes a terminal with a saved command", () => {
    expect(staysBehind(terminal("t1", { persistentCommand: "make" }), live(), procs({ t1: "make" }))).toBe(false);
  });

  it("takes an agent that resumes, and leaves one that has no stored session", () => {
    const resumes = live({ t1: { agent: "claude", status: "idle", resumable: true } });
    const lost = live({ t1: { agent: "codex", status: "idle", resumable: false } });
    expect(staysBehind(terminal("t1"), resumes, procs())).toBe(false);
    expect(staysBehind(terminal("t1"), lost, procs())).toBe(true);
  });
});
