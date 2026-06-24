import { describe, expect, it } from "vitest";
import { isHtmlPath, isMarkdownPath } from "./utils";

describe("isHtmlPath", () => {
  it("matches .html", () => expect(isHtmlPath("foo/bar.html")).toBe(true));
  it("matches .htm", () => expect(isHtmlPath("foo/bar.htm")).toBe(true));
  it("is case-insensitive", () => expect(isHtmlPath("FOO.HTML")).toBe(true));
  it("does not match .md", () => expect(isHtmlPath("foo.md")).toBe(false));
  it("does not match .tsx", () => expect(isHtmlPath("foo.tsx")).toBe(false));
});

describe("isMarkdownPath", () => {
  it("matches .md", () => expect(isMarkdownPath("foo.md")).toBe(true));
  it("does not match .html", () => expect(isMarkdownPath("foo.html")).toBe(false));
});
