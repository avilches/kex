import type { TabEntry } from "./tabEntries";

// The absolute path a tab row shows on its second line: where the tab lives. Null when the
// tab has nowhere to point (a browser with no url yet).
export function tabLocation(entry: TabEntry): string | null {
  if (!entry.detail) return null;
  if (entry.kind !== "browser") return entry.detail;
  return entry.detail.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") || null;
}

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// The program of a command line, without arguments, path or leading VAR=value assignments.
function processName(command: string): string {
  const word = command.split(/\s+/).find((w) => w && !ENV_ASSIGNMENT.test(w)) ?? "";
  return word.split(/[\\/]/).pop() ?? "";
}

// The line under the path: the process the terminal runs (an agent already has its icon) and the
// branch, joined by a middle dot. Null when the tab has neither.
export function tabStatus(entry: TabEntry): string | null {
  const process = entry.agent ? "" : processName(entry.command);
  return [process, entry.branch].filter(Boolean).join(" · ") || null;
}
