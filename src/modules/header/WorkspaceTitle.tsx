import { HugeiconsIcon } from "@hugeicons/react";
import { useSyncExternalStore } from "react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  subscribe as subscribeOscTitles,
  getSnapshot as getOscTitlesSnapshot,
} from "@/modules/terminal/lib/oscTitleStore";
import { agentAwareTabTitle, tabTitle } from "@/modules/workspaces/lib/tabTitle";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import type { Tab, Workspace } from "@/modules/workspaces/lib/types";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import { getWorkspaceIcon } from "@/modules/workspaces/lib/workspaceIcon";

type Props = {
  workspace: Pick<Workspace, "id" | "title" | "icon" | "color" | "statusId"> | null;
  tab: Tab | null;
};

export function WorkspaceTitle({ workspace, tab }: Props) {
  const runningCommandMap = useSyncExternalStore(
    subscribeToRunningCommands,
    getRunningCommandsSnapshot,
  );
  const oscTitleMap = useSyncExternalStore(subscribeOscTitles, getOscTitlesSnapshot);
  const agentSession = useAgentStore((s) => (tab ? s.sessions[tab.id] : undefined));
  const workspaceStatuses = usePreferencesStore((s) => s.workspaceStatuses);

  if (!workspace) return null;

  const color = resolveWorkspaceColor(workspace.color, workspace.id);
  const icon = workspace.icon ? getWorkspaceIcon(workspace.icon) : null;
  const status = workspace.statusId
    ? (workspaceStatuses.find((s) => s.id === workspace.statusId) ?? null)
    : null;

  const runningCommand =
    tab?.kind === "terminal" ? (runningCommandMap.get(tab.id) ?? null) : null;
  const oscTitle = tab?.kind === "terminal" ? oscTitleMap.get(tab.id) : undefined;

  const hasAgent = !!agentSession && tab?.kind === "terminal";
  const subtitle = tab
    ? agentAwareTabTitle(
        tab,
        hasAgent,
        agentSession?.agent,
        oscTitle,
        agentSession?.meta?.sessionTitle,
        tabTitle(tab, runningCommand, oscTitle),
      )
    : null;

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
