import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
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
import type { WorkspaceSettingsFocus, WorkspaceSettingsTab } from "@/modules/workspaces/lib/workspaceSettingsStore";
import {
  WORKSPACE_COLOR_PALETTE,
  resolveWorkspaceColor,
} from "@/modules/workspaces/lib/workspaceColor";
import { WORKSPACE_ICON_PALETTE } from "@/modules/workspaces/lib/workspaceIcon";
import type { Workspace, RunConfig } from "@/modules/workspaces/lib/types";

type Props = {
  workspaces: Workspace[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetIcon: (id: string, icon: string | null) => void;
  onSetPinnedRoot: (id: string, path: string | undefined) => void;
  onAddRunConfig: (id: string, config: RunConfig) => void;
  onUpdateRunConfig: (id: string, configId: string, patch: Partial<RunConfig>) => void;
  onRemoveRunConfig: (id: string, configId: string) => void;
  onReorderRunConfigs: (id: string, fromId: string, toId: string) => void;
};

export function WorkspaceSettingsDialog(props: Props) {
  const { open, workspaceId, initialTab, initialFocus, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);

  function handleClose() {
    if (ws) {
      for (const sc of ws.scripts ?? []) {
        if (!sc.command.trim()) {
          props.onRemoveRunConfig(ws.id, sc.id);
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
            key={`${ws.id}-${initialTab}-${initialFocus}`}
            ws={ws}
            initialTab={initialTab}
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

function IconPicker({
  wsId,
  wsIcon,
  onSetIcon,
}: {
  wsId: string;
  wsIcon: string | undefined;
  onSetIcon: (id: string, icon: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-0.5">
      <button
        type="button"
        title="No icon"
        onClick={() => onSetIcon(wsId, null)}
        className={cn(
          "size-6 flex items-center justify-center rounded border-2 bg-muted text-muted-foreground transition-colors",
          wsIcon == null
            ? "border-foreground"
            : "border-transparent hover:border-muted-foreground/50",
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
      </button>
      {WORKSPACE_ICON_PALETTE.map((entry) => (
        <button
          key={entry.name}
          type="button"
          title={entry.label}
          onClick={() => onSetIcon(wsId, entry.name)}
          className={cn(
            "size-6 flex items-center justify-center rounded border-2 text-foreground transition-colors",
            wsIcon === entry.name
              ? "border-foreground bg-muted"
              : "border-transparent hover:border-muted-foreground/40 hover:bg-muted/60",
          )}
        >
          <HugeiconsIcon icon={entry.icon} size={13} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

type FormProps = { ws: Workspace; initialTab: WorkspaceSettingsTab; initialFocus: WorkspaceSettingsFocus; onRequestClose: () => void } & Omit<Props, "workspaces">;

function WorkspaceSettingsForm({ ws, initialTab, initialFocus, onRequestClose, ...props }: FormProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceSettingsTab>(initialTab);
  const [cwdValue, setCwdValue] = useState(ws.pinnedRoot ?? "");
  const [cwdValid, setCwdValid] = useState<boolean | null>(null);
  const [titleValue, setTitleValue] = useState(ws.title ?? "");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cwdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "properties") {
      setTimeout(() => {
        if (initialFocus === "workspaceRoot") {
          cwdInputRef.current?.focus();
        } else {
          nameInputRef.current?.focus();
        }
      }, 0);
    }
  }, [activeTab, initialFocus]);

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
      {/* Tab bar */}
      <div className="mb-4 flex gap-0 border-b border-border">
        {(["properties", "run-configurations"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "-mb-px px-3 py-1.5 text-[12px] font-medium outline-none transition-colors focus-visible:outline-none",
              activeTab === tab
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "properties" ? "Properties" : "Run Scripts"}
          </button>
        ))}
      </div>

      {activeTab === "properties" && (
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
          {/* Color: below name */}
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
                    props.onSetPinnedRoot(ws.id, undefined);
                  } else if (cwdValid !== false) {
                    props.onSetPinnedRoot(ws.id, cwdValue);
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
                    props.onSetPinnedRoot(ws.id, undefined);
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
                    props.onSetPinnedRoot(ws.id, selected);
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
        </div>
      )}

      {activeTab === "run-configurations" && (
        <RunConfigSection
          ws={ws}
          onAddRunConfig={props.onAddRunConfig}
          onUpdateRunConfig={props.onUpdateRunConfig}
          onRemoveRunConfig={props.onRemoveRunConfig}
          onReorderRunConfigs={props.onReorderRunConfigs}
        />
      )}
    </div>
  );
}

type RunConfigRowHandle = { focusCommand: () => void };

const RunConfigRow = forwardRef<
  RunConfigRowHandle,
  {
    config: RunConfig;
    onUpdate: (patch: Partial<Omit<RunConfig, "id">>) => void;
    onRemove: () => void;
  }
>(function RunConfigRow({ config, onUpdate, onRemove }, ref) {
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

function RunConfigSection({
  ws,
  onAddRunConfig,
  onUpdateRunConfig,
  onRemoveRunConfig,
  onReorderRunConfigs,
}: {
  ws: Workspace;
  onAddRunConfig: Props["onAddRunConfig"];
  onUpdateRunConfig: Props["onUpdateRunConfig"];
  onRemoveRunConfig: Props["onRemoveRunConfig"];
  onReorderRunConfigs: Props["onReorderRunConfigs"];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const configs = ws.scripts ?? [];
  const configRefs = useRef<Map<string, RunConfigRowHandle>>(new Map());

  function handleAdd() {
    const firstMissingCommand = configs.find((c) => !c.command.trim());
    if (firstMissingCommand) {
      configRefs.current.get(firstMissingCommand.id)?.focusCommand();
      return;
    }
    onAddRunConfig(ws.id, { id: newScriptId(), name: "", command: "" });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderRunConfigs(ws.id, String(active.id), String(over.id));
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
              <RunConfigRow
                key={cfg.id}
                ref={(handle) => {
                  if (handle) configRefs.current.set(cfg.id, handle);
                  else configRefs.current.delete(cfg.id);
                }}
                config={cfg}
                onUpdate={(patch) => onUpdateRunConfig(ws.id, cfg.id, patch)}
                onRemove={() => onRemoveRunConfig(ws.id, cfg.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {configs.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No run configurations yet.</p>
      )}
    </div>
  );
}
