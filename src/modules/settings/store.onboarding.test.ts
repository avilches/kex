import { beforeEach, describe, expect, it, vi } from "vitest";

const backing = vi.hoisted(() => ({ general: [] as [string, unknown][] }));

vi.mock("@tauri-apps/plugin-store", () => {
  class LazyStore {
    private readonly path: string;
    constructor(path: string) {
      this.path = path;
    }
    async entries() {
      return this.path.includes("general") ? backing.general : [];
    }
    async get() {
      return undefined;
    }
    async set() {}
    async save() {}
    async onChange() {
      return () => {};
    }
  }
  return { LazyStore };
});
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));

import { DEFAULT_PREFERENCES, loadPreferences } from "./store";

describe("onboarding persistence", () => {
  beforeEach(() => {
    backing.general = [];
  });

  it("defaults to finished so nothing flashes before the load", () => {
    expect(DEFAULT_PREFERENCES.onboarding.finished).toBe(true);
  });

  it("a fresh store loads onboarding as not finished", async () => {
    const prefs = await loadPreferences();
    expect(prefs.onboarding).toEqual({ finished: false, step: "welcome", shown: false, reminded: false });
  });

  it("a store with prior keys loads it as finished", async () => {
    backing.general = [["zoomLevel", 1]];
    const prefs = await loadPreferences();
    expect(prefs.onboarding.finished).toBe(true);
  });
});
