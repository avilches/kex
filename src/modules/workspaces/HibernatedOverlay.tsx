import { useDroppable } from "@dnd-kit/core";
import { SleepingIcon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatHibernatedFor } from "./lib/hibernate";
import { HIBERNATED_DROP_PREFIX } from "./lib/tabDrop";
import type { Workspace } from "./lib/types";
import { useWorkspaceDnd } from "./WorkspaceDndProvider";
import { WorkspaceMark } from "./WorkspaceMark";

type Props = { workspace: Workspace; onWake: () => void; active: boolean };

const TICK_MS = 30_000;

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

export function HibernatedOverlay({ workspace, onWake, active }: Props) {
  const workspaceId = workspace.id;
  const dragging = useWorkspaceDnd().draggingItem;
  const acceptsDrop = active && dragging?.kind === "tab" && dragging.workspaceId !== workspaceId;
  const { setNodeRef, isOver } = useDroppable({
    id: `${HIBERNATED_DROP_PREFIX}${workspaceId}`,
    disabled: !acceptsDrop,
  });
  const now = useNow(active && workspace.hibernatedAt !== undefined);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background text-muted-foreground",
        acceptsDrop && isOver && "ring-2 ring-inset ring-primary/60",
      )}
    >
      <HugeiconsIcon icon={SleepingIcon} size={112} strokeWidth={1} className="opacity-70" />
      <div className="flex max-w-[80%] flex-col items-center gap-1.5">
        <span className="flex items-center gap-2 text-[15px] text-foreground">
          <WorkspaceMark id={workspaceId} color={workspace.color} icon={workspace.icon} size={22} />
          <span className="truncate">{workspace.title || "Workspace"}</span>
        </span>
        {workspace.hibernatedAt !== undefined && (
          <span className="text-[12px]">
            Hibernated for {formatHibernatedFor(now - workspace.hibernatedAt)}
          </span>
        )}
      </div>
      <Button size="lg" onClick={onWake} autoFocus={active} className="gap-2">
        <HugeiconsIcon icon={Undo02Icon} size={16} strokeWidth={2} />
        Restore
      </Button>
    </div>
  );
}
