import type { TabEntry } from "./tabEntries";

// The absolute path a tab row shows on its second line: where the tab lives. Null when the
// tab has nowhere to point (a browser with no url yet).
export function tabLocation(entry: TabEntry): string | null {
  if (!entry.detail) return null;
  if (entry.kind !== "browser") return entry.detail;
  return entry.detail.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") || null;
}
