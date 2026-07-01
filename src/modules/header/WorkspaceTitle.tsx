import { HugeiconsIcon } from "@hugeicons/react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";

type Props = {
  workspace: Pick<Workspace, "id" | "title" | "icon" | "color" | "statusId"> | null;
  tab: Tab | null;
};

export function WorkspaceTitle({ workspace, tab }: Props) {
  const agentTabTitle = useAgentTabTitle(tab);
  const workspaceStatuses = usePreferencesStore((s) => s.workspaceStatuses);

  if (!workspace) return null;

  const color = resolveWorkspaceColor(workspace.color, workspace.id);
  const icon = workspace.icon ? getWorkspaceIcon(workspace.icon) : null;
  const status = workspace.statusId
    ? (workspaceStatuses.find((s) => s.id === workspace.statusId) ?? null)
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
          {status && (
            <span className="shrink-0 rounded border border-border/70 px-1 py-0.5 text-[9.5px] font-medium uppercase tracking-wide leading-none text-muted-foreground">
              {status.label}
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
