import { create } from "zustand";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  onPreferencesChange,
  type Preferences,
} from "./store";

type State = Preferences & {
  hydrated: boolean;
  /** Subscribe & hydrate. Idempotent — safe to call from multiple windows. */
  init: () => Promise<void>;
};

let initialized = false;

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
    void onPreferencesChange((key, value) => {
      set({ [key]: value } as Partial<State>);
    });
  },
}));
