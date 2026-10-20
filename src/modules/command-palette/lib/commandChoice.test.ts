import { describe, expect, it } from "vitest";
import type { PaletteItem } from "../types";
import { commandChoice } from "./commandChoice";

const item = (id: string, over: Partial<PaletteItem> = {}): PaletteItem => ({
  id,
  title: id,
  group: "General",
  run: () => {},
  ...over,
});

describe("commandChoice", () => {
  it("runs and learns an ordinary command", () => {
    expect(commandChoice(item("settings.open"))).toEqual({ action: "run", learn: true });
  });

  it("ignores a disabled row entirely", () => {
    expect(commandChoice(item("tab.close", { disabledReason: "Last workspace" }))).toEqual({ action: "none", learn: false });
  });

  it("learns the rows that only open a sub mode, since they are the ones chosen by text most", () => {
    expect(commandChoice(item("theme.pick"))).toEqual({ action: "themes", learn: true });
    expect(commandChoice(item("tab.moveToWorkspace"))).toEqual({ action: "workspaces", learn: true });
    expect(commandChoice(item("search.content"))).toEqual({ action: "content", learn: true });
    expect(commandChoice(item("history.open"))).toEqual({ action: "history", learn: true });
  });

  it("does not run a mode row as a command", () => {
    expect(commandChoice(item("theme.pick")).action).not.toBe("run");
  });
});
