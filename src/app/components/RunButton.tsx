import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PlayIcon,
  StopIcon,
  Tick02Icon,
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
  runConfigs: RunConfig[];
  activeRunConfigId: string | undefined;
  onSelectConfig: (configId: string) => void;
  onRun: (config: RunConfig) => void;
  onStop: (config: RunConfig) => void;
  onOpenRunConfigurations: () => void;
};

function isComplete(c: RunConfig): boolean {
  return c.command.trim() !== "";
}

export function RunButton({
  runConfigs,
  activeRunConfigId,
  onSelectConfig,
  onRun,
  onStop,
  onOpenRunConfigurations,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const completeConfigs = runConfigs.filter(isComplete);
  const activeConfig =
    completeConfigs.find((c) => c.id === activeRunConfigId) ?? completeConfigs[0];
  const isRunning = !!(activeConfig?.panelId && runningMap.get(activeConfig.panelId));

  const dropdownContent = (
    <DropdownMenuContent align="end">
      {completeConfigs.map((cfg) => (
        <DropdownMenuItem key={cfg.id} onSelect={() => onSelectConfig(cfg.id)} className="gap-2">
          <span className="flex-1">{cfg.name || cfg.command}</span>
          {cfg.id === activeConfig?.id && (
            <HugeiconsIcon
              icon={Tick02Icon}
              size={12}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          )}
        </DropdownMenuItem>
      ))}
      {completeConfigs.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={onOpenRunConfigurations} className="text-muted-foreground">
        + Add Run configuration
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
            <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
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
            : `Run: ${activeConfig?.name || activeConfig?.command}`
        }
        onClick={() => {
          if (!activeConfig) return;
          isRunning ? onStop(activeConfig) : onRun(activeConfig);
        }}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-l-md px-2 text-[11px] transition-colors",
          isRunning
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <HugeiconsIcon
          icon={isRunning ? StopIcon : PlayIcon}
          size={13}
          strokeWidth={2}
        />
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
