import { describe, expect, it } from "vitest";
import { consumeHeldBlock, seedHeldBlock, setModalBlock, liveHeldBlock } from "./pendingRestore";
import type { RestoreBlock } from "./restoreStart";

const block: RestoreBlock = {
  reason: "Folder not found",
  dir: "/gone/dir",
  command: "claude --resume abc",
  agent: "claude",
  restorable: true,
};

describe("seedHeldBlock", () => {
  it("hands the block over once, under the id it was seeded for", () => {
    seedHeldBlock("tab-x", block);
    expect(consumeHeldBlock("tab-y")).toBeNull();
    expect(consumeHeldBlock("tab-x")).toEqual(block);
    expect(consumeHeldBlock("tab-x")).toBeNull();
  });
});

describe("liveHeldBlock", () => {
  it("reads the block of the dialog that is up, and nothing once it is gone", () => {
    setModalBlock("tab-z", block);
    expect(liveHeldBlock("tab-z")).toEqual(block);
    setModalBlock("tab-z", null);
    expect(liveHeldBlock("tab-z")).toBeNull();
  });
});
