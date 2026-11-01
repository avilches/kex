import { beforeEach, describe, expect, it, vi } from "vitest";

const backing = vi.hoisted(() => ({
  onboarding: undefined as unknown,
  sets: [] as [string, string, unknown][],
  emitted: [] as unknown[],
}));

vi.mock("@tauri-apps/plugin-store", () => {
  class LazyStore {
    private readonly path: string;
    constructor(path: string) {
      this.path = path;
    }
    async entries() {
      return [];
    }
    async get(key: string) {
      if (this.path === "settings-onboarding.json" && key === "onboarding") return backing.onboarding;
      return undefined;
    }
    async set(key: string, value: unknown) {
      backing.sets.push([this.path, key, value]);
    }
    async save() {}
    async onChange() {
      return () => {};
    }
  }
  return { LazyStore };
});
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async (_name: string, payload: unknown) => {
    backing.emitted.push(payload);
  }),
  listen: vi.fn(async () => () => {}),
}));

import { DEFAULT_PREFERENCES, loadPreferences, updateOnboarding } from "./store";

const FRESH = { finished: false, step: "welcome", shown: false, reminded: false };

describe("onboarding persistence", () => {
  beforeEach(() => {
    backing.onboarding = undefined;
    backing.sets = [];
    backing.emitted = [];
  });

  it("defaults to finished so nothing flashes before the load", () => {
    expect(DEFAULT_PREFERENCES.onboarding.finished).toBe(true);
  });

  it("an absent onboarding store loads as not finished and writes nothing", async () => {
    const prefs = await loadPreferences();
    expect(prefs.onboarding).toEqual(FRESH);
    expect(backing.sets.filter(([, k]) => k === "onboarding")).toEqual([]);
  });

  it("a stored valid value loads as stored", async () => {
    backing.onboarding = { finished: false, step: "agents", shown: true, reminded: false };
    const prefs = await loadPreferences();
    expect(prefs.onboarding).toEqual({ finished: false, step: "agents", shown: true, reminded: false });
  });

  it("a malformed stored value loads as finished", async () => {
    backing.onboarding = "junk";
    const prefs = await loadPreferences();
    expect(prefs.onboarding.finished).toBe(true);
  });

  it("updateOnboarding reads a missing value as fresh and writes to the onboarding store with its change event", async () => {
    const seen: unknown[] = [];
    await updateOnboarding((current) => {
      seen.push(current);
      return { ...current, shown: true };
    });
    expect(seen).toEqual([FRESH]);
    expect(backing.sets).toEqual([
      ["settings-onboarding.json", "onboarding", { ...FRESH, shown: true }],
    ]);
    expect(backing.emitted).toEqual([
      { store: "onboarding", key: "onboarding", value: { ...FRESH, shown: true } },
    ]);
  });

  it("the general store never receives an onboarding key", async () => {
    await loadPreferences();
    await updateOnboarding((c) => c);
    expect(
      backing.sets.filter(([path, k]) => path === "settings-general.json" && k === "onboarding"),
    ).toEqual([]);
  });
});
