import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function queueNavAndNotify({
  workspaceId,
  tabId,
  title,
  body,
}: {
  workspaceId: string;
  tabId: string;
  title: string;
  body: string;
}): Promise<void> {
  const windowLabel = getCurrentWindow().label;
  try {
    await invoke("agent_os_notify", { windowLabel, workspaceId, tabId, title, body });
  } catch (e) {
    console.warn("[kex] agent_os_notify failed:", e);
  }
}
