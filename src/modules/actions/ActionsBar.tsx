import { useEffect, useRef, useState } from "react";
import { ArrowDown01Icon, ComputerTerminal01Icon, PlayIcon, StopIcon, Tick02Icon, AppWindowMacIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ActionIcon } from "./ActionIcon";
import { ActionNameLines } from "./ActionNameLines";
import { menuEntries, WORKSPACE_UNSET, type BarItem } from "./lib/actionsBar";
import type { Workspace } from "@/modules/workspaces/lib/types";
import { useActionsBarModel, type BarController } from "./lib/useActionsBar";

type Handlers = Pick<BarController, "run" | "stop" | "focus">;

// The play or stop zone of a script. It has its own hover, apart from the name next to it,
// so it reads at a glance that pressing it starts or stops the script.
function ScriptControl({ item, run, stop, className }: { item: BarItem } & Handlers & { className?: string }) {
  const running = item.state === "running";
  const waiting = item.state === "waiting";
  const blocked = !running && !waiting && item.disabledReason !== null;
  const label = running ? "Stop" : waiting ? "Stopping..." : "Run";
  return (
    <button
      type="button"
      aria-label={`${label} ${item.name}`}
      title={blocked ? `${item.name}: ${item.disabledReason}` : `${label}: ${item.name}`}
      disabled={waiting || blocked}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (running) stop(item.action);
        else run(item.action);
      }}
      className={cn(
        "flex size-[22px] shrink-0 items-center justify-center rounded transition-colors",
        running && "text-destructive hover:bg-destructive/15",
        waiting && "cursor-not-allowed text-amber-500/70",
        !running && !waiting && !blocked && "text-green-500 hover:bg-green-500/15",
        blocked && "cursor-not-allowed text-muted-foreground/40",
        className,
      )}
    >
      {waiting ? <Spinner size={13} className="text-current" /> : <HugeiconsIcon icon={running ? StopIcon : PlayIcon} size={12} strokeWidth={2} />}
    </button>
  );
}

// Clicking the name of a script that has a tab brings it into view; without one it runs.
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
        item.state === "waiting" && "bg-amber-500/10",
      )}
    >
      {script && <ScriptControl item={item} {...h} className="ml-0.5" />}
      <button
        type="button"
        title={ownButtonTitle(item)}
        disabled={disabled || item.state === "waiting"}
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
  const [main, stop] = menuEntries(item);
  return (
    <>
      <DropdownMenuItem
        title={item.disabledReason ? `${item.name}: ${item.disabledReason}` : undefined}
        disabled={!main?.enabled}
        className="gap-1 px-1 py-0.5"
        onSelect={() => {
          if (!script) h.run(item.action);
          else nameClick(item, h);
        }}
      >
        {script ? <ScriptControl item={item} {...h} /> : <span className="flex size-[22px] shrink-0 items-center justify-center"><ActionIcon action={item.action} size={14} /></span>}
        <span className={cn("flex min-w-0 flex-1 px-1", blocked && "opacity-60")}>
          <ActionNameLines name={item.name} value={item.subtitle} />
        </span>
        {blocked && item.subtitle !== WORKSPACE_UNSET && (
          <span className="shrink-0 pr-1 text-[10px] text-muted-foreground/70">{item.disabledReason}</span>
        )}
        {item.active && <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2} className="shrink-0 text-muted-foreground" />}
      </DropdownMenuItem>
      {stop && (
        <DropdownMenuItem
          disabled={!stop.enabled}
          className="gap-1 px-1 py-0.5 pl-7 text-[12px] text-destructive focus:text-destructive"
          onSelect={() => h.stop(item.action)}
        >
          {item.state === "waiting" ? "Stopping..." : `Stop ${item.name}`}
        </DropdownMenuItem>
      )}
    </>
  );
}

type MenuProps = {
  label: string;
  icon: typeof PlayIcon;
  items: BarItem[];
  globalItems: BarItem[];
  onRestoreFocus: () => void;
  onConfigure: () => void;
} & Handlers;

export function GroupMenu({ label, icon, items, globalItems, onRestoreFocus, onConfigure, ...h }: MenuProps) {
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
          <HugeiconsIcon icon={icon} size={13} strokeWidth={2} className={cn(busy && "text-green-500")} />
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
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">{label}</DropdownMenuLabel>
        {items.map((item) => (
          <MenuRow key={item.id} item={item} {...h} />
        ))}
        {globalItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Global</DropdownMenuLabel>
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
// buttons while the entry point stays one hover away. Its menu picks the scope first:
// the choice opens the matching editor with a blank command draft ready to be typed.
export function AddActionMenu({
  onAddGlobal,
  onAddWorkspace,
  reveal,
}: {
  onAddGlobal: () => void;
  onAddWorkspace: () => void;
  reveal: "always" | "hover";
}) {
  // While its menu is open the trigger stays visible even after the bar hover ended: with
  // the anchor hidden the positioned content has nothing to point back to and lands at
  // the top-left corner of the window.
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Add an action: run a command or open an app"
          aria-haspopup="menu"
          className={cn(
            "flex h-7 shrink-0 items-center rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            reveal === "hover" && !open && "hidden group-hover/ap:flex",
          )}
        >
          <span>+ Action</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <DropdownMenuItem onSelect={onAddGlobal} className="text-[12px]">
          Add global action
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddWorkspace} className="text-[12px]">
          This workspace only
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


type BarProps = {
  workspace: Pick<Workspace, "paneTree" | "activePaneId" | "cwd" | "workspaceRoot" | "actions" | "activeAction" | "hibernated"> | null;
  controller: BarController;
  onConfigure: () => void;
  onAddGlobal: () => void;
  onAddWorkspace: () => void;
  onRestoreFocus: () => void;
};

// The Header's actions: own buttons in the user's order, then a menu of scripts and a menu
// of apps, each with the global Actions in a Global section and a dimmed row count. The
// bar takes all the room between the title and the search box and measures it: as it
// shrinks, the last own buttons fold into the menus instead of pushing the rest out.
export function ActionsBar({ workspace, controller, onConfigure, onAddGlobal, onAddWorkspace, onRestoreFocus }: BarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setRoom(entries[0]?.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const model = useActionsBarModel({ workspace, room });
  return (
    <div ref={ref} data-tauri-drag-region className="group/ap flex h-full min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden">
      <AddActionMenu onAddGlobal={onAddGlobal} onAddWorkspace={onAddWorkspace} reveal={model.empty ? "always" : "hover"} />
      {model.buttons.map((item) => (
        <OwnButton key={item.id} item={item} {...controller} />
      ))}
      <GroupMenu
        label="Scripts"
        icon={ComputerTerminal01Icon}
        items={model.scripts}
        globalItems={model.scriptsGlobal}
        onRestoreFocus={onRestoreFocus}
        onConfigure={onConfigure}
        {...controller}
      />
      <GroupMenu
        label="Apps"
        icon={AppWindowMacIcon}
        items={model.apps}
        globalItems={model.appsGlobal}
        onRestoreFocus={onRestoreFocus}
        onConfigure={onConfigure}
        {...controller}
      />
    </div>
  );
}
