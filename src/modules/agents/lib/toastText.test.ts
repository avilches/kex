import { describe, expect, it } from "vitest";
import { toastBody, toastTitle } from "./toastText";

describe("toastText", () => {
  it("keeps short text untouched", () => {
    expect(toastTitle("Claude needs your input")).toBe("Claude needs your input");
    expect(toastBody("short")).toBe("short");
  });

  it("collapses newlines and runs of spaces into one line", () => {
    expect(toastBody("a\n\n  b\tc")).toBe("a b c");
  });

  it("truncates long text with an ellipsis within the limit", () => {
    const out = toastBody("x".repeat(500))!;
    expect(out.length).toBe(140);
    expect(out.endsWith("…")).toBe(true);
    expect(toastTitle("t".repeat(200)).length).toBe(60);
  });

  it("returns undefined for an empty body", () => {
    expect(toastBody(undefined)).toBeUndefined();
    expect(toastBody("")).toBeUndefined();
  });
});
