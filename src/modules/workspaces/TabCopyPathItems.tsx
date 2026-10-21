import { ContextMenuSeparator } from "@/components/ui/context-menu";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  CopyAbsolutePathItem,
  CopyRelativePathItem,
} from "@/modules/explorer/lib/copyPathItems";
import { useSidebarTabMenu } from "./SidebarTabMenuContext";
import { tabCopyPath } from "./lib/tabPath";
import type { Tab } from "./lib/types";

// Nothing renders for a tab with no path (browser, git history), separator included.
export function TabCopyPathItems({ tab, workspaceId }: { tab: Tab; workspaceId: string }) {
  const { workspaceRoot } = useSidebarTabMenu();
  const agentWorktree = useAgentStore((s) => s.sessions[tab.id]?.meta?.worktreeCwd ?? null);
  const path = tabCopyPath(tab, agentWorktree);
  if (!path) return null;
  return (
    <>
      <ContextMenuSeparator />
      <CopyAbsolutePathItem path={path} compact={false} shortcut="path.copy" />
      <CopyRelativePathItem path={path} workspaceRoot={workspaceRoot(workspaceId)} compact={false} />
      <ContextMenuSeparator />
    </>
  );
}
