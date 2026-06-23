import { describe, expect, it } from "vitest";
import { clampPatchPreview, countLines, isDiffTooLarge } from "./diffSize";

describe("countLines", () => {
  it("counts a single line for empty input", () => {
    expect(countLines("")).toBe(1);
  });

  it("counts trailing and interior newlines", () => {
    expect(countLines("a\nb\nc")).toBe(3);
    expect(countLines("a\nb\n")).toBe(3);
  });
});

describe("isDiffTooLarge", () => {
  it("is false for small inputs", () => {
    expect(isDiffTooLarge("hello", "hello world")).toBe(false);
  });

  it("is true when one side exceeds the byte threshold", () => {
    const big = "x".repeat(256 * 1024 + 1);
    expect(isDiffTooLarge("small", big)).toBe(true);
  });

  // A minified bundle: tiny by bytes, huge by line count. The byte-only guard
  // missed this and stalled the merge view.
  it("is true when line count is high even with small byte size", () => {
    const manyShortLines = "a\n".repeat(5001);
    expect(manyShortLines.length).toBeLessThan(256 * 1024);
    expect(isDiffTooLarge("", manyShortLines)).toBe(true);
  });
});

describe("clampPatchPreview", () => {
  it("returns the patch untouched when under the limit", () => {
    const patch = "a\nb\nc";
    expect(clampPatchPreview(patch, 500)).toEqual({ text: patch, hiddenLines: 0 });
  });

  it("keeps exactly maxLines and reports the hidden count", () => {
    const patch = Array.from({ length: 600 }, (_, i) => `line ${i}`).join("\n");
    const { text, hiddenLines } = clampPatchPreview(patch, 500);
    expect(countLines(text)).toBe(500);
    expect(hiddenLines).toBe(100);
  });

  it("counts a trailing newline correctly", () => {
    const patch = `${"x\n".repeat(600)}`; // 600 lines, trailing newline
    const { hiddenLines } = clampPatchPreview(patch, 500);
    expect(hiddenLines).toBe(100);
  });

  it("handles empty input", () => {
    expect(clampPatchPreview("", 500)).toEqual({ text: "", hiddenLines: 0 });
  });
});
