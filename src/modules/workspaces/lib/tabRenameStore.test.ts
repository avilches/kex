import { beforeEach, describe, expect, test } from "vitest";
import { useTabRenameStore } from "./tabRenameStore";

describe("tabRenameStore", () => {
  beforeEach(() => {
    useTabRenameStore.setState({ renamingTabId: null });
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
});
