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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { scriptSubtitle, SETTINGS_LABELS } from "./lib/actionsBar";
import type { Action } from "./lib/types";

const SMALL_BUTTON =
  "flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground";

type ViewProps = {
  action: Action;
  /** The row as it floats under the pointer while it is dragged: nothing in it reacts. */
  overlay?: boolean;
  handleProps?: HTMLAttributes<HTMLSpanElement>;
  onToggleButton?: (own: boolean) => void;
  onEdit?: () => void;
  remove?: React.ReactNode;
};

// One Action in a column: handle, icon, name over what it points at, the Button flag, edit and,
// at the far right, delete. Everything else about the Action lives in the edit modal.
export function ActionRowView({ action, overlay, handleProps, onToggleButton, onEdit, remove }: ViewProps) {
  const display = action.name.trim() || "Name";
  const subtitle = scriptSubtitle({ ...action, name: display }, SETTINGS_LABELS);
  return (
    <div
      data-action-row={action.id}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border bg-card py-1.5 pr-1 pl-1.5 text-[12px]",
        overlay ? "border-primary shadow-lg" : "border-border/60",
      )}
    >
      <span {...handleProps} aria-label="Drag to reorder" className="shrink-0 cursor-grab text-muted-foreground">
        <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
      </span>
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground" title={display}>
        <ActionIcon action={action} size={14} />
      </span>
      <ActionNameLines name={display} value={subtitle.text ?? undefined} startTrim={subtitle.startTrim} />
      <Checkbox
        aria-label="Own button in the header bar"
        title="Own button in the header bar"
        checked={action.ownButton}
        disabled={overlay}
        onCheckedChange={(v) => onToggleButton?.(v === true)}
        className="shrink-0"
      />
      <button type="button" title="Edit" aria-label="Edit action" onClick={onEdit} className={SMALL_BUTTON}>
        <HugeiconsIcon icon={PencilEdit02Icon} size={12} strokeWidth={2} />
      </button>
      {remove}
    </div>
  );
}

type Props = {
  action: Action;
  /** A preset as Kex installs it: deleting it asks nothing, the Add menu offers it again. */
  preset: boolean;
  onToggleButton: (own: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
};

export function ActionRow({ action, preset, onToggleButton, onEdit, onRemove }: Props) {
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
        onToggleButton={onToggleButton}
        onEdit={onEdit}
        remove={remove}
      />
    </div>
  );
}
