import { invoke } from "@tauri-apps/api/core";

export type SettingsSection =
  | "general"
  | "workspaces"
  | "editor"
  | "filetypes"
  | "terminal"
  | "appearance"
  | "themes"
  | "shortcuts"
  | "external-editors"
  | "about";

export async function openSettingsWindow(section?: SettingsSection): Promise<void> {
  await invoke("open_settings_window", { section: section ?? null });
}

// Opens Settings > File Types, expanding the entry for `ext` if it exists.
// Encodes as "filetypes:ext" so SettingsApp can parse both section and ext in one param.
export async function openFileTypesSettings(ext?: string): Promise<void> {
  const section = ext ? `filetypes:${ext}` : "filetypes";
  await invoke("open_settings_window", { section });
}
