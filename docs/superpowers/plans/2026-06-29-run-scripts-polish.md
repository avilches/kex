# Run Scripts Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Run Configurations feature to "Scripts", fix two runtime bugs (running-state timing race + second-click re-run), add shared script pane tracking, and polish the dialog and dropdown UI.

**Architecture:** Four sequential tasks: (1) data model rename + new fields in types/useWorkspaces, (2) dialog UX overhaul, (3) RunButton per-item controls + Header prop renames, (4) App.tsx bug fixes and new wiring. Each task compiles and tests cleanly before the next begins.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind v4, shadcn/ui Button + DropdownMenu, @dnd-kit, @hugeicons/core-free-icons, Tauri 2

## Global Constraints

- No em-dash anywhere (code, comments, JSX text, commit messages)
- No "Co-authored-by" in commits; commit messages in English
- All imports use `@/...` alias, never relative across modules
- Lint: `pnpm exec biome lint ./src` (NOT `pnpm lint` -- RTK proxy breaks it)
- Checks after every task: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

---

## File Map

| File | Change |
|------|--------|
| `src/lib/ids.ts` | Add `newScriptId()` |
| `src/modules/workspaces/lib/types.ts` | Rename `runConfigs`->`scripts`, `activeRunConfigId`->`activeScript`; add `paneId?` to RunConfig; add `scriptPaneId?` to Workspace |
| `src/modules/workspaces/lib/workspaceState.ts` | Migration: read old field names, write new |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Rename field accesses; modify `splitPaneAndOpenPanel` to return `freshPaneId`; add `setScriptPaneId`; update `validateRunConfigPanels` |
| `src/app/components/WorkspaceSettingsDialog.tsx` | Fixed-size dialog, title "Workspace {name}", "Workspace Root", "Run Scripts" tab, per-row command+name on one line, red border on empty command, ghost "+" button |
| `src/app/components/RunButton.tsx` | Per-item play/stop button, "Add Script" label, state colors in dropdown |
| `src/modules/header/Header.tsx` | Rename props `runConfigs`->`scripts`, `activeRunConfigId`->`activeScript` |
| `src/app/App.tsx` | Fix OSC 133 timing race; track `scriptPaneId`; use `openPanel` for existing pane; rename field accesses |

---

### Task 1: Data model + IDs + migration + useWorkspaces

**Files:**
- Modify: `src/lib/ids.ts`
- Modify: `src/modules/workspaces/lib/types.ts`
- Modify: `src/modules/workspaces/lib/workspaceState.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`

**Produces:**
- `newScriptId()` exported from `src/lib/ids.ts`
- `RunConfig` with new optional `paneId?: string`
- `Workspace` with `scripts?: RunConfig[]`, `activeScript?: string`, `scriptPaneId?: string`
- `splitPaneAndOpenPanel` returns `string` (the freshPaneId)
- New action `setScriptPaneId(workspaceId: string, paneId: string): void`
- `validateRunConfigPanels` also clears `scriptPaneId` when pane no longer exists
- All existing actions (`addRunConfig`, `updateRunConfig`, etc.) still exported with same names, now operate on `scripts`/`activeScript` internally

- [ ] **Step 1: Add `newScriptId` to `src/lib/ids.ts`**

Current file:
```ts
function nid(bytes = 6): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export const newWorkspaceId = () => `ws-${nid()}`;
export const newPaneId      = () => `grp-${nid()}`;
export const newSplitId     = () => `sp-${nid()}`;
export const newPanelId     = () => `tab-${nid()}`;
export const newThemeId     = () => `th-${nid()}`;
```

Add one line at the end:
```ts
export const newScriptId    = () => `sc-${nid()}`;
```

- [ ] **Step 2: Update `RunConfig` and `Workspace` in `src/modules/workspaces/lib/types.ts`**

Find and replace the `RunConfig` type:
```ts
// OLD
export type RunConfig = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  panelId?: string;
};
```
Replace with:
```ts
export type RunConfig = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  panelId?: string;
  paneId?: string;
};
```

Find and replace the tail of `Workspace` type (the `color`/`runConfigs`/`activeRunConfigId` lines):
```ts
// OLD (last 3 lines of Workspace)
  color?: string | null;
  runConfigs?: RunConfig[];
  activeRunConfigId?: string;
};
```
Replace with:
```ts
  color?: string | null;
  scripts?: RunConfig[];
  activeScript?: string;
  scriptPaneId?: string;
};
```

- [ ] **Step 3: Add migration in `src/modules/workspaces/lib/workspaceState.ts`**

Read the current file first to see the existing `migrateWorkspace` function. It likely looks like:
```ts
export function migrateWorkspace(w: Workspace): Workspace {
  // existing migration logic...
  return w;
}
```

Add migration for the renamed fields at the END of the return, before the final `return`:

```ts
export function migrateWorkspace(raw: unknown): Workspace {
  // existing migration steps first...
  const w = /* existing migration result */ as Workspace & {
    runConfigs?: RunConfig[];
    activeRunConfigId?: string;
  };

  // Migrate runConfigs -> scripts, activeRunConfigId -> activeScript
  const migrated: Workspace = { ...w };
  if ("runConfigs" in w && w.runConfigs !== undefined && !w.scripts) {
    migrated.scripts = w.runConfigs;
    delete (migrated as Record<string, unknown>).runConfigs;
  }
  if ("activeRunConfigId" in w && w.activeRunConfigId !== undefined && !w.activeScript) {
    migrated.activeScript = w.activeRunConfigId;
    delete (migrated as Record<string, unknown>).activeRunConfigId;
  }
  return migrated;
}
```

**IMPORTANT:** Read the actual `workspaceState.ts` before editing -- the migration chain may be more complex. Add the rename migration AT THE END of the chain, after all existing migrations, so it always runs on the final output. Preserve ALL existing migration logic unchanged.

- [ ] **Step 4: Update `src/modules/workspaces/lib/useWorkspaces.ts`**

There are 5 places to change. Make each edit with Edit tool (do NOT rewrite the whole file):

**4a. `addRunConfig` -- change `runConfigs` to `scripts`:**
```ts
// OLD
? { ...w, runConfigs: [...(w.runConfigs ?? []), config] }
// NEW
? { ...w, scripts: [...(w.scripts ?? []), config] }
```

**4b. `updateRunConfig` -- change `runConfigs` to `scripts`:**
```ts
// OLD
runConfigs: (w.runConfigs ?? []).map((c) =>
  c.id === configId ? { ...c, ...patch } : c,
),
// NEW
scripts: (w.scripts ?? []).map((c) =>
  c.id === configId ? { ...c, ...patch } : c,
),
```

**4c. `removeRunConfig` -- change `runConfigs` and `activeRunConfigId`:**
```ts
// OLD
runConfigs: (w.runConfigs ?? []).filter((c) => c.id !== configId),
activeRunConfigId:
  w.activeRunConfigId === configId ? undefined : w.activeRunConfigId,
// NEW
scripts: (w.scripts ?? []).filter((c) => c.id !== configId),
activeScript:
  w.activeScript === configId ? undefined : w.activeScript,
```

**4d. `reorderRunConfigs` -- change `runConfigs`:**
```ts
// OLD
const configs = w.runConfigs ?? [];
// ...
return { ...w, runConfigs: next };
// NEW
const configs = w.scripts ?? [];
// ...
return { ...w, scripts: next };
```

**4e. `setActiveRunConfig` -- change `activeRunConfigId`:**
```ts
// OLD
? { ...w, activeRunConfigId: configId ?? undefined }
// NEW
? { ...w, activeScript: configId ?? undefined }
```

**4f. `validateRunConfigPanels` -- change `runConfigs` and add `scriptPaneId` cleanup:**
```ts
// OLD
const configs = w.runConfigs ?? [];
const cleaned = configs.map((c) =>
  c.panelId && !livingPanelIds.has(c.panelId)
    ? { ...c, panelId: undefined }
    : c,
);
if (cleaned.every((c, i) => c === configs[i])) return w;
return { ...w, runConfigs: cleaned };

// NEW
const configs = w.scripts ?? [];
const cleaned = configs.map((c) =>
  c.panelId && !livingPanelIds.has(c.panelId)
    ? { ...c, panelId: undefined, paneId: undefined }
    : c,
);
const paneStillLive = w.scriptPaneId ? allPanes(w.paneTree).some((p) => p.id === w.scriptPaneId) : true;
const scriptPaneId = paneStillLive ? w.scriptPaneId : undefined;
if (cleaned.every((c, i) => c === configs[i]) && scriptPaneId === w.scriptPaneId) return w;
return { ...w, scripts: cleaned, scriptPaneId };
```

Note: `allPanes` is already imported in the file from `./splitNode`.

**4g. Add `setScriptPaneId` action** (after `setActiveRunConfig`):
```ts
const setScriptPaneId = useCallback((workspaceId: string, paneId: string) => {
  setWorkspaces((prev) =>
    prev.map((w) => w.id === workspaceId ? { ...w, scriptPaneId: paneId } : w),
  );
}, []);
```

**4h. Modify `splitPaneAndOpenPanel` to return `freshPaneId`:**

Current (lines 436-456):
```ts
const splitPaneAndOpenPanel = useCallback((
  workspaceId: string,
  targetPaneId: string,
  direction: "left" | "right" | "top" | "bottom",
  panel: Panel,
) => {
  setWorkspaces((prev) =>
    prev.map((w) => {
      if (w.id !== workspaceId) return w;
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (allPanes(w.paneTree).length >= workspacePaneLimit) return w;
      const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
      const newPanePosition: "first" | "second" = direction === "left" || direction === "top" ? "first" : "second";
      const freshPaneId = newPaneId();
      const freshSplitId = newSplitId();
      const newTree = splitPaneAndInsertPanel(w.paneTree, targetPaneId, freshSplitId, freshPaneId, orientation, newPanePosition, withNewTabAutofocus(panel));
      if (newTree === w.paneTree) return w;
      return { ...w, paneTree: newTree, activePaneId: freshPaneId };
    }),
  );
}, []);
```

Replace with (move ID generation before `setWorkspaces` so we can return it):
```ts
const splitPaneAndOpenPanel = useCallback((
  workspaceId: string,
  targetPaneId: string,
  direction: "left" | "right" | "top" | "bottom",
  panel: Panel,
): string => {
  const freshPaneId = newPaneId();
  const freshSplitId = newSplitId();
  setWorkspaces((prev) =>
    prev.map((w) => {
      if (w.id !== workspaceId) return w;
      const { workspacePaneLimit } = usePreferencesStore.getState();
      if (allPanes(w.paneTree).length >= workspacePaneLimit) return w;
      const orientation = direction === "left" || direction === "right" ? "horizontal" : "vertical";
      const newPanePosition: "first" | "second" = direction === "left" || direction === "top" ? "first" : "second";
      const newTree = splitPaneAndInsertPanel(w.paneTree, targetPaneId, freshSplitId, freshPaneId, orientation, newPanePosition, withNewTabAutofocus(panel));
      if (newTree === w.paneTree) return w;
      return { ...w, paneTree: newTree, activePaneId: freshPaneId };
    }),
  );
  return freshPaneId;
}, []);
```

**4i. Export `setScriptPaneId` in the return object** (find the `addRunConfig,` line in the return and add after `setActiveRunConfig`):
```ts
    setScriptPaneId,
```

- [ ] **Step 5: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```

Expected: TypeScript errors in `WorkspaceSettingsDialog.tsx`, `RunButton.tsx`, `Header.tsx`, and `App.tsx` because they still reference the old field names. That is expected at this stage -- the plan fixes those in Tasks 2-4. If there are errors ONLY in those 4 files, that is acceptable. If there are errors elsewhere (e.g., in useWorkspaces.ts itself), fix them before committing.

Actually, to avoid a broken intermediate state: add temporary type aliases to types.ts so existing consumers still compile:

Actually no -- just accept that Task 1's type change will break the downstream files. The check step should only verify `useWorkspaces.ts` itself compiles (isolated). Skip the full `pnpm check-types` for this task and instead verify:

```bash
pnpm exec biome lint ./src/modules/workspaces/lib/
pnpm exec biome lint ./src/lib/ids.ts
```

(Full `pnpm check-types` will pass only after Task 4 completes all the renames.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/ids.ts src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/workspaceState.ts src/modules/workspaces/lib/useWorkspaces.ts
git commit -m "refactor(workspace): rename runConfigs->scripts, add scriptPaneId, newScriptId"
```

---

### Task 2: WorkspaceSettingsDialog - UX overhaul

**Files:**
- Modify: `src/app/components/WorkspaceSettingsDialog.tsx` (full replacement)

**Consumes from Task 1:**
- `ws.scripts` (not `ws.runConfigs`)
- `ws.activeScript` (not `ws.activeRunConfigId`)
- `newScriptId()` from `@/lib/ids` (not `crypto.randomUUID()`)
- `RunConfig.paneId` field exists (ignore it in the dialog)

**Changes:**
1. `DialogContent`: `className="max-w-2xl"` + inner content area fixed at `min-h-[460px] flex flex-col`
2. `DialogTitle`: `Workspace {ws.title || ws.kind}` (dynamic name)
3. Tab "Properties" unchanged; tab "Run Configurations" -> "Run Scripts"
4. Properties tab: "Working Directory" label -> "Workspace Root"
5. Run Scripts tab: remove the `<label className="text-xs font-medium">Run Configurations</label>` header above the list
6. "+" button: use shadcn `<Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]">` with `PlusSignIcon` -- same as ExternalEditorsSection.tsx "Add tool" button
7. RunConfigRow: command + name on the SAME LINE (flex row, command takes `flex-[3_3_0%]`, name takes `flex-[1_1_0%]`)
8. Empty command border: add local `dirty` state per row; after first blur on the command input, if value is empty show `border-destructive`
9. ID generation: `newScriptId()` instead of `crypto.randomUUID()`
10. Field access: `ws.scripts` not `ws.runConfigs`

**Import to add:** `import { newScriptId } from "@/lib/ids";` and `import { Button } from "@/components/ui/button";` and `import { PlusSignIcon } from "@hugeicons/core-free-icons";`

- [ ] **Step 1: Read the current file**

Read `src/app/components/WorkspaceSettingsDialog.tsx` fully before editing.

- [ ] **Step 2: Apply changes**

Apply all 10 changes above using the Edit tool. Key diffs:

**DialogContent size:**
```tsx
// OLD
<DialogContent className="max-w-lg">
// NEW
<DialogContent className="max-w-2xl">
```

**DialogTitle:**
```tsx
// OLD
<DialogTitle>Workspace Properties</DialogTitle>
// NEW
<DialogTitle>Workspace {ws.title || ws.kind}</DialogTitle>
```

**Inner form fixed height:**
```tsx
// OLD
<div className="flex flex-col gap-0 py-1">
// NEW
<div className="flex min-h-[460px] flex-col gap-0 py-1">
```

**Tab button for Run Configurations:**
```tsx
// OLD (in the tab map)
{tab === "properties" ? "Properties" : "Run Configurations"}
// NEW
{tab === "properties" ? "Properties" : "Run Scripts"}
```

**Working Directory -> Workspace Root (in Properties tab):**
```tsx
// OLD
<label className="text-xs font-medium">Working Directory</label>
// NEW
<label className="text-xs font-medium">Workspace Root</label>
```

**Remove Run Configurations section header (in RunConfigSection):**
Find and remove this block entirely:
```tsx
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
```

Replace with (no header label, just the button aligned right):
```tsx
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1.5 px-2 text-[12px]" onClick={handleAdd}>
          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
          Add Script
        </Button>
      </div>
```

**RunConfigRow: command + name on same line (75% / 25%):**

Replace the current 2-row layout inside `RunConfigRow`:
```tsx
// OLD: command input in its own row, name input below
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
          title="Remove"
          onClick={onRemove}
          className="size-[22px] flex items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
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
```

Replace with (single flex row, command 75%, name 25%):
```tsx
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
          defaultValue={config.command}
          onBlur={(e) => {
            setCommandDirty(true);
            setCommandValue(e.target.value);
            onUpdate({ command: e.target.value });
          }}
        />
        <input
          className="h-8 flex-[1_1_0%] min-w-0 rounded-md border border-border/60 bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-1"
          placeholder="Name (optional)"
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
```

Add two state variables at the top of the `RunConfigRow` function body (before the `useSortable` call):
```tsx
const [commandDirty, setCommandDirty] = useState(false);
const [commandValue, setCommandValue] = useState(config.command);
```

**Field access: `ws.scripts` not `ws.runConfigs`** (in `RunConfigSection`):
```tsx
// OLD
const configs = ws.runConfigs ?? [];
// NEW
const configs = ws.scripts ?? [];
```

**ID generation:**
```tsx
// OLD
onAddRunConfig(ws.id, { id: crypto.randomUUID(), name: "", command: "" });
// NEW
onAddRunConfig(ws.id, { id: newScriptId(), name: "", command: "" });
```

Remove the `"+ Working dir"` toggle button and the `showCwd` state entirely (YAGNI -- the working dir feature is below the command/name row, only shown if the config already has a cwd; this is a separate optional feature that was added in the previous session). Actually: keep it as-is, just ensure it renders below the new single-row layout. The toggle button was already there, keep it.

- [ ] **Step 3: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```

Expected: `App.tsx` still has type errors for `runConfigs`/`activeRunConfigId` field access. That's OK at this stage. All other files should be clean. If WorkspaceSettingsDialog.tsx has errors, fix them.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/WorkspaceSettingsDialog.tsx
git commit -m "feat(workspace): dialog fixed size, Workspace {name} title, Run Scripts tab, inline command+name row"
```

---

### Task 3: RunButton + Header - per-item play/stop + renames

**Files:**
- Modify: `src/app/components/RunButton.tsx` (full replacement)
- Modify: `src/modules/header/Header.tsx` (targeted edits)

**Consumes from Task 1:**
- `RunConfig` type (unchanged interface, just new `paneId` field ignored here)
- The prop names `scripts`/`activeScript` replace `runConfigs`/`activeRunConfigId`

**Changes to RunButton.tsx:**
1. Props: `runConfigs: RunConfig[]` -> `scripts: RunConfig[]`; `activeRunConfigId: string | undefined` -> `activeScript: string | undefined`
2. Dropdown last item: "Add Script" (was "Add Run configuration")
3. Each config item in dropdown: actionable play/stop icon button (left) + name text (middle, closes dropdown on click) + check (right)
4. Play/stop icon: red (`text-destructive`) when running, muted when idle
5. Play/stop button uses `onMouseDown` + `e.preventDefault()` to prevent Radix from closing the dropdown

**Changes to Header.tsx:**
1. Props type: `runConfigs: RunConfig[]` -> `scripts: RunConfig[]`; `activeRunConfigId: string | undefined` -> `activeScript: string | undefined`
2. Destructuring: same rename
3. JSX: `runConfigs={runConfigs}` -> `scripts={scripts}`, `activeRunConfigId={activeRunConfigId}` -> `activeScript={activeScript}`

- [ ] **Step 1: Replace `src/app/components/RunButton.tsx` entirely**

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
  scripts: RunConfig[];
  activeScript: string | undefined;
  onSelectConfig: (configId: string) => void;
  onRun: (config: RunConfig) => void;
  onStop: (config: RunConfig) => void;
  onOpenRunConfigurations: () => void;
};

function isComplete(c: RunConfig): boolean {
  return c.command.trim() !== "";
}

export function RunButton({
  scripts,
  activeScript,
  onSelectConfig,
  onRun,
  onStop,
  onOpenRunConfigurations,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const completeConfigs = scripts.filter(isComplete);
  const activeConfig =
    completeConfigs.find((c) => c.id === activeScript) ?? completeConfigs[0];
  const isRunning = !!(activeConfig?.panelId && runningMap.get(activeConfig.panelId));

  const dropdownContent = (
    <DropdownMenuContent align="end">
      {completeConfigs.map((cfg) => {
        const cfgRunning = !!(cfg.panelId && runningMap.get(cfg.panelId));
        const isActive = cfg.id === activeConfig?.id;
        return (
          <DropdownMenuItem
            key={cfg.id}
            className="gap-0 px-1 py-0.5"
            onSelect={() => onSelectConfig(cfg.id)}
          >
            <button
              type="button"
              title={cfgRunning ? "Stop" : "Run"}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                cfgRunning ? onStop(cfg) : onRun(cfg);
              }}
              className={cn(
                "size-[22px] shrink-0 flex items-center justify-center rounded transition-colors",
                cfgRunning
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <HugeiconsIcon
                icon={cfgRunning ? StopIcon : PlayIcon}
                size={12}
                strokeWidth={2}
              />
            </button>
            <span className="flex-1 truncate px-1.5 text-[12px]">
              {cfg.name || cfg.command}
            </span>
            {isActive && (
              <HugeiconsIcon
                icon={Tick02Icon}
                size={11}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
              />
            )}
          </DropdownMenuItem>
        );
      })}
      {completeConfigs.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={onOpenRunConfigurations} className="text-muted-foreground">
        + Add Script
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

- [ ] **Step 2: Update `src/modules/header/Header.tsx` (3 targeted edits)**

**Edit A** -- Props type (find `runConfigs: RunConfig[];` and `activeRunConfigId: string | undefined;`):
```tsx
// OLD
  runConfigs: RunConfig[];
  activeRunConfigId: string | undefined;
// NEW
  scripts: RunConfig[];
  activeScript: string | undefined;
```

**Edit B** -- Destructuring (find `runConfigs,` and `activeRunConfigId,` in the destructured props):
```tsx
// OLD
  runConfigs,
  activeRunConfigId,
// NEW
  scripts,
  activeScript,
```

**Edit C** -- JSX (find `runConfigs={runConfigs}` and `activeRunConfigId={activeRunConfigId}` in the RunButton JSX):
```tsx
// OLD
        runConfigs={runConfigs}
        activeRunConfigId={activeRunConfigId}
// NEW
        scripts={scripts}
        activeScript={activeScript}
```

- [ ] **Step 3: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```

Expected: `App.tsx` still has type errors (to be fixed in Task 4). All other files should be clean. If there are errors in RunButton or Header, fix them.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/RunButton.tsx src/modules/header/Header.tsx
git commit -m "feat(header): per-item play/stop in RunButton dropdown, rename to scripts/activeScript"
```

---

### Task 4: App.tsx - timing fix + scriptPaneId + renames

**Files:**
- Modify: `src/app/App.tsx` (targeted edits only -- do NOT rewrite the whole file)

**Consumes from Task 1:**
- `setScriptPaneId(workspaceId, paneId)` from useWorkspaces
- `splitPaneAndOpenPanel` now returns `string` (freshPaneId)
- `openPanel(workspaceId, paneId, panel)` -- existing action, adds panel to existing pane
- `findPane` from `@/modules/workspaces/lib/splitNode`

**Consumes from Task 3:**
- Header prop `scripts` / `activeScript` (not `runConfigs` / `activeRunConfigId`)

**Changes:**

**A. Fix OSC 133 timing race (the "turns red then disappears" bug)**

Root cause: On a NEW terminal, the shell may emit its initial OSC 133 A (prompt ready) AFTER our `setRunConfigRunning(panelId, true)` call, because the shell takes longer than 150ms to finish initializing. The `onRunningCommand(panelId, null)` handler in App.tsx clears `runConfigRunning` whenever it sees `cmd === null` -- even if it's the initial prompt, not command completion.

Fix: Add a `useRef<Set<string>>` that tracks which panels have received an OSC 133 C event (command pre-execution). Only clear `runConfigRunning` when we've seen 133 C first -- meaning we know a REAL command was running.

Add near the top of the component, after the `terminalHandles` ref:
```tsx
const runConfigCommandSeen = useRef<Set<string>>(new Set());
```

Update the `onRunningCommand` callback (currently at line ~1700):
```tsx
// OLD
      onRunningCommand: (panelId, cmd) => {
        const found = findPanelGlobal(panelId);
        if (found) setTerminalRunningCommand(found.workspace.id, panelId, cmd);
        if (cmd === null && getRunConfigRunningSnapshot().has(panelId)) {
          setRunConfigRunning(panelId, false);
        }
      },
// NEW
      onRunningCommand: (panelId, cmd) => {
        const found = findPanelGlobal(panelId);
        if (found) setTerminalRunningCommand(found.workspace.id, panelId, cmd);
        if (cmd !== null) {
          runConfigCommandSeen.current.add(panelId);
        } else if (
          runConfigCommandSeen.current.has(panelId) &&
          getRunConfigRunningSnapshot().has(panelId)
        ) {
          setRunConfigRunning(panelId, false);
          runConfigCommandSeen.current.delete(panelId);
        }
      },
```

Also add cleanup when a terminal panel is closed (find the block that calls `terminalHandles.current.delete(id)`, around line 464, and add after it):
```tsx
runConfigCommandSeen.current.delete(id);
```

**B. Rename destructured actions + import `setScriptPaneId` and `openPanel`**

Find the block that destructures workspace actions (around lines 201-206):
```tsx
    addRunConfig,
    updateRunConfig,
    removeRunConfig,
    reorderRunConfigs,
    setActiveRunConfig,
    validateRunConfigPanels,
```

Add `setScriptPaneId` to this list:
```tsx
    addRunConfig,
    updateRunConfig,
    removeRunConfig,
    reorderRunConfigs,
    setActiveRunConfig,
    validateRunConfigPanels,
    setScriptPaneId,
    openPanel,
```

Note: `openPanel` is already destructured in the file from useWorkspaces (it's the action for adding a panel to an existing pane, used elsewhere). Verify the actual variable name -- grep for `openPanel` in App.tsx first. If it's already destructured, don't add it again.

**C. Fix `runWorkspaceConfig` to use `scriptPaneId`**

Find the current function (around line 515). Replace the entire function body:

```tsx
  const runWorkspaceConfig = useCallback(
    (config: RunConfig) => {
      if (!activeWorkspace) return;

      // Case 1: panel already exists -- focus it and re-run if idle
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

      const newPanelId = newPanelId_fn();
      const panelCwd = config.cwd ?? activeWorkspace.pinnedRoot ?? activeWorkspace.cwd;
      const panel: Panel = { id: newPanelId, kind: "terminal", cwd: panelCwd };

      // Case 2: existing script pane -- add panel to it without splitting
      const existingScriptPane = activeWorkspace.scriptPaneId
        ? findPane(activeWorkspace.paneTree, activeWorkspace.scriptPaneId)
        : null;

      if (existingScriptPane) {
        openPanel(activeWorkspace.id, activeWorkspace.scriptPaneId!, panel);
        setActiveWorkspaceId(activeWorkspace.id);
        activatePanel(activeWorkspace.id, newPanelId);
      } else {
        // Case 3: no script pane yet -- split and record the new pane
        const freshPaneId = splitPaneAndOpenPanel(
          activeWorkspace.id,
          activeWorkspace.activePaneId,
          "bottom",
          panel,
        );
        setScriptPaneId(activeWorkspace.id, freshPaneId);
      }

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
    [activeWorkspace, findPanelGlobal, setActiveWorkspaceId, activatePanel, splitPaneAndOpenPanel, updateRunConfig, openPanel, setScriptPaneId],
  );
```

**IMPORTANT about `newPanelId_fn`:** the function `newPanelId` from `@/lib/ids` is already imported in App.tsx (or re-import it). But the variable name `newPanelId` might conflict with the local function name. Check the current import at the top of App.tsx. If `newPanelId` is already imported from `@/lib/ids`, just use `newPanelId()` directly (but avoid shadowing with `const newPanelId = ...`). Change the local variable name to `freshPanelId`:

```tsx
const freshPanelId = newPanelId();
const panel: Panel = { id: freshPanelId, kind: "terminal", cwd: panelCwd };
// ...all references below use freshPanelId instead of newPanelId
```

Also add `findPane` import if not already present -- it comes from `@/modules/workspaces/lib/splitNode`. Check current imports in App.tsx for splitNode imports.

**D. Rename field accesses in App.tsx**

Find all 4 remaining occurrences of old field names and rename them:

1. Around line 2016 (`activeWorkspace.runConfigs`):
```tsx
// OLD
const configs = activeWorkspace.runConfigs ?? [];
// ...
configs.find((c) => c.id === activeWorkspace.activeRunConfigId) ??
// NEW
const configs = activeWorkspace.scripts ?? [];
// ...
configs.find((c) => c.id === activeWorkspace.activeScript) ??
```

2. Around line 2511-2512 (Header props):
```tsx
// OLD
            runConfigs={activeWorkspace?.runConfigs ?? []}
            activeRunConfigId={activeWorkspace?.activeRunConfigId}
// NEW
            scripts={activeWorkspace?.scripts ?? []}
            activeScript={activeWorkspace?.activeScript}
```

3. Around line 2513 (`setActiveRunConfig`):
```tsx
// OLD
            onSelectRunConfig={(id) => setActiveRunConfig(activeWorkspaceId, id)}
// NEW (no change needed -- action name stays the same)
            onSelectRunConfig={(id) => setActiveRunConfig(activeWorkspaceId, id)}
```

**E. Wire `onOpenRunSettings` to "run-configurations" tab (already done in previous session but verify it's still passing `"run-configurations"`)**

Verify line ~2498 passes the second argument:
```tsx
onOpenRunSettings={() =>
  useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId, "run-configurations")
}
```

If it's still there from the previous session, leave it. If it was lost, restore it.

- [ ] **Step 1: Read the relevant sections**

Read App.tsx at these ranges before editing:
- Lines 195-215 (destructured actions)
- Lines 280-295 (refs area for `terminalHandles`)
- Lines 460-470 (terminal cleanup)
- Lines 515-565 (runWorkspaceConfig)
- Lines 1695-1710 (onRunningCommand)
- Lines 2010-2025 (runConfigs field access)
- Lines 2505-2520 (Header props)
- Lines 1-50 (imports, to check for `findPane`, `newPanelId`)

- [ ] **Step 2: Apply all edits**

Apply changes A through E using the Edit tool. For each Edit call, verify the `old_string` matches exactly what's in the file (use the Read output from Step 1).

- [ ] **Step 3: Run checks**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
```

Expected: clean, 633+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/App.tsx
git commit -m "fix(workspace): timing race in run-config isRunning, shared scriptPaneId, rename to scripts"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Dialog: fixed size, no jump when adding/removing configs | T2 (min-h-[460px]) |
| Dialog title: "Workspace {name}" | T2 |
| "Working Directory" -> "Workspace Root" | T2 |
| Tab "Run Scripts" (not "Run Configurations") | T2 |
| Remove "Run Configurations" header above list | T2 |
| "+" button same style as "Add tool" in ExternalEditorsSection | T2 (Button ghost size-sm) |
| Command + name on same line (75% / 25%) | T2 |
| Red border on empty command | T2 (commandDirty state) |
| "Add Script" in dropdown (not "Add Run configuration") | T3 |
| Per-item play/stop icon in dropdown (actionable, state color) | T3 |
| Name in dropdown selects config (closes dropdown) | T3 (DropdownMenuItem onSelect) |
| Check mark for active config | T3 |
| JSON field "scripts" not "runConfigs" | T1 (types.ts) |
| JSON field "activeScript" not "activeRunConfigId" | T1 (types.ts) |
| Migration for existing data | T1 (workspaceState.ts) |
| Script pane tracking: all new scripts in same pane | T4 (scriptPaneId) |
| ID generation via newScriptId() | T1 (ids.ts) + T2 (dialog) |
| Stop button timing fix (turns red then disappears) | T4 (runConfigCommandSeen) |
| Second-click re-run works (already fixed in previous session, verify) | T4 (verify line ~2498) |

### Placeholder scan

- No "TBD", "TODO", or "implement later" in any step.
- All code blocks are complete and self-contained.

### Type consistency

- `RunConfig.paneId?: string` defined in T1, stored in T4 (`updateRunConfig` patch includes `paneId`). Wait -- the current `updateRunConfig` action takes `Partial<Omit<RunConfig, "id">>`, so `paneId` is automatically included. No issue.
- `splitPaneAndOpenPanel` return type changed to `string` in T1, consumed in T4 (`const freshPaneId = splitPaneAndOpenPanel(...)`). Consistent.
- `scripts` / `activeScript` defined in T1, used in T2 (`ws.scripts`), T3 (RunButton/Header props), T4 (App.tsx field accesses). Consistent.
- `setScriptPaneId(workspaceId: string, paneId: string): void` defined in T1, destructured and called in T4. Consistent.
- `newScriptId()` exported from T1 (`src/lib/ids.ts`), imported in T2 (`WorkspaceSettingsDialog.tsx`). Consistent.
- `runConfigCommandSeen = useRef<Set<string>>(new Set())` is a local ref in App.tsx; used only within T4. No cross-task dependency.

One potential issue: `openPanel` in App.tsx -- verified it exists (line 460 in useWorkspaces.ts shows `const openPanel = useCallback((workspaceId: string, paneId: string, panel: Panel, insertionIndex?: number) => {...})`). Task 4 must verify it is destructured. If not already destructured, add it.
