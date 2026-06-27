import { describe, expect, it } from "vitest";
import {
  formatScratchpadRef,
  scratchpadRefForDrop,
  toRelativePath,
} from "./scratchpadPath";

describe("toRelativePath", () => {
  it("returns a plain child path", () => {
    expect(toRelativePath("/home/me/proj", "/home/me/proj/src/main.ts")).toBe(
      "src/main.ts",
    );
  });

  it("returns the basename for a direct child", () => {
    expect(toRelativePath("/home/me/proj", "/home/me/proj/file.txt")).toBe(
      "file.txt",
    );
  });

  it("walks up with .. for siblings and ancestors", () => {
    expect(toRelativePath("/home/me/proj/src", "/home/me/proj/docs/a.md")).toBe(
      "../docs/a.md",
    );
    expect(toRelativePath("/home/me/proj/src/deep", "/home/me/other.txt")).toBe(
      "../../../other.txt",
    );
  });

  it("returns . when target equals cwd", () => {
    expect(toRelativePath("/home/me/proj", "/home/me/proj")).toBe(".");
  });

  it("ignores trailing slashes on either side", () => {
    expect(toRelativePath("/home/me/proj/", "/home/me/proj/src/")).toBe("src");
  });

  it("normalizes backslash separators", () => {
    expect(toRelativePath("C:/Users/me/proj", "C:/Users/me/proj/src/a.ts")).toBe(
      "src/a.ts",
    );
  });

  it("falls back to the absolute target across different Windows drives", () => {
    expect(toRelativePath("C:/Users/me", "D:/data/file.txt")).toBe(
      "D:/data/file.txt",
    );
  });
});

describe("formatScratchpadRef", () => {
  it("prefixes a safe path with @ and no quotes", () => {
    expect(formatScratchpadRef("src/main.ts")).toBe("@src/main.ts");
  });

  it("quotes a path with spaces", () => {
    expect(formatScratchpadRef("pepe largo.txt")).toBe('@"pepe largo.txt"');
  });

  it("quotes and escapes shell-special characters", () => {
    expect(formatScratchpadRef('weird"$name')).toBe('@"weird\\"\\$name"');
  });
});

describe("scratchpadRefForDrop", () => {
  it("combines relativization and formatting", () => {
    expect(
      scratchpadRefForDrop("/home/me/proj", "/home/me/proj/a b/c.txt"),
    ).toBe('@"a b/c.txt"');
  });
});
