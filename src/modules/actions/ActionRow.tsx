import { Cancel01Icon, DragDropVerticalIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type HTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { scriptSubtitle, SETTINGS_LABELS } from "./lib/actionsBar";
import type { Action } from "./lib/types";

const SMALL_BUTTON =
  "flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground";

const EDIT_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:bg-muted/70";

type ViewProps = {
  action: Action;
  /** The row as it floats under the pointer while it is dragged: nothing in it reacts. */
  overlay?: boolean;
  handleProps?: HTMLAttributes<HTMLSpanElement>;
  onEdit?: () => void;
  remove?: React.ReactNode;
};

// One Action in a column: handle, icon, name over what it points at, edit and, at the far
// right, delete. A double click anywhere on the row but its buttons opens the edit modal, where
// everything else about the Action lives.
export function ActionRowView({ action, overlay, handleProps, onEdit, remove }: ViewProps) {
  const display = action.name.trim() || "Name";
  const subtitle = scriptSubtitle({ ...action, name: display }, SETTINGS_LABELS);
  return (
    <div
      data-action-row={action.id}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) onEdit?.();
      }}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border bg-card py-1.5 pr-1 pl-1.5 text-[12px]",
        overlay ? "border-primary shadow-lg" : "border-border/60",
      )}
    >
      <span {...handleProps} aria-label="Drag to reorder" className="shrink-0 cursor-grab text-muted-foreground">
        <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2" title={display}>
        <ActionIcon action={action} size={14} fill />
        <ActionNameLines name={display} value={subtitle.text ?? undefined} startTrim={subtitle.startTrim} lead={subtitle.lead} />
      </span>
      <button type="button" title="Edit" aria-label="Edit action" onClick={onEdit} className={EDIT_BUTTON}>
        <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={2} />
      </button>
      {remove}
    </div>
  );
}

type Props = {
  action: Action;
  /** A preset as Kex installs it: deleting it asks nothing, the Add menu offers it again. */
  preset: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

export function ActionRow({ action, preset, onEdit, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: action.id });
  const [removeOpen, setRemoveOpen] = useState(false);
  const display = action.name.trim() || "Name";
  const trigger = (
    <button type="button" title="Delete" aria-label="Remove action" onClick={preset ? onRemove : undefined} className={cn(SMALL_BUTTON, "hover:text-destructive")}>
      <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
    </button>
  );
  const remove = preset ? (
    trigger
  ) : (
    <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="w-[360px] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Delete &quot;{display}&quot;?</AlertDialogTitle>
          <AlertDialogDescription className="text-[12px]">The Action is removed and cannot come back.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onRemove}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
    >
      <ActionRowView
        action={action}
        handleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        remove={remove}
      />
    </div>
  );
}
