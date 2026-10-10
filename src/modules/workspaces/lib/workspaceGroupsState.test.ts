import { describe, expect, it } from "vitest";
import { groupLabelOf, sanitizeSavedGroups } from "./workspaceGroupsState";

describe("sanitizeSavedGroups", () => {
  it("keeps well-formed groups", () => {
    const groups = [{ id: "grp-a", label: "Group A" }];
    expect(sanitizeSavedGroups(groups)).toEqual(groups);
  });

  it("falls back to an empty array for non-array input", () => {
    expect(sanitizeSavedGroups(undefined)).toEqual([]);
    expect(sanitizeSavedGroups(null)).toEqual([]);
    expect(sanitizeSavedGroups("bogus")).toEqual([]);
  });

  it("drops entries missing an id or a label", () => {
    const groups = [{ id: "grp-a", label: "A" }, { label: "no id" }, { id: "grp-b" }];
    expect(sanitizeSavedGroups(groups)).toEqual([{ id: "grp-a", label: "A" }]);
  });

  it("drops entries with a non-string id or label", () => {
    const groups = [{ id: 1, label: "A" }, { id: "grp-a", label: 2 }];
    expect(sanitizeSavedGroups(groups)).toEqual([]);
  });
});

describe("groupLabelOf", () => {
  const groups = [{ id: "grp-a", label: "Group A" }];
  it("returns the label of an existing group", () => {
    expect(groupLabelOf("grp-a", groups)).toBe("Group A");
  });
  it("returns undefined for no group or a stale id", () => {
    expect(groupLabelOf(undefined, groups)).toBeUndefined();
    expect(groupLabelOf("grp-gone", groups)).toBeUndefined();
  });
});
