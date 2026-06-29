import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PlayIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RunConfig } from "@/modules/workspaces/lib/types";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";
import {
  subscribeToRunConfigRunning,
  getRunConfigRunningSnapshot,
} from "@/modules/workspaces/lib/terminalEphemeralStore";

type Props = {
  workspaceId: string;
  runConfigs: RunConfig[];
  activeRunConfigId: string | undefined;
  onSelectConfig: (configId: string) => void;
  onRun: (config: RunConfig) => void;
  onStop: (config: RunConfig) => void;
  onOpenSettings: () => void;
};

export function RunButton({
  runConfigs,
  activeRunConfigId,
  onSelectConfig,
  onRun,
  onStop,
  onOpenSettings,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const activeConfig =
    runConfigs.find((c) => c.id === activeRunConfigId) ?? runConfigs[0];

  const isRunning = !!(activeConfig?.panelId && runningMap.get(activeConfig.panelId));

  if (runConfigs.length === 0) {
    return (
      <button
        type="button"
        title="Configure Run in Workspace Settings"
        onClick={onOpenSettings}
        className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
        <span>Run</span>
      </button>
    );
  }

  if (runConfigs.length === 1 && activeConfig) {
    return (
      <button
        type="button"
        title={isRunning ? "Stop" : `Run: ${activeConfig.command}`}
        onClick={() => (isRunning ? onStop(activeConfig) : onRun(activeConfig))}
        className={cn(
          "flex h-7 items-center gap-1 rounded px-2 text-[11px] transition-colors",
          isRunning
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <HugeiconsIcon
          icon={isRunning ? StopIcon : PlayIcon}
          size={13}
          strokeWidth={2}
        />
        <span className="max-w-[120px] truncate">
          {activeConfig.name || activeConfig.command}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded-l border-r border-border/40 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="max-w-[120px] truncate">
              {activeConfig?.name || activeConfig?.command || "Run"}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {runConfigs.map((cfg) => (
            <DropdownMenuItem key={cfg.id} onSelect={() => onSelectConfig(cfg.id)}>
              <span
                className={cn(
                  "flex-1",
                  cfg.id === activeRunConfigId && "font-medium",
                )}
              >
                {cfg.name || cfg.command}
              </span>
              {cfg.id === activeRunConfigId && (
                <HugeiconsIcon
                  icon={PlayIcon}
                  size={11}
                  strokeWidth={2}
                  className="ml-2 text-primary"
                />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {activeConfig && (
        <button
          type="button"
          title={isRunning ? "Stop" : "Run"}
          onClick={() =>
            isRunning ? onStop(activeConfig) : onRun(activeConfig)
          }
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-r text-[11px] transition-colors",
            isRunning
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon
            icon={isRunning ? StopIcon : PlayIcon}
            size={13}
            strokeWidth={2}
          />
        </button>
      )}
    </div>
  );
}
