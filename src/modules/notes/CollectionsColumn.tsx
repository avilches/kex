import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { buildFolderTree, countNotesPerFolder, type FolderNode } from "./lib/folderTree";
import type { NoteListItem } from "./lib/notesList";

export type CollectionsColumnProps = {
  quickAccess: string[];
  notesByRelPath: Map<string, NoteListItem>;
  folders: string[];
  notes: NoteListItem[];
  collapsedFolders: string[];
  selectedFolder: string;
  editingFolder: string | null;
  onOpen: (relPath: string, pin?: boolean) => void;
  onReorderQuickAccess: (paths: string[]) => void;
  onUnpin: (relPath: string) => void;
  onToggleFolderCollapsed: (relPath: string) => void;
  onSelectFolder: (relPath: string) => void;
  onNewNoteIn: (folderRelPath: string) => void;
  onNewFolder: (parentRelPath: string) => void;
  onStartRenameFolder: (relPath: string) => void;
  onRenameFolder: (relPath: string, newName: string) => void;
  onRenameFolderDone: () => void;
  onDeleteFolder: (relPath: string) => void;
};

function baseName(relPath: string): string {
  const parts = relPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? relPath;
}

function QuickAccessRow(props: {
  relPath: string;
  note: NoteListItem | undefined;
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
        !props.note && "text-muted-foreground",
      )}
      onClick={() => props.onOpen(props.relPath)}
      onDoubleClick={() => props.onOpen(props.relPath, true)}
      title={props.relPath}
    >
      <HugeiconsIcon icon={NoteIcon} size={12} strokeWidth={1.85} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {props.note?.title ?? baseName(props.relPath)}
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

type FolderRowProps = {
  node: FolderNode;
  depth: number;
  counts: Map<string, number>;
  collapsed: Set<string>;
  selectedFolder: string;
  editingFolder: string | null;
  onToggleFolderCollapsed: (relPath: string) => void;
  onSelectFolder: (relPath: string) => void;
  onNewNoteIn: (folderRelPath: string) => void;
  onNewFolder: (parentRelPath: string) => void;
  onStartRenameFolder: (relPath: string) => void;
  onRenameFolder: (relPath: string, newName: string) => void;
  onRenameFolderDone: () => void;
  onDeleteFolder: (relPath: string) => void;
};

function FolderRow(props: FolderRowProps) {
  const { node, depth } = props;
  const isCollapsed = props.collapsed.has(node.relPath);
  const hasChildren = node.children.length > 0;
  const editing = props.editingFolder === node.relPath;
  const [draft, setDraft] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(node.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, node.name]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== node.name) props.onRenameFolder(node.relPath, trimmed);
    props.onRenameFolderDone();
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "flex h-6 cursor-pointer items-center gap-1 rounded px-1.5 text-[12px] hover:bg-accent",
              props.selectedFolder === node.relPath
                ? "bg-accent text-foreground"
                : "text-foreground/90",
            )}
            style={{ paddingLeft: `${6 + depth * 12}px` }}
            onClick={() => {
              if (!editing) props.onSelectFolder(node.relPath);
            }}
          >
            <button
              type="button"
              title={isCollapsed ? "Expand" : "Collapse"}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) props.onToggleFolderCollapsed(node.relPath);
              }}
              className={cn(
                "flex size-[14px] shrink-0 items-center justify-center text-muted-foreground",
                !hasChildren && "invisible",
              )}
            >
              <HugeiconsIcon
                icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
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
                  else if (e.key === "Escape") props.onRenameFolderDone();
                }}
                onBlur={commitRename}
                className="h-5 w-full rounded border border-border bg-transparent px-1 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            )}
            {!editing && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {props.counts.get(node.relPath) ?? 0}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => props.onNewNoteIn(node.relPath)}>
            New Note
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => props.onNewFolder(node.relPath)}>
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => props.onStartRenameFolder(node.relPath)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => props.onDeleteFolder(node.relPath)}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!isCollapsed &&
        node.children.map((child) => (
          <FolderRow key={child.relPath} {...props} node={child} depth={depth + 1} />
        ))}
    </>
  );
}

export function CollectionsColumn(props: CollectionsColumnProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const tree = useMemo(() => buildFolderTree(props.folders), [props.folders]);
  const counts = useMemo(() => countNotesPerFolder(props.notes), [props.notes]);
  const collapsed = useMemo(
    () => new Set(props.collapsedFolders),
    [props.collapsedFolders],
  );
  const folderRowShared = {
    counts,
    collapsed,
    selectedFolder: props.selectedFolder,
    editingFolder: props.editingFolder,
    onToggleFolderCollapsed: props.onToggleFolderCollapsed,
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
                  note={props.notesByRelPath.get(relPath)}
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
                icon={NoteIcon}
                size={12}
                strokeWidth={1.85}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">All notes</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {props.notes.length}
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
        {tree.map((node) => (
          <FolderRow key={node.relPath} node={node} depth={0} {...folderRowShared} />
        ))}
      </div>
    </div>
  );
}
