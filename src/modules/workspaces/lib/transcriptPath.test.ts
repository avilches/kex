import { describe, expect, it } from "vitest";
import { parentDir } from "./transcriptPath";

describe("parentDir", () => {
  it("drops the last segment of a posix path", () => {
    expect(parentDir("/home/u/.claude/projects/p/abc.jsonl")).toBe("/home/u/.claude/projects/p");
  });

  it("drops the last segment of a windows path", () => {
    expect(parentDir("C:\\Users\\u\\abc.jsonl")).toBe("C:\\Users\\u");
  });

  it("returns the input when there is no parent segment", () => {
    expect(parentDir("abc.jsonl")).toBe("abc.jsonl");
    expect(parentDir("/abc.jsonl")).toBe("/abc.jsonl");
  });
});
