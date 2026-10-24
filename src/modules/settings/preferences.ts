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
    try {
      const prefs = await loadPreferences();
      set({ ...prefs, hydrated: true });
    } catch (err) {
      console.error("Failed to load preferences, using defaults:", err);
      set({ ...DEFAULT_PREFERENCES, hydrated: true });
    }
    markHydrated();
    void onPreferencesChange((key, value) => {
      set({ [key]: value } as Partial<State>);
    });
  },
}));
