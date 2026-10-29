import { describe, expect, it } from "vitest";
import { consumeHeldBlock, seedHeldBlock } from "./pendingRestore";
import { heldBlockOf, type RestoreBlock } from "./restoreStart";

const block: RestoreBlock = {
  reason: "Folder not found",
  dir: "/gone/dir",
  command: "claude --resume abc",
  agent: "claude",
  restorable: true,
};

describe("heldBlockOf", () => {
  it("keeps the modal block as the modal state", () => {
    expect(heldBlockOf(block, null)).toEqual({ block, modal: true });
  });
  it("keeps a plan that only waits in the menu as not modal", () => {
    expect(heldBlockOf(null, block)).toEqual({ block, modal: false });
  });
  it("prefers the modal when both exist", () => {
    expect(heldBlockOf(block, { ...block, reason: "other" })).toEqual({ block, modal: true });
  });
  it("is null when nothing is held", () => {
    expect(heldBlockOf(null, null)).toBeNull();
  });
});

describe("seedHeldBlock", () => {
  it("hands the block over once, under the id it was seeded for", () => {
    seedHeldBlock("tab-x", { block, modal: true });
    expect(consumeHeldBlock("tab-y")).toBeNull();
    expect(consumeHeldBlock("tab-x")).toEqual({ block, modal: true });
    expect(consumeHeldBlock("tab-x")).toBeNull();
  });
});
