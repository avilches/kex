import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HIBERNATED_DROP_PREFIX } from "./lib/tabDrop";
import { useWorkspaceDnd } from "./WorkspaceDndProvider";

type Props = { workspaceId: string; onWake: () => void; active: boolean };

export function HibernatedOverlay({ workspaceId, onWake, active }: Props) {
  const dragging = useWorkspaceDnd().draggingItem;
  const acceptsDrop = active && dragging?.kind === "tab" && dragging.workspaceId !== workspaceId;
  const { setNodeRef, isOver } = useDroppable({
    id: `${HIBERNATED_DROP_PREFIX}${workspaceId}`,
    disabled: !acceptsDrop,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/95 text-muted-foreground",
        acceptsDrop && isOver && "ring-2 ring-inset ring-primary/60",
      )}
    >
      <span className="select-none text-5xl font-light tracking-widest">Zzzzz</span>
      <Button variant="outline" size="sm" onClick={onWake} autoFocus={active}>
        Restore
      </Button>
    </div>
  );
}
