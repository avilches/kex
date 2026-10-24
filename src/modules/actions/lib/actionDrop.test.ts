import { describe, expect, it } from "vitest";
import { columnDropId, isDropCandidate, parseColumnDropId, resolveDrop } from "./actionDrop";
import type { Action } from "./types";

const a = (id: string, script: boolean): Action => ({ id, name: id, command: id, kind: script ? "script" : "app", ownButton: false });
const lists = {
  global: [a("g-s1", true), a("g-s2", true), a("g-a1", false)],
  workspace: [a("w-s1", true), a("w-a1", false)],
};
const both = { global: true, workspace: true };

describe("resolveDrop", () => {
  it("reorders inside a column only between the same kind", () => {
    expect(resolveDrop(lists, both, "g-s1", "g-s2")).toEqual({ kind: "reorder", scope: "global", fromId: "g-s1", toId: "g-s2" });
    expect(resolveDrop(lists, both, "g-s1", "g-a1")).toBeNull();
    expect(resolveDrop(lists, both, "g-s1", columnDropId("global"))).toBeNull();
    expect(resolveDrop(lists, both, "g-s1", "g-s1")).toBeNull();
  });

  it("moves to the other column over a row of any kind or over its frame", () => {
    const move = { kind: "move", from: "global", to: "workspace", id: "g-s1" };
    expect(resolveDrop(lists, both, "g-s1", "w-a1")).toEqual(move);
    expect(resolveDrop(lists, both, "g-s1", columnDropId("workspace"))).toEqual(move);
    expect(resolveDrop(lists, both, "w-a1", "g-s1")).toEqual({ kind: "move", from: "workspace", to: "global", id: "w-a1" });
  });

  it("refuses a column that cannot take drops and unknown ids", () => {
    expect(resolveDrop(lists, { global: true, workspace: false }, "g-s1", columnDropId("workspace"))).toBeNull();
    expect(resolveDrop(lists, both, "nope", "g-s1")).toBeNull();
    expect(resolveDrop(lists, both, "g-s1", "nope")).toBeNull();
  });
});

describe("isDropCandidate", () => {
  it("allows the own kind inside the column and everything in the other one", () => {
    expect(isDropCandidate(lists, "g-s2", "g-s1")).toBe(true);
    expect(isDropCandidate(lists, "g-a1", "g-s1")).toBe(false);
    expect(isDropCandidate(lists, columnDropId("global"), "g-s1")).toBe(false);
    expect(isDropCandidate(lists, "w-a1", "g-s1")).toBe(true);
    expect(isDropCandidate(lists, columnDropId("workspace"), "g-s1")).toBe(true);
  });
});

describe("parseColumnDropId", () => {
  it("reads only column ids", () => {
    expect(parseColumnDropId("col:workspace")).toBe("workspace");
    expect(parseColumnDropId("row")).toBeNull();
  });
});

describe("agents in the Settings columns", () => {
  const g = (id: string): Action => ({ id, name: id, command: id, kind: "agent", ownButton: false });
  const three = { global: [a("s", true), a("p", false), g("g1"), g("g2")], workspace: [] };

  it("reorder only among agents, never with an app or a script", () => {
    expect(resolveDrop(three, both, "g1", "g2")).toEqual({ kind: "reorder", scope: "global", fromId: "g1", toId: "g2" });
    expect(resolveDrop(three, both, "g1", "p")).toBeNull();
    expect(resolveDrop(three, both, "g1", "s")).toBeNull();
    expect(resolveDrop(three, both, "p", "g1")).toBeNull();
    expect(resolveDrop(three, both, "s", "g1")).toBeNull();
    expect(isDropCandidate(three, "p", "g1")).toBe(false);
    expect(isDropCandidate(three, "g2", "g1")).toBe(true);
  });
});
