import { invoke } from "@tauri-apps/api/core";

export type SettingsTab =
  | "general"
  | "editor"
  | "terminal"
  | "appearance"
  | "themes"
  | "shortcuts"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  await invoke("open_settings_window", { tab: tab ?? null });
}

// Opens Settings > Editor > File Types, expanding the entry for `ext` if it exists.
// Encodes as "editor:ext" so SettingsApp can parse both tab and section in one param.
export async function openEditorFileTypesSettings(ext?: string): Promise<void> {
  const tab = ext ? `editor:${ext}` : "editor";
  await invoke("open_settings_window", { tab });
}
