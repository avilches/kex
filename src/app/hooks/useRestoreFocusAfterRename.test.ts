import { describe, expect, it } from "vitest";
import { shouldRestoreFocus } from "./useRestoreFocusAfterRename";

describe("shouldRestoreFocus", () => {
  const body = {} as Element;

  it("restores when nothing holds the focus", () => {
    expect(shouldRestoreFocus(null, body)).toBe(true);
    expect(shouldRestoreFocus(body, body)).toBe(true);
  });

  it("keeps a control the user clicked", () => {
    expect(shouldRestoreFocus({} as Element, body)).toBe(false);
  });
});
