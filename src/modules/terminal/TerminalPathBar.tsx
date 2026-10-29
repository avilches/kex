import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { buildCwdBreadcrumb } from "@/modules/workspaces/pathbar/cwdBreadcrumb";
import { PathBreadcrumb } from "@/modules/workspaces/pathbar/PathBreadcrumb";
import { DirSegmentContextMenu } from "@/modules/workspaces/pathbar/DirSegmentContextMenu";
import type { RevealAction } from "@/modules/workspaces/pathbar/segmentMenuItems";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { useMetrics } from "@/modules/workspaces/lib/terminalMetricsStore";
import { AppWindowMacIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ProcessSegmentContextMenu } from "./ProcessSegmentContextMenu";
import { formatCpu, formatMem } from "./lib/metricsFormat";

type Props = {
  tabId: string;
  cwd: string;
  home: string | null;
  workspaceRoot: string | null;
  gitRootPath: string | null;
  onFocusOnExplorer?: (path: string, action?: RevealAction) => void;
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
  onFocusOnExplorer,
  onSetAsRoot,
  onNewWorkspaceFromFolder,
  onRevealInTerminal,
  onAddToGitignore,
}: Props) {
  const metrics = useMetrics(tabId);
  const running =
    useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot).get(tabId) ??
    null;
  const { segments } = buildCwdBreadcrumb(cwd, workspaceRoot, home);
  const process = running ?? metrics?.foregroundChild ?? metrics?.shellName ?? null;
  return (
    <div className="surface-terminal flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-[var(--terminal-background)] px-2 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PathBreadcrumb
          grow={false}
          segments={segments}
          onRevealPath={(p) => onFocusOnExplorer?.(p)}
          renderSegment={(seg, trigger) => (
            <DirSegmentContextMenu
              path={seg.fullPath}
              workspaceRoot={workspaceRoot}
              gitRootPath={gitRootPath}
              onSetAsRoot={onSetAsRoot}
              onNewWorkspaceFromFolder={onNewWorkspaceFromFolder}
              onRevealInTerminal={onRevealInTerminal}
              onAddToGitignore={onAddToGitignore}
              onFocusOnExplorer={onFocusOnExplorer}
            >
              {trigger}
            </DirSegmentContextMenu>
          )}
        />
        {process && (
          <ProcessSegmentContextMenu tabId={tabId} running={!!running}>
            <span
              title={process}
              className={cn(
                "flex min-w-0 shrink items-center gap-1 rounded px-1 py-0.5 font-mono text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
                running && "text-foreground",
              )}
            >
              <HugeiconsIcon
                icon={running ? AppWindowMacIcon : ComputerTerminal01Icon}
                size={12}
                strokeWidth={1.75}
                className="shrink-0"
              />
              <span className="truncate">{process}</span>
            </span>
          </ProcessSegmentContextMenu>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-muted-foreground">
        {metrics && (
          <>
            <span className={cn(metrics.cpuPercent < 0.05 && "text-muted-foreground/50")}>
              {formatCpu(metrics.cpuPercent)}
            </span>
            <span className="text-border/60">&middot;</span>
            <span>{formatMem(metrics.memBytes)}</span>
          </>
        )}
      </div>
    </div>
  );
}
