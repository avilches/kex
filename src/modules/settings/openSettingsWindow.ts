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
  | "actions"
  | "about";

export async function openSettingsWindow(section?: SettingsSection): Promise<void> {
  await invoke("open_settings_window", { section: section ?? null });
}

// Opens Settings > Appearance scrolled to the block that edits the default tab and workspace
// titles. With Settings already open it only focuses the window and scrolls.
export async function openTitleTemplatesSettings(): Promise<void> {
  await invoke("open_settings_window", { section: "appearance:titles" });
}

// Opens Settings > File Types, expanding the entry for `ext` if it exists.
// Encodes as "filetypes:ext" so SettingsApp can parse both section and ext in one param.
export async function openFileTypesSettings(ext?: string): Promise<void> {
  const section = ext ? `filetypes:${ext}` : "filetypes";
  await invoke("open_settings_window", { section });
}

// Opens Settings > Actions with a blank command draft ready to be typed. Encodes as
// "actions:script", the filetypes scheme again: section plus the extra from one param.
// The workspace tab of the section edits the Actions of the current workspace.
export async function openGlobalActionsSettings(withDraft = false): Promise<void> {
  await invoke("open_settings_window", { section: withDraft ? "actions:script" : "actions" });
}

export async function openWorkspaceActionsSettings(withDraft = false): Promise<void> {
  await invoke("open_settings_window", { section: withDraft ? "actions:workspace:script" : "actions:workspace" });
}
