import { describe, expect, it } from "vitest";
import { ownedAfterEdit } from "./appOwnership";
import type { Action } from "./types";

const preset: Action = {
  id: "a",
  name: "Sublime Text {workspace}",
  command: "subl {workspace}",
  runInTerminal: false,
  appId: "sublime",
  ownButton: false,
};

describe("ownedAfterEdit", () => {
  it("drops the appId when the name or the command changes", () => {
    expect(ownedAfterEdit(preset, { ...preset, command: "subl -n {workspace}" }).appId).toBe("");
    expect(ownedAfterEdit(preset, { ...preset, name: "Subl {workspace}" }).appId).toBe("");
  });

  it("keeps it for the Button flag and for a value typed back to what it was", () => {
    expect(ownedAfterEdit(preset, { ...preset, ownButton: true }).appId).toBe("sublime");
    expect(ownedAfterEdit(preset, { ...preset, command: "subl {workspace} " }).appId).toBe("sublime");
  });

  it("leaves an action that is not a preset alone", () => {
    const own: Action = { ...preset, appId: undefined };
    expect(ownedAfterEdit(own, { ...own, command: "x" })).toEqual({ ...own, command: "x" });
  });
});
