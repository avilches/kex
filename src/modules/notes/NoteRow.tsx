import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Delete02Icon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { formatRelativeDate } from "./lib/noteSort";
import type { NoteListItem } from "./lib/notesList";

export type NoteRowProps = {
  note: NoteListItem;
  pinned: boolean;
  sortable: boolean;
  editing: boolean;
  onOpen: (relPath: string, pin?: boolean) => void;
  onOpenToSide: (relPath: string) => void;
  onTogglePin: (relPath: string) => void;
  onStartRename: (relPath: string) => void;
  onRename: (relPath: string, newName: string) => void;
  onRenameDone: () => void;
  onDelete: (relPath: string) => void;
  onRevealInExplorer: (relPath: string) => void;
};

function baseName(relPath: string): string {
  const parts = relPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? relPath;
}

export function NoteRow(props: NoteRowProps) {
  const { note } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.relPath, disabled: !props.sortable });
  const [draft, setDraft] = useState(baseName(note.relPath));
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a double-invocation: unmounting the focused input (e.g. after
  // Escape swaps the JSX branch back to a plain span) fires a blur, which would
  // otherwise re-trigger commit with the already-abandoned draft.
  const committedRef = useRef(false);

  useEffect(() => {
    if (props.editing) {
      setDraft(baseName(note.relPath));
      committedRef.current = false;
      // select the stem, keep the extension out of the selection
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        const dot = el.value.lastIndexOf(".");
        el.setSelectionRange(0, dot === -1 ? el.value.length : dot);
      });
    }
  }, [props.editing, note.relPath]);

  const commitRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== baseName(note.relPath)) {
      props.onRename(note.relPath, trimmed);
    }
    props.onRenameDone();
  };
  const cancelRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    props.onRenameDone();
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          {...attributes}
          {...(props.sortable ? listeners : {})}
          className={cn(
            "cursor-pointer rounded px-2 py-1.5 hover:bg-accent",
            isDragging && "opacity-60",
          )}
          onClick={() => {
            if (!props.editing) props.onOpen(note.relPath);
          }}
          onDoubleClick={() => {
            if (!props.editing) props.onOpen(note.relPath, true);
          }}
        >
          <div className="flex items-center gap-1.5">
            {props.editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") cancelRename();
                }}
                onBlur={commitRename}
                className="h-5 w-full rounded border border-border bg-transparent px-1 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                {note.title}
              </span>
            )}
            {props.pinned && !props.editing && (
              <HugeiconsIcon
                icon={PinIcon}
                size={11}
                strokeWidth={1.85}
                className="shrink-0 text-muted-foreground"
              />
            )}
            {!props.editing && (
              <span className="shrink-0 text-[10.5px] text-muted-foreground">
                {formatRelativeDate(note.mtime, Date.now())}
              </span>
            )}
          </div>
          {note.snippet && !props.editing && (
            <div className="truncate text-[11px] text-muted-foreground">{note.snippet}</div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => props.onOpen(note.relPath, true)}>
          Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onOpenToSide(note.relPath)}>
          Open to the Side
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => props.onTogglePin(note.relPath)}>
          <HugeiconsIcon
            icon={props.pinned ? PinOffIcon : PinIcon}
            size={12}
            strokeWidth={1.85}
          />
          {props.pinned ? "Unpin from Quick Access" : "Pin to Quick Access"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onStartRename(note.relPath)}>
          <HugeiconsIcon icon={PencilEdit01Icon} size={12} strokeWidth={1.85} />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => props.onRevealInExplorer(note.relPath)}>
          <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={1.85} />
          Reveal in Explorer
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => props.onDelete(note.relPath)}>
          <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.85} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
