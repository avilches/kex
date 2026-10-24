import { invoke } from "@tauri-apps/api/core";
import { actionsSectionParam } from "@/modules/actions/lib/actionsTarget";

export type SettingsSection =
  | "general"
  | "workspaces"
  | "editor"
  | "agents"
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

// Opens Settings > Actions, on the Global or the current workspace tab.
export async function openGlobalActionsSettings(): Promise<void> {
  await invoke("open_settings_window", { section: actionsSectionParam("global") });
}

export async function openWorkspaceActionsSettings(): Promise<void> {
  await invoke("open_settings_window", { section: actionsSectionParam("workspace") });
}

// Opens Settings > Actions on the tab of the scope with that Action open.
export async function openActionSettings(scope: "global" | "workspace", id: string): Promise<void> {
  await invoke("open_settings_window", { section: actionsSectionParam(scope, id) });
}
