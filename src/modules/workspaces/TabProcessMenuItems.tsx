import { useEffect, useState, useSyncExternalStore } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AppWindowMacIcon,
  BombIcon,
  ComputerTerminal01Icon,
  Copy01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { writeClipboardText } from "@/lib/clipboard";
import { native, type PtyProcessInfo } from "@/lib/native";
import { IS_WINDOWS } from "@/lib/platform";
import { ptyIdForTab } from "@/modules/terminal/lib/useTerminalSession";
import {
  getRunningCommand,
  subscribeToRunningCommands,
} from "./lib/terminalEphemeralStore";
import { processLabel } from "./lib/terminalProcess";
import type { Tab } from "./lib/types";

// Process entry of the tab menu: the first item of the agent block, right under
// the agent name; a submenu whose trigger reads "Process: " plus what the
// terminal is running right now (the process the path bar shows), and whose
// items copy the pid or take the tree down. Only a terminal tab with a live
// PTY renders it; the menu content mounts while open, so the snapshot is
// fetched fresh each time.
export function TabProcessMenuItems({ tab }: { tab: Tab }) {
  const [info, setInfo] = useState<PtyProcessInfo | null>(null);
  const runningCommand = useSyncExternalStore(subscribeToRunningCommands, () =>
    tab.kind === "terminal" ? getRunningCommand(tab.id) : null,
  );

  useEffect(() => {
    if (tab.kind !== "terminal") return;
    const ptyId = ptyIdForTab(tab.id);
    if (ptyId == null) return;
    let cancelled = false;
    native
      .ptyProcessInfo(ptyId)
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab.id, tab.kind]);

  if (tab.kind !== "terminal" || !info) return null;

  const label = processLabel({
    runningCommand,
    fgName: info.fg_name,
    shellName: info.shell_name,
  });
  const running = !!(runningCommand?.trim() || info.fg_name);

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <HugeiconsIcon
          icon={running ? AppWindowMacIcon : ComputerTerminal01Icon}
          size={14}
          strokeWidth={2}
        />
        <span className="min-w-0 truncate">Process: {label}</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuItem onSelect={() => void writeClipboardText(String(info.pid))}>
          <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
          Copy PID
          <span className="ml-auto max-w-[140px] truncate pl-3 font-mono text-[10px] font-normal text-muted-foreground">
            {info.pid}
          </span>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={IS_WINDOWS}
          title={IS_WINDOWS ? "Stop the process with Ctrl+C in the terminal" : undefined}
          onSelect={() => void native.ptyStop(tab.id).catch(() => {})}
        >
          <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
          Stop Process Tree
        </ContextMenuItem>
        <ContextMenuItem
          disabled={IS_WINDOWS}
          title={IS_WINDOWS ? "Stop the process with Ctrl+C in the terminal" : undefined}
          onSelect={() => void native.ptyKill(tab.id).catch(() => {})}
        >
          <HugeiconsIcon icon={BombIcon} size={14} strokeWidth={2} />
          Kill Process Tree
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
