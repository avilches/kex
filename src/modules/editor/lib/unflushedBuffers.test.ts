import { describe, expect, it } from "vitest";
import {
  discardUnflushedBuffers,
  hasUnflushedBuffer,
  stashUnflushedBuffer,
  takeUnflushedBuffer,
} from "./unflushedBuffers";

describe("unflushedBuffers", () => {
  it("returns and removes a stashed buffer", () => {
    stashUnflushedBuffer("t1", "text");
    expect(takeUnflushedBuffer("t1")).toBe("text");
    expect(hasUnflushedBuffer("t1")).toBe(false);
  });

  it("discards the carried edits of the given tabs only", () => {
    stashUnflushedBuffer("t1", "a");
    stashUnflushedBuffer("t2", "b");
    discardUnflushedBuffers(["t1"]);
    expect(hasUnflushedBuffer("t1")).toBe(false);
    expect(hasUnflushedBuffer("t2")).toBe(true);
    discardUnflushedBuffers(["t2"]);
  });
});
