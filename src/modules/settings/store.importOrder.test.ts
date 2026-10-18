import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";

describe("settings store import order", () => {
  it("seeds the preferences store when the store is imported first", () => {
    expect(usePreferencesStore.getState().themeId).toBe(DEFAULT_PREFERENCES.themeId);
  });
});
