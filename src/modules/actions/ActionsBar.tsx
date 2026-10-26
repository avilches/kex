import { createContext, Fragment, useContext, useEffect, useRef, useState } from "react";
import {
  closestCenter,
  type CollisionDetection,
  type Collision,
  type Modifier,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type Over,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import {
  ArrowDown01Icon,
  PencilEdit02Icon,
  PlayIcon,
  Rocket01Icon,
  Settings01Icon,
  StopIcon,
  Tick02Icon,
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
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { IS_MAC } from "@/lib/platform";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { splitActionName } from "./lib/actionName";
import {
  DROP_MENU,
  DROP_MENU_PREFIX,
  DROP_MENU_GLOBAL,
  DROP_MENU_WORKSPACE,
  barZoneId,
  KIND_ORDER,
  MENU_DRAG_PREFIX,
  menuEntries,
  parseBarZone,
  resolveDrop,
  type Drop,
  WORKSPACE_UNSET,
  type BarItem,
} from "./lib/actionsBar";
import { isScript, usesTerminal, type Action, type ActionKind } from "./lib/types";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { useActionsBarModel, type BarController } from "./lib/useActionsBar";

const ZONE_WORDS: Record<ActionKind, string> = { app: "apps", agent: "agents", script: "scripts" };

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
        "flex shrink-0 items-center justify-center rounded-md transition-colors",
        busy && "text-destructive hover:bg-destructive/15",
        !busy && !blocked && "text-green-500 hover:bg-green-500/15",
        blocked && "cursor-not-allowed text-muted-foreground/40",
        className,
      )}
    >
      <HugeiconsIcon icon={busy ? StopIcon : PlayIcon} size={14} strokeWidth={2} />
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
  if (isScript(item.action) && item.state !== "idle") return `Show ${main}`;
  return item.title ?? `${usesTerminal(item.action) ? "Run" : "Open"} ${main}`;
}

export function OwnButton({ item, ...h }: { item: BarItem } & Handlers) {
  const script = isScript(item.action);
  const disabled = item.disabledReason !== null;
  const iconOnly = item.iconOnly && !script;
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md text-[11px]",
        item.active && "ring-1 ring-border",
      )}
    >
      {script && <ScriptControl item={item} {...h} className="size-8" />}
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
        {iconOnly ? (
          <ActionIcon action={item.action} size={14} fill />
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            {!script && <ActionIcon action={item.action} size={14} fill />}
            <span className="max-w-[120px] min-w-0">
              <ActionNameLines name={item.name} value={item.subtitle} startTrim={item.subtitleTrim} root={item.subtitleRoot} />
            </span>
          </span>
        )}
      </button>
    </div>
  );
}

// Where the dragged Action would land, shown as a line on the edge of the Action it is over:
// `after` is the lower or right edge. Absent when the drop goes nowhere or into a frame.
type DropHint = { overId: string; after: boolean } | null;
const DropHintContext = createContext<DropHint>(null);

function DropLine({ id, vertical }: { id: string; vertical: boolean }) {
  const hint = useContext(DropHintContext);
  if (hint?.overId !== id) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full bg-foreground/70",
        vertical
          ? cn("inset-x-2 h-0.5", hint.after ? "bottom-0" : "top-0")
          : cn("inset-y-1 w-0.5", hint.after ? "-right-1.5" : "-left-1.5"),
      )}
    />
  );
}

// How a drop zone looks during a drag: a soft tint and a dashed outline, firmer and solid
// while the dragged Action is over it.
const ZONE = "outline-[1.5px] outline-dashed outline-foreground/30 bg-foreground/[0.04]";
const ZONE_OVER = "outline-solid outline-foreground/60 bg-foreground/[0.12]";

type ItemOps = { onEdit: (item: BarItem) => void };

const scopeOf = (item: BarItem) => (item.global ? "global" : "workspace");

// The right-click menu of an Action, the same on a bar button and on a row of the menu: the
// way to its card in Settings, where it is changed, moved or deleted.
function ItemContextMenu({
  item,
  onEdit,
  children,
}: { item: BarItem; children: React.ReactElement } & ItemOps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onSelect={() => onEdit(item)}>
          <HugeiconsIcon icon={PencilEdit02Icon} size={13} strokeWidth={2} />
          Edit Action
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// A button that can be dragged while the reorder modifier is held. Out of that mode it is a
// plain wrapper: no listeners, no attributes. In it the click is swallowed, so grabbing a
// button never runs it, and the children ignore the pointer so even a disabled button
// (which the webview hides pointer events from) can be picked up. What follows the pointer
// is the drag overlay; the button itself stays dimmed in its place.
function ReorderableButton({
  item,
  reorderMode,
  onEdit,
  ...h
}: { item: BarItem; reorderMode: boolean } & ItemOps & Handlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !reorderMode,
  });
  return (
    <ItemContextMenu item={item} onEdit={onEdit}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform && { ...transform, y: 0 }), transition }}
        {...(reorderMode ? attributes : {})}
        {...listeners}
        onClickCapture={reorderMode ? (e) => e.stopPropagation() : undefined}
        className={cn("relative shrink-0 rounded-md", reorderMode && "cursor-grab [&_*]:pointer-events-none", isDragging && "opacity-40")}
      >
        <OwnButton item={item} run={h.run} stop={h.stop} focus={h.focus} />
        <DropLine id={item.id} vertical={false} />
      </div>
    </ItemContextMenu>
  );
}

// One scope and kind of the bar. During a drag it draws a dashed frame with its label, empty
// or not, and is where a dragged Action of its kind lands when it is dropped on no button;
// a frame of the other kind stays dim and takes nothing. Out of a drag an empty one takes
// no room. The frame is an outline so showing it moves nothing.
function BarZone({
  id,
  label,
  dragging,
  accepts,
  empty,
  children,
}: {
  id: string;
  label: string;
  dragging: boolean;
  accepts: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !dragging || !accepts });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex shrink-0 items-center gap-2 rounded-md",
        empty && (!dragging || !accepts) && "hidden",
        dragging && "min-h-8 min-w-16 outline-offset-2",
        dragging && !accepts && "opacity-40 outline-[1.5px] outline-dashed outline-border",
        dragging && accepts && ZONE,
        dragging && accepts && isOver && ZONE_OVER,
      )}
    >
      {dragging && accepts && (
        <span className="pointer-events-none absolute -top-[5px] left-2 bg-card px-1 text-[8px] leading-none text-foreground/70">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

// A grey dashed stand-in for the menu while a button is dragged and the menu has no
// Actions to open; it exists for the length of the drag only.
function FakeMenu({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      title="Hide from the bar"
      aria-label="Hide from the bar"
      className={cn(
        "flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed border-foreground/30 bg-foreground/[0.04] px-3 text-[11px] text-foreground/70 transition-colors",
        isOver && "border-solid border-foreground/60 bg-foreground/[0.12] text-foreground",
      )}
    >
      <HugeiconsIcon icon={Rocket01Icon} size={13} strokeWidth={2} />
      <span>Actions</span>
    </div>
  );
}

// The menu trigger is a target while a button is dragged: dropping there hides the button.
// While a menu row is dragged it is no target, the row is already in the menu.
function MenuDrop({
  dragging,
  fromMenu,
  hasMenu,
  children,
}: {
  dragging: boolean;
  fromMenu: boolean;
  hasMenu: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_MENU, disabled: !dragging || fromMenu });
  if (!hasMenu) return dragging && !fromMenu ? <FakeMenu id={DROP_MENU} /> : null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "shrink-0 rounded-md transition-colors",
        dragging && !fromMenu && cn(ZONE, "outline-offset-2"),
        dragging && !fromMenu && isOver && ZONE_OVER,
      )}
    >
      {children}
    </div>
  );
}

type RowProps = { item: BarItem; reorderMode: boolean } & ItemOps & Handlers;

function MenuRow({ item, reorderMode, onEdit, ...h }: RowProps) {
  const script = isScript(item.action);
  // Dragged with the reorder modifier held: within its section, to the other section, or out
  // onto the bar. The listeners go on a wrapper that takes the pointer in that mode, so a
  // blocked row, which a menu item ignores, can be grabbed too; the wrapper's attributes are
  // never taken, they would replace the role of the menu item inside.
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: `${MENU_DRAG_PREFIX}${item.id}`,
    disabled: !reorderMode,
  });
  const blocked = item.state === "idle" && item.disabledReason !== null;
  const text = (
    <>
      <span className={cn("flex min-w-0 flex-1 items-center gap-2", blocked && "opacity-60")}>
        {!script && <ActionIcon action={item.action} size={14} fill />}
        <ActionNameLines name={item.name} value={item.subtitle} startTrim={item.subtitleTrim} root={item.subtitleRoot} />
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
  };
  // An app or an agent is one menu item, icon and text lit together: the whole row is one click. A
  // script has two zones, the start or stop control and the name, siblings so that each
  // hover lights only its own; the name runs an idle script or brings a live one into view,
  // and either way the menu stays open.
  return (
    <ItemContextMenu item={item} onEdit={onEdit}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        {...listeners}
        onClickCapture={reorderMode ? (e) => e.stopPropagation() : undefined}
        className={cn(
          "relative flex min-w-0 items-center",
          script && "pl-1.5",
          reorderMode && "cursor-grab [&_*]:pointer-events-none",
          isDragging && "opacity-40",
        )}
      >
        {script ? (
          <>
            <ScriptControl item={item} {...h} className="min-h-9 w-9 self-stretch" />
            <DropdownMenuItem
              {...common}
              className="flex min-h-9 min-w-0 flex-1 items-center overflow-hidden py-0.5 pr-3 pl-1"
              onSelect={(e) => {
                e.preventDefault();
                nameClick(item, h);
              }}
            >
              {text}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            {...common}
            className="flex min-h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden py-0.5 pr-3"
            onSelect={() => nameClick(item, h)}
          >
            {text}
          </DropdownMenuItem>
        )}
        <DropLine id={`${MENU_DRAG_PREFIX}${item.id}`} vertical />
      </div>
    </ItemContextMenu>
  );
}

// One scope of the menu. While dragging, both sections show their title and a dashed frame,
// empty or not, and an empty one says where to drop.
function MenuSection({
  id,
  label,
  items,
  dragging,
  ...row
}: { id: string; label: string; items: BarItem[]; dragging: boolean } & Omit<RowProps, "item">) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !dragging });
  if (items.length === 0 && !dragging) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md",
        dragging && cn(ZONE, "-outline-offset-2"),
        dragging && isOver && ZONE_OVER,
      )}
    >
      <DropdownMenuLabel className="text-[10px] text-muted-foreground">{label}</DropdownMenuLabel>
      <SortableContext items={items.map((i) => `${MENU_DRAG_PREFIX}${i.id}`)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <MenuRow key={item.id} item={item} {...row} />
        ))}
      </SortableContext>
      {items.length === 0 && (
        <div className="mx-2 mb-1 flex h-9 items-center justify-center text-[11px] text-foreground/60">Drop here</div>
      )}
    </div>
  );
}

type MenuProps = {
  label: string;
  items: BarItem[];
  globalItems: BarItem[];
  /** The reorder modifier is held: rows can be dragged and a click does nothing. */
  reorderMode: boolean;
  /** Some drag is in flight. */
  dragging: boolean;
  onRestoreFocus: () => void;
  onConfigure: () => void;
} & ItemOps &
  Handlers;

// The one menu of the bar: every non-own Action, the workspace scope first and the global
// one after, each in the user's order, with the Settings entry at the bottom.
export function ActionsMenu({
  label,
  items,
  globalItems,
  reorderMode,
  dragging,
  onEdit,
  onRestoreFocus,
  onConfigure,
  ...props
}: MenuProps) {
  // The menu is not modal, so focus can move to a script's terminal while it stays open;
  // once that happened, the focus leaving the menu is not a reason to dismiss it. A click
  // outside, Escape or a pick still close it.
  const holdOpen = useRef(false);
  if (items.length === 0 && globalItems.length === 0) return null;
  const h = {
    run: props.run,
    stop: props.stop,
    focus: (action: Action) => {
      const done = props.focus(action);
      if (done) holdOpen.current = true;
      return done;
    },
  };
  const busy = items.some((i) => i.state !== "idle") || globalItems.some((i) => i.state !== "idle");
  const row = { reorderMode, onEdit, ...h };
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
        <MenuSection id={DROP_MENU_GLOBAL} label="Global actions" items={globalItems} dragging={dragging} {...row} />
        {(globalItems.length > 0 || dragging) && (items.length > 0 || dragging) && <DropdownMenuSeparator />}
        <MenuSection id={DROP_MENU_WORKSPACE} label="Workspace actions" items={items} dragging={dragging} {...row} />
        <DropdownMenuSeparator />
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
function AddActionMenu({ onAdd, reveal, dragging }: { onAdd: () => void; reveal: "always" | "hover"; dragging: boolean }) {
  return (
    <button
      type="button"
      title="Add an action: run a script or open an app"
      aria-haspopup="menu"
      onClick={onAdd}
      className={cn(
        "flex h-7 shrink-0 items-center rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        reveal === "hover" && "hidden group-hover/ap:flex",
        dragging && "hidden group-hover/ap:hidden",
      )}
    >
      <span>+</span>
    </button>
  );
}

type BarProps = {
  workspace: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "actions" | "activeAction"> | null;
  controller: BarController;
  onConfigure: () => void;
  onAddAction: () => void;
  onRestoreFocus: () => void;
};

// The ghost that follows the pointer sits next to it whatever the layout did since the drag
// began: a section appearing in the menu moves the dragged row, and the overlay, which is
// placed from the row, would otherwise carry that shift as an offset from the pointer.
const followPointer: Modifier = ({ activatorEvent, activeNodeRect, overlayNodeRect, transform }) => {
  const start = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  if (!start || !activeNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + start.x - activeNodeRect.left - 16,
    y: transform.y + start.y - activeNodeRect.top - (overlayNodeRect?.height ?? 32) / 2,
  };
};

const isZone = (id: string | number) => String(id).startsWith("zone:") || String(id).startsWith("mzone:");

// The Header's actions: own buttons in the user's order, then the single Actions menu of
// the rest with its workspace and global sections. The bar takes all the room between the
// title and the search box and measures it: as it shrinks, the last own buttons fold into
// the menu instead of pushing the rest out. With the reorder modifier held, buttons and menu
// rows are dragged between the four places an Action can live: the workspace and the global
// scope of the bar, and of the menu.
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const model = useActionsBarModel({ workspace, room, arranging: held || draggingId !== null });
  const menuItems = [...model.menu.workspace, ...model.menu.global];
  const fromMenu = draggingId?.startsWith(MENU_DRAG_PREFIX) ?? false;
  const dragged = draggingId
    ? fromMenu
      ? menuItems.find((i) => i.id === draggingId.slice(MENU_DRAG_PREFIX.length))
      : model.buttons.find((b) => b.id === draggingId)
    : undefined;
  const workspaceButtons = model.buttons.filter((b) => !b.global);
  const globalButtons = model.buttons.filter((b) => b.global);
  const dragging = draggingId !== null;
  const kindOf = (id: string): ActionKind | undefined =>
    (id.startsWith(MENU_DRAG_PREFIX)
      ? menuItems.find((i) => i.id === id.slice(MENU_DRAG_PREFIX.length))
      : model.buttons.find((b) => b.id === id)
    )?.action.kind;
  const dragKind = draggingId ? kindOf(draggingId) : undefined;
  // The pointer decides what is under the drag, a button or row before the frame around it.
  // Over a section of the menu the Action may only land among its own kind: the one under
  // the pointer, else the nearest, and where the section has none of its kind the section
  // itself, which takes it anywhere. With nothing under it a bar button falls back to the
  // nearest button of its own scope.
  const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args)
      .filter((c) => c.id !== args.active.id)
      .sort((a, b) => Number(isZone(a.id)) - Number(isZone(b.id)));
    const activeId = String(args.active.id);
    // The section under the pointer: a menu row or section, or a bar button or zone.
    const sectionOf = (id: string | number): { global: boolean; menu: boolean } | null => {
      const key = String(id);
      if (key.startsWith(MENU_DRAG_PREFIX)) {
        const item = menuItems.find((i) => i.id === key.slice(MENU_DRAG_PREFIX.length));
        return item ? { global: item.global, menu: true } : null;
      }
      if (key === DROP_MENU_WORKSPACE || key === DROP_MENU_GLOBAL) return { global: key === DROP_MENU_GLOBAL, menu: true };
      const zone = parseBarZone(key);
      if (zone) return { global: zone.scope === "global", menu: false };
      const button = model.buttons.find((b) => b.id === key);
      return button ? { global: button.global, menu: false } : null;
    };
    const hit = within.find((c) => sectionOf(c.id));
    const kind = kindOf(activeId);
    if (hit && kind !== undefined) {
      const section = sectionOf(hit.id)!;
      const idOf = (i: BarItem) => (section.menu ? `${MENU_DRAG_PREFIX}${i.id}` : i.id);
      const peers = (section.menu ? menuItems : model.buttons).filter(
        (i) => i.global === section.global && i.action.kind === kind && idOf(i) !== activeId,
      );
      const peerCollision = (id: string): Collision[] => {
        const container = args.droppableContainers.find((c) => c.id === id);
        return container ? [{ id, data: { droppableContainer: container, value: 0 } }] : [];
      };
      if (peers.length === 0) {
        const scope = section.global ? "global" : "workspace";
        return peerCollision(section.menu ? `${DROP_MENU_PREFIX}${scope}` : barZoneId(scope, kind));
      }
      const direct = within.find((c) => peers.some((p) => idOf(p) === c.id));
      if (direct) return [direct];
      const pointer = args.pointerCoordinates;
      let best: { id: string; distance: number } | undefined;
      for (const p of peers) {
        const rect = args.droppableRects.get(idOf(p));
        if (!rect || !pointer) continue;
        const distance = section.menu
          ? Math.abs(rect.top + rect.height / 2 - pointer.y)
          : Math.abs(rect.left + rect.width / 2 - pointer.x);
        if (!best || distance < best.distance) best = { id: idOf(p), distance };
      }
      return best ? peerCollision(best.id) : within;
    }
    if (within.length > 0 || activeId.startsWith(MENU_DRAG_PREFIX)) return within;
    const origin = model.buttons.find((b) => b.id === args.active.id);
    const own = args.droppableContainers.filter((c) =>
      model.buttons.some((b) => b.id === c.id && b.global === origin?.global && b.action.kind === origin?.action.kind),
    );
    return closestCenter({ ...args, droppableContainers: own });
  };
  const dragStart = ({ active }: DragStartEvent) => {
    draggingRef.current = true;
    setDraggingId(String(active.id));
  };
  const endDrag = () => {
    draggingRef.current = false;
    setDraggingId(null);
    live.current = { activeId: null, over: null, point: null };
    setHint(null);
  };
  const [hint, setHint] = useState<DropHint>(null);
  // What dropping here would do, and on which edge of what it is over the line goes: past the
  // middle of it along the axis its list runs (down in the menu, right in the bar), or, for a
  // reorder inside one list, the edge the dragged Action ends up on.
  const dropAt = (activeId: string, over: Pick<Over, "id" | "rect">, point: { x: number; y: number } | null) => {
    const overId = String(over.id);
    const vertical = overId.startsWith(MENU_DRAG_PREFIX);
    const past = point
      ? vertical
        ? point.y > over.rect.top + over.rect.height / 2
        : point.x > over.rect.left + over.rect.width / 2
      : false;
    const drop: Drop | null = resolveDrop(model.buttons, menuItems, activeId, overId, past);
    if (!drop) return null;
    let after = past;
    if (drop.reorderOver) {
      const order = vertical ? menuItems.map((i) => `${MENU_DRAG_PREFIX}${i.id}`) : model.buttons.map((b) => b.id);
      after = order.indexOf(activeId) < order.indexOf(overId);
    }
    return { drop, after, overId };
  };
  // The line follows what the pointer is over, which dnd-kit reports when it changes
  // (`onDragOver`) and not with every move, where it lags a move behind; the pointer comes
  // from the moves. Both feed the same refresh.
  const live = useRef<{ activeId: string | null; over: Over | null; point: { x: number; y: number } | null }>({
    activeId: null,
    over: null,
    point: null,
  });
  const refreshHint = () => {
    const { activeId, over, point } = live.current;
    const at = activeId && over ? dropAt(activeId, over, point) : null;
    const next: DropHint = at && !isZone(at.overId) ? { overId: at.overId, after: at.after } : null;
    setHint((prev) => (prev?.overId === next?.overId && prev?.after === next?.after ? prev : next));
  };
  const dragOver = ({ active, over }: DragOverEvent) => {
    live.current.activeId = String(active.id);
    live.current.over = over;
    refreshHint();
  };
  const dragMove = ({ active, activatorEvent, delta }: DragMoveEvent) => {
    const start = getEventCoordinates(activatorEvent);
    live.current.activeId = String(active.id);
    live.current.point = start ? { x: start.x + delta.x, y: start.y + delta.y } : null;
    refreshHint();
  };
  const dragEnd = ({ active, over, activatorEvent, delta }: DragEndEvent) => {
    endDrag();
    const start = getEventCoordinates(activatorEvent);
    const drop = over ? dropAt(String(active.id), over, start ? { x: start.x + delta.x, y: start.y + delta.y } : null)?.drop : null;
    if (!drop) return;
    if (drop.button !== drop.wasButton) controller.update(drop.from, drop.id, { ownButton: drop.button });
    if (drop.to !== drop.from) controller.move(drop.from, drop.id, drop.placeBefore ?? undefined);
    else if (drop.placeBefore !== undefined) controller.place(drop.from, drop.id, drop.placeBefore ?? undefined);
    if (drop.reorderOver) controller.reorder(drop.from, drop.id, drop.reorderOver);
  };
  const itemOps: ItemOps = { onEdit: (item) => controller.edit(scopeOf(item), item.id) };
  const renderButtons = (list: BarItem[]) => (
    <SortableContext items={list.map((b) => b.id)} strategy={horizontalListSortingStrategy}>
      {list.map((item) => (
        <ReorderableButton key={item.id} item={item} reorderMode={held} {...itemOps} {...controller} />
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
      <AddActionMenu onAdd={onAddAction} reveal={model.empty ? "always" : "hover"} dragging={dragging} />
      <DropHintContext.Provider value={hint}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={dragStart}
        onDragOver={dragOver}
        onDragMove={dragMove}
        onDragEnd={dragEnd}
        onDragCancel={endDrag}
      >
        {(["workspace", "global"] as const).map((scope, i) => {
          const scoped = model.buttons.filter((b) => b.global === (scope === "global"));
          return (
            <Fragment key={scope}>
              {i === 1 && !dragging && workspaceButtons.length > 0 && globalButtons.length > 0 && (
                <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
              )}
              {KIND_ORDER.map((kind) => {
                const list = scoped.filter((b) => b.action.kind === kind);
                return (
                  <BarZone
                    key={`${scope}-${kind}`}
                    id={barZoneId(scope, kind)}
                    label={`${scope === "global" ? "Global" : "Workspace"} ${ZONE_WORDS[kind]}`}
                    dragging={dragging}
                    accepts={dragKind === undefined || dragKind === kind}
                    empty={list.length === 0}
                  >
                    {renderButtons(list)}
                  </BarZone>
                );
              })}
            </Fragment>
          );
        })}
        <MenuDrop dragging={dragging} fromMenu={fromMenu} hasMenu={menuItems.length > 0}>
          <ActionsMenu
            label="Actions"
            items={model.menu.workspace}
            globalItems={model.menu.global}
            reorderMode={held}
            dragging={dragging}
            onRestoreFocus={onRestoreFocus}
            onConfigure={onConfigure}
            {...itemOps}
            {...controller}
          />
        </MenuDrop>
        <DragOverlay dropAnimation={null} modifiers={[followPointer]}>
          {dragged && (
            <div className="flex h-8 items-center gap-1.5 rounded-md bg-popover px-2 text-[11px] shadow-lg ring-1 ring-foreground/10">
              <ActionIcon action={dragged.action} size={14} fill />
              <span className="max-w-[120px] truncate">{splitActionName(dragged.name).main}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </DropHintContext.Provider>
    </div>
  );
}
