# Workspace UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish workspace UI: sidebar no-initials-in-expanded-mode, context menu reorder/rename, "Workspace Properties" dialog with 50/50 layout + 3-row color picker + run config scroll/guard, RunButton styled like Tool combo with checkmark and filtering, "Delete Workspace" modal without isLast distinction.

**Architecture:** All changes are pure frontend React. No new Tauri commands needed. `workspaceColor.ts` gains one palette color (9 total). `CloseDialogs.tsx` type loses `isLast`. `RunButton.tsx` is refactored to match `OpenInEditorButton` style pattern.

**Tech Stack:** React 19, TypeScript, Tailwind v4, shadcn/ui, @dnd-kit, @hugeicons/core-free-icons

## Global Constraints

- No em-dash anywhere (code, comments, text)
- No emojis
- No "Co-authored-by" in commits
- Commit messages in English
- All icon imports from `@hugeicons/core-free-icons`
- All cross-module imports use `@/...` alias
- `pnpm exec biome lint ./src` for lint (not `pnpm lint`)
- After every task: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

---

### Task 1: Remove F12 from PENDING.md + delete F12 file

**Files:**
- Modify: `docs/PENDING.md`
- Delete: `docs/pending/features/F12-boton-run-proyecto-workspace.md`

- [ ] **Step 1: Remove F12 line from PENDING.md**

Delete this line from the Features section:
```
- [F12](pending/features/F12-boton-run-proyecto-workspace.md) - URGENTE: boton Run para ejecutar el proyecto del workspace (run configs por workspace)
```

- [ ] **Step 2: Delete the F12 feature file**

```bash
rm docs/pending/features/F12-boton-run-proyecto-workspace.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/PENDING.md docs/pending/features/F12-boton-run-proyecto-workspace.md
git commit -m "docs: remove F12 run button from pending (implemented)"
```

---

### Task 2: Sidebar - no initials in expanded mode

**Files:**
- Modify: `src/app/components/WorkspaceSidebar.tsx:158-165`

**Context:** When `compact` is false (sidebar wider than 80px), the button currently shows BOTH the abbreviated initials AND the full name below. The fix: in expanded mode, show only the name (no initials).

- [ ] **Step 1: Replace the span+conditional block in `SortableWorkspaceItem`**

Find this block (around line 158):
```tsx
        <span className={compact ? "text-[11px]" : "text-[14px] font-bold"}>
          {abbrev(ws.title, ws.kind)}
        </span>
        {!compact && (
          <span className="max-w-full truncate text-center text-[10px] font-normal leading-tight">
            {ws.title || ws.kind}
          </span>
        )}
```

Replace with:
```tsx
        {compact ? (
          <span className="text-[11px]">{abbrev(ws.title, ws.kind)}</span>
        ) : (
          <span className="max-w-full truncate text-center text-[10px] font-normal leading-tight">
            {ws.title || ws.kind}
          </span>
        )}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm check-types
```
Expected: no errors in WorkspaceSidebar.tsx

- [ ] **Step 3: Commit**

```bash
git add src/app/components/WorkspaceSidebar.tsx
git commit -m "feat(sidebar): hide initials in expanded mode, show name only"
```

---

### Task 3: Context menu - reorder and rename

**Files:**
- Modify: `src/app/components/WorkspaceSidebar.tsx:16-17` (imports) and `:197-215` (ContextMenuContent)

**Context:** Current order: Rename, Settings, separator, Close. New order: Rename, Delete (destructive, trash icon), separator, Properties. The "Close Workspace" action becomes "Delete" with `Delete02Icon`. "Workspace Settings" becomes "Properties".

- [ ] **Step 1: Add `Delete02Icon` import**

Change the hugeicons import line from:
```tsx
import { Cancel01Icon, PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
```
To:
```tsx
import { Cancel01Icon, Delete02Icon, PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
```

- [ ] **Step 2: Replace ContextMenuContent body**

Find the ContextMenuContent block (around line 197):
```tsx
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onSelect={() => startRename(ws.id)}>
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename Workspace
            {renameLabel && <ContextMenuShortcut>{renameLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenSettings(ws.id)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={2} />
            Workspace Settings
            {settingsLabel && <ContextMenuShortcut>{settingsLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {onClose && (
            <ContextMenuItem onSelect={() => onClose(ws.id)} className="text-destructive focus:text-destructive">
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              Close Workspace
              {closeLabel && <ContextMenuShortcut>{closeLabel}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
```

Replace with:
```tsx
        <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <ContextMenuItem onSelect={() => startRename(ws.id)}>
            <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={2} />
            Rename
            {renameLabel && <ContextMenuShortcut>{renameLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
          {onClose && (
            <ContextMenuItem onSelect={() => onClose(ws.id)} className="text-destructive focus:text-destructive">
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
              Delete
              {closeLabel && <ContextMenuShortcut>{closeLabel}</ContextMenuShortcut>}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onOpenSettings(ws.id)}>
            <HugeiconsIcon icon={Settings01Icon} size={14} strokeWidth={2} />
            Properties
            {settingsLabel && <ContextMenuShortcut>{settingsLabel}</ContextMenuShortcut>}
          </ContextMenuItem>
        </ContextMenuContent>
```

- [ ] **Step 3: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types
```
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/app/components/WorkspaceSidebar.tsx
git commit -m "feat(sidebar): reorder context menu, rename to Properties and Delete"
```

---

### Task 4: Add 9th palette color

**Files:**
- Modify: `src/modules/workspaces/lib/workspaceColor.ts:1-10`

**Context:** The UI will split the palette as 4 (row 1) + 5 (row 2). Currently 8 colors, need 9. Add red `"#f75a5a"` at the end.

- [ ] **Step 1: Add the 9th color**

Replace:
```ts
export const WORKSPACE_COLOR_PALETTE = [
  "#4f8ef7", // blue
  "#7c6af7", // violet
  "#c45af7", // purple
  "#f75a8e", // pink
  "#f7874f", // orange
  "#f7c34f", // yellow
  "#4fc97a", // green
  "#4fc9c9", // teal
] as const;
```

With:
```ts
export const WORKSPACE_COLOR_PALETTE = [
  "#4f8ef7", // blue
  "#7c6af7", // violet
  "#c45af7", // purple
  "#f75a8e", // pink
  "#f7874f", // orange
  "#f7c34f", // yellow
  "#4fc97a", // green
  "#4fc9c9", // teal
  "#f75a5a", // red
] as const;
```

- [ ] **Step 2: Run existing tests to verify no regression**

```bash
pnpm test -- --testPathPattern="workspaceColor"
```
Expected: all pass (the test uses `WORKSPACE_COLOR_PALETTE.length % PALETTE_SIZE` logic; adding a color shifts the auto-assignment for some IDs - this is expected behavior)

- [ ] **Step 3: Commit**

```bash
git add src/modules/workspaces/lib/workspaceColor.ts
git commit -m "feat(workspace): add red to color palette (9 colors)"
```

---

### Task 5: WorkspaceSettingsDialog - full redesign

**Files:**
- Modify: `src/app/components/WorkspaceSettingsDialog.tsx` (full file)

**Changes:**
1. Dialog title: "Workspace Properties"
2. Name + Color section: flex row, each 50% (`flex-1`)
3. Color picker: 3 rows using `WORKSPACE_COLOR_PALETTE` split as `[0..3]` (4 chips) and `[4..8]` (5 chips); row 3 = hex input + native color picker button
4. Run configs list: `max-h-[180px] overflow-y-auto` when > 2 configs
5. Add button: disabled if any config has empty name OR empty command; styled as a proper `<button>` with `border border-border rounded px-2 py-0.5 text-[11px]` instead of link-style
6. Remove the "+ Working dir" text link from RunConfigRow (this was a link-style button; the user hasn't asked to change it so leave it - actually no change needed there per spec)

- [ ] **Step 1: Replace the full file**

```tsx
import { useEffect, useState } from "react";
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
  const { open, workspaceId, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Workspace Properties</DialogTitle>
        </DialogHeader>
        {ws && (
          <WorkspaceSettingsForm key={ws.id} ws={ws} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormProps = { ws: Workspace } & Omit<Props, "workspaces">;

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
      {/* Row 1: no-color chip + first 4 palette colors */}
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
              wsColor === hex
                ? "border-foreground"
                : "border-transparent hover:border-foreground/40",
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      {/* Row 2: remaining 5 palette colors */}
      <div className="flex items-center gap-1">
        {PALETTE_ROW2.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            onClick={() => onSetColor(wsId, hex)}
            className={cn(
              "size-6 rounded-full border-2 transition-opacity",
              wsColor === hex
                ? "border-foreground"
                : "border-transparent hover:border-foreground/40",
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      {/* Row 3: color preview + hex input + native color picker */}
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

function WorkspaceSettingsForm({ ws, ...props }: FormProps) {
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
    <div className="flex flex-col gap-5 py-1">
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

      {/* Run Configurations */}
      <RunConfigSection
        ws={ws}
        onAddRunConfig={props.onAddRunConfig}
        onUpdateRunConfig={props.onUpdateRunConfig}
        onRemoveRunConfig={props.onRemoveRunConfig}
        onReorderRunConfigs={props.onReorderRunConfigs}
      />
    </div>
  );
}

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
  const hasIncomplete = configs.some((c) => !c.name.trim() || !c.command.trim());

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
          disabled={hasIncomplete}
          onClick={() =>
            onAddRunConfig(ws.id, {
              id: crypto.randomUUID(),
              name: "",
              command: "",
            })
          }
          className={cn(
            "rounded border px-2 py-0.5 text-[11px] transition-colors",
            hasIncomplete
              ? "cursor-not-allowed border-border/40 text-muted-foreground/40"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          )}
        >
          + Add
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={configs.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={configs.length > 2 ? "flex max-h-[180px] flex-col gap-1 overflow-y-auto pr-1" : "flex flex-col gap-1"}>
            {configs.map((cfg) => (
              <RunConfigRow
                key={cfg.id}
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

function RunConfigRow({
  config,
  onUpdate,
  onRemove,
}: {
  config: RunConfig;
  onUpdate: (patch: Partial<Omit<RunConfig, "id">>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: config.id,
  });
  const [showCwd, setShowCwd] = useState(!!config.cwd);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-1 rounded-md border border-border/60 p-2"
    >
      <div className="flex items-center gap-1">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} size={12} strokeWidth={2} />
        </span>
        <input
          className="h-6 flex-1 rounded border border-border/60 bg-background px-2 text-[11px]"
          placeholder="Name (e.g. Dev server)"
          defaultValue={config.name}
          onBlur={(e) => onUpdate({ name: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="size-[20px] flex items-center justify-center rounded text-muted-foreground hover:text-destructive"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>
      <input
        className="h-6 w-full rounded border border-border/60 bg-background px-2 font-mono text-[11px]"
        placeholder="Command (e.g. pnpm dev)"
        defaultValue={config.command}
        onBlur={(e) => onUpdate({ command: e.target.value })}
      />
      <button
        type="button"
        className="self-start text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowCwd((v) => !v)}
      >
        {showCwd ? "Hide working dir" : "+ Working dir"}
      </button>
      {showCwd && (
        <input
          className="h-6 w-full rounded border border-border/60 bg-background px-2 font-mono text-[11px]"
          placeholder="Working dir (optional, defaults to workspace root)"
          defaultValue={config.cwd ?? ""}
          onBlur={(e) => onUpdate({ cwd: e.target.value || undefined })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```
Expected: all clean

- [ ] **Step 3: Commit**

```bash
git add src/app/components/WorkspaceSettingsDialog.tsx src/modules/workspaces/lib/workspaceColor.ts
git commit -m "feat(workspace): Workspace Properties dialog - 50/50 layout, 3-row color picker, run config scroll and add guard"
```

---

### Task 6: RunButton - filter incomplete configs + style like OpenInEditorButton

**Files:**
- Modify: `src/app/components/RunButton.tsx` (full file)

**Changes:**
1. Filter out configs where `name.trim() === ""` OR `command.trim() === ""` before rendering
2. 0 complete configs: keep current "Run" ghost button that opens settings
3. 1 complete config: single unified button (icon + name) with `hover:bg-accent hover:text-foreground` style; isRunning = destructive
4. Multi complete configs: left button (icon + name, runs/stops active) + right button (chevron, opens dropdown); dropdown items show `Tick02Icon` for active config
5. Import `Tick02Icon` and `ChevronDown01Icon` (or `ArrowDown01Icon` which is already imported)

**Reference style from `OpenInEditorButton.tsx`:**
- Outer wrapper: `flex items-center rounded-md`
- Left: `flex h-7 items-center gap-1.5 rounded-l-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground`
- Right (chevron trigger): `flex h-7 items-center rounded-r-md px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground`
- Active item in dropdown: `Tick02Icon` (size 12, strokeWidth 2)

- [ ] **Step 1: Replace the full RunButton.tsx**

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
  onOpenSettings: () => void;
};

function isComplete(c: RunConfig): boolean {
  return c.name.trim() !== "" && c.command.trim() !== "";
}

export function RunButton({
  runConfigs,
  activeRunConfigId,
  onSelectConfig,
  onRun,
  onStop,
  onOpenSettings,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const completeConfigs = runConfigs.filter(isComplete);
  const activeConfig =
    completeConfigs.find((c) => c.id === activeRunConfigId) ?? completeConfigs[0];
  const isRunning = !!(activeConfig?.panelId && runningMap.get(activeConfig.panelId));

  if (completeConfigs.length === 0) {
    return (
      <button
        type="button"
        title="Configure Run in Workspace Properties"
        onClick={onOpenSettings}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
        <span>Run</span>
      </button>
    );
  }

  if (completeConfigs.length === 1 && activeConfig) {
    return (
      <button
        type="button"
        title={isRunning ? "Stop" : `Run: ${activeConfig.command}`}
        onClick={() => (isRunning ? onStop(activeConfig) : onRun(activeConfig))}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors",
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
          {activeConfig.name}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center rounded-md">
      <button
        type="button"
        title={isRunning ? `Stop: ${activeConfig?.name}` : `Run: ${activeConfig?.name}`}
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
          {activeConfig?.name ?? "Run"}
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
        <DropdownMenuContent align="end">
          {completeConfigs.map((cfg) => (
            <DropdownMenuItem key={cfg.id} onSelect={() => onSelectConfig(cfg.id)} className="gap-2">
              <span className="flex-1">{cfg.name}</span>
              {cfg.id === (activeConfig?.id) && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={12}
                  strokeWidth={2}
                  className="text-muted-foreground"
                />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types
```
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/app/components/RunButton.tsx
git commit -m "feat(header): RunButton styled like Tool combo, filter incomplete configs, checkmark for active"
```

---

### Task 7: "Delete Workspace" modal - remove isLast distinction

**Files:**
- Modify: `src/app/components/CloseDialogs.tsx:29` (type) and `:153-179` (AlertDialog body)
- Modify: `src/app/App.tsx:572-573` (state type) and `:593-596` (setPendingCloseWorkspace call)

**Changes in CloseDialogs.tsx:**
- Type `pendingCloseWorkspace`: remove `isLast` field: `{ id: string } | null`
- AlertDialog title: "Delete Workspace"
- AlertDialog description: always "The workspace and all its tabs will be closed."
- Action button text: "Delete"

**Changes in App.tsx:**
- State type `{ id: string; isLast: boolean } | null` -> `{ id: string } | null`
- Remove `isLast: workspacesRef.current.length === 1` from the `setPendingCloseWorkspace` call

- [ ] **Step 1: Update CloseDialogs.tsx type**

Change line 29:
```tsx
  pendingCloseWorkspace: { id: string; isLast: boolean } | null;
```
To:
```tsx
  pendingCloseWorkspace: { id: string } | null;
```

- [ ] **Step 2: Update the close workspace AlertDialog in CloseDialogs.tsx**

Find (around line 148):
```tsx
      <AlertDialog
        open={pendingCloseWorkspace !== null}
        onOpenChange={(open) => !open && onCancelCloseWorkspace()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCloseWorkspace?.isLast
                ? "This is the last workspace. Closing it will close all windows."
                : "The workspace and all of its tabs will be closed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
            />
            Don't ask me again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelCloseWorkspace}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirmCloseWorkspace(dontAskAgain)}
              autoFocus
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

Replace with:
```tsx
      <AlertDialog
        open={pendingCloseWorkspace !== null}
        onOpenChange={(open) => !open && onCancelCloseWorkspace()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              The workspace and all its tabs will be closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
            />
            Don't ask me again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelCloseWorkspace}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirmCloseWorkspace(dontAskAgain)}
              autoFocus
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 3: Update App.tsx - state type**

Find (around line 571):
```tsx
  const [pendingCloseWorkspace, setPendingCloseWorkspace] = useState<
    { id: string; isLast: boolean } | null
  >(null);
```
Replace with:
```tsx
  const [pendingCloseWorkspace, setPendingCloseWorkspace] = useState<
    { id: string } | null
  >(null);
```

- [ ] **Step 4: Update App.tsx - setPendingCloseWorkspace call**

Find (around line 592):
```tsx
    if (prefs.warnOnCloseWorkspace) {
      setPendingCloseWorkspace({
        id: wsId,
        isLast: workspacesRef.current.length === 1,
      });
      return;
    }
```
Replace with:
```tsx
    if (prefs.warnOnCloseWorkspace) {
      setPendingCloseWorkspace({ id: wsId });
      return;
    }
```

- [ ] **Step 5: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```
Expected: all clean

- [ ] **Step 6: Commit**

```bash
git add src/app/components/CloseDialogs.tsx src/app/App.tsx
git commit -m "feat(workspace): rename close modal to Delete Workspace, remove isLast distinction"
```

---

## Self-Review

### Spec coverage check:

- [x] "elimina de pending la issue" (F12) -> Task 1
- [x] Sidebar: no initials in expanded mode -> Task 2
- [x] Context menu: "Properties" instead of "Workspace Settings" -> Task 3
- [x] Context menu order: Rename, Delete (trash), separator, Properties -> Task 3
- [x] Dialog title "Workspace Properties" -> Task 5
- [x] Name 50% + Color selector 50% -> Task 5
- [x] Color: 3 rows (X+4, 5, hex+HUE button) -> Task 5 + Task 4 (9th color)
- [x] Run configs: own scroll if > 2 -> Task 5
- [x] No adding config if any is incomplete -> Task 5
- [x] "+ Add" as proper button -> Task 5
- [x] RunButton: never show incomplete configs -> Task 6
- [x] RunButton style like Tool combo -> Task 6
- [x] RunButton: checkmark for active config (not triangle) -> Task 6
- [x] Modal: "Delete Workspace" no isLast distinction -> Task 7

### Placeholder scan: none found.

### Type consistency:
- `RunConfig` type unchanged (from `@/modules/workspaces/lib/types`)
- `pendingCloseWorkspace` type changed consistently in both CloseDialogs.tsx and App.tsx
- `WORKSPACE_COLOR_PALETTE` is `readonly string[]` in both files
- `isComplete` helper is local to RunButton.tsx
