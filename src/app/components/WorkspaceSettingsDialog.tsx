import { useEffect, useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  Cancel01Icon,
  DragDropVerticalIcon,
  FolderOpenIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { newScriptId } from "@/lib/ids";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { native } from "@/lib/native";
import { useWorkspaceSettingsStore } from "@/modules/workspaces/lib/workspaceSettingsStore";
import type { WorkspaceSettingsFocus, WorkspaceSettingsSection } from "@/modules/workspaces/lib/workspaceSettingsStore";
import {
  WORKSPACE_COLOR_PALETTE,
  resolveWorkspaceColor,
} from "@/modules/workspaces/lib/workspaceColor";
import { WORKSPACE_ICON_PALETTE, PALETTE_PAGE_SIZE, searchIcons, type IconSearchResult } from "@/modules/workspaces/lib/workspaceIcon";
import type { Workspace, Script } from "@/modules/workspaces/lib/types";
import type { WorkspaceStatus } from "@/modules/settings/store";

type Props = {
  workspaces: Workspace[];
  workspaceStatuses: WorkspaceStatus[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetIcon: (id: string, icon: string | null) => void;
  onSetStatus: (id: string, statusId: string | null) => void;
  onSetWorkspaceRoot: (id: string, path: string | undefined) => void;
  onAddScript: (id: string, config: Script) => void;
  onUpdateScript: (id: string, configId: string, patch: Partial<Script>) => void;
  onRemoveScript: (id: string, configId: string) => void;
  onReorderScripts: (id: string, fromId: string, toId: string) => void;
};

export function WorkspaceSettingsDialog(props: Props) {
  const { open, workspaceId, initialSection, initialFocus, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);

  function handleClose() {
    if (ws) {
      for (const sc of ws.scripts ?? []) {
        if (!sc.command.trim()) {
          props.onRemoveScript(ws.id, sc.id);
        }
      }
    }
    closeSettings();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Workspace {ws?.title}</DialogTitle>
        </DialogHeader>
        {ws && (
          <WorkspaceSettingsForm
            key={`${ws.id}-${initialSection}-${initialFocus}`}
            ws={ws}
            initialSection={initialSection}
            initialFocus={initialFocus}
            onRequestClose={handleClose}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}


function ColorPicker({
  wsId,
  wsColor,
  displayColor,
  onSetColor,
}: {
  wsId: string;
  wsColor: string | null | undefined;
  displayColor: string | null;
  onSetColor: (id: string, color: string | null) => void;
}) {
  const customHex =
    wsColor != null && !(WORKSPACE_COLOR_PALETTE as readonly string[]).includes(wsColor)
      ? wsColor
      : "";

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="size-5 shrink-0 rounded-full border border-border"
        style={displayColor ? { backgroundColor: displayColor } : undefined}
      />
      <input
        className="h-6 w-20 rounded border border-border bg-background px-1.5 text-[11px] font-mono outline-none ring-ring focus-visible:ring-1"
        placeholder="#rrggbb"
        defaultValue={customHex}
        key={customHex}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onSetColor(wsId, v);
        }}
      />
      <label
        title="Pick color"
        className="relative flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
        style={displayColor ? { backgroundColor: `${displayColor}33` } : undefined}
      >
        <input
          type="color"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={displayColor ?? "#4f8ef7"}
          onChange={(e) => onSetColor(wsId, e.target.value)}
        />
        <span className="pointer-events-none text-[10px] font-bold leading-none">H</span>
      </label>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button
        type="button"
        title="No color"
        onClick={() => onSetColor(wsId, null)}
        className={cn(
          "size-6 rounded-full border-2 flex items-center justify-center bg-muted text-muted-foreground transition-colors",
          wsColor === null
            ? "border-foreground"
            : "border-transparent hover:border-muted-foreground/50",
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
      </button>
      {WORKSPACE_COLOR_PALETTE.map((hex) => (
        <button
          key={hex}
          type="button"
          title={hex}
          onClick={() => onSetColor(wsId, hex)}
          className={cn(
            "size-6 rounded-full border-2 transition-opacity",
            wsColor === hex ? "border-foreground" : "border-transparent hover:border-foreground/40",
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}

const PALETTE_PAGES = Math.ceil(WORKSPACE_ICON_PALETTE.length / PALETTE_PAGE_SIZE);

function IconPicker({
  wsId,
  wsIcon,
  onSetIcon,
}: {
  wsId: string;
  wsIcon: string | undefined;
  onSetIcon: (id: string, icon: string | null) => void;
}) {
  const currentEntry = WORKSPACE_ICON_PALETTE.find((e) => e.name === wsIcon);
  const [query, setQuery] = useState(currentEntry?.label ?? "");
  const [filtered, setFiltered] = useState<IconSearchResult[]>([]);
  const [page, setPage] = useState(() => {
    if (!wsIcon) return 0;
    const idx = WORKSPACE_ICON_PALETTE.findIndex((e) => e.name === wsIcon);
    return idx === -1 ? 0 : Math.floor(idx / PALETTE_PAGE_SIZE);
  });

  useEffect(() => {
    setFiltered(searchIcons(query));
  }, [query]);

  function selectIcon(name: string | null) {
    onSetIcon(wsId, name);
    if (name) {
      const idx = WORKSPACE_ICON_PALETTE.findIndex((e) => e.name === name);
      if (idx !== -1) setPage(Math.floor(idx / PALETTE_PAGE_SIZE));
    }
    const entry = WORKSPACE_ICON_PALETTE.find((e) => e.name === name);
    setQuery(entry?.label ?? "");
  }

  const pageIcons = WORKSPACE_ICON_PALETTE.slice(
    page * PALETTE_PAGE_SIZE,
    page * PALETTE_PAGE_SIZE + PALETTE_PAGE_SIZE,
  );

  return (
    <div className="flex gap-3">
      {/* Left: search input + results below */}
      <div className="flex flex-col gap-1.5">
        <div className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icon..."
            className="h-8 w-28 rounded border border-border bg-transparent py-0 pl-2.5 pr-6 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {wsIcon != null && (
            <button
              type="button"
              title="Remove icon"
              onClick={() => { onSetIcon(wsId, null); setQuery(""); }}
              className="absolute right-1.5 flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-0.5">
          {filtered.map((entry) => (
            <button
              key={entry.name}
              type="button"
              title={entry.label}
              onClick={() => selectIcon(entry.name)}
              className={cn(
                "size-8 flex items-center justify-center rounded border-2 text-foreground transition-colors",
                wsIcon === entry.name
                  ? "border-foreground bg-muted"
                  : "border-transparent hover:border-muted-foreground/40 hover:bg-muted/60",
              )}
            >
              <HugeiconsIcon icon={entry.icon} size={17} strokeWidth={1.5} />
            </button>
          ))}
          {query.trim() && filtered.length === 0 && (
            <span className="text-[11px] text-muted-foreground">No icons found</span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-border/60" />

      {/* Right: paginated palette */}
      <div className="relative flex flex-wrap gap-0.5 pb-5">
        {/* No-icon button */}
        <button
          type="button"
          title="No icon"
          onClick={() => { onSetIcon(wsId, null); setQuery(""); }}
          className={cn(
            "size-8 flex items-center justify-center rounded border-2 bg-muted text-muted-foreground transition-colors",
            wsIcon == null
              ? "border-foreground"
              : "border-transparent hover:border-muted-foreground/50",
          )}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </button>
        {/* 32 icons for the current page */}
        {pageIcons.map((entry) => (
          <button
            key={entry.name}
            type="button"
            title={entry.label}
            onClick={() => selectIcon(entry.name)}
            className={cn(
              "size-8 flex items-center justify-center rounded border-2 text-foreground transition-colors",
              wsIcon === entry.name
                ? "border-foreground bg-muted"
                : "border-transparent hover:border-muted-foreground/40 hover:bg-muted/60",
            )}
          >
            <HugeiconsIcon icon={entry.icon} size={17} strokeWidth={1.5} />
          </button>
        ))}
        {/* Page indicator + next button, bottom-right */}
        <button
          type="button"
          onClick={() => setPage((p) => (p + 1) % PALETTE_PAGES)}
          className="absolute bottom-0 right-8 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          More {page + 1}/{PALETTE_PAGES}
        </button>
      </div>
    </div>
  );
}

type FormProps = { ws: Workspace; initialSection: WorkspaceSettingsSection; initialFocus: WorkspaceSettingsFocus; onRequestClose: () => void } & Omit<Props, "workspaces">;

function WorkspaceSettingsForm({ ws, initialSection, initialFocus, onRequestClose, ...props }: FormProps) {
  const [activeSection, setActiveSection] = useState<WorkspaceSettingsSection>(initialSection);
  const [cwdValue, setCwdValue] = useState(ws.workspaceRoot ?? "");
  const [cwdValid, setCwdValid] = useState<boolean | null>(null);
  const [titleValue, setTitleValue] = useState(ws.title ?? "");
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [hiddenStatusCount, setHiddenStatusCount] = useState(0);
  const statusContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = statusContainerRef.current;
    if (!el || statusExpanded || props.workspaceStatuses.length <= 18) {
      setHiddenStatusCount(0);
      return;
    }
    const bottom = el.getBoundingClientRect().bottom;
    let count = 0;
    for (const child of el.children) {
      if ((child as HTMLElement).getBoundingClientRect().top >= bottom) count++;
    }
    setHiddenStatusCount(count);
  }, [props.workspaceStatuses, statusExpanded]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cwdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeSection === "properties") {
      setTimeout(() => {
        if (initialFocus === "workspaceRoot") {
          cwdInputRef.current?.focus();
        } else {
          nameInputRef.current?.focus();
        }
      }, 0);
    }
  }, [activeSection, initialFocus]);

  useEffect(() => {
    if (!cwdValue) {
      setCwdValid(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const stat = await native.fsStat(cwdValue);
        setCwdValid(stat.kind === "dir");
      } catch {
        setCwdValid(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [cwdValue]);

  const displayColor = resolveWorkspaceColor(ws.color, ws.id);

  return (
    <div className="flex min-h-[380px] flex-col gap-0 py-1">
      {/* Section bar */}
      <div className="mb-4 flex gap-0 border-b border-border">
        {(["properties", "scripts"] as const).map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            className={cn(
              "-mb-px px-3 py-1.5 text-[12px] font-medium outline-none transition-colors focus-visible:outline-none",
              activeSection === section
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {section === "properties" ? "Properties" : "Scripts"}
          </button>
        ))}
      </div>

      {activeSection === "properties" && (
        <div className="flex flex-col gap-5">
          {/* Name: full width */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Name</label>
            <input
              ref={nameInputRef}
              className="h-8 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Name"
              spellCheck={false}
              value={titleValue}
              onChange={(e) => {
                setTitleValue(e.target.value);
                if (e.target.value.trim()) props.onSetTitle(ws.id, e.target.value.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); cwdInputRef.current?.focus(); }
              }}
            />
          </div>

          {props.workspaceStatuses.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Status</label>
              <div
                ref={statusContainerRef}
                className={cn(
                  "flex flex-wrap items-center gap-1.5 overflow-hidden",
                  !statusExpanded && props.workspaceStatuses.length > 18 && "max-h-[108px]",
                )}
              >
                <button
                  type="button"
                  title="No status"
                  onClick={() => props.onSetStatus(ws.id, null)}
                  className={cn(
                    "size-6 rounded-full border-2 flex items-center justify-center bg-muted text-muted-foreground transition-colors",
                    !ws.statusId
                      ? "border-foreground"
                      : "border-transparent hover:border-muted-foreground/50",
                  )}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                </button>
                {props.workspaceStatuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => props.onSetStatus(ws.id, s.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      ws.statusId === s.id
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {props.workspaceStatuses.length > 18 && (statusExpanded || hiddenStatusCount > 0) && (
                <button
                  type="button"
                  onClick={() => setStatusExpanded((v) => !v)}
                  className="self-end text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {statusExpanded ? "Show less" : `Show ${hiddenStatusCount} more`}
                </button>
              )}
            </div>
          )}

          {/* Working Directory */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Workspace Root</label>
            <div className="flex items-center gap-1">
              <input
                ref={cwdInputRef}
                className={cn(
                  "h-8 flex-1 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring",
                  cwdValid === false ? "border-destructive" : "border-border",
                )}
                spellCheck={false}
                value={cwdValue}
                onChange={(e) => setCwdValue(e.target.value)}
                onBlur={() => {
                  if (!cwdValue) {
                    props.onSetWorkspaceRoot(ws.id, undefined);
                  } else if (cwdValid !== false) {
                    props.onSetWorkspaceRoot(ws.id, cwdValue);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onRequestClose(); }
                }}
                placeholder="Not set"
              />
              {cwdValue && (
                <button
                  type="button"
                  title="Clear"
                  onClick={() => {
                    setCwdValue("");
                    setCwdValid(null);
                    props.onSetWorkspaceRoot(ws.id, undefined);
                  }}
                  className="size-[22px] flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                title="Browse"
                onClick={async () => {
                  const selected = await openFolderDialog({
                    directory: true,
                    defaultPath: cwdValue || undefined,
                  });
                  if (typeof selected === "string") {
                    setCwdValue(selected);
                    setCwdValid(null);
                    props.onSetWorkspaceRoot(ws.id, selected);
                  }
                }}
                className="size-[22px] flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={FolderOpenIcon} size={12} strokeWidth={2} />
              </button>
            </div>
            {cwdValid === false && (
              <p className="text-[11px] text-destructive">Folder does not exist</p>
            )}
            <p className="text-[11px] text-muted-foreground/60">
              Tip: right-click any folder in the explorer and choose &quot;Set as Workspace Root&quot;
            </p>
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Color</label>
            <ColorPicker
              wsId={ws.id}
              wsColor={ws.color}
              displayColor={displayColor}
              onSetColor={props.onSetColor}
            />
          </div>

          {/* Icon */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Icon</label>
            <IconPicker
              wsId={ws.id}
              wsIcon={ws.icon}
              onSetIcon={props.onSetIcon}
            />
          </div>
        </div>
      )}

      {activeSection === "scripts" && (
        <ScriptSection
          ws={ws}
          onAddScript={props.onAddScript}
          onUpdateScript={props.onUpdateScript}
          onRemoveScript={props.onRemoveScript}
          onReorderScripts={props.onReorderScripts}
        />
      )}
    </div>
  );
}

type ScriptRowHandle = { focusCommand: () => void };

const ScriptRow = forwardRef<
  ScriptRowHandle,
  {
    config: Script;
    onUpdate: (patch: Partial<Omit<Script, "id">>) => void;
    onRemove: () => void;
  }
>(function ScriptRow({ config, onUpdate, onRemove }, ref) {
  const [commandDirty, setCommandDirty] = useState(false);
  const [commandValue, setCommandValue] = useState(config.command);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: config.id,
  });
  const [showCwd, setShowCwd] = useState(!!config.cwd);
  const commandRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusCommand: () => {
      commandRef.current?.focus();
      commandRef.current?.select();
    },
  }));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-1.5 rounded-md border border-border/60 p-2"
    >
      <div className="flex items-center gap-1.5">
        <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0">
          <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
        </span>
        <input
          ref={commandRef}
          className={cn(
            "h-8 flex-[3_3_0%] min-w-0 rounded-md border bg-background px-3 font-mono text-sm outline-none ring-ring focus-visible:ring-1",
            commandDirty && !commandValue ? "border-destructive" : "border-border/60",
          )}
          placeholder="Command (e.g. pnpm dev)"
          spellCheck={false}
          defaultValue={config.command}
          onBlur={(e) => {
            setCommandDirty(true);
            setCommandValue(e.target.value);
            onUpdate({ command: e.target.value });
          }}
        />
        <input
          className="h-8 flex-[1_1_0%] min-w-0 rounded-md border border-border/60 bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1"
          placeholder="Name"
          spellCheck={false}
          defaultValue={config.name}
          onBlur={(e) => onUpdate({ name: e.target.value })}
        />
        <button
          type="button"
          title="Remove"
          onClick={onRemove}
          className="size-[22px] shrink-0 flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>
      <button
        type="button"
        className="self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setShowCwd((v) => !v)}
      >
        {showCwd ? "Hide working dir" : "+ Working dir"}
      </button>
      {showCwd && (
        <input
          className="h-8 w-full rounded-md border border-border/60 bg-background px-3 font-mono text-sm outline-none ring-ring focus-visible:ring-1"
          placeholder="Working dir (optional)"
          defaultValue={config.cwd ?? ""}
          onBlur={(e) => onUpdate({ cwd: e.target.value || undefined })}
        />
      )}
    </div>
  );
});

function ScriptSection({
  ws,
  onAddScript,
  onUpdateScript,
  onRemoveScript,
  onReorderScripts,
}: {
  ws: Workspace;
  onAddScript: Props["onAddScript"];
  onUpdateScript: Props["onUpdateScript"];
  onRemoveScript: Props["onRemoveScript"];
  onReorderScripts: Props["onReorderScripts"];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const configs = ws.scripts ?? [];
  const configRefs = useRef<Map<string, ScriptRowHandle>>(new Map());

  function handleAdd() {
    const firstMissingCommand = configs.find((c) => !c.command.trim());
    if (firstMissingCommand) {
      configRefs.current.get(firstMissingCommand.id)?.focusCommand();
      return;
    }
    onAddScript(ws.id, { id: newScriptId(), name: "", command: "" });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderScripts(ws.id, String(active.id), String(over.id));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" onClick={handleAdd}>
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add Script
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={configs.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {configs.map((cfg) => (
              <ScriptRow
                key={cfg.id}
                ref={(handle) => {
                  if (handle) configRefs.current.set(cfg.id, handle);
                  else configRefs.current.delete(cfg.id);
                }}
                config={cfg}
                onUpdate={(patch) => onUpdateScript(ws.id, cfg.id, patch)}
                onRemove={() => onRemoveScript(ws.id, cfg.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {configs.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No scripts yet.</p>
      )}
    </div>
  );
}
