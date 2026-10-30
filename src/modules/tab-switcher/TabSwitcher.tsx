import { useEffect, useRef } from "react";
import { SleepingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { TabEntry } from "@/modules/command-palette";
import { tabDetailLines } from "@/modules/command-palette/lib/rowDetail";
import { TabBarIcon } from "@/modules/workspaces/lib/tabBarIcon";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { commitSwitcher, hoverSwitcher, useSwitcherStore } from "./lib/switcherController";

function HibernatedMark({ size }: { size: number }) {
  return (
    <span role="img" aria-label="Tab is hibernated" className="inline-flex shrink-0 text-muted-foreground">
      <HugeiconsIcon icon={SleepingIcon} size={size} strokeWidth={1.75} />
    </span>
  );
}

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
function Tile({ entry, selected, index }: { entry: TabEntry; selected: boolean; index: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      onMouseMove={(e) => hoverSwitcher(index, { x: e.clientX, y: e.clientY })}
      onClick={() => commitSwitcher(index)}
      className={cn(
        "relative flex h-[118px] min-w-0 scroll-mt-3 scroll-mb-3 flex-col items-center gap-1.5 rounded-xl border-2 border-transparent px-2 pt-3 text-center outline-none",
        selected ? "border-primary bg-primary/10" : "hover:bg-accent/50",
      )}
    >
      <span className="relative shrink-0">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_img]:size-6 [&_svg]:size-6",
            entry.hibernated && "opacity-40 grayscale",
          )}
        >
          <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} />
        </span>
        {entry.indicator === "working" ? (
          <span className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-popover ring-2 ring-popover">
            <Spinner size={12} />
          </span>
        ) : entry.indicator ? (
          <span
            role="img"
            aria-label="Agent needs attention"
            className={cn(
              "absolute -top-1 -right-1 size-3.5 rounded-full ring-2 ring-popover",
              entry.indicator === "error" ? "bg-destructive" : "bg-amber-400",
            )}
          />
        ) : null}
        {entry.hibernated ? (
          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-popover ring-2 ring-popover">
            <HibernatedMark size={11} />
          </span>
        ) : null}
      </span>
      <span data-title-slot className="flex w-full min-w-0 flex-col items-center gap-0.5">
        <span
          className={cn(
            "line-clamp-2 w-full text-[12px] leading-[15px] break-words",
            entry.hibernated && "text-muted-foreground",
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
}

function Footer({ entry, position, total }: { entry: TabEntry; position: number; total: number }) {
  const detail = tabDetailLines(entry).join("  ·  ");
  return (
    <div
      data-testid="tab-switcher-footer"
      className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <div data-footer-line className="flex min-w-0 items-center gap-1.5">
          <span data-tab-icon className="flex shrink-0 items-center text-muted-foreground">
            <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} />
          </span>
          <span className="truncate text-[13px] font-medium">{entry.title || entry.kind}</span>
          {entry.hibernated ? <HibernatedMark size={13} /> : null}
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
      <div className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {position} / {total}
      </div>
    </div>
  );
}

// Mounted by the parent only while a session is on, and it paints nothing during the first moments of one.
export function TabSwitcher() {
  const revealed = useSwitcherStore((s) => s.revealed);
  const entries = useSwitcherStore((s) => s.entries);
  const index = useSwitcherStore((s) => s.index);
  if (!revealed || entries.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/40">
      <div
        role="listbox"
        aria-label="Switch tab"
        className="flex max-h-[min(520px,calc(100vh-2rem))] w-[min(880px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-popover/90 text-popover-foreground shadow-xl ring-1 ring-foreground/10 backdrop-blur-xl"
      >
        <div
          data-tab-switcher-grid
          className="grid grid-cols-[repeat(auto-fill,minmax(122px,1fr))] gap-1.5 overflow-y-auto p-3"
        >
          {entries.map((entry, i) => (
            <Tile key={entry.tabId} entry={entry} selected={i === index} index={i} />
          ))}
        </div>
        <Footer entry={entries[index]} position={index + 1} total={entries.length} />
      </div>
    </div>
  );
}
