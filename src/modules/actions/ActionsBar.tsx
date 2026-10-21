import { useEffect, useRef, useState } from "react";
import { ArrowDown01Icon, PlayIcon, Rocket01Icon, StopIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { menuEntries, WORKSPACE_UNSET, type BarItem } from "./lib/actionsBar";
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

function ownButtonTitle(item: BarItem): string {
  if (item.disabledReason) return `${item.name}: ${item.disabledReason}`;
  if (!item.action.runInTerminal) return `Open ${item.name}`;
  return item.state === "idle" ? `Run ${item.name}` : `Show ${item.name}`;
}

export function OwnButton({ item, ...h }: { item: BarItem } & Handlers) {
  const script = item.action.runInTerminal;
  const disabled = item.disabledReason !== null;
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
        disabled={disabled}
        onClick={() => nameClick(item, h)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        )}
      >
        {!script && <ActionIcon action={item.action} size={14} />}
        <span className="max-w-[120px] min-w-0">
          <ActionNameLines name={item.name} value={item.subtitle} />
        </span>
      </button>
    </div>
  );
}

function MenuRow({ item, ...h }: { item: BarItem } & Handlers) {
  const script = item.action.runInTerminal;
  const blocked = item.state === "idle" && item.disabledReason !== null;
  const nameZone = (
    <DropdownMenuItem
      // The hover words: where the Action opens. A blocked row keeps its reason.
      title={item.title ?? undefined}
      disabled={!menuEntries(item)[0].enabled}
      className="flex flex-1 items-center py-0.5"
      onSelect={(e) => {
        if (script && item.state !== "idle" && h.focus(item.action)) e.preventDefault();
        else nameClick(item, h);
      }}
    >
      <span className={cn("flex min-w-0 flex-1 px-1", blocked && "opacity-60")}>
        <ActionNameLines name={item.name} value={item.subtitle} startTrim={item.subtitleTrim} />
      </span>
      {blocked && item.subtitle !== WORKSPACE_UNSET && (
        <span className="shrink-0 pr-1 text-[10px] text-muted-foreground/70">{item.disabledReason}</span>
      )}
      {item.active && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2} className="shrink-0 text-muted-foreground" />}
    </DropdownMenuItem>
  );
  // The start or stop zone is a sibling cell of the name zone, so its hover never lights
  // the name and the name hover never lights it; only the name zone is a menu item.
  if (script) {
    return (
      <div className="flex items-center">
        <ScriptControl item={item} {...h} />
        {nameZone}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="flex size-[22px] shrink-0 items-center justify-center"><ActionIcon action={item.action} size={14} /></span>
      {nameZone}
    </div>
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
export function ActionsMenu({ label, items, globalItems, onRestoreFocus, onConfigure, ...h }: MenuProps) {
  if (items.length === 0 && globalItems.length === 0) return null;
  const busy = items.some((i) => i.state !== "idle") || globalItems.some((i) => i.state !== "idle");
  return (
    <DropdownMenu>
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
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onRestoreFocus();
        }}
      >
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">Workspace actions</DropdownMenuLabel>
        {items.map((item) => (
          <MenuRow key={item.id} item={item} {...h} />
        ))}
        {globalItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Global actions</DropdownMenuLabel>
            {globalItems.map((item) => (
              <MenuRow key={item.id} item={item} {...h} />
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onConfigure} className="text-muted-foreground">
          Configure Actions
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
  const [room, setRoom] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setRoom(entries[0]?.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const model = useActionsBarModel({ workspace, room });
  return (
    <div ref={ref} data-tauri-drag-region className="group/ap flex h-full min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden">
      <AddActionMenu onAdd={onAddAction} reveal={model.empty ? "always" : "hover"} />
      {model.buttons.map((item) => (
        <OwnButton key={item.id} item={item} {...controller} />
      ))}
      <ActionsMenu
        label="Actions"
        items={model.menu.workspace}
        globalItems={model.menu.global}
        onRestoreFocus={onRestoreFocus}
        onConfigure={onConfigure}
        {...controller}
      />
    </div>
  );
}
