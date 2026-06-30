import { allPanes } from "@/modules/workspaces/lib/splitNode";
import type { SplitNode } from "@/modules/workspaces/lib/types";

export function visibleTerminalPanels(tree: SplitNode): { panelId: string }[] {
  const out: { panelId: string }[] = [];
  for (const pane of allPanes(tree)) {
    const active = pane.tabs.find((p) => p.id === pane.activeTabId);
    if (active && active.kind === "terminal") out.push({ panelId: active.id });
  }
  return out;
}
