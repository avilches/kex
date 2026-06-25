import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { editorPathDisplay } from "@/modules/editor/lib/editorPathDisplay";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { useMetrics } from "@/modules/workspaces/lib/terminalMetricsStore";
import { formatCpu, formatMem } from "./lib/metricsFormat";

type Props = {
  panelId: string;
  cwd: string;
  explorerRoot: string | null;
  home: string | null;
  onReveal?: () => void;
};

export function TerminalPathBar({ panelId, cwd, explorerRoot, home, onReveal }: Props) {
  const metrics = useMetrics(panelId);
  const running =
    useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot).get(panelId) ??
    null;
  const { dirs, name } = cwd ? editorPathDisplay(cwd, explorerRoot, home) : { dirs: [], name: "" };
  const process = running ?? metrics?.shellName ?? null;
  return (
    <div className="flex h-6 w-full shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2 text-[11px]">
      <button
        type="button"
        onClick={onReveal}
        title={cwd}
        disabled={!onReveal}
        className="flex min-w-0 items-center gap-1 overflow-hidden text-left text-[11px]"
      >
        {dirs.length > 0 && (
          <span className="min-w-0 truncate text-muted-foreground" style={{ direction: "rtl" }}>
            <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>{dirs.join(" / ")} /</span>
          </span>
        )}
        <span className={cn("min-w-0 truncate text-foreground", onReveal && "hover:underline")}>
          {name}
        </span>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-muted-foreground">
        {metrics && <span>{metrics.pid}</span>}
        {process && (
          <span className={cn("max-w-[200px] truncate", running && "text-foreground")}>
            {process}
          </span>
        )}
        <span className="text-border/60">&middot;</span>
        <span>{metrics ? formatCpu(metrics.cpuPercent) : "-"}</span>
        <span className="text-border/60">&middot;</span>
        <span>{metrics ? formatMem(metrics.memBytes) : "-"}</span>
      </div>
    </div>
  );
}
