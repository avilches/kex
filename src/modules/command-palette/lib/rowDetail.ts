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

const DOT = " \u00b7 ";

// The lines a tab row shows under its title: the path, the process the terminal runs (an agent
// already has its icon) and the branch. With both process and branch they get a line of their own;
// with only one it joins the path, the process before it and the branch after it.
export function tabDetailLines(entry: TabEntry): string[] {
  const path = tabLocation(entry);
  const process = entry.agent ? "" : processName(entry.command);
  const branch = entry.branch;
  if (process && branch) return [path, process + DOT + branch].filter((l): l is string => !!l);
  const line = [process, path, branch].filter(Boolean).join(DOT);
  return line ? [line] : [];
}
