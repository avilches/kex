import { HugeiconsIcon } from "@hugeicons/react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import type { Tab, Workspace, WorkspaceGroup } from "@/modules/workspaces/lib/types";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";

type Props = {
  workspace: Pick<Workspace, "id" | "title" | "icon" | "color" | "groupId"> | null;
  tab: Tab | null;
  groups: WorkspaceGroup[];
};

export function WorkspaceTitle({ workspace, tab, groups }: Props) {
  const agentTabTitle = useAgentTabTitle(tab);

  if (!workspace) return null;

  const color = resolveWorkspaceColor(workspace.color, workspace.id);
  const icon = workspace.icon ? getWorkspaceIcon(workspace.icon) : null;
  const group = workspace.groupId
    ? (groups.find((g) => g.id === workspace.groupId) ?? null)
    : null;

  const hasAgent = agentTabTitle?.hasAgent ?? false;
  const agentSession = agentTabTitle?.agentSession;
  const subtitle = agentTabTitle?.displayTitle ?? null;

  return (
    <div className="flex min-w-0 max-w-[340px] items-center gap-2">
      {icon ? (
        <HugeiconsIcon
          icon={icon}
          size={26}
          strokeWidth={1.75}
          className="shrink-0"
          style={color ? { color } : undefined}
        />
      ) : (
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "hsl(var(--muted-foreground))" }}
        />
      )}
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold leading-none text-foreground">
            {workspace.title || "Workspace"}
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
