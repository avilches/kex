import { useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BombIcon, Copy01Icon, StopIcon } from "@hugeicons/core-free-icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { COMPACT_CONTENT } from "@/modules/explorer/lib/menuItemClass";
import { writeClipboardText } from "@/lib/clipboard";
import { native, type PtyProcessInfo } from "@/lib/native";
import { IS_WINDOWS } from "@/lib/platform";
import { ptyIdForTab } from "./lib/useTerminalSession";

// Context menu of the process segment of the terminal path bar: copy the pid
// or take the process tree down. Stop and Kill signal the descendants of the
// shell, so they are only offered while something runs. The content mounts
// while open, so the snapshot is fetched fresh each time.
export function ProcessSegmentContextMenu({
  tabId,
  running,
  children,
}: {
  tabId: string;
  running: boolean;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className={COMPACT_CONTENT}>
        <ProcessMenuItems tabId={tabId} running={running} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ProcessMenuItems({ tabId, running }: { tabId: string; running: boolean }) {
  const [info, setInfo] = useState<PtyProcessInfo | null>(null);

  useEffect(() => {
    const ptyId = ptyIdForTab(tabId);
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
  }, [tabId]);

  const pid = info ? String(info.pid) : null;
  const busy = running || !!info?.fg_name;
  const noStop = IS_WINDOWS || !info;
  const noStopTitle = IS_WINDOWS ? "Stop the process with Ctrl+C in the terminal" : undefined;

  return (
    <>
      <ContextMenuItem disabled={!pid} onSelect={() => pid && void writeClipboardText(pid)}>
        <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
        Copy PID
        {pid && (
          <span className="ml-auto max-w-[140px] truncate pl-3 font-mono text-[10px] font-normal text-muted-foreground">
            {pid}
          </span>
        )}
      </ContextMenuItem>
      {busy && (
        <>
          <ContextMenuItem
            disabled={noStop}
            title={noStopTitle}
            onSelect={() => void native.ptyStop(tabId).catch(() => {})}
          >
            <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
            Stop Process Tree
          </ContextMenuItem>
          <ContextMenuItem
            disabled={noStop}
            title={noStopTitle}
            onSelect={() => void native.ptyKill(tabId).catch(() => {})}
          >
            <HugeiconsIcon icon={BombIcon} size={14} strokeWidth={2} />
            Kill Process Tree
          </ContextMenuItem>
        </>
      )}
    </>
  );
}
