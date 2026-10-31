import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { TabEntry } from "@/modules/command-palette";
import { tabDetailLines } from "@/modules/command-palette/lib/rowDetail";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { TabBarIcon } from "@/modules/workspaces/lib/tabBarIcon";
import { useTabIndicator } from "@/modules/workspaces/lib/useTabIndicator";
import { DirtyMark } from "@/modules/workspaces/DirtyMark";
import { isDirtyDocument } from "@/modules/workspaces/lib/dirtyTab";
import { SleepingBadge } from "@/modules/workspaces/SleepingBadge";
import { TabIndicatorMark } from "@/modules/workspaces/TabIndicatorMark";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { LockKeyIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Tab } from "@/modules/workspaces/lib/types";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { commitSwitcher, hoverSwitcher, menuSwitcher, useSwitcherStore } from "./lib/switcherController";
import { GRID_GAP, GRID_PAD, JUMP_KEYS, TILE_HEIGHT, gridViewportHeight } from "./lib/switcherModel";

// What the app puts in a tile's context menu. Called on every render of the tile, so it can read live state.
export type RenderMenu = (entry: TabEntry) => ReactNode;

// The tab as it is now. The entries are a snapshot taken when the overlay opened, and a menu item that keeps
// the overlay open (Lock, Color, Icon) changes the tab under it, so what is drawn reads the live tab instead.
export type LiveTab = (tabId: string) => Tab | undefined;

// The tab's colour is only the tint of its icon.
const iconColor = (tab: Tab) => tab.color ?? undefined;

function LockMark({ size }: { size: number }) {
  return (
    <span role="img" aria-label="Tab is locked" className="inline-flex shrink-0 text-muted-foreground">
      <HugeiconsIcon icon={LockKeyIcon} size={size} strokeWidth={2} />
    </span>
  );
}

// The icon is asked for at this size instead of stretched with CSS: the agent marks carry an inline size
// that no class can override, which left them at 13 px inside a 44 px square.
const TILE_ICON = 26;

function WorkspaceLine({ entry, size }: { entry: TabEntry; size: number }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <WorkspaceMark id={entry.workspaceId} color={entry.workspaceColor} icon={entry.workspaceIcon ?? undefined} size={size} />
      <span className="truncate">{entry.workspaceTitle}</span>
    </span>
  );
}

// Every tile has the same height whatever its title: the title and the workspace share one block that
// is as tall as two title lines plus the workspace line, and the spare room sits under them, so the
// workspace hugs a one-line title instead of floating at the bottom. A tile that changed height with
// its text would move the rows below it and the scroll with them.
function Tile({
  entry,
  selected,
  index,
  renderMenu,
}: {
  entry: TabEntry;
  selected: boolean;
  index: number;
  renderMenu?: RenderMenu;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const indicator = useTabIndicator(entry.tabId, entry.indicator);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const tile = (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      onMouseMove={(e) => hoverSwitcher(index, { x: e.clientX, y: e.clientY })}
      onClick={() => commitSwitcher(index)}
      style={{ height: TILE_HEIGHT }}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border-2 border-transparent px-2 pt-3 text-center outline-none",
        selected && "border-primary bg-primary/10",
      )}
    >
      {index < JUMP_KEYS ? (
        <span
          data-jump-number
          aria-hidden
          className="absolute top-1.5 left-2 text-[10px] leading-none text-muted-foreground tabular-nums"
        >
          {index + 1}
        </span>
      ) : null}
      <span className="relative shrink-0">
        <span
          style={{ color: iconColor(entry.tab) }}
          className={cn(
            "flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground",
            entry.hibernated && "opacity-40 grayscale",
          )}
        >
          {!entry.agentSession && !entry.hibernated && entry.agent && entry.kind === "terminal" && !entry.tab.icon ? (
            <AgentIcon agent={entry.agent} size={TILE_ICON} />
          ) : (
            <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} size={TILE_ICON} carriedAgent={entry.agent} />
          )}
        </span>
        {entry.tab.locked ? (
          <span className="absolute -right-1.5 -bottom-1.5 flex size-[18px] items-center justify-center rounded-full bg-popover ring-2 ring-popover">
            <LockMark size={11} />
          </span>
        ) : null}
        {entry.hibernated ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-popover ring-2 ring-popover">
            <SleepingBadge size={12} indicator={indicator} />
          </span>
        ) : isDirtyDocument(entry.tab) ? (
          <span
            role="img"
            aria-label="Unsaved changes"
            data-dirty-mark=""
            className="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary ring-2 ring-popover"
          />
        ) : indicator === "working" ? (
          <span className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-popover ring-2 ring-popover">
            <Spinner size={12} />
          </span>
        ) : indicator ? (
          <span
            role="img"
            aria-label="Agent needs attention"
            className={cn(
              "absolute -top-1 -right-1 size-3.5 rounded-full ring-2 ring-popover",
              indicator === "error" ? "bg-destructive" : "bg-amber-400",
            )}
          />
        ) : null}
      </span>
      <span data-title-slot className="flex w-full min-w-0 flex-col items-center gap-0.5">
        <span
          className={cn(
            "line-clamp-2 w-full text-[12px] leading-[15px] break-words",
            entry.hibernated && "opacity-40",
          )}
        >
          {entry.title || entry.kind}
        </span>
        <span className="flex w-full min-w-0 justify-center text-[10px] leading-[13px] text-muted-foreground">
          <WorkspaceLine entry={entry} size={10} />
        </span>
      </span>
    </button>
  );
  if (!renderMenu) return tile;
  return (
    <ContextMenu onOpenChange={(open) => menuSwitcher(open, index)}>
      <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>{renderMenu(entry)}</ContextMenuContent>
    </ContextMenu>
  );
}

// Only the keys that would work right now: W when the app can close, the hibernate letter when it is on and the
// highlighted tab is a terminal (a file tab has nothing to put to sleep), saying restore for one that is asleep.
function KeyHints({ entry }: { entry: TabEntry }) {
  const keys = useSwitcherStore((s) => s.keys);
  const hints: Array<[string, string]> = [];
  if (keys.close) hints.push(["W", "close"]);
  if (keys.sleep && entry.kind === "terminal") hints.push([keys.sleep.toUpperCase(), entry.hibernated ? "restore" : "hibernate"]);
  hints.push(["1-9", "jump"]);
  hints.push(["Esc", "cancel"]);
  return (
    <div data-testid="tab-switcher-hints" className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
      {hints.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1 font-sans text-[10px] leading-4">{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

function Footer({
  entry,
  position,
  total,
  ref,
}: {
  entry: TabEntry;
  position: number;
  total: number;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const detail = tabDetailLines(entry).join("  ·  ");
  const indicator = useTabIndicator(entry.tabId, entry.indicator);
  return (
    <div
      ref={ref}
      data-testid="tab-switcher-footer"
      className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <div data-footer-line className="flex min-w-0 items-center gap-1.5">
          <span
            data-tab-icon
            style={{ color: iconColor(entry.tab) }}
            className="flex shrink-0 items-center text-muted-foreground"
          >
            <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} carriedAgent={entry.agent} />
          </span>
          <span className={cn("truncate text-[13px] font-medium", entry.hibernated && "opacity-40")}>{entry.title || entry.kind}</span>
          {entry.hibernated ? <SleepingBadge size={13} indicator={indicator} /> : <TabIndicatorMark indicator={indicator} />}
          {isDirtyDocument(entry.tab) && <DirtyMark />}
          {entry.tab.locked ? <LockMark size={13} /> : null}
        </div>
        <div data-footer-line className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <WorkspaceLine entry={entry} size={11} />
          {detail ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{detail}</span>
            </>
          ) : null}
        </div>
      </div>
      <KeyHints entry={entry} />
      <div className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {position} / {total}
      </div>
    </div>
  );
}

// The grid shows whole rows only: its height is the rows that fit in what the box leaves once the footer
// is counted, so the last visible row is never cut in half and every scroll stop lands on a row.
function useWholeRows(count: number, shown: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (!shown || !box.current || !grid.current || !foot.current) return;
      const max = Math.min(520, window.innerHeight - 32);
      const columns = Math.max(1, getComputedStyle(grid.current).gridTemplateColumns.split(" ").filter(Boolean).length);
      setHeight(gridViewportHeight(max - foot.current.offsetHeight, Math.ceil(count / columns)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [count, shown]);
  return { box, grid, foot, height };
}

// Mounted by the parent only while a session is on, and it paints nothing during the first moments of one.
export function TabSwitcher({ renderMenu, liveTab }: { renderMenu?: RenderMenu; liveTab?: LiveTab }) {
  const revealed = useSwitcherStore((s) => s.revealed);
  const snapshot = useSwitcherStore((s) => s.entries);
  const entries = snapshot.map((e) => {
    const tab = liveTab?.(e.tabId);
    return tab ? { ...e, tab } : e;
  });
  const index = useSwitcherStore((s) => s.index);
  const { box, grid, foot, height } = useWholeRows(entries.length, revealed);
  if (!revealed || entries.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/40">
      <div
        ref={box}
        role="listbox"
        aria-label="Switch tab"
        className="flex max-h-[min(520px,calc(100vh-2rem))] w-[min(880px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-popover/90 text-popover-foreground shadow-xl ring-1 ring-foreground/10 backdrop-blur-xl"
      >
        <div style={{ padding: GRID_PAD }} className="min-h-0">
          <div
            ref={grid}
            data-tab-switcher-grid
            style={{ height: height ?? undefined, gap: GRID_GAP }}
            className="grid grid-cols-[repeat(auto-fill,minmax(122px,1fr))] overflow-y-auto"
          >
            {entries.map((entry, i) => (
              <Tile key={entry.tabId} entry={entry} selected={i === index} index={i} renderMenu={renderMenu} />
            ))}
          </div>
        </div>
        <Footer ref={foot} entry={entries[index]} position={index + 1} total={entries.length} />
      </div>
    </div>
  );
}
