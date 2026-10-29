import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { TabEntry } from "@/modules/command-palette";
import { tabDetailLines } from "@/modules/command-palette/lib/rowDetail";
import { TabBarIcon } from "@/modules/workspaces/lib/tabBarIcon";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { commitSwitcher, selectSwitcher, useSwitcherStore } from "./lib/switcherController";

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
      onMouseEnter={() => selectSwitcher(index)}
      onClick={() => commitSwitcher(index)}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border-2 border-transparent px-2 pt-3 pb-2 text-center outline-none",
        selected ? "border-primary bg-primary/10" : "hover:bg-accent/50",
      )}
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_img]:size-6 [&_svg]:size-6",
          entry.hibernated && "opacity-40 grayscale",
        )}
      >
        <TabBarIcon tab={entry.tab} agentSession={entry.agentSession} running={entry.running} />
      </span>
      <span
        className={cn(
          "line-clamp-2 min-h-[2.5em] w-full text-[12px] leading-tight break-words",
          entry.hibernated && "text-muted-foreground",
        )}
      >
        {entry.title || entry.kind}
      </span>
      <span className="flex w-full min-w-0 items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <WorkspaceMark id={entry.workspaceId} color={entry.workspaceColor} icon={entry.workspaceIcon ?? undefined} size={10} />
        <span className="truncate">{entry.workspaceTitle}</span>
      </span>
      {entry.indicator === "working" ? (
        <Spinner size={11} className="absolute top-2 right-3" />
      ) : entry.indicator ? (
        <span
          role="img"
          aria-label="Agent needs attention"
          className={cn(
            "absolute top-2.5 right-3.5 size-[7px] rounded-full",
            entry.indicator === "error" ? "bg-destructive" : "bg-amber-400",
          )}
        />
      ) : null}
    </button>
  );
}

function Footer({ entry, position, total }: { entry: TabEntry; position: number; total: number }) {
  const detail = [entry.workspaceTitle, ...tabDetailLines(entry)];
  if (entry.hibernated) detail.push("hibernated");
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{entry.title || entry.kind}</div>
        <div className="truncate text-[11px] text-muted-foreground">{detail.join("  ·  ")}</div>
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
