import { allPanes } from "@/modules/workspaces/lib/splitNode";
import type { SplitNode } from "@/modules/workspaces/lib/types";

export function visibleTerminalTabs(tree: SplitNode): { tabId: string }[] {
  const out: { tabId: string }[] = [];
  for (const pane of allPanes(tree)) {
    const active = pane.tabs.find((p) => p.id === pane.activeTabId);
    if (active && active.kind === "terminal") out.push({ tabId: active.id });
  }
  return out;
}
