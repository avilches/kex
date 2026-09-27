import { describe, expect, it } from "vitest";
import { normalizeError } from "./errors";

describe("normalizeError", () => {
  it("returns a string error as-is", () => {
    expect(normalizeError("boom")).toBe("boom");
  });

  it("returns the message of an Error instance", () => {
    expect(normalizeError(new Error("boom"))).toBe("boom");
  });

  it("returns the message of an error-shaped object", () => {
    expect(normalizeError({ message: "boom" })).toBe("boom");
  });

  it("falls back to the default message for a non-string message", () => {
    expect(normalizeError({ message: 42 })).toBe("Unknown error");
  });

  it("falls back to the default message for an unrecognized value", () => {
    expect(normalizeError(null)).toBe("Unknown error");
    expect(normalizeError(undefined)).toBe("Unknown error");
    expect(normalizeError(42)).toBe("Unknown error");
  });

  it("uses a custom fallback when given one", () => {
    expect(normalizeError(null, "Unknown source control error")).toBe(
      "Unknown source control error",
    );
  });
});
