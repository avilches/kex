import { describe, expect, it } from "vitest";
import { injectBase, PREVIEW_SANDBOX } from "./HtmlPreviewPane";

describe("PREVIEW_SANDBOX", () => {
  it("never includes allow-same-origin", () => {
    // srcDoc inherits the parent's origin: allow-same-origin here would let
    // a previewed HTML's <script> reach window.parent.__TAURI_INTERNALS__
    // and the full IPC surface (fs, shell, git). See TASK-556.
    const tokens = PREVIEW_SANDBOX.split(/\s+/);
    expect(tokens).not.toContain("allow-same-origin");
    expect(tokens).toContain("allow-scripts");
  });
});

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
