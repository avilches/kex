import { pathBasename } from "@/lib/pathUtils";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { tabCopyPath } from "@/modules/workspaces/lib/tabPath";
import type { ClosedTabEntry } from "./closedEntries";
import type { MergedRow } from "./mergeRows";
import type { TabEntry } from "./tabEntries";

export type RowMenuItemId =
  | "go"
  | "terminal"
  | "copy"
  | "close"
  | "pick"
  | "worktrees"
  | "run"
  | "stop"
  | "edit";

export type RowMenuItem = {
  id: RowMenuItemId;
  label: string;
  // Enter shows the return key; every other item shows the user's binding for the shortcut.
  shortcutId?: ShortcutId;
  enter?: boolean;
  disabled?: boolean;
  // Full text for the tooltip when the label shortens something, such as a folder path.
  title?: string;
};

export function highlightedTabOf(value: string, rows: readonly MergedRow[]): TabEntry | null {
  for (const row of rows) {
    if (row.kind === "tab" && value === `tab:${row.entry.tabId}`) return row.entry;
  }
  return null;
}

export function highlightedActionOf(value: string, rows: readonly MergedRow[]): BarItem | null {
  for (const row of rows) {
    if (row.kind === "action" && value === row.key) return row.item;
  }
  return null;
}

export function actionMenuItems(item: BarItem): RowMenuItem[] {
  const label = item.state !== "idle" ? "Show script" : item.action.runInTerminal ? "Run" : "Open";
  const items: RowMenuItem[] = [{ id: "run", label, enter: true }];
  if (item.stoppable) items.push({ id: "stop", label: "Stop" });
  items.push({ id: "edit", label: "Edit" });
  return items;
}

export function highlightedClosedOf(
  value: string,
  rows: readonly MergedRow[],
): ClosedTabEntry | null {
  for (const row of rows) {
    if (row.kind === "closed" && value === row.entry.key) return row.entry;
  }
  return null;
}

export function closedMenuItems(entry: ClosedTabEntry): RowMenuItem[] {
  return [
    { id: "go", label: "Reopen Closed Tab", enter: true },
    {
      id: "copy",
      label: "Copy Absolute Path",
      shortcutId: "path.copy",
      disabled: !entry.path,
    },
  ];
}

export function tabEntryCopyPath(entry: TabEntry): string | null {
  if (entry.kind === "browser") return entry.detail || null;
  return tabCopyPath(entry.tab, entry.agentSession?.meta?.worktreeCwd ?? null);
}

export function tabMenuItems(entry: TabEntry): RowMenuItem[] {
  const closable = !entry.hibernated && !entry.tab.locked;
  return [
    {
      id: "go",
      label: entry.hibernated ? "Restore and go to Tab" : "Go to Tab",
      enter: true,
    },
    { id: "terminal", label: "Open new Terminal", shortcutId: "tab.new", disabled: !entry.cwd },
    {
      id: "copy",
      label: "Copy Absolute Path",
      shortcutId: "path.copy",
      disabled: !tabEntryCopyPath(entry),
    },
    { id: "close", label: "Close Tab", shortcutId: "tab.close", disabled: !closable },
  ];
}

export type FolderMenuTarget = {
  path: string;
  // The worktrees action of the row's repository, null when the row has none.
  worktrees: { kind: "show"; count: number } | { kind: "hide" } | null;
};

export function worktreesLabel(hint: NonNullable<FolderMenuTarget["worktrees"]>): string {
  if (hint.kind === "hide") return "Hide worktrees";
  return `Show ${hint.count} ${hint.count === 1 ? "worktree" : "worktrees"}`;
}

export function folderMenuItems(target: FolderMenuTarget): RowMenuItem[] {
  const items: RowMenuItem[] = [
    {
      id: "pick",
      label: `New Tab in ${pathBasename(target.path, { tolerateTrailingSlash: true }) || target.path}`,
      title: target.path,
      enter: true,
    },
  ];
  if (target.worktrees) {
    items.push({
      id: "worktrees",
      label: worktreesLabel(target.worktrees),
      shortcutId: "tab.new",
    });
  }
  items.push({ id: "copy", label: "Copy Absolute Path", shortcutId: "path.copy" });
  return items;
}

// The enabled item the arrow key reaches from `from`, wrapping around; -1 when none is enabled.
export function stepEnabled(
  items: readonly RowMenuItem[],
  from: number,
  direction: 1 | -1,
): number {
  const n = items.length;
  for (let i = 1; i <= n; i++) {
    const at = (((from + direction * i) % n) + n) % n;
    if (!items[at].disabled) return at;
  }
  return -1;
}

export type MenuAnchor = {
  rowTop: number;
  rowBottom: number;
  // Set when the menu was opened with the mouse: it hangs from the pointer, not from the row.
  pointer?: { x: number; y: number };
};

// Left edge for a menu opened at the pointer, kept inside the box.
export function placeMenuLeft(pointerX: number, boxWidth: number, menuWidth: number): number {
  return Math.max(0, Math.min(pointerX, boxWidth - menuWidth));
}

// Below the row when the menu fits, above it otherwise, and pinned to the bottom edge when it
// fits in neither, so it never leaves the palette.
export function placeMenuTop(anchor: MenuAnchor, boxHeight: number, menuHeight: number): number {
  const below = anchor.rowBottom + 2;
  if (below + menuHeight <= boxHeight) return below;
  const above = anchor.rowTop - menuHeight - 2;
  if (above >= 0) return above;
  return Math.max(0, boxHeight - menuHeight);
}
