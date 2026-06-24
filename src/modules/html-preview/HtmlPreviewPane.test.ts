import { describe, expect, it } from "vitest";
import { injectBase } from "./HtmlPreviewPane";

describe("injectBase", () => {
  it("inserts base tag after <head>", () => {
    const input = "<html><head><title>T</title></head><body></body></html>";
    const result = injectBase(input, "https://asset.localhost/foo/");
    expect(result).toBe(
      '<html><head><base href="https://asset.localhost/foo/"><title>T</title></head><body></body></html>'
    );
  });

  it("inserts base tag after <head> with attributes", () => {
    const input = '<html><head lang="en"><title>T</title></head></html>';
    const result = injectBase(input, "https://asset.localhost/foo/");
    expect(result).toContain('<head lang="en"><base href="https://asset.localhost/foo/">');
  });

  it("prepends base tag when no <head>", () => {
    const input = "<p>Hello</p>";
    const result = injectBase(input, "https://asset.localhost/foo/");
    expect(result).toBe('<base href="https://asset.localhost/foo/"><p>Hello</p>');
  });

  it("handles empty string", () => {
    const result = injectBase("", "https://asset.localhost/foo/");
    expect(result).toBe('<base href="https://asset.localhost/foo/">');
  });
});
