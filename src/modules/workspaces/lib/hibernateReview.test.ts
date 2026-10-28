import { describe, expect, it } from "vitest";
import {
  busyTabIds,
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
const doc: Tab = { id: "e1", kind: "editor", path: "/a.ts", dirty: true, preview: false };

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

  it("does not list a sleeping tab", () => {
    const r = hibernateReview(
      ws([term("t1", { hibernation: { at: 1 } })]),
      live({ t1: { agent: "claude", status: "working" } }),
    );
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("ignores a script that is running: it is stopped without asking", () => {
    const r = hibernateReview(ws([term("t1")]), live({}, { t1: "running" }, dev));
    expect(isReviewEmpty(r)).toBe(true);
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

  it("asks about a working agent", () => {
    expect(needsConfirmation(tabsReview([term("t1")], live(working)))).toBe(true);
  });

  it("asks about an unsaved document", () => {
    expect(needsConfirmation(hibernateReview(ws([doc]), live()))).toBe(true);
  });

  it("does not ask about a running script", () => {
    expect(needsConfirmation(tabsReview([term("t1")], live({}, { t1: "running" }, dev)))).toBe(false);
  });

  it("does not ask about an empty shell, an idle agent or one waiting for the user", () => {
    const cases: Parameters<typeof live>[0][] = [{}, { t1: { agent: "claude", status: "idle" } }, { t1: { agent: "claude", status: "attention" } }];
    for (const agents of cases) {
      expect(needsConfirmation(tabsReview([term("t1")], live(agents)))).toBe(false);
    }
  });

  it("asks when a working agent comes with a script", () => {
    const r = tabsReview([term("t1"), term("t2")], live(working, { t2: "running" }, { t2: { name: "dev", command: "x" } }));
    expect(needsConfirmation(r)).toBe(true);
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
  it("reviews only the terminals it is given, never documents", () => {
    const tabs = [term("t1"), term("t2"), doc];
    const r = tabsReview(tabs, live({ t1: { agent: "claude", status: "working" } }));
    expect(r.busy.map((b) => b.tabId)).toEqual(["t1"]);
    expect(r.docs).toEqual([]);
  });

  it("is empty for a shell with nothing running, which sleeps without asking", () => {
    expect(isReviewEmpty(tabsReview([term("t1")], live()))).toBe(true);
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

  it("ignores a script Action whose run has ended and a sleeping tab", () => {
    const tabs = [term("t1"), term("t2", { hibernation: { at: 1 } })];
    const ids = busyTabIds(tabs, live({ t2: { agent: "claude", status: "working" } }, {}, dev));
    expect([...ids]).toEqual([]);
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
