import { beforeEach, describe, expect, it, vi } from "vitest";

const backing = vi.hoisted(() => ({
  general: [] as [string, unknown][],
  generalSets: [] as [string, unknown][],
}));

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
    async set(key: string, value: unknown) {
      if (this.path.includes("general")) backing.generalSets.push([key, value]);
    }
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
    backing.generalSets = [];
  });

  const writtenOnboarding = () => backing.generalSets.filter(([k]) => k === "onboarding").map(([, v]) => v);

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

  it("a fresh store writes onboarding as not finished on the first load", async () => {
    await loadPreferences();
    expect(writtenOnboarding()).toEqual([
      { finished: false, step: "welcome", shown: false, reminded: false },
    ]);
  });

  it("a store with prior keys and no onboarding writes it as finished", async () => {
    backing.general = [["zoomLevel", 1]];
    await loadPreferences();
    expect(writtenOnboarding()).toHaveLength(1);
    expect(writtenOnboarding()[0]).toMatchObject({ finished: true });
  });

  it("never overwrites an onboarding state that is already stored", async () => {
    backing.general = [["onboarding", { finished: false, step: "agents", shown: true, reminded: false }]];
    const prefs = await loadPreferences();
    expect(writtenOnboarding()).toEqual([]);
    expect(prefs.onboarding).toEqual({ finished: false, step: "agents", shown: true, reminded: false });
  });
});
