import { describe, expect, it } from "vitest";
import { hibernateReview, isBlockedByFailures, isReviewEmpty, liveAgent, type HibernateLive } from "./hibernateReview";
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
const live = (
  agents: Record<string, { agent: string; status: "working" | "attention" | "idle"; resumable?: boolean }> = {},
  commands: Record<string, string> = {},
  scripts: Record<string, "running" | "waiting"> = {},
): HibernateLive => ({
  agentOf: (id) => (agents[id] ? { resumable: true, ...agents[id] } : undefined),
  runningCommand: (id) => commands[id],
  scriptState: (id) => scripts[id],
});

describe("hibernateReview agents", () => {
  it("lists agents with a spinner even when they have Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "working" } }));
    expect(r.busy.map((a) => a.tabId)).toEqual(["t1"]);
  });

  it("does not list an idle agent that has Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "idle" } }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("does not list an agent waiting for the user as active", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "attention" } }));
    expect(r.busy).toEqual([]);
  });

  it("flags a working agent that would not come back so the row can offer Run on start", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: false })]),
      live({ t1: { agent: "claude", status: "working" } }),
    );
    expect(r.busy[0]).toMatchObject({ kind: "agent", runOnStart: true });
  });

  it("does not offer Run on start on a working agent that resumes", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "working" } }));
    expect(r.busy[0]).toMatchObject({ runOnStart: false });
  });

  it("names a working agent after its tab title, falling back to the agent", () => {
    const r = hibernateReview(
      ws([term("t1", { title: "fix layout" }), term("t2")]),
      live({ t1: { agent: "claude", status: "working" }, t2: { agent: "codex", status: "working" } }),
    );
    expect(r.busy.map((b) => b.name)).toEqual(["fix layout", "codex"]);
  });

  it("does not duplicate a working agent without Run on start in the commands list", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: false })]),
      live({ t1: { agent: "claude", status: "working" } }),
    );
    expect(r.busy.map((a) => a.tabId)).toEqual(["t1"]);
    expect(r.commands).toEqual([]);
  });
});

describe("hibernateReview commands", () => {
  it("lists an idle agent without a stored session, since it cannot resume", () => {
    const r = hibernateReview(
      ws([term("t1")]),
      live({ t1: { agent: "codex", status: "idle", resumable: false } }),
    );
    expect(r.commands).toEqual([{ tabId: "t1", title: undefined, command: "codex" }]);
  });

  it("does not list an idle agent with a stored session and Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({ t1: { agent: "claude", status: "idle", resumable: true } }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("keeps a working agent without a stored session in agents only", () => {
    const r = hibernateReview(
      ws([term("t1")]),
      live({ t1: { agent: "claude", status: "working", resumable: false } }),
    );
    expect(r.busy.map((a) => a.tabId)).toEqual(["t1"]);
    expect(r.commands).toEqual([]);
  });

  it("lists an idle agent whose Run on start is explicitly off", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: false })]),
      live({ t1: { agent: "claude", status: "idle" } }),
    );
    expect(r.commands).toEqual([{ tabId: "t1", title: undefined, command: "claude" }]);
  });

  it("lists a plain terminal running a command without Run on start", () => {
    const r = hibernateReview(ws([term("t1")]), live({}, { t1: "npm run dev" }));
    expect(r.commands.map((c) => c.command)).toEqual(["npm run dev"]);
  });

  it("lists a terminal that has a persistent command but Run on start explicitly off", () => {
    const r = hibernateReview(
      ws([term("t1", { persistentCommand: "make watch", restoreOnRestart: false })]),
      live(),
    );
    expect(r.commands.map((c) => c.command)).toEqual(["make watch"]);
  });

  it("does not list a terminal whose persistent command replays on its own (restoreOnRestart unset)", () => {
    const r = hibernateReview(ws([term("t1", { persistentCommand: "make watch" })]), live({}, { t1: "make watch" }));
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("lists a terminal with Run on start on but no command saved, since nothing would replay", () => {
    const r = hibernateReview(ws([term("t1", { restoreOnRestart: true })]), live({}, { t1: "npm run dev" }));
    expect(r.commands.map((c) => c.command)).toEqual(["npm run dev"]);
  });

  it("does not list a terminal with Run on start and a saved command", () => {
    const r = hibernateReview(
      ws([term("t1", { restoreOnRestart: true, persistentCommand: "make" })]),
      live({}, { t1: "make" }),
    );
    expect(isReviewEmpty(r)).toBe(true);
  });

  it("does not list an empty shell", () => {
    expect(isReviewEmpty(hibernateReview(ws([term("t1")]), live()))).toBe(true);
  });

  it("skips an idle RunButton script terminal even with a command running", () => {
    const w = ws([term("t1")], { scripts: [{ id: "s1", name: "dev", command: "npm run dev", tabId: "t1" }] });
    expect(isReviewEmpty(hibernateReview(w, live({}, { t1: "npm run dev" })))).toBe(true);
  });

  it("lists a running script as busy under its script name, without Run on start", () => {
    const w = ws([term("t1", { title: "tab" })], { scripts: [{ id: "s1", name: "dev", command: "npm run dev", tabId: "t1" }] });
    const r = hibernateReview(w, live({}, {}, { t1: "running" }));
    expect(r.busy).toEqual([{ tabId: "t1", kind: "script", name: "dev", stopping: false, runOnStart: false }]);
    expect(r.commands).toEqual([]);
  });

  it("marks a script whose stop was requested as stopping", () => {
    const w = ws([term("t1")], { scripts: [{ id: "s1", name: "dev", command: "npm run dev", tabId: "t1" }] });
    const r = hibernateReview(w, live({}, {}, { t1: "waiting" }));
    expect(r.busy[0]).toMatchObject({ kind: "script", stopping: true });
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
    const review = hibernateReview(
      ws([term("t1", { restoreOnRestart: false })]),
      { ...live(), agentOf: () => liveAgent(placeholder) },
    );
    expect(review.busy).toEqual([]);
  });

  it("keeps a real agent session", () => {
    expect(liveAgent({ agent: "claude", status: "working", restoreError: false })).toMatchObject({ agent: "claude", status: "working" });
  });
});
