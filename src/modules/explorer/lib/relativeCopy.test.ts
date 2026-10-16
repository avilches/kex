import { describe, expect, it } from "vitest";
import { relativeCopyFor } from "./relativeCopy";

describe("relativeCopyFor", () => {
  it("returns the path relative to the root", () => {
    expect(relativeCopyFor("/w/app/src/a.ts", "/w/app")).toEqual({
      ok: true,
      text: "src/a.ts",
    });
  });

  it("returns a dot for the root itself", () => {
    expect(relativeCopyFor("/w/app", "/w/app")).toEqual({ ok: true, text: "." });
  });

  it("tolerates a trailing slash on the root and backslashes", () => {
    expect(relativeCopyFor("C:\\w\\app\\src", "C:/w/app/")).toEqual({
      ok: true,
      text: "src",
    });
  });

  it("explains when there is no root", () => {
    expect(relativeCopyFor("/w/app", null)).toEqual({
      ok: false,
      reason: "No workspace root",
    });
  });

  it("explains when the path is outside the root, including sibling prefixes", () => {
    const outside = { ok: false, reason: "Outside the workspace root" };
    expect(relativeCopyFor("/w", "/w/app")).toEqual(outside);
    expect(relativeCopyFor("/w/app2/x", "/w/app")).toEqual(outside);
  });

  it("handles a filesystem root", () => {
    expect(relativeCopyFor("/etc", "/")).toEqual({ ok: true, text: "etc" });
  });
});
