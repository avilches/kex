import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { allPanes } from "./splitNode";
import type { SplitNode, Tab, TabHibernation, Workspace } from "./types";

type TerminalTab = Extract<Tab, { kind: "terminal" }>;
export type SleepingTab = TerminalTab & { hibernation: TabHibernation };

export function isHibernatedTab(tab: Tab | null | undefined): tab is SleepingTab {
  return tab?.kind === "terminal" && tab.hibernation !== undefined;
}

// A sleeping tab has no terminal behind it, so only what acts on a live terminal is
// blocked; tab, pane, sidebar and explorer shortcuts work on it like on any other tab.
const BLOCKED_PREFIXES = ["terminal."];
const BLOCKED_IDS: readonly ShortcutId[] = ["search.focus"];

export function blockedWhileHibernated(id: ShortcutId): boolean {
  return BLOCKED_IDS.includes(id) || BLOCKED_PREFIXES.some((p) => id.startsWith(p));
}

// Palette commands share the shortcut ids; these have none and act on a live terminal.
const BLOCKED_COMMAND_IDS: readonly string[] = ["history.open"];

export function commandBlockedWhileHibernated(commandId: string): boolean {
  return BLOCKED_COMMAND_IDS.includes(commandId) || blockedWhileHibernated(commandId as ShortcutId);
}

function mapTabs(node: SplitNode, fn: (t: Tab) => Tab): SplitNode {
  if (node.kind === "pane") return { ...node, tabs: node.tabs.map(fn) };
  return { ...node, first: mapTabs(node.first, fn), second: mapTabs(node.second, fn) };
}

export function applyHibernate(
  workspaces: Workspace[],
  workspaceId: string,
  snapshots: Readonly<Record<string, TabHibernation>>,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId
      ? {
          ...w,
          paneTree: mapTabs(w.paneTree, (t) =>
            t.kind === "terminal" && !t.hibernation && snapshots[t.id] ? { ...t, hibernation: snapshots[t.id] } : t,
          ),
        }
      : w,
  );
}

export function applyWake(workspaces: Workspace[], workspaceId: string, tabIds: ReadonlySet<string>): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId
      ? {
          ...w,
          paneTree: mapTabs(w.paneTree, (t) => {
            if (t.kind !== "terminal" || !t.hibernation || !tabIds.has(t.id)) return t;
            const { hibernation: _hibernation, ...rest } = t;
            return rest;
          }),
        }
      : w,
  );
}

// Two units at most: "5m", "3h 20m", "2d 4h". A zero second unit is left out.
export function formatHibernatedFor(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  const unit = (big: number, bigLabel: string, small: number, smallLabel: string) =>
    small > 0 ? `${big}${bigLabel} ${small}${smallLabel}` : `${big}${bigLabel}`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "h", minutes % 60, "m");
  return unit(Math.floor(hours / 24), "d", hours % 24, "h");
}

export function hibernatedTabIds(workspaces: readonly Workspace[]): Set<string> {
  const ids = new Set<string>();
  for (const ws of workspaces) for (const t of terminalTabs(ws)) if (t.hibernation) ids.add(t.id);
  return ids;
}

// Tabs that slept before and do not now: woken, closed, or gone with their workspace. Whatever was
// stored for them has no use left.
export function departedHibernatedIds(before: ReadonlySet<string>, after: ReadonlySet<string>): string[] {
  return [...before].filter((id) => !after.has(id));
}

// The terminals that can still be put to sleep.
export function awakeTerminalTabs(ws: Workspace): TerminalTab[] {
  return terminalTabs(ws).filter((t) => !t.hibernation);
}

export function terminalTabs(ws: Workspace): TerminalTab[] {
  return allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((t): t is TerminalTab => t.kind === "terminal");
}

// The terminals that own a session (PTY and render slot): every terminal tab that is awake. The
// sweep that disposes sessions leaves the sleeping ones out, which is what frees their slot.
export function liveTerminalIds(workspaces: readonly Workspace[]): Set<string> {
  const ids = new Set<string>();
  for (const ws of workspaces) for (const t of awakeTerminalTabs(ws)) ids.add(t.id);
  return ids;
}

export function editorTabIds(ws: Workspace): string[] {
  return allPanes(ws.paneTree)
    .flatMap((p) => p.tabs)
    .filter((t) => t.kind === "editor" || t.kind === "markdown")
    .map((t) => t.id);
}

// What the restore will type into the tab: the agent resume command, else the Restore Command.
export function restoreCommandFor(tab: TerminalTab, plan: { resumeCmd: string } | null | undefined): string | undefined {
  return plan?.resumeCmd.trim() || tab.persistentCommand || undefined;
}

// The Restore Command is saved every time a terminal stops (hibernate or close), so waking it or
// undoing the close brings back what it was running. A shell with nothing to run is left alone, an
// agent that resumes its own session never copies the running command, and a command the user
// typed by hand is never replaced by the running one.
export function saveRestoreCommand(
  tab: Tab,
  live: { running: string | null; agentResumable: boolean | undefined },
): Tab {
  if (tab.kind !== "terminal" || tab.hibernation || live.agentResumable === true) return tab;
  const running = live.running ?? undefined;
  const command = tab.persistentCommandManual ? tab.persistentCommand : (running ?? tab.persistentCommand);
  return command === tab.persistentCommand ? tab : { ...tab, persistentCommand: command };
}

export function isPendingStale(pendingId: string | null, workspaces: readonly { id: string }[]): boolean {
  return pendingId !== null && !workspaces.some((w) => w.id === pendingId);
}

// The global shortcut listener runs in capture phase before the Radix dialog, so a modal
// does not block it; any dialog awaiting an answer must disable them.
export function workspaceDialogPending(hibernatePending: unknown, closePendingId: string | null | undefined): boolean {
  return hibernatePending != null || (closePendingId ?? null) !== null;
}
