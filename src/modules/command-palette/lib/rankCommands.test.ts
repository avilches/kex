import { describe, expect, it } from "vitest";
import type { LearnedMap } from "./learned";
import { buildSearchBlobs, rankCommands } from "./rankCommands";
import type { PaletteItem } from "../types";

const item = (id: string, title: string, over: Partial<PaletteItem> = {}): PaletteItem => ({
  id,
  title,
  group: "General",
  run: () => {},
  ...over,
});

const rank = (items: PaletteItem[], term: string, learned: LearnedMap = {}, mru: Record<string, number> = {}) =>
  rankCommands(items, buildSearchBlobs(items), term, mru, learned).map((i) => i.id);

describe("rankCommands", () => {
  const items = [
    item("sidebar.showExplorer", "Explorer (cycle root)", { group: "Sidebar" }),
    item("search.focus", "Find in current tab", { group: "Search" }),
    item("settings.section.terminal", "Terminal settings", { group: "Settings" }),
    item("workspace.hibernate", "Hibernate Workspace"),
  ];

  it("drops sparse subsequences that would flood a short query", () => {
    const ids = rank(items, "ser");
    expect(ids).not.toContain("sidebar.showExplorer");
    expect(ids).not.toContain("workspace.hibernate");
  });

  it("does not match on the internal id", () => {
    const only = [item("zzz.secret.id", "Open settings", { keywords: [] })];
    expect(rank(only, "secret")).toEqual([]);
  });

  it("returns every row on a blank term, the most recently used first", () => {
    expect(rank(items, "", {}, { "workspace.hibernate": 9 })[0]).toBe("workspace.hibernate");
    expect(rank(items, "")).toHaveLength(items.length);
  });

  it("lifts a row the user keeps choosing for that term", () => {
    const two = [item("a", "Search files"), item("b", "Search content")];
    expect(rank(two, "sea")[0]).toBe("a");
    const learned: LearnedMap = { sea: { "cmd:b": 8 } };
    expect(rank(two, "sea", learned)[0]).toBe("b");
  });

  it("does not let a learned row appear for a query it does not match", () => {
    const two = [item("a", "Search files"), item("b", "Hibernate")];
    const learned: LearnedMap = { sea: { "cmd:b": 8 } };
    expect(rank(two, "sea", learned)).toEqual(["a"]);
  });

  it("does not let learning bury a far better match", () => {
    const two = [item("a", "Settings"), item("b", "Sidebar: toggle terminal inspector", { group: "Sidebar" })];
    const learned: LearnedMap = { set: { "cmd:b": 500 } };
    expect(rank(two, "settings", learned)).toEqual(["a"]);
  });

  it("lets a rare choice break a near tie but not outweigh a clearly better match", () => {
    const two = [item("a", "Settings"), item("b", "Settings editor")];
    const once: LearnedMap = { settings: { "cmd:b": 1 } };
    expect(rank(two, "settings")[0]).toBe("a");
    expect(rank(two, "settings", once)).toContain("b");
  });
});
