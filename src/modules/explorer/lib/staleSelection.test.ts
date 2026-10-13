import { describe, expect, it } from "vitest";
import { shouldClearSelection } from "./staleSelection";

describe("shouldClearSelection", () => {
  it("keeps a restored selection while its parent listing is loading", () => {
    expect(shouldClearSelection(false, "loading")).toBe(false);
    expect(shouldClearSelection(false, "idle")).toBe(false);
  });

  it("clears a selection from the old root after an in-session root change", () => {
    expect(shouldClearSelection(false, undefined)).toBe(true);
  });

  it("clears a selection whose parent folder was deleted or failed to list", () => {
    expect(shouldClearSelection(false, undefined)).toBe(true);
    expect(shouldClearSelection(false, "error")).toBe(true);
    expect(shouldClearSelection(false, "loaded")).toBe(true);
  });

  it("never clears a visible selection", () => {
    expect(shouldClearSelection(true, "loaded")).toBe(false);
    expect(shouldClearSelection(true, undefined)).toBe(false);
  });
});
