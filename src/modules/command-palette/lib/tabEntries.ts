import type { AgentEntryVisual } from "@/modules/agents/lib/notificationList";
import { allPanes } from "@/modules/workspaces/lib/splitNode";
import { tabDir } from "@/modules/workspaces/lib/titleVars";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";

export type TabSources = {
  displayTitle(tab: Tab): string;
  git(dir: string | undefined): { branch: string; repoRoot: string };
  runningCommand(tabId: string): string | null;
  agentOf(tabId: string): string | undefined;
  visualOf(tabId: string): AgentEntryVisual | null;
  lastUsed(tabId: string): number;
  workspaceActiveAt(workspaceId: string): number;
};

export type TabEntry = {
  tabId: string;
  workspaceId: string;
  workspaceTitle: string;
  hibernated: boolean;
  kind: Tab["kind"];
  title: string;
  note: string | null;
  cwd: string;
  // What tells two same-titled tabs apart: the url of a browser tab, the cwd of the rest.
  detail: string;
  worktree: string;
  branch: string;
  process: string;
  indicator: AgentEntryVisual | null;
  lastUsedAt: number;
  workspaceActiveAt: number;
  order: number;
};

export type WorkspaceEntry = {
  workspaceId: string;
  title: string;
  color: string | null;
  hibernated: boolean;
  tabCount: number;
  lastUsedAt: number;
};

const WORKTREE_RE = /[\\/]\.claude[\\/]worktrees[\\/]([^\\/]+)/;

export function worktreeName(path: string): string {
  return WORKTREE_RE.exec(path)?.[1] ?? "";
}

function processOf(tab: Tab, src: TabSources): string {
  const asleep = tab.kind === "terminal" ? tab.hibernation : undefined;
  const command = src.runningCommand(tab.id) ?? asleep?.command ?? "";
  const agent = src.agentOf(tab.id) ?? asleep?.agent ?? "";
  return [command.trim(), agent].filter(Boolean).join(" ");
}

export function buildTabEntries(workspaces: readonly Workspace[], src: TabSources): TabEntry[] {
  const out: TabEntry[] = [];
  let order = 0;
  for (const ws of workspaces) {
    const workspaceActiveAt = src.workspaceActiveAt(ws.id);
    for (const pane of allPanes(ws.paneTree)) {
      for (const tab of pane.tabs) {
        const cwd = tabDir(tab) ?? "";
        const git = src.git(cwd || undefined);
        out.push({
          tabId: tab.id,
          workspaceId: ws.id,
          workspaceTitle: ws.title,
          hibernated: !!ws.hibernated,
          kind: tab.kind,
          title: src.displayTitle(tab),
          note: tab.note?.trim() ? tab.note : null,
          cwd,
          detail: tab.kind === "browser" ? tab.url : cwd,
          worktree: worktreeName(git.repoRoot) || worktreeName(cwd),
          branch: git.branch,
          process: processOf(tab, src),
          indicator: src.visualOf(tab.id),
          lastUsedAt: src.lastUsed(tab.id),
          workspaceActiveAt,
          order: order++,
        });
      }
    }
  }
  return out;
}

export function buildWorkspaceEntries(workspaces: readonly Workspace[], src: TabSources): WorkspaceEntry[] {
  return workspaces.map((ws) => {
    const tabs = allPanes(ws.paneTree).flatMap((p) => p.tabs);
    const newestTab = tabs.reduce((max, t) => Math.max(max, src.lastUsed(t.id)), 0);
    return {
      workspaceId: ws.id,
      title: ws.title,
      color: ws.color ?? null,
      hibernated: !!ws.hibernated,
      tabCount: tabs.length,
      lastUsedAt: newestTab || src.workspaceActiveAt(ws.id),
    };
  });
}

export function duplicateTitleIds(entries: readonly TabEntry[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const e of entries) {
    const key = `${e.workspaceId}\u0000${e.title}`;
    const ids = groups.get(key);
    if (ids) ids.push(e.tabId);
    else groups.set(key, [e.tabId]);
  }
  const dup = new Set<string>();
  for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) dup.add(id);
  return dup;
}
