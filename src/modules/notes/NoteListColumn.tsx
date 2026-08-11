import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  AlertCircleIcon,
  ArrowUpDownIcon,
  Calendar03Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { NoteSortMode, NotesConfig } from "./lib/notesConfig";
import { groupNotesByDate, sortNotes } from "./lib/noteSort";
import type { NoteListItem } from "./lib/notesList";
import { NoteRow } from "./NoteRow";

export type NoteListColumnProps = {
  notes: NoteListItem[];
  config: NotesConfig;
  quickAccess: string[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  primedRenamePath: string | null;
  onRetry: () => void;
  onOpen: (relPath: string, pin?: boolean) => void;
  onOpenToSide: (relPath: string) => void;
  onTogglePin: (relPath: string) => void;
  onRename: (relPath: string, newName: string) => void;
  onDelete: (relPath: string) => void;
  onRevealInExplorer: (relPath: string) => void;
  onNewNote: () => void;
  onSetSortMode: (mode: NoteSortMode) => void;
  onSetGroupByDate: (on: boolean) => void;
  onSetNoteOrder: (order: Record<string, number>) => void;
  onRenameDone: () => void;
};

const SORT_LABELS: Record<NoteSortMode, string> = {
  modified: "Modified",
  title: "Title",
  created: "Created",
  custom: "Custom",
};

const HEADER_BUTTON =
  "flex size-[22px] items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground";

export function NoteListColumn(props: NoteListColumnProps) {
  const { config } = props;
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const sorted = useMemo(
    () => sortNotes(props.notes, config.sortMode, config.noteOrder),
    [props.notes, config.sortMode, config.noteOrder],
  );
  const isDateSort = config.sortMode === "modified" || config.sortMode === "created";
  const groups = useMemo(
    () =>
      isDateSort && config.groupByDate
        ? groupNotesByDate(
            sorted,
            config.sortMode === "created" ? "created" : "modified",
            Date.now(),
          )
        : null,
    [sorted, isDateSort, config.groupByDate, config.sortMode],
  );
  const pinnedSet = useMemo(() => new Set(props.quickAccess), [props.quickAccess]);
  const activeEditing = props.primedRenamePath ?? editingPath;

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const rels = sorted.map((n) => n.relPath);
    const from = rels.indexOf(String(active.id));
    const to = rels.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    rels.splice(to, 0, ...rels.splice(from, 1));

    // `sorted` only covers the folder-filtered rows, so the order for every
    // other note (elsewhere in the vault) must be preserved as-is. Only the
    // visible rows get new indices, reusing their previous slot values where
    // possible so their position relative to the rest of the vault doesn't
    // jump around; rows that never had a custom index get fresh slots past
    // the current maximum.
    const visible = new Set(rels);
    const prevOrder = config.noteOrder;
    const order: Record<string, number> = {};
    let maxIndex = -1;
    for (const [rel, idx] of Object.entries(prevOrder)) {
      if (idx > maxIndex) maxIndex = idx;
      if (!visible.has(rel)) order[rel] = idx;
    }
    const slots = rels
      .map((rel) => prevOrder[rel])
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    while (slots.length < rels.length) slots.push(++maxIndex);
    rels.forEach((rel, i) => {
      order[rel] = slots[i];
    });
    props.onSetNoteOrder(order);
  };

  const renderRow = (note: NoteListItem) => (
    <NoteRow
      key={note.relPath}
      note={note}
      pinned={pinnedSet.has(note.relPath)}
      sortable={config.sortMode === "custom"}
      editing={activeEditing === note.relPath}
      onOpen={props.onOpen}
      onOpenToSide={props.onOpenToSide}
      onTogglePin={props.onTogglePin}
      onStartRename={setEditingPath}
      onRename={props.onRename}
      onRenameDone={() => {
        setEditingPath(null);
        props.onRenameDone();
      }}
      onDelete={props.onDelete}
      onRevealInExplorer={props.onRevealInExplorer}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Sort notes"
              className="flex h-[22px] items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={ArrowUpDownIcon} size={11} strokeWidth={1.85} />
              {SORT_LABELS[config.sortMode]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={config.sortMode}
              onValueChange={(v) => props.onSetSortMode(v as NoteSortMode)}
            >
              {(Object.keys(SORT_LABELS) as NoteSortMode[]).map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {SORT_LABELS[mode]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {isDateSort && (
          <button
            type="button"
            title={config.groupByDate ? "Ungroup by date" : "Group by date"}
            onClick={() => props.onSetGroupByDate(!config.groupByDate)}
            className={cn(HEADER_BUTTON, config.groupByDate && "text-foreground")}
          >
            <HugeiconsIcon icon={Calendar03Icon} size={12} strokeWidth={1.85} />
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          title="New note"
          onClick={props.onNewNote}
          className={HEADER_BUTTON}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={1.85} />
        </button>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
        {props.error ? (
          <div className="flex flex-col items-start gap-2 p-2 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={1.85} />
              Could not list notes: {props.error}
            </span>
            <button
              type="button"
              onClick={props.onRetry}
              className="rounded border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
            >
              Retry
            </button>
          </div>
        ) : sorted.length === 0 && !props.loading ? (
          <div className="p-2 text-[12px] text-muted-foreground">
            No notes here. Create one with the + button.
          </div>
        ) : config.sortMode === "custom" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sorted.map((n) => n.relPath)}
              strategy={verticalListSortingStrategy}
            >
              {sorted.map(renderRow)}
            </SortableContext>
          </DndContext>
        ) : groups ? (
          groups.map((g) => (
            <div key={g.bucket}>
              <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.bucket}
              </div>
              {g.notes.map(renderRow)}
            </div>
          ))
        ) : (
          sorted.map(renderRow)
        )}
        {props.truncated && (
          <div className="p-2 text-[11px] text-muted-foreground">
            Showing the first {sorted.length} notes (scan cap reached)
          </div>
        )}
      </div>
    </div>
  );
}
