import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { Theme } from "./types";

const STORE_PATH = "kex-custom-themes.json";
const KEY = "themes";
const CHANGED_EVENT = "kex://custom-themes-changed";

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export async function listCustomThemes(): Promise<Theme[]> {
  const v = await store.get<Theme[]>(KEY);
  return Array.isArray(v) ? v : [];
}

export async function saveCustomTheme(theme: Theme): Promise<void> {
  await invoke("custom_theme_save", { theme });
}

export async function deleteCustomTheme(id: string): Promise<void> {
  await invoke("custom_theme_delete", { id });
}

export async function onCustomThemesChange(cb: () => void): Promise<UnlistenFn> {
  const unsubLocal = await store.onChange((key) => {
    if (key === KEY) cb();
  });
  const unsubEvent = await listen(CHANGED_EVENT, () => cb());
  return () => {
    unsubLocal();
    unsubEvent();
  };
}
