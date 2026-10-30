import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { workspaceDisplayColor } from "@/modules/workspaces/lib/workspaceColor";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import { useWorkspaceTitle } from "@/modules/workspaces/lib/workspaceTitle";
import type { Tab, Workspace, WorkspaceGroup } from "@/modules/workspaces/lib/types";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";

type Props = {
  workspace: Pick<Workspace, "id" | "title" | "icon" | "color" | "groupId" | "cwd" | "workspaceRoot"> | null;
  tab: Tab | null;
  groups: WorkspaceGroup[];
};

export function WorkspaceTitle({ workspace, tab, groups }: Props) {
  const agentTabTitle = useAgentTabTitle(tab);
  const shownTitle = useWorkspaceTitle({
    id: workspace?.id,
    title: workspace?.title ?? "",
    cwd: workspace?.cwd,
    workspaceRoot: workspace?.workspaceRoot,
    focusedTab: tab,
  });

  if (!workspace) return null;

  const group = workspace.groupId
    ? (groups.find((g) => g.id === workspace.groupId) ?? null)
    : null;

  const hasAgent = agentTabTitle?.hasAgent ?? false;
  const agentSession = agentTabTitle?.agentSession;
  const subtitle = agentTabTitle?.displayTitle ?? null;

  return (
    <div className="flex min-w-0 max-w-[340px] items-center gap-2">
      <WorkspaceMark
        id={workspace.id}
        color={workspaceDisplayColor(workspace)}
        icon={workspace.icon}
        size={workspace.icon ? 26 : 13.5}
      />
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold leading-none text-foreground">
            {shownTitle || "Workspace"}
          </span>
          {group && (
            <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-muted-foreground">
              {group.label}
            </span>
          )}
        </span>
        {subtitle && (
          <span className="flex min-w-0 items-center gap-1 text-[11px] leading-none text-muted-foreground">
            {hasAgent && (
              <span className="shrink-0">
                <AgentIcon agent={agentSession!.agent} size={11} />
              </span>
            )}
            <span className="truncate">{subtitle}</span>
          </span>
        )}
      </div>
    </div>
  );
}
