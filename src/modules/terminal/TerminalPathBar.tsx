import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { buildCwdBreadcrumb } from "@/modules/workspaces/pathbar/cwdBreadcrumb";
import { PathBreadcrumb } from "@/modules/workspaces/pathbar/PathBreadcrumb";
import { DirSegmentContextMenu } from "@/modules/workspaces/pathbar/DirSegmentContextMenu";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { useMetrics } from "@/modules/workspaces/lib/terminalMetricsStore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { AgentSession } from "@/modules/agents/lib/types";
import type { Tab } from "@/modules/workspaces/lib/types";
import { ComputerTerminal01Icon, ReloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatCpu, formatMem } from "./lib/metricsFormat";
import { agentChip } from "./lib/agentChip";
import { TerminalPathBarMenu } from "./TerminalPathBarMenu";

function AgentChipIndicator({ session }: { session: AgentSession }) {
  const chip = agentChip(session.status);
  const model = session.meta?.model ?? session.agent;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", chip.dotClass)} title={chip.title} />
      <span>{model}</span>
    </span>
  );
}

type Props = {
  tabId: string;
  cwd: string;
  home: string | null;
  workspaceRoot: string | null;
  gitRootPath: string | null;
  restoreOnRestart?: boolean;
  persistentCommand?: string;
  onUpdateTab?: (updater: (p: Tab) => Tab) => void;
  onReveal?: (path: string) => void;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function TerminalPathBar({
  tabId,
  cwd,
  home,
  workspaceRoot,
  gitRootPath,
  restoreOnRestart,
  persistentCommand,
  onUpdateTab,
  onReveal,
  onSetAsRoot,
  onNewWorkspaceFromFolder,
  onRevealInTerminal,
  onAddToGitignore,
}: Props) {
  const metrics = useMetrics(tabId);
  const running =
    useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot).get(tabId) ??
    null;
  const agentSession = useAgentStore((s) => s.sessions[tabId] ?? null);
  const { segments } = buildCwdBreadcrumb(cwd, workspaceRoot, home);
  const process = running ?? metrics?.shellName ?? null;
  return (
    <div className="flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PathBreadcrumb
          grow={false}
          segments={segments}
          onRevealPath={(p) => onReveal?.(p)}
          renderSegment={(seg, trigger) => (
            <DirSegmentContextMenu
              path={seg.fullPath}
              workspaceRoot={workspaceRoot}
              gitRootPath={gitRootPath}
              onSetAsRoot={onSetAsRoot}
              onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
              onRevealInTerminal={onRevealInTerminal}
              onAddToGitignore={onAddToGitignore}
            >
              {trigger}
            </DirSegmentContextMenu>
          )}
        />
        {process && (
          <span
            title={process}
            className={cn(
              "flex min-w-0 shrink items-center gap-1 font-mono text-muted-foreground",
              running && "text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={ComputerTerminal01Icon}
              size={12}
              strokeWidth={1.75}
              className="shrink-0"
            />
            <span className="truncate">{process}</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-muted-foreground">
        {metrics && (
          <span title="Process ID">{metrics.pid}</span>
        )}
        {metrics && (
          <>
            <span className="text-border/60">&middot;</span>
            <span className={cn(metrics.cpuPercent < 0.05 && "text-muted-foreground/50")}>
              {formatCpu(metrics.cpuPercent)}
            </span>
            <span className="text-border/60">&middot;</span>
            <span>{formatMem(metrics.memBytes)}</span>
          </>
        )}
        {restoreOnRestart !== false && persistentCommand && (
          <span
            title={persistentCommand}
            className="flex size-[22px] items-center justify-center text-muted-foreground"
          >
            <HugeiconsIcon icon={ReloadIcon} size={11} strokeWidth={1.75} />
          </span>
        )}
        {agentSession && <AgentChipIndicator session={agentSession} />}
        <TerminalPathBarMenu
          leafId={tabId}
          restoreOnRestart={restoreOnRestart}
          persistentCommand={persistentCommand}
          onUpdateTab={onUpdateTab ?? (() => {})}
          agentSession={agentSession}
          runningCommand={running}
        />
      </div>
    </div>
  );
}
