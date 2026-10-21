import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown01Icon,
  CircleArrowDownDoubleIcon,
  CircleArrowUpDoubleIcon,
  Delete02Icon,
  PlayIcon,
  Rocket01Icon,
  Settings01Icon,
  StopIcon,
  Tick02Icon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { IS_MAC } from "@/lib/platform";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { splitActionName } from "./lib/actionName";
import {
  DROP_GLOBAL,
  DROP_MENU,
  DROP_WORKSPACE,
  MENU_DRAG_PREFIX,
  menuEntries,
  resolveDrop,
  resolveMenuDrop,
  WORKSPACE_UNSET,
  type BarItem,
} from "./lib/actionsBar";
import type { Action } from "./lib/types";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { useActionsBarModel, type BarController } from "./lib/useActionsBar";

type Handlers = Pick<BarController, "run" | "stop" | "focus">;

// The play or stop zone of a script. It has its own hover, apart from the name next to it,
// so it reads at a glance that pressing it starts or stops the script. While the script is
// stopping the zone stays the red Stop button: the first stop typed Ctrl+C, and clicking
// again delivers the signal that no keystroke can, with no spinner to wait for.
function ScriptControl({ item, run, stop, className }: { item: BarItem } & Handlers & { className?: string }) {
  const busy = item.state !== "idle";
  const blocked = !busy && item.disabledReason !== null;
  const label = busy ? "Stop" : "Run";
  return (
    <button
      type="button"
      aria-label={`${label} ${item.name}`}
      title={blocked ? `${item.name}: ${item.disabledReason}` : `${label}: ${item.name}`}
      disabled={blocked}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (busy) stop(item.action);
        else run(item.action);
      }}
      className={cn(
        "flex size-[22px] shrink-0 items-center justify-center rounded transition-colors",
        busy && "text-destructive hover:bg-destructive/15",
        !busy && !blocked && "text-green-500 hover:bg-green-500/15",
        blocked && "cursor-not-allowed text-muted-foreground/40",
        className,
      )}
    >
      <HugeiconsIcon icon={busy ? StopIcon : PlayIcon} size={12} strokeWidth={2} />
    </button>
  );
}

// Clicking the name of a script that has a tab brings it into view; without one it runs.
// A waiting script focuses like a running one: its own zone still stops.
function nameClick(item: BarItem, { run, focus }: Handlers) {
  if (item.state !== "idle" && focus(item.action)) return;
  run(item.action);
}

// The hover words spell the variable out ("Open RustRover in /p/root"), never the raw template.
function ownButtonTitle(item: BarItem): string {
  const { main } = splitActionName(item.name);
  if (item.disabledReason) return `${main}: ${item.disabledReason}`;
  if (item.action.runInTerminal && item.state !== "idle") return `Show ${main}`;
  return item.title ?? `${item.action.runInTerminal ? "Run" : "Open"} ${main}`;
}

export function OwnButton({ item, ...h }: { item: BarItem } & Handlers) {
  const script = item.action.runInTerminal;
  const disabled = item.disabledReason !== null;
  const iconOnly = item.iconOnly && !script;
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md text-[11px]",
        item.active && "ring-1 ring-border",
      )}
    >
      {script && <ScriptControl item={item} {...h} className="ml-0.5" />}
      <button
        type="button"
        title={ownButtonTitle(item)}
        aria-label={iconOnly ? item.name : undefined}
        disabled={disabled}
        onClick={() => nameClick(item, h)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-1.5 text-left text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        )}
      >
        {!script && <ActionIcon action={item.action} size={14} />}
        {!iconOnly && (
          <span className="max-w-[120px] min-w-0">
            <ActionNameLines name={item.name} value={item.subtitle} startTrim={item.subtitleTrim} />
          </span>
        )}
      </button>
    </div>
  );
}

type Ops = Pick<BarController, "update" | "move">;

// A button that can be dragged while the reorder modifier is held. Out of that mode it is a
// plain wrapper: no listeners, no attributes. In it the click is swallowed, so grabbing a
// button never runs it, and the children ignore the pointer so even a disabled button
// (which the webview hides pointer events from) can be picked up. The right-click menu
// is the third way, after Settings and dragging, to take an Action to the menu, to the
// other scope or out of the app.
function ReorderableButton({
  item,
  reorderMode,
  ops,
  onDelete,
  ...h
}: { item: BarItem; reorderMode: boolean; ops: Ops; onDelete: (item: BarItem) => void } & Handlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !reorderMode,
  });
  const scope = item.global ? "global" : "workspace";
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={{ transform: CSS.Translate.toString(transform && { ...transform, y: 0 }), transition, zIndex: isDragging ? 10 : undefined }}
          {...(reorderMode ? attributes : {})}
          {...listeners}
          onClickCapture={reorderMode ? (e) => e.stopPropagation() : undefined}
          className={cn("shrink-0 rounded-md", reorderMode && "cursor-grab [&>*]:pointer-events-none", isDragging && "cursor-grabbing bg-accent opacity-80")}
        >
          <OwnButton item={item} run={h.run} stop={h.stop} focus={h.focus} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onSelect={() => ops.update(scope, item.id, { ownButton: false })}>
          <HugeiconsIcon icon={ViewOffIcon} size={13} strokeWidth={2} />
          Hide from bar
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => ops.move(scope, item.id)}>
          <HugeiconsIcon icon={item.global ? CircleArrowDownDoubleIcon : CircleArrowUpDoubleIcon} size={13} strokeWidth={2} />
          {item.global ? "Move to Workspace Only" : "Move to Global"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onDelete(item)}>
          <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2} />
          Delete Action
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Where a dragged button can land when its own scope has no buttons, or the menu has no
// Actions: a grey dashed stand-in that only exists during the drag.
function DropPlaceholder({ id, label, children }: { id: string; label: string; children?: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/40 px-3 text-[11px] text-muted-foreground transition-colors",
        isOver && "border-foreground/50 bg-accent text-foreground",
      )}
    >
      {children}
    </div>
  );
}

// The menu is a drop target while a button is dragged: dropping there hides the button.
// Without a menu a grey dashed "Actions" appears for the duration of the drag instead.
function MenuDrop({ dragging, hasMenu, children }: { dragging: boolean; hasMenu: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_MENU, disabled: !dragging });
  if (hasMenu) {
    return (
      <div ref={setNodeRef} className={cn("shrink-0 rounded-md transition-shadow", dragging && isOver && "ring-1 ring-foreground/40")}>
        {children}
      </div>
    );
  }
  if (!dragging) return null;
  return (
    <DropPlaceholder id={DROP_MENU} label="Hide from the bar">
      <HugeiconsIcon icon={Rocket01Icon} size={13} strokeWidth={2} />
      <span>Actions</span>
    </DropPlaceholder>
  );
}

function MenuRow({ item, ...h }: { item: BarItem } & Handlers) {
  const script = item.action.runInTerminal;
  // Dragging a row out of the menu onto the bar makes it a button. Only the pointer
  // listeners are taken, never the attributes, which would replace the menu item's role.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `${MENU_DRAG_PREFIX}${item.id}` });
  const blocked = item.state === "idle" && item.disabledReason !== null;
  const text = (
    <>
      <span className={cn("flex min-w-0 flex-1", blocked && "opacity-60")}>
        <ActionNameLines name={item.name} value={item.subtitle} startTrim={item.subtitleTrim} />
      </span>
      {blocked && item.subtitle !== WORKSPACE_UNSET && (
        <span className="shrink-0 pr-1 text-[10px] text-muted-foreground/70">{item.disabledReason}</span>
      )}
      {item.active && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2} className="shrink-0 text-muted-foreground" />}
    </>
  );
  const common = {
    // The hover words: where the Action opens. A blocked row keeps its reason.
    title: item.title ?? undefined,
    disabled: !menuEntries(item)[0].enabled,
    ref: setNodeRef,
    ...listeners,
  };
  // An app is one menu item, icon and text lit together: the whole row is one click. A
  // script has two zones, the start or stop control and the name, siblings so that each
  // hover lights only its own; the name runs an idle script or brings a live one into view,
  // and either way the menu stays open.
  if (script) {
    return (
      <div className="flex min-w-0 items-center pl-1.5">
        <ScriptControl item={item} {...h} />
        <DropdownMenuItem
          {...common}
          className={cn("flex min-h-9 min-w-0 flex-1 items-center overflow-hidden py-0.5 pr-3 pl-1", isDragging && "opacity-50")}
          onSelect={(e) => {
            e.preventDefault();
            nameClick(item, h);
          }}
        >
          {text}
        </DropdownMenuItem>
      </div>
    );
  }
  return (
    <DropdownMenuItem
      {...common}
      className={cn("flex min-h-9 min-w-0 items-center gap-2 overflow-hidden py-0.5 pr-3", isDragging && "opacity-50")}
      onSelect={() => nameClick(item, h)}
    >
      <span className="flex shrink-0 items-center justify-center"><ActionIcon action={item.action} size={14} /></span>
      {text}
    </DropdownMenuItem>
  );
}

type MenuProps = {
  label: string;
  items: BarItem[];
  globalItems: BarItem[];
  onRestoreFocus: () => void;
  onConfigure: () => void;
} & Handlers;

// The one menu of the bar: every non-own Action, the workspace scope first and the global
// one after, each in the user's order, with the Settings entry at the bottom.
export function ActionsMenu({ label, items, globalItems, onRestoreFocus, onConfigure, ...props }: MenuProps) {
  // The menu is not modal, so focus can move to a script's terminal while it stays open;
  // once that happened, the focus leaving the menu is not a reason to dismiss it. A click
  // outside, Escape or a pick still close it.
  const holdOpen = useRef(false);
  if (items.length === 0 && globalItems.length === 0) return null;
  const h = {
    ...props,
    focus: (action: Action) => {
      const done = props.focus(action);
      if (done) holdOpen.current = true;
      return done;
    },
  };
  const busy = items.some((i) => i.state !== "idle") || globalItems.some((i) => i.state !== "idle");
  return (
    <DropdownMenu modal={false} onOpenChange={() => (holdOpen.current = false)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={label}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={Rocket01Icon} size={13} strokeWidth={2} className={cn(busy && "text-green-500")} />
          <span>{label}</span>
          <span className="text-[10px] text-muted-foreground/60">{items.length + globalItems.length}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-64 max-w-96"
        onFocusOutside={(e) => {
          if (holdOpen.current) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRestoreFocus();
        }}
      >
        {items.length > 0 && (
          <DropdownMenuLabel className="text-[10px] text-muted-foreground">Workspace actions</DropdownMenuLabel>
        )}
        {items.map((item) => (
          <MenuRow key={item.id} item={item} {...h} />
        ))}
        {globalItems.length > 0 && (
          <>
            {items.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Global actions</DropdownMenuLabel>
            {globalItems.map((item) => (
              <MenuRow key={item.id} item={item} {...h} />
            ))}
          </>
        )}
        {(items.length > 0 || globalItems.length > 0) && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={onConfigure} className="text-muted-foreground">
          <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={2} />
          Action Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// With no Actions at all the bar shows the dashed add button; once there are Actions it
// hides and comes back when the pointer crosses the bar, so the bar keeps its room for
// buttons while the entry point stays one hover away. It leads straight to the editor.
function AddActionMenu({ onAdd, reveal }: { onAdd: () => void; reveal: "always" | "hover" }) {
  return (
    <button
      type="button"
      title="Add an action: run a command or open an app"
      aria-haspopup="menu"
      onClick={onAdd}
      className={cn(
        "flex h-7 shrink-0 items-center rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        reveal === "hover" && "hidden group-hover/ap:flex",
      )}
    >
      <span>+</span>
    </button>
  );
}

type BarProps = {
  workspace: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "actions" | "activeAction" | "hibernated"> | null;
  controller: BarController;
  onConfigure: () => void;
  onAddAction: () => void;
  onRestoreFocus: () => void;
};

// The Header's actions: own buttons in the user's order, then the single Actions menu of
// the rest with its workspace and global sections. The bar takes all the room between the
// title and the search box and measures it: as it shrinks, the last own buttons fold into
// the menu instead of pushing the rest out.
export function ActionsBar({ workspace, controller, onConfigure, onAddAction, onRestoreFocus }: BarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [held, setHeld] = useState(false);
  const draggingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const modifier = (e: { metaKey: boolean; ctrlKey: boolean }) => (IS_MAC ? e.metaKey : e.ctrlKey);
  // The modifier is read from the keyboard only while the pointer is over the bar, and a
  // drag in flight keeps the mode whatever happens to the key or the pointer meanwhile.
  useEffect(() => {
    if (!hover) return;
    const sync = (e: KeyboardEvent) => {
      if (!draggingRef.current) setHeld(modifier(e));
    };
    const clear = () => {
      if (!draggingRef.current) setHeld(false);
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
    };
  }, [hover]);
  const [room, setRoom] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setRoom(entries[0]?.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const model = useActionsBarModel({ workspace, room });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BarItem | null>(null);
  const dragged = draggingId ? model.buttons.find((b) => b.id === draggingId) : undefined;
  const menuItems = [...model.menu.workspace, ...model.menu.global];
  const draggedFromMenu = draggingId?.startsWith(MENU_DRAG_PREFIX)
    ? menuItems.find((i) => i.id === draggingId.slice(MENU_DRAG_PREFIX.length))
    : undefined;
  const workspaceButtons = model.buttons.filter((b) => !b.global);
  const globalButtons = model.buttons.filter((b) => b.global);
  const workspaceStandIn =
    (!!dragged?.global && workspaceButtons.length === 0) ||
    (!!draggedFromMenu && !draggedFromMenu.global && workspaceButtons.length === 0 && !model.full.workspace);
  const globalStandIn =
    (!!dragged && !dragged.global && globalButtons.length === 0) ||
    (!!draggedFromMenu?.global && globalButtons.length === 0 && !model.full.global);
  // The pointer decides what is under the drag; with none, the nearest button of its own scope.
  const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args).filter((c) => c.id !== args.active.id);
    if (within.length > 0 || String(args.active.id).startsWith(MENU_DRAG_PREFIX)) return within;
    const scope = model.buttons.find((b) => b.id === args.active.id)?.global;
    const own = args.droppableContainers.filter((c) => model.buttons.some((b) => b.id === c.id && b.global === scope));
    return closestCenter({ ...args, droppableContainers: own });
  };
  const dragStart = ({ active }: DragStartEvent) => {
    draggingRef.current = true;
    setDraggingId(String(active.id));
  };
  const endDrag = () => {
    draggingRef.current = false;
    setDraggingId(null);
  };
  const dragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (!over) return;
    const show = resolveMenuDrop(menuItems, model.buttons, model.full, String(active.id), String(over.id));
    if (show) {
      controller.update(show.scope, show.id, { ownButton: true });
      if (show.beforeId) controller.reorder(show.scope, show.id, show.beforeId);
      return;
    }
    const drop = resolveDrop(model.buttons, String(active.id), String(over.id));
    if (!drop) return;
    if (drop.kind === "reorder") controller.reorder(drop.scope, drop.fromId, drop.toId);
    else if (drop.kind === "move") controller.move(drop.scope, drop.id);
    else controller.update(drop.scope, drop.id, { ownButton: false });
  };
  const askDelete = (item: BarItem) => {
    if (item.action.appId) controller.remove(item.global ? "global" : "workspace", item.id);
    else setPendingDelete(item);
  };
  const renderButtons = (list: BarItem[]) => (
    <SortableContext items={list.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
      {list.map((item) => (
        <ReorderableButton key={item.id} item={item} reorderMode={held} ops={controller} onDelete={askDelete} {...controller} />
      ))}
    </SortableContext>
  );
  return (
    <div
      ref={ref}
      data-tauri-drag-region
      onPointerEnter={(e) => {
        setHover(true);
        setHeld(modifier(e));
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) setHeld(modifier(e));
      }}
      onPointerLeave={() => {
        if (draggingRef.current) return;
        setHover(false);
        setHeld(false);
      }}
      className="group/ap flex h-full min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden"
    >
      <AddActionMenu onAdd={onAddAction} reveal={model.empty ? "always" : "hover"} />
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        autoScroll={false}
        onDragStart={dragStart}
        onDragEnd={dragEnd}
        onDragCancel={endDrag}
      >
        {renderButtons(workspaceButtons)}
        {workspaceStandIn && <DropPlaceholder id={DROP_WORKSPACE} label="Move to workspace only" />}
        {(workspaceButtons.length > 0 || workspaceStandIn) && (globalButtons.length > 0 || globalStandIn) && (
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
        )}
        {renderButtons(globalButtons)}
        {globalStandIn && <DropPlaceholder id={DROP_GLOBAL} label="Move to global" />}
        <MenuDrop dragging={draggingId !== null} hasMenu={model.menu.workspace.length + model.menu.global.length > 0}>
          <ActionsMenu
            label="Actions"
            items={model.menu.workspace}
            globalItems={model.menu.global}
            onRestoreFocus={onRestoreFocus}
            onConfigure={onConfigure}
            {...controller}
          />
        </MenuDrop>
        <DragOverlay dropAnimation={null}>
          {draggedFromMenu && (
            <div className="flex h-8 items-center gap-1.5 rounded-md bg-popover px-2 text-[11px] shadow-lg ring-1 ring-foreground/10">
              <ActionIcon action={draggedFromMenu.action} size={14} />
              <span className="max-w-[120px] truncate">{splitActionName(draggedFromMenu.name).main}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="w-[360px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete &quot;{pendingDelete?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">The Action is removed and cannot come back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pendingDelete && controller.remove(pendingDelete.global ? "global" : "workspace", pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
