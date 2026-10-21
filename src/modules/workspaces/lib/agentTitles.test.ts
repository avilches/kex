import { describe, expect, it } from "vitest";
import { applyAgentTitles, clearAgentTitles } from "./agentTitles";
import type { Tab, Workspace } from "./types";

type Term = Extract<Tab, { kind: "terminal" }>;
const term = (id: string, over: Record<string, unknown> = {}): Tab => ({ id, kind: "terminal", ...over }) as Tab;
const ws = (tabs: Tab[]): Workspace =>
  ({ id: "w1", title: "W", paneTree: { kind: "pane", id: "p1", tabs, activeTabId: null }, activePaneId: "p1" }) as Workspace;
const tabsOf = (w: Workspace) => (w.paneTree as { tabs: Tab[] }).tabs as Term[];

describe("applyAgentTitles", () => {
  it("writes agentTitle on the matching terminal tabs and leaves the user title alone", () => {
    const out = applyAgentTitles([ws([term("t1", { title: "mine" }), term("t2")])], new Map([["t1", "A"], ["t2", "B"]]));
    const [t1, t2] = tabsOf(out[0]!);
    expect(t1!.title).toBe("mine");
    expect(t1!.agentTitle).toBe("A");
    expect(t2!.agentTitle).toBe("B");
  });

  it("returns the same array when nothing changes", () => {
    const list = [ws([term("t1", { agentTitle: "A" })])];
    expect(applyAgentTitles(list, new Map([["t1", "A"], ["gone", "Z"]]))).toBe(list);
    expect(applyAgentTitles(list, new Map())).toBe(list);
  });
});

describe("clearAgentTitles", () => {
  it("drops agentTitle from the named terminal tabs and leaves everything else alone", () => {
    const list = [ws([term("t1", { agentTitle: "pi > Kex" }), term("t2", { title: "mine", agentTitle: "A" })])];
    const out = clearAgentTitles(list, new Set(["t1"]));
    const [t1, t2] = tabsOf(out[0]!) as [Term, Term];
    expect("agentTitle" in t1).toBe(false);
    expect(t2!.agentTitle).toBe("A");
    expect(t2!.title).toBe("mine");
  });

  it("returns the same array when no named tab is reached", () => {
    const list = [ws([term("t1", { agentTitle: "A" })])];
    expect(clearAgentTitles(list, new Set())).toBe(list);
    expect(clearAgentTitles(list, new Set(["gone"]))).toBe(list);
    const changed = clearAgentTitles(list, new Set(["t1"]));
    expect(changed).not.toBe(list);
  });

  it("never touches a tab that is not a terminal", () => {
    const md = { id: "t1", kind: "markdown", path: "/p/a.md", agentTitle: "A" } as unknown as Tab;
    const list = [ws([md])];
    expect(clearAgentTitles(list, new Set(["t1"]))).toBe(list);
  });
});
