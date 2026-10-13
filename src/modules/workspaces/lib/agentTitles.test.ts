import { describe, expect, it } from "vitest";
import { applyAgentTitles } from "./agentTitles";
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
