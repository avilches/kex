import type { AgentSession } from "@/modules/agents/lib/types";
import type { AgentEntryVisual } from "@/modules/agents/lib/notificationList";
import { allPanes } from "@/modules/workspaces/lib/splitNode";
import { tabFilePath } from "@/modules/workspaces/lib/tabPath";
import { tabDir } from "@/modules/workspaces/lib/titleVars";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";

export type TabSources = {
  displayTitle(tab: Tab): string;
  workspaceTitle(ws: Workspace): string;
  git(dir: string | undefined): { branch: string; repoRoot: string };
  runningCommand(tabId: string): string | null;
  agentOf(tabId: string): string | undefined;
  agentSessionOf(tabId: string): AgentSession | undefined;
  visualOf(tabId: string): AgentEntryVisual | null;
  lastUsed(tabId: string): number;
  workspaceActiveAt(workspaceId: string): number;
};

export type TabEntry = {
  tabId: string;
  workspaceId: string;
  workspaceTitle: string;
  workspaceColor: string | null;
  workspaceIcon: string | null;
  hibernated: boolean;
  kind: Tab["kind"];
  title: string;
  note: string | null;
  cwd: string;
  // The absolute path the row shows on its second line: the url of a browser tab, the file
  // if the tab holds one, the folder otherwise.
  detail: string;
  worktree: string;
  branch: string;
  process: string;
  indicator: AgentEntryVisual | null;
  // The live tab and its agent session, so the row can draw the exact icon of the tab bar.
  tab: Tab;
  agentSession: AgentSession | undefined;
  running: boolean;
  lastUsedAt: number;
  workspaceActiveAt: number;
  order: number;
};

export type WorkspaceEntry = {
  workspaceId: string;
  title: string;
  color: string | null;
  icon: string | null;
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
    const workspaceTitle = src.workspaceTitle(ws);
    for (const pane of allPanes(ws.paneTree)) {
      for (const tab of pane.tabs) {
        const cwd = tabDir(tab) ?? "";
        const git = src.git(cwd || undefined);
        out.push({
          tabId: tab.id,
          workspaceId: ws.id,
          workspaceTitle,
          workspaceColor: ws.color ?? null,
          workspaceIcon: ws.icon ?? null,
          hibernated: !!ws.hibernated,
          kind: tab.kind,
          title: src.displayTitle(tab),
          note: tab.note?.trim() ? tab.note : null,
          cwd,
          detail: tab.kind === "browser" ? tab.url : (tabFilePath(tab) ?? cwd),
          worktree: worktreeName(git.repoRoot) || worktreeName(cwd),
          branch: git.branch,
          process: processOf(tab, src),
          indicator: src.visualOf(tab.id),
          tab,
          agentSession: src.agentSessionOf(tab.id),
          running: !!src.runningCommand(tab.id),
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
      title: src.workspaceTitle(ws),
      color: ws.color ?? null,
      icon: ws.icon ?? null,
      hibernated: !!ws.hibernated,
      tabCount: tabs.length,
      lastUsedAt: newestTab || src.workspaceActiveAt(ws.id),
    };
  });
}

