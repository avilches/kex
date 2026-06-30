import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PlayIcon,
  StopIcon,
  Tick02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  scripts: RunConfig[];
  activeScript: string | undefined;
  onSelectConfig: (configId: string) => void;
  onRun: (config: RunConfig) => void;
  onStop: (config: RunConfig) => void;
  onOpenRunConfigurations: () => void;
};

function isComplete(c: RunConfig): boolean {
  return c.command.trim() !== "";
}

export function RunButton({
  scripts,
  activeScript,
  onSelectConfig,
  onRun,
  onStop,
  onOpenRunConfigurations,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const completeConfigs = scripts.filter(isComplete);
  const activeConfig =
    completeConfigs.find((c) => c.id === activeScript) ?? completeConfigs[0];
  const activeState = activeConfig?.panelId ? runningMap.get(activeConfig.panelId) : undefined;
  const isRunning = activeState === "running";
  const isWaiting = activeState === "waiting";
  const isActive_ = isRunning || isWaiting;

  function cfgState(cfg: RunConfig) {
    return cfg.panelId ? runningMap.get(cfg.panelId) : undefined;
  }

  const dropdownContent = (
    <DropdownMenuContent align="end">
      {completeConfigs.map((cfg) => {
        const state = cfgState(cfg);
        const cfgRunning = state === "running";
        const cfgWaiting = state === "waiting";
        const isActiveCfg = cfg.id === activeConfig?.id;
        return (
          <DropdownMenuItem
            key={cfg.id}
            className="gap-0 px-1 py-0.5"
            onSelect={() => onSelectConfig(cfg.id)}
          >
            <button
              type="button"
              title={cfgRunning ? "Stop" : cfgWaiting ? "Stopping..." : "Run"}
              disabled={cfgWaiting}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (cfgWaiting) return;
                cfgRunning ? onStop(cfg) : onRun(cfg);
              }}
              className={cn(
                "size-[22px] shrink-0 flex items-center justify-center rounded transition-colors",
                cfgRunning
                  ? "text-destructive hover:bg-destructive/10"
                  : cfgWaiting
                    ? "text-amber-500/60 cursor-not-allowed"
                    : "text-green-500 hover:bg-accent",
              )}
            >
              {cfgWaiting ? (
                <HugeiconsIcon icon={Loading03Icon} size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <HugeiconsIcon icon={cfgRunning ? StopIcon : PlayIcon} size={12} strokeWidth={2} />
              )}
            </button>
            <span className="flex-1 truncate px-1.5 text-[12px]">
              {cfg.name || cfg.command}
            </span>
            {isActiveCfg && (
              <HugeiconsIcon
                icon={Tick02Icon}
                size={11}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
              />
            )}
          </DropdownMenuItem>
        );
      })}
      {completeConfigs.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={onOpenRunConfigurations} className="text-muted-foreground">
        {completeConfigs.length === 0 ? "+ Add run script" : "Configure Scripts"}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (completeConfigs.length === 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} className="text-green-500" />
            <span>Run</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        {dropdownContent}
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center rounded-md">
      <button
        type="button"
        title={
          isRunning
            ? `Stop: ${activeConfig?.name || activeConfig?.command}`
            : isWaiting
              ? `Stopping: ${activeConfig?.name || activeConfig?.command}`
              : `Run: ${activeConfig?.name || activeConfig?.command}`
        }
        disabled={isWaiting}
        onClick={() => {
          if (!activeConfig || isWaiting) return;
          isRunning ? onStop(activeConfig) : onRun(activeConfig);
        }}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-l-md px-2 text-[11px] transition-colors",
          isRunning
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : isWaiting
              ? "bg-amber-500/10 text-amber-500/70 cursor-not-allowed"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {isWaiting ? (
          <HugeiconsIcon icon={Loading03Icon} size={13} strokeWidth={2} className="animate-spin" />
        ) : (
          <HugeiconsIcon
            icon={isActive_ ? StopIcon : PlayIcon}
            size={13}
            strokeWidth={2}
            className={!isActive_ ? "text-green-500" : undefined}
          />
        )}
        <span className="max-w-[120px] truncate">
          {activeConfig?.name || activeConfig?.command || "Run"}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center rounded-r-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        {dropdownContent}
      </DropdownMenu>
    </div>
  );
}
