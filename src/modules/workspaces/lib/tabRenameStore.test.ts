import { beforeEach, describe, expect, test } from "vitest";
import { resolveRenameShortcut, useTabRenameStore } from "./tabRenameStore";

describe("tabRenameStore", () => {
  beforeEach(() => {
    useTabRenameStore.setState({ renamingTabId: null, step: "title", saveSeq: 0 });
  });

  test("initial state has no tab being renamed", () => {
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });

  test("startRename sets the renaming tab id", () => {
    useTabRenameStore.getState().startRename("tab-abc");
    expect(useTabRenameStore.getState().renamingTabId).toBe("tab-abc");
  });

  test("startRename replaces a previous rename in progress", () => {
    useTabRenameStore.getState().startRename("tab-abc");
    useTabRenameStore.getState().startRename("tab-xyz");
    expect(useTabRenameStore.getState().renamingTabId).toBe("tab-xyz");
  });

  test("clearRename resets to null", () => {
    useTabRenameStore.getState().startRename("tab-abc");
    useTabRenameStore.getState().clearRename();
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });

  test("startRename begins on the title step", () => {
    useTabRenameStore.getState().startRename("tab-abc");
    expect(useTabRenameStore.getState().step).toBe("title");
  });

  test("startRename can open straight on the note step", () => {
    useTabRenameStore.getState().startRename("tab-abc", "note");
    expect(useTabRenameStore.getState().step).toBe("note");
  });

  test("goToNote switches the step without changing the tab", () => {
    useTabRenameStore.getState().startRename("tab-abc");
    useTabRenameStore.getState().goToNote();
    expect(useTabRenameStore.getState()).toMatchObject({ renamingTabId: "tab-abc", step: "note" });
  });

  test("clearRename resets the step to title", () => {
    useTabRenameStore.getState().startRename("tab-abc", "note");
    useTabRenameStore.getState().clearRename();
    expect(useTabRenameStore.getState().step).toBe("title");
  });

  test("requestSave bumps saveSeq on every call", () => {
    useTabRenameStore.getState().requestSave();
    useTabRenameStore.getState().requestSave();
    expect(useTabRenameStore.getState().saveSeq).toBe(2);
  });
});

describe("resolveRenameShortcut", () => {
  const base = { renamingTabId: null, step: "title" as const, activeTabId: "tab-1", inTextField: false };

  test("starts a rename on the active tab", () => {
    expect(resolveRenameShortcut(base)).toBe("start");
  });

  test("ignores the press when a text field outside the rename has focus", () => {
    expect(resolveRenameShortcut({ ...base, inTextField: true })).toBe("ignore");
  });

  test("ignores the press without an active tab", () => {
    expect(resolveRenameShortcut({ ...base, activeTabId: null })).toBe("ignore");
  });

  test("a second press while renaming the title goes to the note", () => {
    expect(resolveRenameShortcut({ ...base, renamingTabId: "tab-1", inTextField: true })).toBe("to-note");
  });

  test("a third press while editing the note saves", () => {
    expect(resolveRenameShortcut({ ...base, renamingTabId: "tab-1", step: "note", inTextField: true })).toBe("save");
  });
});
