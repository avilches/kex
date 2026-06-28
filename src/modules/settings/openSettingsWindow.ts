import { invoke } from "@tauri-apps/api/core";

export type SettingsTab =
  | "general"
  | "editor"
  | "filetypes"
  | "terminal"
  | "appearance"
  | "themes"
  | "shortcuts"
  | "external-editors"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  await invoke("open_settings_window", { tab: tab ?? null });
}

// Opens Settings > File Types, expanding the entry for `ext` if it exists.
// Encodes as "filetypes:ext" so SettingsApp can parse both tab and ext in one param.
export async function openFileTypesSettings(ext?: string): Promise<void> {
  const tab = ext ? `filetypes:${ext}` : "filetypes";
  await invoke("open_settings_window", { tab });
}
