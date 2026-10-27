import { invoke } from "@tauri-apps/api/core";

export function saveHibernateLines(tabId: string, text: string): Promise<void> {
  return invoke<void>("hibernate_lines_save", { tabId, text });
}

export function readHibernateLines(tabId: string): Promise<string | null> {
  return invoke<string | null>("hibernate_lines_read", { tabId });
}

export function deleteHibernateLines(tabIds: readonly string[]): Promise<void> {
  if (tabIds.length === 0) return Promise.resolve();
  return invoke<void>("hibernate_lines_delete", { tabIds: [...tabIds] });
}
