import { useEffect } from "react";
import { native } from "@/lib/native";
import { isHibernatedTab } from "./hibernate";
import type { Tab } from "./types";

export function withoutKeptWorktree(tab: Tab): Tab {
  if (!isHibernatedTab(tab) || !tab.hibernation.worktreeCwd) return tab;
  const { worktreeCwd: _gone, ...rest } = tab.hibernation;
  return { ...tab, hibernation: rest };
}

// A tab can sleep for days and nothing tells it that the worktree it kept was removed meanwhile,
// so the focused one is checked and falls back to its shell folder when the worktree is gone.
export function usePruneSleepingWorktree(
  workspaceId: string | null,
  tab: Tab | null,
  update: (workspaceId: string, tabId: string, updater: (t: Tab) => Tab) => void,
) {
  const tabId = tab?.id;
  const kept = isHibernatedTab(tab) ? tab.hibernation.worktreeCwd : undefined;
  useEffect(() => {
    if (!workspaceId || !tabId || !kept) return;
    let cancelled = false;
    void native
      .fsStat(kept)
      .catch(() => null)
      .then((stat) => {
        if (!cancelled && !stat) update(workspaceId, tabId, withoutKeptWorktree);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, tabId, kept, update]);
}
