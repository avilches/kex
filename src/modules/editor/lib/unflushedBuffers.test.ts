import { describe, expect, it } from "vitest";
import {
  abandonUnflushedBuffers,
  discardUnflushedBuffers,
  hasUnflushedBuffer,
  stashUnflushedBuffer,
  takeUnflushedBuffer,
} from "./unflushedBuffers";

describe("unflushedBuffers", () => {
  it("returns and removes a stashed buffer", () => {
    stashUnflushedBuffer("t1", "text");
    expect(takeUnflushedBuffer("t1")).toEqual({ text: "text", conflict: false });
    expect(hasUnflushedBuffer("t1")).toBe(false);
  });

  it("carries the conflict flag with the buffer", () => {
    stashUnflushedBuffer("t1", "text", true);
    expect(takeUnflushedBuffer("t1")).toEqual({ text: "text", conflict: true });
  });

  it("discards the carried edits of the given tabs only", () => {
    stashUnflushedBuffer("t1", "a");
    stashUnflushedBuffer("t2", "b");
    discardUnflushedBuffers(["t1"]);
    expect(hasUnflushedBuffer("t1")).toBe(false);
    expect(hasUnflushedBuffer("t2")).toBe(true);
    discardUnflushedBuffers(["t2"]);
  });

  it("refuses a stash from the unmount of an abandoned tab", () => {
    stashUnflushedBuffer("t3", "a");
    abandonUnflushedBuffers(["t3"]);
    expect(hasUnflushedBuffer("t3")).toBe(false);
    stashUnflushedBuffer("t3", "late");
    expect(hasUnflushedBuffer("t3")).toBe(false);
  });
});
