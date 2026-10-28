import { ContextMenuShortcut } from "@/components/ui/context-menu";
import { StartTrimmed } from "@/components/StartTrimmed";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel } from "@/modules/shortcuts";
import { alertDialogOpen } from "./lib/keepPaletteFocus";
import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  ArrowTurnBackwardIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  CopySlashIcon,
  Copy01Icon,
  FloppyDiskIcon,
  Link01Icon,
  LockKeyIcon,
  SquareUnlock02Icon,
  StickyNote03Icon,
  GitBranchIcon,
  PencilEdit02Icon,
  PlayIcon,
  StopIcon,
  CancelSquareIcon,
  Delete02Icon,
  PencilEdit01Icon,
  SleepingIcon,
  CircleArrowUpIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type MenuAnchor,
  placeMenuLeft,
  placeMenuTop,
  type RowMenuItem,
  type RowMenuItemId,
  stepEnabled,
} from "./lib/rowMenu";

const ICONS = {
  go: ArrowRight01Icon,
  pick: ComputerTerminal01Icon,
  terminal: ComputerTerminal01Icon,
  copy: CopySlashIcon,
  close: Cancel01Icon,
  worktrees: GitBranchIcon,
  run: PlayIcon,
  stop: StopIcon,
  edit: PencilEdit02Icon,
  action: PlayIcon,
  rename: PencilEdit01Icon,
  hibernate: SleepingIcon,
  closeTabs: CancelSquareIcon,
  closeWorkspace: Delete02Icon,
  settings: Settings01Icon,
  copyRelative: Link01Icon,
  tabId: Copy01Icon,
  lock: LockKeyIcon,
  hibernateTab: SleepingIcon,
  restoreTab: CircleArrowUpIcon,
  save: FloppyDiskIcon,
  note: StickyNote03Icon,
  removeNote: Cancel01Icon,
  moveWorkspace: ArrowRight01Icon,
  back: ArrowTurnBackwardIcon,
  moveNew: Add01Icon,
  moveTarget: ArrowRight01Icon,
} as const;

// The icon of a toggle that is on, for the ones that change it.
const ACTIVE_ICONS: Partial<Record<RowMenuItemId, typeof LockKeyIcon>> = {
  lock: SquareUnlock02Icon,
};

function iconOf(item: RowMenuItem) {
  if (item.id === "go" && (item.label.startsWith("Restore") || item.label.startsWith("Reopen"))) {
    return ArrowReloadHorizontalIcon;
  }
  return (item.active && ACTIVE_ICONS[item.id]) || ICONS[item.id];
}

// The binding of the wildcard menu-action shortcut with its digit swapped for this item's.
export function digitLabel(userShortcuts: Parameters<typeof getShortcutLabel>[1], digit: number): string | null {
  const label = getShortcutLabel("palette.menuAction", userShortcuts);
  return label ? `${label.slice(0, -1)}${digit}` : null;
}

export type RowMenuState = {
  rowKey: string;
  items: RowMenuItem[];
  active: number;
  anchor: MenuAnchor;
  // The menu this one replaced ("Move to Workspace" turns the menu into the destinations); Back
  // and Escape restore it.
  parent?: { items: RowMenuItem[]; active: number };
};

// A right click or a click inside the menu would move the focus off the palette input, so the
// default of the mouse down is cancelled and the user keeps typing.
export function keepInputFocus(e: React.MouseEvent): void {
  if (e.button === 2 || (e.target as HTMLElement).closest("[data-row-menu]")) e.preventDefault();
}

// The box the menu is placed in (its `relative` wrapper) and the row it hangs from.
export function anchorOf(
  box: HTMLElement,
  row: HTMLElement,
  pointer?: { clientX: number; clientY: number },
): MenuAnchor {
  const b = box.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const anchor: MenuAnchor = { rowTop: r.top - b.top, rowBottom: r.bottom - b.top };
  if (pointer) {
    const y = pointer.clientY - b.top;
    return { rowTop: y, rowBottom: y, pointer: { x: pointer.clientX - b.left, y } };
  }
  return anchor;
}

// The menu of the highlighted row, opened with Tab or the right button. The palette input keeps
// the focus the whole time, so the menu is driven from the palette's own keydown.
export function useRowMenu() {
  const [menu, setMenu] = useState<RowMenuState | null>(null);
  const isOpen = menu !== null;
  const inSubmenu = !!menu?.parent;

  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((rowKey: string, items: RowMenuItem[], anchor: MenuAnchor) => {
    const active = stepEnabled(items, -1, 1);
    setMenu({ rowKey, items, active: Math.max(0, active), anchor });
  }, []);

  // Replaces the items of the open menu with a submenu, remembering the ones it leaves and the item
  // `from` that opened it, which Back makes active again.
  const enter = useCallback((items: RowMenuItem[], from?: RowMenuItemId) => {
    setMenu((m) => {
      if (!m) return m;
      const at = from ? m.items.findIndex((i) => i.id === from) : -1;
      return {
        ...m,
        items,
        active: Math.max(0, stepEnabled(items, -1, 1)),
        parent: m.parent ?? { items: m.items, active: at >= 0 ? at : m.active },
      };
    });
  }, []);

  const back = useCallback(() => {
    setMenu((m) =>
      m?.parent ? { ...m, items: m.parent.items, active: m.parent.active, parent: undefined } : m,
    );
  }, []);

  // Radix listens for Escape on the document in capture, before React handlers.
  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || alertDialogOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (inSubmenu) back();
      else setMenu(null);
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [isOpen, inSubmenu, back]);

  // True when the menu took the key.
  const handleKey = useCallback(
    (e: React.KeyboardEvent, run: (item: RowMenuItem) => void): boolean => {
      if (!menu) return false;
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        take();
        const next = stepEnabled(menu.items, menu.active, e.key === "ArrowDown" ? 1 : -1);
        if (next >= 0) setMenu({ ...menu, active: next });
        return true;
      }
      if (e.key === "Enter") {
        take();
        const item = menu.items[menu.active];
        if (item && !item.disabled) run(item);
        return true;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        take();
        setMenu(null);
        return true;
      }
      return false;
    },
    [menu],
  );

  const setActive = useCallback(
    (active: number) => setMenu((m) => (m ? { ...m, active } : m)),
    [],
  );

  // Swaps the items of the open menu (a toggle flipped in place), keeping the same item active.
  const setItems = useCallback((items: RowMenuItem[]) => {
    setMenu((m) => {
      if (!m) return m;
      if (m.parent) return { ...m, parent: { ...m.parent, items } };
      const prev = m.items[m.active];
      let active = items.findIndex((i) => i.id === prev?.id && i.actionId === prev?.actionId);
      if (active < 0 || items[active].disabled) active = Math.max(0, stepEnabled(items, -1, 1));
      return { ...m, items, active };
    });
  }, []);

  return { menu, open, enter, back, close, setActive, setItems, handleKey };
}

export function RowMenu({
  menu,
  onRun,
  onActive,
  iconFor,
}: {
  menu: RowMenuState;
  onRun: (id: RowMenuItemId, item: RowMenuItem) => void;
  onActive: (index: number) => void;
  /** Replaces the icon of an item that carries its own (an Action's). */
  iconFor?: (item: RowMenuItem) => ReactNode;
}) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const level = menu.parent ? 1 : 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once per open and per level, a toggle flipped in place does not change its size
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null;
    if (!el || !box) return;
    setTop(placeMenuTop(menu.anchor, box.clientHeight, el.offsetHeight));
    setLeft(
      menu.anchor.pointer
        ? placeMenuLeft(menu.anchor.pointer.x, box.clientWidth, el.offsetWidth)
        : null,
    );
  }, [menu.rowKey, menu.anchor, level]);

  useEffect(() => {
    ref.current?.querySelector("[data-active]")?.scrollIntoView?.({ block: "nearest" });
  }, [menu.active, level]);

  return (
    <div
      ref={ref}
      role="menu"
      data-row-menu=""
      style={{
        top: top ?? 0,
        maxHeight: "100%",
        ...(left !== null ? { left } : {}),
        visibility: top === null ? "hidden" : "visible",
      }}
      className={cn(
        "absolute z-10 min-w-56 max-w-[calc(100%-24px)] overflow-y-auto rounded-menu bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10",
        !menu.anchor.pointer && "right-3",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.items.map((item, i) => {
        const label = item.shortcutId
          ? getShortcutLabel(item.shortcutId, userShortcuts)
          : item.digit
            ? digitLabel(userShortcuts, item.digit)
            : null;
        const own = item.leading ? (
          <WorkspaceMark
            id={item.leading.workspaceId}
            color={item.leading.color}
            icon={item.leading.icon ?? undefined}
            size={14}
          />
        ) : (
          iconFor?.(item)
        );
        return (
          <Fragment key={item.actionId ?? item.targetId ?? item.id}>
            {item.separatorBefore ? <div aria-hidden className="-mx-1 my-1 h-px bg-border/60" /> : null}
            {item.heading ? (
              <div className="px-2.5 py-1 text-[10px] font-medium text-muted-foreground select-none">{item.heading}</div>
            ) : null}
            <div
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              data-active={i === menu.active ? "" : undefined}
              title={item.title}
              onPointerMove={() => !item.disabled && i !== menu.active && onActive(i)}
              onClick={() => !item.disabled && onRun(item.id, item)}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-menu-item px-2.5 py-1 text-[13px] font-medium select-none",
                i === menu.active && "bg-accent text-accent-foreground",
                item.disabled && "pointer-events-none opacity-50",
              )}
            >
              {own ?? (
                <HugeiconsIcon
                  icon={iconOf(item)}
                  size={14}
                  strokeWidth={2}
                  className="shrink-0"
                />
              )}
              {item.detail !== undefined ? (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  <StartTrimmed
                    text={item.detail}
                    className="flex max-w-[260px] font-mono text-[10px] font-normal text-muted-foreground"
                  />
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              )}
              {item.value !== undefined ? (
                <span className="max-w-[140px] shrink-0 truncate pl-3 font-mono text-[10px] font-normal text-muted-foreground">
                  {item.value}
                </span>
              ) : null}
              {item.enter ? (
                <ContextMenuShortcut>{"↵"}</ContextMenuShortcut>
              ) : label ? (
                <ContextMenuShortcut>{label}</ContextMenuShortcut>
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
