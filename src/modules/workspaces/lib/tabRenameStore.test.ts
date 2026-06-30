import { beforeEach, describe, expect, test } from "vitest";
import { useTabRenameStore } from "./tabRenameStore";

describe("tabRenameStore", () => {
  beforeEach(() => {
    useTabRenameStore.setState({ renamingTabId: null });
  });

  test("initial state has no panel being renamed", () => {
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });

  test("startRename sets the renaming panel id", () => {
    useTabRenameStore.getState().startRename("panel-abc");
    expect(useTabRenameStore.getState().renamingTabId).toBe("panel-abc");
  });

  test("startRename replaces a previous rename in progress", () => {
    useTabRenameStore.getState().startRename("panel-abc");
    useTabRenameStore.getState().startRename("panel-xyz");
    expect(useTabRenameStore.getState().renamingTabId).toBe("panel-xyz");
  });

  test("clearRename resets to null", () => {
    useTabRenameStore.getState().startRename("panel-abc");
    useTabRenameStore.getState().clearRename();
    expect(useTabRenameStore.getState().renamingTabId).toBeNull();
  });
});
