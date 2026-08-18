import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { pathBasename } from "@/lib/pathUtils";
import { cn } from "@/lib/utils";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  NoteIcon,
  PinOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteHead, NotesDir } from "./lib/notesDir";

export type CollectionsColumnProps = {
  quickAccess: string[];
  heads: Map<string, NoteHead>;
  dirs: Map<string, NotesDir>;
  rootLabel: string;
  expandedFolders: string[];
  selectedFolder: string;
  editingFolder: string | null;
  onOpen: (relPath: string, pin?: boolean) => void;
  onReorderQuickAccess: (paths: string[]) => void;
  onUnpin: (relPath: string) => void;
  onToggleFolderExpanded: (relPath: string) => void;
  onSelectFolder: (relPath: string) => void;
  onNewNoteIn: (folderRelPath: string) => void;
  onNewFolder: (parentRelPath: string) => void;
  onStartRenameFolder: (relPath: string) => void;
  onRenameFolder: (relPath: string, newName: string) => void;
  onRenameFolderDone: () => void;
  onDeleteFolder: (relPath: string) => void;
};

function QuickAccessRow(props: {
  relPath: string;
  head: NoteHead | undefined;
  onOpen: (relPath: string, pin?: boolean) => void;
  onUnpin: (relPath: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.relPath });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "group flex h-6 cursor-pointer items-center gap-1.5 rounded px-1.5 text-[12px]",
        "text-foreground/90 hover:bg-accent",
        isDragging && "opacity-60",
        (!props.head || props.head.missing) && "text-muted-foreground",
      )}
      onClick={() => props.onOpen(props.relPath)}
      onDoubleClick={() => props.onOpen(props.relPath, true)}
      title={props.relPath}
    >
      <HugeiconsIcon icon={NoteIcon} size={12} strokeWidth={1.85} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {props.head && !props.head.missing
          ? props.head.title
          : pathBasename(props.relPath)}
      </span>
      <button
        type="button"
        title="Unpin"
        onClick={(e) => {
          e.stopPropagation();
          props.onUnpin(props.relPath);
        }}
        className="flex size-[18px] shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:text-foreground group-hover:opacity-100"
      >
        <HugeiconsIcon icon={PinOffIcon} size={11} strokeWidth={1.85} />
      </button>
    </div>
  );
}

type FolderEntry = {
  name: string;
  relPath: string;
  noteCount: number;
  hasSubfolders: boolean;
};

function childrenOf(dirs: Map<string, NotesDir>, folder: string): FolderEntry[] {
  const dir = dirs.get(folder);
  if (!dir) return [];
  return dir.subfolders.map((s) => ({
    name: s.name,
    relPath: folder === "" ? s.name : `${folder}/${s.name}`,
    noteCount: s.noteCount,
    hasSubfolders: s.hasSubfolders,
  }));
}

type FolderRowProps = {
  entry: FolderEntry;
  dirs: Map<string, NotesDir>;
  depth: number;
  expanded: Set<string>;
  selectedFolder: string;
  editingFolder: string | null;
  onToggleFolderExpanded: (relPath: string) => void;
  onSelectFolder: (relPath: string) => void;
  onNewNoteIn: (folderRelPath: string) => void;
  onNewFolder: (parentRelPath: string) => void;
  onStartRenameFolder: (relPath: string) => void;
  onRenameFolder: (relPath: string, newName: string) => void;
  onRenameFolderDone: () => void;
  onDeleteFolder: (relPath: string) => void;
};

function FolderRow(props: FolderRowProps) {
  const { entry, depth } = props;
  const isExpanded = props.expanded.has(entry.relPath);
  const hasChildren = props.entry.hasSubfolders;
  const editing = props.editingFolder === entry.relPath;
  const [draft, setDraft] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a double-invocation: unmounting the focused input (e.g. after
  // Escape swaps the JSX branch back to a plain span) fires a blur, which would
  // otherwise re-trigger commit with the already-abandoned draft.
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(entry.name);
      committedRef.current = false;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, entry.name]);

  const commitRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== entry.name) props.onRenameFolder(entry.relPath, trimmed);
    props.onRenameFolderDone();
  };
  const cancelRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    props.onRenameFolderDone();
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "flex h-6 cursor-pointer items-center gap-1 rounded px-1.5 text-[12px] hover:bg-accent",
              props.selectedFolder === entry.relPath
                ? "bg-accent text-foreground"
                : "text-foreground/90",
            )}
            style={{ paddingLeft: `${6 + depth * 12}px` }}
            onClick={() => {
              if (!editing) props.onSelectFolder(entry.relPath);
            }}
          >
            <button
              type="button"
              title={isExpanded ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) props.onToggleFolderExpanded(entry.relPath);
              }}
              className={cn(
                "flex size-[14px] shrink-0 items-center justify-center text-muted-foreground",
                !hasChildren && "invisible",
              )}
            >
              <HugeiconsIcon
                icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                size={11}
                strokeWidth={1.85}
              />
            </button>
            <HugeiconsIcon
              icon={Folder01Icon}
              size={12}
              strokeWidth={1.85}
              className="shrink-0"
            />
            {editing ? (
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
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            )}
            {!editing && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {props.entry.noteCount}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => props.onNewNoteIn(entry.relPath)}>
            New Note
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => props.onNewFolder(entry.relPath)}>
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => props.onStartRenameFolder(entry.relPath)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => props.onDeleteFolder(entry.relPath)}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isExpanded &&
        childrenOf(props.dirs, entry.relPath).map((child) => (
          <FolderRow key={child.relPath} {...props} entry={child} depth={depth + 1} />
        ))}
    </>
  );
}

export function CollectionsColumn(props: CollectionsColumnProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const expanded = useMemo(() => new Set(props.expandedFolders), [props.expandedFolders]);
  const folderRowShared = {
    dirs: props.dirs,
    expanded,
    selectedFolder: props.selectedFolder,
    editingFolder: props.editingFolder,
    onToggleFolderExpanded: props.onToggleFolderExpanded,
    onSelectFolder: props.onSelectFolder,
    onNewNoteIn: props.onNewNoteIn,
    onNewFolder: props.onNewFolder,
    onStartRenameFolder: props.onStartRenameFolder,
    onRenameFolder: props.onRenameFolder,
    onRenameFolderDone: props.onRenameFolderDone,
    onDeleteFolder: props.onDeleteFolder,
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = props.quickAccess.indexOf(String(active.id));
    const to = props.quickAccess.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...props.quickAccess];
    next.splice(to, 0, ...next.splice(from, 1));
    props.onReorderQuickAccess(next);
  };

  return (
    <div className="thin-scrollbar flex h-full flex-col gap-3 overflow-y-auto p-2">
      <div>
        <div className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Access
        </div>
        {props.quickAccess.length === 0 ? (
          <div className="px-1.5 text-[11px] text-muted-foreground">
            Pin notes here from the note list context menu
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={props.quickAccess}
              strategy={verticalListSortingStrategy}
            >
              {props.quickAccess.map((relPath) => (
                <QuickAccessRow
                  key={relPath}
                  relPath={relPath}
                  head={props.heads.get(relPath)}
                  onOpen={props.onOpen}
                  onUnpin={props.onUnpin}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div>
        <div className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Folders
        </div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                "flex h-6 cursor-pointer items-center gap-1.5 rounded px-1.5 text-[12px] hover:bg-accent",
                props.selectedFolder === ""
                  ? "bg-accent text-foreground"
                  : "text-foreground/90",
              )}
              onClick={() => props.onSelectFolder("")}
            >
              <HugeiconsIcon
                icon={Folder01Icon}
                size={12}
                strokeWidth={1.85}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">{props.rootLabel}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {props.dirs.get("")?.notes.length ?? 0}
              </span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => props.onNewNoteIn("")}>
              New Note
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => props.onNewFolder("")}>
              New Folder
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {childrenOf(props.dirs, "").map((entry) => (
          <FolderRow key={entry.relPath} entry={entry} depth={0} {...folderRowShared} />
        ))}
      </div>
    </div>
  );
}
