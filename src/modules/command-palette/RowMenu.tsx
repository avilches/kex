import { ContextMenuShortcut } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel } from "@/modules/shortcuts";
import {
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  CopySlashIcon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type MenuAnchor,
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
} as const;

export type RowMenuState = {
  rowKey: string;
  items: RowMenuItem[];
  active: number;
  anchor: MenuAnchor;
};

// The box the menu is placed in (its `relative` wrapper) and the row it hangs from.
export function anchorOf(box: HTMLElement, row: HTMLElement): MenuAnchor {
  const b = box.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  return { rowTop: r.top - b.top, rowBottom: r.bottom - b.top };
}

// The menu of the highlighted row, opened with Tab or the right button. The palette input keeps
// the focus the whole time, so the menu is driven from the palette's own keydown.
export function useRowMenu() {
  const [menu, setMenu] = useState<RowMenuState | null>(null);
  const isOpen = menu !== null;

  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((rowKey: string, items: RowMenuItem[], anchor: MenuAnchor) => {
    const active = stepEnabled(items, -1, 1);
    setMenu({ rowKey, items, active: Math.max(0, active), anchor });
  }, []);

  // Radix listens for Escape on the document in capture, before React handlers.
  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setMenu(null);
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [isOpen]);

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

  return { menu, open, close, setActive, handleKey };
}

export function RowMenu({
  menu,
  onRun,
  onActive,
}: {
  menu: RowMenuState;
  onRun: (id: RowMenuItemId) => void;
  onActive: (index: number) => void;
}) {
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once per open, items do not change its size
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent as HTMLElement | null;
    if (!el || !box) return;
    setTop(placeMenuTop(menu.anchor, box.clientHeight, el.offsetHeight));
  }, [menu.rowKey, menu.anchor]);

  return (
    <div
      ref={ref}
      role="menu"
      data-row-menu=""
      style={{ top: top ?? 0, visibility: top === null ? "hidden" : "visible" }}
      className="absolute right-3 z-10 min-w-56 max-w-[calc(100%-24px)] rounded-menu bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.items.map((item, i) => {
        const label = item.shortcutId ? getShortcutLabel(item.shortcutId, userShortcuts) : null;
        return (
          <div
            key={item.id}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            data-active={i === menu.active ? "" : undefined}
            title={item.title}
            onPointerMove={() => !item.disabled && i !== menu.active && onActive(i)}
            onClick={() => !item.disabled && onRun(item.id)}
            className={cn(
              "flex cursor-default items-center gap-2 rounded-menu-item px-2.5 py-1 text-[13px] font-medium select-none",
              i === menu.active && "bg-accent text-accent-foreground",
              item.disabled && "pointer-events-none opacity-50",
            )}
          >
            <HugeiconsIcon
              icon={item.id === "go" && item.label.startsWith("Restore") ? ArrowReloadHorizontalIcon : ICONS[item.id]}
              size={14}
              strokeWidth={2}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.enter ? (
              <ContextMenuShortcut>{"↵"}</ContextMenuShortcut>
            ) : label ? (
              <ContextMenuShortcut>{label}</ContextMenuShortcut>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
