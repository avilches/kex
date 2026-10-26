import { toast } from "sonner";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import type { ClosedEntry } from "./types";

const NOTICE_ID = "closed-undo";

// What the newest entry of the closed stack says to the user. Tabs closed by
// one bulk action count as one close, since one undo returns them all.
export function closeNoticeTitle(entries: ClosedEntry[]): string | null {
  const top = entries[0];
  if (!top) return null;
  if (top.kind === "workspace") return "Workspace closed";
  if (!top.batchId) return "Tab closed";
  const count = entries.filter((e) => e.kind === "tab" && e.batchId === top.batchId).length;
  return count > 1 ? `${count} tabs closed` : "Tab closed";
}

// A fixed id makes each close replace the previous notice, so a bulk close or a
// tab that takes its workspace with it shows a single toast.
export function showCloseNotice(entries: ClosedEntry[]): void {
  const title = closeNoticeTitle(entries);
  if (!title) return;
  const shortcuts = usePreferencesStore.getState().shortcuts ?? {};
  const label = getShortcutLabel("tab.reopenClosed", shortcuts);
  toast(title, { id: NOTICE_ID, description: label ? `Press ${label} to undo this action` : undefined });
}

export function dismissCloseNotice(): void {
  toast.dismiss(NOTICE_ID);
}
