import { create } from "zustand";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  onPreferencesChange,
  type Preferences,
} from "./store";

type State = Preferences & {
  hydrated: boolean;
  /** Subscribe & hydrate. Idempotent - safe to call from multiple windows. */
  init: () => Promise<void>;
};

let initialized = false;
let markHydrated: () => void = () => {};
const hydration = new Promise<void>((resolve) => {
  markHydrated = resolve;
});

/** Resolves once the first load from disk has landed in the store, in this window. */
export function whenHydrated(): Promise<void> {
  return hydration;
}

export const usePreferencesStore = create<State>((set) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,
  init: async () => {
    if (initialized) return;
    initialized = true;
    const early: Array<[string, unknown]> = [];
    let loaded = false;
    try {
      await onPreferencesChange((key, value) => {
        if (loaded) set({ [key]: value } as Partial<State>);
        else early.push([key, value]);
      });
    } catch (err) {
      console.error("Failed to subscribe to preference changes:", err);
    }
    try {
      const prefs = await loadPreferences();
      set({ ...prefs, hydrated: true });
    } catch (err) {
      console.error("Failed to load preferences, using defaults:", err);
      set({ ...DEFAULT_PREFERENCES, hydrated: true });
    }
    // Events that landed during the disk read are newer than it, so they go on top.
    for (const [key, value] of early) set({ [key]: value } as Partial<State>);
    loaded = true;
    markHydrated();
  },
}));
