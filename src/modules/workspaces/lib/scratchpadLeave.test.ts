import { describe, expect, it } from "vitest";
import { scratchpadLeafsToClose } from "./scratchpadLeave";

const panes = [
  { id: "pane-a", activeTabId: "tab-a1", tabs: [{ id: "tab-a1" }, { id: "tab-a2" }] },
  { id: "pane-b", activeTabId: "tab-b1", tabs: [{ id: "tab-b1" }] },
];

describe("scratchpadLeafsToClose", () => {
  it("same pane, different tab: closes the tab being left", () => {
    expect(scratchpadLeafsToClose(panes, "pane-a", "tab-a2")).toEqual(["tab-a1"]);
  });

  it("same pane, same tab: closes nothing", () => {
    expect(scratchpadLeafsToClose(panes, "pane-a", "tab-a1")).toEqual([]);
  });

  it("cross-pane: closes the target pane's previous tab and the pane being left", () => {
    expect(scratchpadLeafsToClose(panes, "pane-b", "tab-a2")).toEqual(["tab-a1", "tab-b1"]);
  });

  it("cross-pane onto the target pane's already-active tab: closes only the pane being left", () => {
    expect(scratchpadLeafsToClose(panes, "pane-b", "tab-a1")).toEqual(["tab-b1"]);
  });

  it("unknown target tab: closes nothing", () => {
    expect(scratchpadLeafsToClose(panes, "pane-a", "tab-zzz")).toEqual([]);
  });

  it("does not duplicate when leaving pane equals target pane result", () => {
    const single = [{ id: "pane-a", activeTabId: "tab-a1", tabs: [{ id: "tab-a1" }, { id: "tab-a2" }] }];
    expect(scratchpadLeafsToClose(single, "pane-a", "tab-a2")).toEqual(["tab-a1"]);
  });
});
