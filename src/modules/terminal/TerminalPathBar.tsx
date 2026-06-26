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
import { formatCpu, formatMem } from "./lib/metricsFormat";

type Props = {
  panelId: string;
  cwd: string;
  home: string | null;
  workspaceRoot: string | null;
  gitRootPath: string | null;
  onReveal?: (path: string) => void;
  onSetAsRoot?: (path: string) => void;
  onNewWorkspaceFromFolder?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAddToGitignore?: (path: string, isDir: boolean) => void;
};

export function TerminalPathBar({
  panelId,
  cwd,
  home,
  workspaceRoot,
  gitRootPath,
  onReveal,
  onSetAsRoot,
  onNewWorkspaceFromFolder,
  onRevealInTerminal,
  onAddToGitignore,
}: Props) {
  const metrics = useMetrics(panelId);
  const running =
    useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot).get(panelId) ??
    null;
  const { segments } = buildCwdBreadcrumb(cwd, workspaceRoot, home);
  const process = running ?? metrics?.shellName ?? null;
  return (
    <div className="flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2 text-[11px]">
      <PathBreadcrumb
        segments={segments}
        onRevealPath={(p) => onReveal?.(p)}
        renderSegment={(seg, trigger) => (
          <DirSegmentContextMenu
            path={seg.fullPath}
            rootPath={workspaceRoot ?? seg.fullPath}
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
      <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-muted-foreground">
        {metrics && (
          <span title="Process ID">{metrics.pid}</span>
        )}
        {process && (
          <span className={cn("max-w-[200px] truncate", running && "text-foreground")}>
            {process}
          </span>
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
      </div>
    </div>
  );
}
