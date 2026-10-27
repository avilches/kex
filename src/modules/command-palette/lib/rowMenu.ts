import { pathBasename } from "@/lib/pathUtils";
import type { BarItem } from "@/modules/actions/lib/actionsBar";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { relativeCopyFor } from "@/modules/explorer/lib/relativeCopy";
import type { AutofocusMode } from "@/modules/settings/store";
import { hasTabNote, isTabNoteOpen } from "@/modules/workspaces/lib/tabNote";
import { tabCopyPath, tabFilePath } from "@/modules/workspaces/lib/tabPath";
import { isAutofocusTab } from "@/modules/workspaces/lib/types";
import type { ClosedTabEntry } from "./closedEntries";
import type { MergedRow } from "./mergeRows";
import type { TabEntry, WorkspaceEntry } from "./tabEntries";
import { tabRowKey } from "./tabRank";

export type RowMenuItemId =
  | "go"
  | "terminal"
  | "copy"
  | "copyRelative"
  | "tabId"
  | "close"
  | "closeOthers"
  | "lock"
  | "hibernateTab"
  | "save"
  | "note"
  | "removeNote"
  | "focusSidebar"
  | "autofocus"
  | "moveWorkspace"
  | "rename"
  | "hibernate"
  | "closeTabs"
  | "closeWorkspace"
  | "settings"
  | "pick"
  | "worktrees"
  | "run"
  | "stop"
  | "edit"
  | "action";

export type RowMenuItem = {
  id: RowMenuItemId;
  label: string;
  // Enter shows the return key; every other item shows the user's binding for the shortcut.
  shortcutId?: ShortcutId;
  enter?: boolean;
  disabled?: boolean;
  // A toggle that is on: Unlock and Restore draw their alternate icon, Autofocus tints its own.
  active?: boolean;
  // Full text for the tooltip when the label shortens something, such as a folder path.
  title?: string;
  // A value the item acts on, drawn dimmed in monospace after the label.
  value?: string;
  // The Action an "action" item runs.
  actionId?: string;
  // The 1-9 key that runs it while the menu is open (Cmd+digit).
  digit?: number;
  // First item of the Actions block: a rule above it.
  separatorBefore?: boolean;
  // First Action of a scope: a title above it, like the Header combo.
  heading?: string;
};

export function highlightedTabOf(value: string, rows: readonly MergedRow[]): TabEntry | null {
  for (const row of rows) {
    if (row.kind === "tab" && value === `tab:${row.entry.tabId}`) return row.entry;
  }
  return null;
}

export function highlightedWorkspaceOf(
  value: string,
  rows: readonly MergedRow[],
): WorkspaceEntry | null {
  for (const row of rows) {
    if (row.kind === "workspace" && value === `ws:${row.entry.workspaceId}`) return row.entry;
  }
  return null;
}

// The workspace a highlighted row belongs to: its own for a workspace row, the one holding the
// tab for a tab row, null for any other kind of row.
export function workspaceIdOfRow(value: string, rows: readonly MergedRow[]): string | null {
  const ws = highlightedWorkspaceOf(value, rows);
  if (ws) return ws.workspaceId;
  return highlightedTabOf(value, rows)?.workspaceId ?? null;
}

// Every row that belongs to the workspace: the workspace row itself and each of its tabs.
export function workspaceRowKeys(rows: readonly MergedRow[], workspaceId: string): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.kind === "workspace" && row.entry.workspaceId === workspaceId) keys.add(row.key);
    else if (row.kind === "tab" && row.entry.workspaceId === workspaceId) keys.add(row.key);
  }
  return keys;
}

export function workspaceMenuItems(entry: WorkspaceEntry): RowMenuItem[] {
  const items: RowMenuItem[] = [{ id: "go", label: "Go to Workspace", enter: true }];
  if (entry.root) {
    items.push({ id: "terminal", label: "New Terminal", title: entry.root, shortcutId: "tab.new" });
  }
  items.push({ id: "rename", label: "Rename Workspace", shortcutId: "workspace.rename" });
  if (entry.canHibernate) items.push({ id: "hibernate", label: "Hibernate Workspace" });
  if (entry.tabCount > 0) items.push({ id: "closeTabs", label: "Close All Tabs" });
  items.push({ id: "closeWorkspace", label: "Close Workspace", shortcutId: "workspace.close" });
  items.push({
    id: "settings",
    label: "Workspace Settings",
    shortcutId: "workspace.settings",
    separatorBefore: true,
  });
  return items;
}

export function highlightedActionOf(value: string, rows: readonly MergedRow[]): BarItem | null {
  for (const row of rows) {
    if (row.kind === "action" && value === row.key) return row.item;
  }
  return null;
}

export function actionMenuItems(item: BarItem): RowMenuItem[] {
  const label = item.state !== "idle" ? "Show script" : item.action.kind === "app" ? "Open" : "Run";
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

export type TabMenuContext = { autofocusMode: AutofocusMode };

// The folder or file "Focus on Sidebar" reveals; the worktree an agent entered wins over the cwd,
// like the shortcut.
export function tabFocusTarget(entry: TabEntry): string | null {
  const { tab } = entry;
  if (tab.kind === "terminal") return entry.agentSession?.meta?.worktreeCwd ?? tab.cwd ?? null;
  return tabFilePath(tab);
}

export function tabEntryRelativePath(entry: TabEntry) {
  if (entry.kind === "browser") return null;
  const path = tabEntryCopyPath(entry);
  return path ? relativeCopyFor(path, entry.workspaceRoot) : null;
}

export function noteLabel(entry: TabEntry): string {
  if (isTabNoteOpen(entry.tab)) return "Hide Note";
  return hasTabNote(entry.tab) ? "Show Note" : "Add Note";
}

export function tabMenuItems(entry: TabEntry, ctx: TabMenuContext): RowMenuItem[] {
  const { tab } = entry;
  const locked = !!tab.locked;
  const items: RowMenuItem[] = [
    {
      id: "go",
      label: entry.hibernated ? "Restore and go to Tab" : "Go to Tab",
      enter: true,
    },
    { id: "terminal", label: "Open new Terminal", shortcutId: "tab.new", disabled: !entry.cwd },
  ];
  if ((tab.kind === "editor" || tab.kind === "markdown") && tab.dirty) {
    items.push({ id: "save", label: "Save", shortcutId: "editor.save" });
  }
  items.push({ id: "note", label: noteLabel(entry), shortcutId: "tab.note", separatorBefore: true });
  if (hasTabNote(tab)) items.push({ id: "removeNote", label: "Remove Note" });
  items.push({
    id: "copy",
    label: "Copy Absolute Path",
    shortcutId: "path.copy",
    disabled: !tabEntryCopyPath(entry),
    separatorBefore: true,
  });
  const rel = tabEntryRelativePath(entry);
  if (rel && !(rel.ok && rel.text === ".")) {
    items.push({
      id: "copyRelative",
      label: "Copy Relative Path",
      title: rel.ok ? rel.text : rel.reason,
      disabled: !rel.ok,
    });
  }
  items.push({ id: "tabId", label: "Copy Tab ID", value: entry.tabId, title: entry.tabId });
  const focusTarget = tabFocusTarget(entry);
  if (focusTarget) {
    items.push({
      id: "focusSidebar",
      label: "Focus on Sidebar",
      shortcutId: "tab.focusOnExplorer",
      title: focusTarget,
      disabled: isAutofocusTab(tab) && !!tab.autofocus,
    });
  }
  if (isAutofocusTab(tab) && ctx.autofocusMode === "manual") {
    items.push({
      id: "autofocus",
      label: "Autofocus Sidebar",
      shortcutId: "tab.toggleAutofocus",
      active: !!tab.autofocus,
    });
  }
  items.push({ id: "moveWorkspace", label: "Move to Workspace" });
  if (tab.kind === "terminal") {
    items.push({
      id: "hibernateTab",
      label: entry.hibernated ? "Restore Tab" : "Hibernate Tab",
      shortcutId: "tab.hibernate",
      active: entry.hibernated,
      separatorBefore: true,
    });
  }
  items.push({
    id: "lock",
    label: locked ? "Unlock Tab" : "Lock Tab",
    shortcutId: "tab.lock",
    active: locked,
    separatorBefore: tab.kind !== "terminal",
  });
  items.push(
    { id: "close", label: "Close Tab", shortcutId: "tab.close", disabled: locked },
    { id: "closeOthers", label: "Close Other Tabs", disabled: entry.paneTabCount <= 1 },
    { id: "closeWorkspace", label: "Close Workspace", shortcutId: "workspace.close" },
  );
  return items;
}

// Whether the item leaves the palette open: it toggles or saves in place, so the row stays and
// shows the new state. Every other item closes the palette or removes rows through the close flow.
// Add and Show Note hand the keyboard to the note, so they close it; Hide Note does not.
export function tabItemKeepsPalette(id: RowMenuItemId, entry: TabEntry): boolean {
  if (id === "note") return isTabNoteOpen(entry.tab);
  return (
    id === "lock" ||
    id === "hibernateTab" ||
    id === "save" ||
    id === "removeNote" ||
    id === "autofocus"
  );
}

// The item a tab shortcut would run on this row, or null when the menu does not offer it or has it
// disabled. Close stays runnable on a locked tab: refusing it flashes the lock.
export function runnableTabItem(
  entry: TabEntry,
  ctx: TabMenuContext,
  id: RowMenuItemId,
): RowMenuItem | null {
  const item = tabMenuItems(entry, ctx).find((i) => i.id === id);
  if (!item || (item.disabled && id !== "close")) return null;
  return item;
}

// Rows of the other tabs of the same pane that "Close Other Tabs" will close: locked ones stay.
export function otherTabRowKeys(entries: readonly TabEntry[], entry: TabEntry): Set<string> {
  const keys = new Set<string>();
  for (const other of entries) {
    if (other.tabId === entry.tabId || other.tab.locked) continue;
    if (other.workspaceId === entry.workspaceId && other.paneId === entry.paneId) {
      keys.add(tabRowKey(other.tabId));
    }
  }
  return keys;
}

export type FolderMenuTarget = {
  path: string;
  // The worktrees action of the row's repository, null when the row has none.
  worktrees: { kind: "show"; count: number } | { kind: "hide" } | null;
  // The Actions that run in the row's folder, in the order the menu lists them.
  actions?: readonly {
    id: string;
    label: string;
    title: string | null;
    scope: "workspace" | "global";
  }[];
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
      shortcutId: "palette.worktrees",
    });
  }
  items.push({ id: "copy", label: "Copy Absolute Path", shortcutId: "path.copy" });
  const actions = target.actions ?? [];
  const titled = actions.some((a) => a.scope === "workspace") && actions.some((a) => a.scope === "global");
  actions.forEach((action, i) => {
    const firstOfScope = i === 0 || actions[i - 1].scope !== action.scope;
    items.push({
      id: "action",
      actionId: action.id,
      label: action.label,
      ...(i < 9 ? { digit: i + 1 } : {}),
      ...(action.title ? { title: action.title } : {}),
      ...(i === 0 || (titled && firstOfScope) ? { separatorBefore: true } : {}),
      ...(titled && firstOfScope
        ? { heading: action.scope === "global" ? "Global actions" : "Workspace actions" }
        : {}),
    });
  });
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
