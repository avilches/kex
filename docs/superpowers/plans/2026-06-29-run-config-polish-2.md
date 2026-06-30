# Run Config Polish Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Workspace Properties dialog (2 tabs, command-first order, optional name, larger fonts, focus-instead-of-disable) and fix two RunButton bugs (isComplete only checks command; re-run command on second click).

**Architecture:** Four independent changes in order: (1) store gains initialTab, (2) dialog gets tabs + UX fixes, (3) RunButton always shows dropdown + "Add Run configuration", (4) App.tsx runWorkspaceConfig sends command to existing terminal when not running.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Zustand, shadcn/ui DropdownMenu

## Global Constraints

- No em-dash anywhere (code, comments, JSX text, commit messages)
- No "Co-authored-by" in commits
- Commit messages in English
- All imports use `@/...` alias
- `pnpm exec biome lint ./src` for lint (NOT `pnpm lint`)
- After each task: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

---

### Task 1: workspaceSettingsStore - add initialTab

**Files:**
- Modify: `src/modules/workspaces/lib/workspaceSettingsStore.ts`

**Produces:** `openSettings(id, tab?)` where tab is `"properties" | "run-configurations"`; `initialTab` readable from store.

- [ ] **Step 1: Replace the store file**

```ts
import { create } from "zustand";

export type WorkspaceSettingsTab = "properties" | "run-configurations";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  initialTab: WorkspaceSettingsTab;
  openSettings: (id: string, tab?: WorkspaceSettingsTab) => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  initialTab: "properties",
  openSettings: (id, tab = "properties") =>
    set({ open: true, workspaceId: id, initialTab: tab }),
  closeSettings: () => set({ open: false, workspaceId: null }),
}));
```

- [ ] **Step 2: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types
```
Expected: clean (no call sites break because the second argument is optional)

- [ ] **Step 3: Commit**

```bash
git add src/modules/workspaces/lib/workspaceSettingsStore.ts
git commit -m "feat(workspace): add initialTab to workspaceSettingsStore"
```

---

### Task 2: WorkspaceSettingsDialog - 2 tabs + UX fixes

**Files:**
- Modify: `src/app/components/WorkspaceSettingsDialog.tsx` (full replacement)

**Consumes:** `WorkspaceSettingsTab` from Task 1 (`useWorkspaceSettingsStore` already exports it).

**Changes:**
1. Dialog reads `initialTab` from store; `WorkspaceSettingsForm` keyed by `${ws.id}-${initialTab}` so switching tabs re-mounts at the correct initial state.
2. Simple two-button tab bar at top of form (no Radix Tabs dependency).
3. Tab "Properties": name + color (50/50 row) + working directory — existing layout unchanged.
4. Tab "Run Configurations": run config list with `max-h-[200px] overflow-y-auto`, "+ Run Configuration" button.
5. `RunConfigRow` rewritten with `forwardRef` to expose `focusCommand()`. Fields: command on top (required, larger font), name on bottom (optional, smaller label, placeholder "(optional)").
6. Font size for inputs inside RunConfigRow: `text-sm` (not `text-[11px]`) with standard focus ring `outline-none ring-ring focus-visible:ring-1`.
7. Add button never disabled; if any config has empty command, focuses the first such config's command input instead of adding.

- [ ] **Step 1: Replace the full file**

```tsx
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  Cancel01Icon,
  DragDropVerticalIcon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import type { WorkspaceSettingsTab } from "@/modules/workspaces/lib/workspaceSettingsStore";
import {
  WORKSPACE_COLOR_PALETTE,
  resolveWorkspaceColor,
} from "@/modules/workspaces/lib/workspaceColor";
import type { Workspace, RunConfig } from "@/modules/workspaces/lib/types";

type Props = {
  workspaces: Workspace[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetPinnedRoot: (id: string, path: string | undefined) => void;
  onAddRunConfig: (id: string, config: RunConfig) => void;
  onUpdateRunConfig: (id: string, configId: string, patch: Partial<RunConfig>) => void;
  onRemoveRunConfig: (id: string, configId: string) => void;
  onReorderRunConfigs: (id: string, fromId: string, toId: string) => void;
};

export function WorkspaceSettingsDialog(props: Props) {
  const { open, workspaceId, initialTab, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Workspace Properties</DialogTitle>
        </DialogHeader>
        {ws && (
          <WorkspaceSettingsForm
            key={`${ws.id}-${initialTab}`}
            ws={ws}
            initialTab={initialTab}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormProps = { ws: Workspace; initialTab: WorkspaceSettingsTab } & Omit<Props, "workspaces">;

const PALETTE_ROW1 = WORKSPACE_COLOR_PALETTE.slice(0, 4);
const PALETTE_ROW2 = WORKSPACE_COLOR_PALETTE.slice(4);

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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
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
        {PALETTE_ROW1.map((hex) => (
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
      <div className="flex items-center gap-1">
        {PALETTE_ROW2.map((hex) => (
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
          style={displayColor ? { backgroundColor: displayColor + "33" } : undefined}
        >
          <input
            type="color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={displayColor ?? "#4f8ef7"}
            onChange={(e) => onSetColor(wsId, e.target.value)}
          />
          <span className="pointer-events-none text-[10px] font-bold leading-none">H</span>
        </label>
      </div>
    </div>
  );
}

function WorkspaceSettingsForm({ ws, initialTab, ...props }: FormProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceSettingsTab>(initialTab);
  const [cwdValue, setCwdValue] = useState(ws.pinnedRoot ?? "");
  const [cwdValid, setCwdValid] = useState<boolean | null>(null);

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
    <div className="flex flex-col gap-0 py-1">
      {/* Tab bar */}
      <div className="mb-4 flex gap-0 border-b border-border">
        {(["properties", "run-configurations"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "-mb-px px-3 py-1.5 text-[12px] font-medium transition-colors",
              activeTab === tab
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "properties" ? "Properties" : "Run Configurations"}
          </button>
        ))}
      </div>

      {activeTab === "properties" && (
        <div className="flex flex-col gap-5">
          {/* Name + Color: 50% / 50% */}
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium">Name</label>
              <input
                className="h-8 rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1"
                defaultValue={ws.title}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v) props.onSetTitle(ws.id, v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium">Color</label>
              <ColorPicker
                wsId={ws.id}
                wsColor={ws.color}
                displayColor={displayColor}
                onSetColor={props.onSetColor}
              />
            </div>
          </div>

          {/* Working Directory */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Working Directory</label>
            <div className="flex items-center gap-1">
              <input
                className={cn(
                  "h-8 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1",
                  cwdValid === false ? "border-destructive" : "border-border",
                )}
                value={cwdValue}
                onChange={(e) => setCwdValue(e.target.value)}
                onBlur={() => {
                  if (!cwdValue) {
                    props.onSetPinnedRoot(ws.id, undefined);
                  } else if (cwdValid !== false) {
                    props.onSetPinnedRoot(ws.id, cwdValue);
                  }
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
        <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
          <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
        </span>
        <input
          ref={commandRef}
          className="h-8 flex-1 rounded-md border border-border/60 bg-background px-3 font-mono text-sm outline-none ring-ring focus-visible:ring-1"
          placeholder="Command (e.g. pnpm dev)"
          defaultValue={config.command}
          onBlur={(e) => onUpdate({ command: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="size-[22px] flex items-center justify-center rounded text-muted-foreground hover:text-destructive"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>
      <input
        className="h-8 w-full rounded-md border border-border/60 bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1"
        placeholder="Name (optional)"
        defaultValue={config.name}
        onBlur={(e) => onUpdate({ name: e.target.value })}
      />
      <button
        type="button"
        className="self-start text-[11px] text-muted-foreground hover:text-foreground"
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
  const configs = ws.runConfigs ?? [];
  const configRefs = useRef<Map<string, RunConfigRowHandle>>(new Map());

  function handleAdd() {
    const firstMissingCommand = configs.find((c) => !c.command.trim());
    if (firstMissingCommand) {
      configRefs.current.get(firstMissingCommand.id)?.focusCommand();
      return;
    }
    onAddRunConfig(ws.id, { id: crypto.randomUUID(), name: "", command: "" });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderRunConfigs(ws.id, String(active.id), String(over.id));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium">Run Configurations</label>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          + Run Configuration
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={configs.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex max-h-[200px] flex-col gap-1.5 overflow-y-auto pr-0.5">
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
```

- [ ] **Step 2: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/app/components/WorkspaceSettingsDialog.tsx
git commit -m "feat(workspace): 2-tab dialog, command-first, optional name, larger fonts, focus-on-add"
```

---

### Task 3: RunButton + Header - always-show-dropdown + "Add Run configuration"

**Files:**
- Modify: `src/app/components/RunButton.tsx` (full replacement)
- Modify: `src/modules/header/Header.tsx` (rename prop `onOpenSettings` -> `onOpenRunConfigurations`)

**Changes to RunButton:**
1. `isComplete(c)` only checks `c.command.trim() !== ""` (name is optional).
2. Display name: `cfg.name || cfg.command` everywhere.
3. Unified render path for 1+ complete configs: split button (left = run/stop + name, right = chevron). The 1-config-only path is removed.
4. 0 complete configs: single combined button (play icon + "Run" + chevron) with DropdownMenuTrigger wrapping the whole thing.
5. Dropdown always has `{completeConfigs.length > 0 && <DropdownMenuSeparator />}` then `"+ Add Run configuration"` item at bottom.
6. Props: replace `onOpenSettings: () => void` with `onOpenRunConfigurations: () => void`.

**Changes to Header.tsx:**
- RunButton prop `onOpenSettings` -> `onOpenRunConfigurations` (rename in JSX and in Props type).

- [ ] **Step 1: Replace RunButton.tsx**

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PlayIcon,
  StopIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RunConfig } from "@/modules/workspaces/lib/types";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";
import {
  subscribeToRunConfigRunning,
  getRunConfigRunningSnapshot,
} from "@/modules/workspaces/lib/terminalEphemeralStore";

type Props = {
  runConfigs: RunConfig[];
  activeRunConfigId: string | undefined;
  onSelectConfig: (configId: string) => void;
  onRun: (config: RunConfig) => void;
  onStop: (config: RunConfig) => void;
  onOpenRunConfigurations: () => void;
};

function isComplete(c: RunConfig): boolean {
  return c.command.trim() !== "";
}

export function RunButton({
  runConfigs,
  activeRunConfigId,
  onSelectConfig,
  onRun,
  onStop,
  onOpenRunConfigurations,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const completeConfigs = runConfigs.filter(isComplete);
  const activeConfig =
    completeConfigs.find((c) => c.id === activeRunConfigId) ?? completeConfigs[0];
  const isRunning = !!(activeConfig?.panelId && runningMap.get(activeConfig.panelId));

  const dropdownContent = (
    <DropdownMenuContent align="end">
      {completeConfigs.map((cfg) => (
        <DropdownMenuItem key={cfg.id} onSelect={() => onSelectConfig(cfg.id)} className="gap-2">
          <span className="flex-1">{cfg.name || cfg.command}</span>
          {cfg.id === activeConfig?.id && (
            <HugeiconsIcon
              icon={Tick02Icon}
              size={12}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          )}
        </DropdownMenuItem>
      ))}
      {completeConfigs.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={onOpenRunConfigurations} className="text-muted-foreground">
        + Add Run configuration
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (completeConfigs.length === 0) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
            <span>Run</span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        {dropdownContent}
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center rounded-md">
      <button
        type="button"
        title={
          isRunning
            ? `Stop: ${activeConfig?.name || activeConfig?.command}`
            : `Run: ${activeConfig?.name || activeConfig?.command}`
        }
        onClick={() => {
          if (!activeConfig) return;
          isRunning ? onStop(activeConfig) : onRun(activeConfig);
        }}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-l-md px-2 text-[11px] transition-colors",
          isRunning
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <HugeiconsIcon
          icon={isRunning ? StopIcon : PlayIcon}
          size={13}
          strokeWidth={2}
        />
        <span className="max-w-[120px] truncate">
          {activeConfig?.name || activeConfig?.command || "Run"}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center rounded-r-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        {dropdownContent}
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Update Header.tsx**

In `src/modules/header/Header.tsx`, rename the prop `onOpenSettings` in the Props type and the JSX. Find the current `onOpenSettings` in the RunButton Props type (around line 38):

```ts
  onOpenRunSettings: (configId: string) => void;
```

Wait — check the actual current name in Header.tsx. Based on earlier file read, the prop passed to RunButton is `onOpenSettings`. The Header.tsx Props type has `onOpenRunSettings` as a function. Update the internal prop name passed to RunButton from `onOpenSettings={onOpenRunSettings}` to `onOpenRunConfigurations={onOpenRunSettings}`.

Find in Header.tsx (around line 137):
```tsx
      <RunButton
        runConfigs={runConfigs}
        activeRunConfigId={activeRunConfigId}
        onSelectConfig={onSelectRunConfig}
        onRun={onRunConfig}
        onStop={onStopConfig}
        onOpenSettings={onOpenRunSettings}
      />
```

Replace with:
```tsx
      <RunButton
        runConfigs={runConfigs}
        activeRunConfigId={activeRunConfigId}
        onSelectConfig={onSelectRunConfig}
        onRun={onRunConfig}
        onStop={onStopConfig}
        onOpenRunConfigurations={onOpenRunSettings}
      />
```

(The Header's own Props type keeps `onOpenRunSettings` unchanged — only the RunButton prop name changes.)

- [ ] **Step 3: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types
```
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/app/components/RunButton.tsx src/modules/header/Header.tsx
git commit -m "feat(header): RunButton always shows dropdown, optional name, Add Run configuration item"
```

---

### Task 4: App.tsx - wire initialTab + fix runWorkspaceConfig re-run

**Files:**
- Modify: `src/app/App.tsx` (two targeted edits)

**Changes:**
1. `onOpenRunSettings` callback: pass `"run-configurations"` as second arg to `openSettings`.
2. `runWorkspaceConfig`: when `config.panelId` exists and panel is found AND `getRunConfigRunningSnapshot().get(panelId)` is falsy, write the command again and call `setRunConfigRunning(panelId, true)` (instead of just focusing the panel).

**Edit 1 - onOpenRunSettings in App.tsx** (around line 2498):

Find:
```tsx
            onOpenRunSettings={() =>
              useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId)
            }
```

Replace with:
```tsx
            onOpenRunSettings={() =>
              useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId, "run-configurations")
            }
```

**Edit 2 - runWorkspaceConfig** (around line 515):

Find the existing function:
```tsx
  const runWorkspaceConfig = useCallback(
    (config: RunConfig) => {
      if (!activeWorkspace) return;

      if (config.panelId) {
        const found = findPanelGlobal(config.panelId);
        if (found) {
          setActiveWorkspaceId(found.workspace.id);
          activatePanel(found.workspace.id, config.panelId);
          return;
        }
      }

      const newPanelId = crypto.randomUUID();
      const panelCwd =
        config.cwd ?? activeWorkspace.pinnedRoot ?? activeWorkspace.cwd;
      const panel: Panel = { id: newPanelId, kind: "terminal", cwd: panelCwd };

      splitPaneAndOpenPanel(activeWorkspace.id, activeWorkspace.activePaneId, "bottom", panel);
      updateRunConfig(activeWorkspace.id, config.id, { panelId: newPanelId });

      const tryWrite = (attempts = 0) => {
        const handle = terminalHandles.current.get(newPanelId);
        if (handle) {
          handle.write(config.command + "\r");
          setRunConfigRunning(newPanelId, true);
        } else if (attempts < 20) {
          setTimeout(() => tryWrite(attempts + 1), 100);
        }
      };
      setTimeout(tryWrite, 150);
    },
    [activeWorkspace, findPanelGlobal, setActiveWorkspaceId, activatePanel, splitPaneAndOpenPanel, updateRunConfig],
  );
```

Replace with:
```tsx
  const runWorkspaceConfig = useCallback(
    (config: RunConfig) => {
      if (!activeWorkspace) return;

      if (config.panelId) {
        const found = findPanelGlobal(config.panelId);
        if (found) {
          setActiveWorkspaceId(found.workspace.id);
          activatePanel(found.workspace.id, config.panelId);
          if (!getRunConfigRunningSnapshot().get(config.panelId)) {
            const panelId = config.panelId;
            const tryWrite = (attempts = 0) => {
              const handle = terminalHandles.current.get(panelId);
              if (handle) {
                handle.write(config.command + "\r");
                setRunConfigRunning(panelId, true);
              } else if (attempts < 20) {
                setTimeout(() => tryWrite(attempts + 1), 100);
              }
            };
            setTimeout(tryWrite, 50);
          }
          return;
        }
      }

      const newPanelId = crypto.randomUUID();
      const panelCwd =
        config.cwd ?? activeWorkspace.pinnedRoot ?? activeWorkspace.cwd;
      const panel: Panel = { id: newPanelId, kind: "terminal", cwd: panelCwd };

      splitPaneAndOpenPanel(activeWorkspace.id, activeWorkspace.activePaneId, "bottom", panel);
      updateRunConfig(activeWorkspace.id, config.id, { panelId: newPanelId });

      const tryWrite = (attempts = 0) => {
        const handle = terminalHandles.current.get(newPanelId);
        if (handle) {
          handle.write(config.command + "\r");
          setRunConfigRunning(newPanelId, true);
        } else if (attempts < 20) {
          setTimeout(() => tryWrite(attempts + 1), 100);
        }
      };
      setTimeout(tryWrite, 150);
    },
    [activeWorkspace, findPanelGlobal, setActiveWorkspaceId, activatePanel, splitPaneAndOpenPanel, updateRunConfig],
  );
```

- [ ] **Step 1: Apply edit 1 (onOpenRunSettings tab arg)**

Find and replace in `src/app/App.tsx` as described above.

- [ ] **Step 2: Apply edit 2 (runWorkspaceConfig re-run fix)**

Find and replace in `src/app/App.tsx` as described above.

- [ ] **Step 3: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```
Expected: clean, 633+ tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/App.tsx
git commit -m "fix(workspace): re-run command in existing terminal, open run configs tab from header"
```

---

## Self-Review

### Spec coverage:
- [x] 2 tabs (Properties / Run Configurations) -> Task 2
- [x] Run configurations with own scroll -> Task 2 (max-h-[200px] overflow-y-auto)
- [x] "+ Run Configuration" button label -> Task 2
- [x] Name optional, uses command if empty -> Task 2 (RunConfigRow placeholder) + Task 3 (display `cfg.name || cfg.command`)
- [x] Add button focus-instead-of-disable when command missing -> Task 2 (handleAdd)
- [x] Font size follows design system (text-sm, proper ring) -> Task 2 (h-8 text-sm ring pattern)
- [x] Command first, name second -> Task 2 (RunConfigRow layout)
- [x] Always show selector even with 1 config -> Task 3 (unified split-button path)
- [x] "Add Run configuration" item in dropdown -> Task 3
- [x] "Add Run configuration" opens at Run Configurations tab -> Task 3 + Task 4 (openSettings with tab arg)
- [x] Stop button not appearing (isComplete only checks command) -> Task 3 (isComplete fix)
- [x] Clicking Play again re-runs command -> Task 4 (runWorkspaceConfig fix)

### Placeholder scan: none found.

### Type consistency:
- `WorkspaceSettingsTab` defined in Task 1, imported in Task 2 (WorkspaceSettingsDialog) -- both use same type
- `onOpenRunConfigurations` defined in RunButton Props (Task 3), passed from Header.tsx (Task 3), wired in App.tsx (Task 4) as `onOpenRunSettings` prop name
- `initialTab` on store (Task 1), read by dialog (Task 2) -- field name matches
