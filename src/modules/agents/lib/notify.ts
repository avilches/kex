import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted = false;

async function ensurePermission(): Promise<boolean> {
  if (granted) return true;
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  granted = ok;
  return ok;
}

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
    await invoke("agent_queue_nav", { windowLabel, workspaceId, tabId });
  } catch (e) {
    console.warn("[kex] agent_queue_nav failed:", e);
  }
  try {
    if (await ensurePermission()) sendNotification({ title, body });
  } catch (e) {
    console.warn("[kex] os notification failed:", e);
  }
}
