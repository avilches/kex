# Workspace Settings + Sidebar Resizable + F12 Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace settings (name, color, working directory, run configurations), a resizable workspace sidebar with per-window persistence, and a Run button in the header that launches run configurations in split terminal panels.

**Architecture:** Extend the `Workspace` data model with `color`, `runConfigs`, and `activeRunConfigId` fields; persist them via the existing `workspace-state.json` debounce path. Add a new manual drag resize to the workspace sidebar (separate from the existing `react-resizable-panels` used for the explorer/center split), persisted per window in the Rust `window_state.rs` alongside `rightPanel`. A new `WorkspaceSettingsDialog` wraps the shadcn `Dialog` and is driven by a Zustand store. The Run button wires into the existing `TerminalPaneHandle.write()` and `onRunningCommand` OSC 133 callback already flowing through `App.tsx`.

**Tech Stack:** React 19, TypeScript, Zustand, shadcn/ui (`Dialog`, `ContextMenu`, `Popover`), Tailwind v4, dnd-kit (already in project), Tauri 2, `tauri-plugin-dialog` (new), Vitest.

## Global Constraints

- Package manager: **pnpm only** — never npm/npx/yarn.
- No em-dash in any text. No emojis. No "Co-authored-by" in commits.
- Imports on the frontend always use `@/...` — never relative across modules.
- Keyboard shortcuts never hardcoded in handlers — always go through the `SHORTCUTS` registry in `src/modules/shortcuts/shortcuts.ts`.
- Shadcn UI components from `src/components/ui/` — `RadioGroup`, `Checkbox`, `Dialog`, `ContextMenu`, `Popover`.
- Run commands: `pnpm lint` (runs `pnpm exec biome lint ./src` — do NOT use `pnpm lint` if the project uses Biome, run `pnpm exec biome lint ./src` directly), `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked`.
- Two living docs updated in every commit that touches their subsystem: `docs/ARCHITECTURE.md` + `docs/IPC.md` (for new Tauri commands), `docs/WORKSPACES.md` (for model changes), `docs/FORK.md` (for F12).
- Work happens in the `workspace-settings` git worktree at `.claude/worktrees/workspace-settings`.

---

## File Map

**Create:**
- `src/modules/workspaces/lib/workspaceRenameStore.ts` — Zustand store for inline rename of workspace title
- `src/modules/workspaces/lib/workspaceSettingsStore.ts` — Zustand store: open/workspaceId for the settings modal
- `src/modules/workspaces/lib/workspaceColor.ts` — palette constant + helper to pick initial color from ID
- `src/modules/workspaces/lib/workspaceSidebarState.ts` — load/save workspace sidebar pixel width (mirrors `windowUiState.ts` for right panel)
- `src/app/components/WorkspaceSettingsDialog.tsx` — full settings modal (name, color, pinnedRoot, run configs)
- `src/app/components/RunButton.tsx` — Run button shown in the header

**Modify:**
- `src/modules/workspaces/lib/types.ts` — add `RunConfig` type; add `color`, `runConfigs`, `activeRunConfigId` to `Workspace`; narrow `ExplorerRootMode` to `"workspace" | "filesystem"`
- `src/modules/workspaces/lib/explorerRoot.ts` — remove `"pinned"` from mode list + ROOT_MODES array
- `src/modules/workspaces/lib/workspaceState.ts` — migration logic on load (pinned→workspace, workspace+no-pinnedRoot→copy cwd or fallback to filesystem)
- `src/modules/workspaces/lib/useWorkspaces.ts` — add `setWorkspaceTitle`, `setWorkspaceColor`, `addRunConfig`, `updateRunConfig`, `removeRunConfig`, `reorderRunConfigs`, `setActiveRunConfig`, `validateRunConfigPanels`
- `src/modules/workspaces/lib/terminalEphemeralStore.ts` — add `runConfigRunning: Map<panelId, boolean>` section
- `src/modules/shortcuts/shortcuts.ts` — add `"workspace.rename"` and `"workspace.settings"` shortcut IDs + entries
- `src/modules/workspaces/lib/windowUiState.ts` — `RIGHT_PANEL_WIDTH_MAX` 35→70
- `src/app/components/WorkspaceSidebar.tsx` — context menu, rename popover, resize handle, adaptive display, color stripe
- `src/modules/explorer/FileExplorer.tsx` — remove "pinned" from the root-mode dropdown
- `src/modules/workspaces/lib/windowUiState.ts` — already mentioned above
- `src-tauri/src/modules/window_state.rs` — add `workspace_sidebar_width: Option<u32>` to `IndexEntry` + `WindowEntry`
- `src-tauri/src/lib.rs` — register `window_save_workspace_sidebar` command + `tauri_plugin_dialog::init()`
- `src-tauri/Cargo.toml` — add `tauri-plugin-dialog = "2"`
- `src-tauri/capabilities/default.json` — add `"dialog:default"` permission
- `package.json` — add `"@tauri-apps/plugin-dialog": "~2.3.0"`
- `src/app/App.tsx` — wire sidebar width state, workspace rename/settings shortcuts, run config execution, `onRunningCommand` extension for `isRunning`
- Header component (confirm path: `src/app/header/Header.tsx` or `src/app/components/Header.tsx`) — add `RunButton`
- `docs/ARCHITECTURE.md`, `docs/IPC.md`, `docs/WORKSPACES.md`, `docs/FORK.md`

---

## Task 1: Data model + migration + useWorkspaces new actions

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Modify: `src/modules/workspaces/lib/explorerRoot.ts`
- Modify: `src/modules/workspaces/lib/workspaceState.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`
- Test: `src/modules/workspaces/lib/types.test.ts` (new file) and `src/modules/workspaces/lib/useWorkspaces.test.ts`

**Interfaces — Produces (used by all later tasks):**
```typescript
// types.ts additions
type RunConfig = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  panelId?: string;
};

// Workspace gains:
color?: string | null;
runConfigs?: RunConfig[];
activeRunConfigId?: string;

// ExplorerRootMode narrows to:
export type ExplorerRootMode = "workspace" | "filesystem";

// useWorkspaces new actions:
setWorkspaceTitle(workspaceId: string, title: string): void
setWorkspaceColor(workspaceId: string, color: string | null): void
addRunConfig(workspaceId: string, config: RunConfig): void
updateRunConfig(workspaceId: string, configId: string, patch: Partial<Omit<RunConfig, "id">>): void
removeRunConfig(workspaceId: string, configId: string): void
reorderRunConfigs(workspaceId: string, fromId: string, toId: string): void
setActiveRunConfig(workspaceId: string, configId: string | null): void
validateRunConfigPanels(workspaceId: string, livingPanelIds: Set<string>): void
```

- [ ] **Step 1: Update types.ts**

In `src/modules/workspaces/lib/types.ts`, add the `RunConfig` type and update `Workspace` and `ExplorerRootMode`:

```typescript
// Add before the Panel type
export type RunConfig = {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  panelId?: string;
};

// Update ExplorerRootMode (was "workspace" | "pinned" | "filesystem")
export type ExplorerRootMode = "workspace" | "filesystem";

// In the Workspace type, add after `git?`:
color?: string | null;
runConfigs?: RunConfig[];
activeRunConfigId?: string;
```

- [ ] **Step 2: Write tests for the data model helpers**

Create `src/modules/workspaces/lib/types.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import type { RunConfig, ExplorerRootMode } from "./types";

describe("ExplorerRootMode", () => {
  test("only allows workspace or filesystem", () => {
    const modes: ExplorerRootMode[] = ["workspace", "filesystem"];
    expect(modes).toHaveLength(2);
  });
});

describe("RunConfig", () => {
  test("panelId is optional", () => {
    const cfg: RunConfig = { id: "1", name: "Dev", command: "pnpm dev" };
    expect(cfg.panelId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm test -- src/modules/workspaces/lib/types.test.ts
```

Expected: PASS (types compile and simple assertions hold).

- [ ] **Step 4: Update explorerRoot.ts — remove "pinned"**

In `src/modules/workspaces/lib/explorerRoot.ts`, find the `ROOT_MODES` array and the `ExplorerRootMode` usages. Remove any `"pinned"` entry and its associated logic. The file exports `resolveExplorerRoot` and similar helpers — update them so they only handle `"workspace"` and `"filesystem"`.

Check what the file currently exports:
```bash
grep -n "pinned\|ROOT_MODES\|ExplorerRootMode" src/modules/workspaces/lib/explorerRoot.ts
```

Remove all `"pinned"` branches. If there is a `MODE_SHORTCUT` map referencing `"explorer.viewPinned"`, keep the shortcut in `shortcuts.ts` but remove the `"pinned"` mode entry from `ROOT_MODES`.

- [ ] **Step 5: Add migration to workspaceState.ts**

In `src/modules/workspaces/lib/workspaceState.ts`, find the function that deserializes/loads a workspace (look for where `Workspace` objects are constructed from JSON). Add a `migrateWorkspace` function:

```typescript
function migrateWorkspace(raw: Workspace): Workspace {
  let ws = { ...raw };

  // Migrate "pinned" mode → "workspace"
  if ((ws.explorerRootMode as string) === "pinned") {
    ws = { ...ws, explorerRootMode: "workspace" };
  }

  // Migrate "workspace" mode with no pinnedRoot:
  // copy cwd to pinnedRoot; if no cwd either, fall back to "filesystem"
  if (ws.explorerRootMode === "workspace" && !ws.pinnedRoot) {
    if (ws.cwd) {
      ws = { ...ws, pinnedRoot: ws.cwd };
    } else {
      ws = { ...ws, explorerRootMode: "filesystem" };
    }
  }

  // Validate runConfig panelIds (clear stale ones — full validation happens
  // in useWorkspaces after the pane tree is built)
  return ws;
}
```

Apply it in the load path: wherever a raw JSON workspace object is converted to a typed `Workspace`, wrap it with `migrateWorkspace(parsed)`.

- [ ] **Step 6: Add actions to useWorkspaces.ts**

In `src/modules/workspaces/lib/useWorkspaces.ts`, add these actions after `setWorkspaceGitConfig`:

```typescript
const setWorkspaceTitle = useCallback((workspaceId: string, title: string) => {
  setWorkspaces((prev) =>
    prev.map((w) => w.id === workspaceId ? { ...w, title } : w)
  );
}, []);

const setWorkspaceColor = useCallback((workspaceId: string, color: string | null) => {
  setWorkspaces((prev) =>
    prev.map((w) => w.id === workspaceId ? { ...w, color } : w)
  );
}, []);

const addRunConfig = useCallback((workspaceId: string, config: RunConfig) => {
  setWorkspaces((prev) =>
    prev.map((w) =>
      w.id === workspaceId
        ? { ...w, runConfigs: [...(w.runConfigs ?? []), config] }
        : w
    )
  );
}, []);

const updateRunConfig = useCallback(
  (workspaceId: string, configId: string, patch: Partial<Omit<RunConfig, "id">>) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== workspaceId
          ? w
          : {
              ...w,
              runConfigs: (w.runConfigs ?? []).map((c) =>
                c.id === configId ? { ...c, ...patch } : c
              ),
            }
      )
    );
  },
  []
);

const removeRunConfig = useCallback((workspaceId: string, configId: string) => {
  setWorkspaces((prev) =>
    prev.map((w) =>
      w.id !== workspaceId
        ? w
        : {
            ...w,
            runConfigs: (w.runConfigs ?? []).filter((c) => c.id !== configId),
            activeRunConfigId:
              w.activeRunConfigId === configId ? undefined : w.activeRunConfigId,
          }
    )
  );
}, []);

const reorderRunConfigs = useCallback((workspaceId: string, fromId: string, toId: string) => {
  setWorkspaces((prev) =>
    prev.map((w) => {
      if (w.id !== workspaceId) return w;
      const configs = w.runConfigs ?? [];
      const from = configs.findIndex((c) => c.id === fromId);
      const to = configs.findIndex((c) => c.id === toId);
      if (from === -1 || to === -1 || from === to) return w;
      const next = [...configs];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return { ...w, runConfigs: next };
    })
  );
}, []);

const setActiveRunConfig = useCallback((workspaceId: string, configId: string | null) => {
  setWorkspaces((prev) =>
    prev.map((w) =>
      w.id === workspaceId
        ? { ...w, activeRunConfigId: configId ?? undefined }
        : w
    )
  );
}, []);

const validateRunConfigPanels = useCallback(
  (workspaceId: string, livingPanelIds: Set<string>) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id !== workspaceId) return w;
        const configs = w.runConfigs ?? [];
        const cleaned = configs.map((c) =>
          c.panelId && !livingPanelIds.has(c.panelId)
            ? { ...c, panelId: undefined }
            : c
        );
        if (cleaned.every((c, i) => c === configs[i])) return w;
        return { ...w, runConfigs: cleaned };
      })
    );
  },
  []
);
```

Add all new actions to the `return` object at the end of `useWorkspaces`.

- [ ] **Step 7: Add tests for the new actions**

In `src/modules/workspaces/lib/useWorkspaces.test.ts` (the file already exists — append to it):

```typescript
import { addRunConfig, removeRunConfig, setWorkspaceTitle } from "./useWorkspaces";
// Note: since useWorkspaces is a hook, test via renderHook or test pure helpers.
// The existing test file likely tests pure helpers — follow its pattern.

// Test migrateWorkspace (import from workspaceState.ts if exported, else test indirectly)
describe("workspace migration", () => {
  test("pinned mode migrates to workspace", () => {
    const raw = { id: "1", title: "W", explorerRootMode: "pinned", pinnedRoot: "/foo", paneTree: {} as any, activePaneId: "" };
    const migrated = migrateWorkspace(raw as any);
    expect(migrated.explorerRootMode).toBe("workspace");
  });

  test("workspace mode without pinnedRoot copies cwd", () => {
    const raw = { id: "1", title: "W", explorerRootMode: "workspace", cwd: "/home/user/proj", paneTree: {} as any, activePaneId: "" };
    const migrated = migrateWorkspace(raw as any);
    expect(migrated.pinnedRoot).toBe("/home/user/proj");
    expect(migrated.explorerRootMode).toBe("workspace");
  });

  test("workspace mode without pinnedRoot or cwd falls back to filesystem", () => {
    const raw = { id: "1", title: "W", explorerRootMode: "workspace", paneTree: {} as any, activePaneId: "" };
    const migrated = migrateWorkspace(raw as any);
    expect(migrated.explorerRootMode).toBe("filesystem");
  });
});
```

Export `migrateWorkspace` from `workspaceState.ts` for testing.

- [ ] **Step 8: Run all tests**

```bash
pnpm test
```

Expected: all existing tests pass + the new ones pass.

- [ ] **Step 9: Type-check**

```bash
pnpm check-types
```

Fix any type errors (usually `ExplorerRootMode` references to `"pinned"` that were missed).

- [ ] **Step 10: Commit**

```bash
git add src/modules/workspaces/lib/types.ts \
        src/modules/workspaces/lib/explorerRoot.ts \
        src/modules/workspaces/lib/workspaceState.ts \
        src/modules/workspaces/lib/useWorkspaces.ts \
        src/modules/workspaces/lib/types.test.ts
git commit -m "feat(workspace): extend model with color/runConfigs, drop pinned explorer mode, add migration"
```

---

## Task 2: Shortcuts + workspace rename inline

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Create: `src/modules/workspaces/lib/workspaceRenameStore.ts`
- Modify: `src/app/components/WorkspaceSidebar.tsx`
- Modify: `src/app/App.tsx` (wire rename shortcut)

**Interfaces — Consumes:** `Workspace.title`, `setWorkspaceTitle` (Task 1)
**Interfaces — Produces:**
```typescript
// workspaceRenameStore.ts
export function useWorkspaceRenameStore(): { renamingId: string | null; startRename(id: string): void; clearRename(): void }
// WorkspaceSidebar gets new props:
onRename?: (id: string, newTitle: string) => void
onOpenSettings?: (id: string) => void
```

- [ ] **Step 1: Add shortcuts**

In `src/modules/shortcuts/shortcuts.ts`, add to the `ShortcutId` union:

```typescript
| "workspace.rename"
| "workspace.settings"
```

In the `SHORTCUTS` array, after the `workspace.close` entry:

```typescript
{
  id: "workspace.rename",
  label: "Rename Workspace",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "r" }],
},
{
  id: "workspace.settings",
  label: "Workspace Settings",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "," }],
},
```

- [ ] **Step 2: Create workspaceRenameStore.ts**

Create `src/modules/workspaces/lib/workspaceRenameStore.ts`:

```typescript
import { create } from "zustand";

type WorkspaceRenameStore = {
  renamingId: string | null;
  startRename: (id: string) => void;
  clearRename: () => void;
};

export const useWorkspaceRenameStore = create<WorkspaceRenameStore>((set) => ({
  renamingId: null,
  startRename: (id) => set({ renamingId: id }),
  clearRename: () => set({ renamingId: null }),
}));
```

- [ ] **Step 3: Add context menu + rename popover to WorkspaceSidebar**

`src/app/components/WorkspaceSidebar.tsx` currently imports from `@dnd-kit` and `@hugeicons`. It needs new imports:

```typescript
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { PencilEdit01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { useWorkspaceRenameStore } from "@/modules/workspaces/lib/workspaceRenameStore";
import { usePreferencesStore } from "@/modules/settings/store";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts"; // check the actual export name
```

Check what the project uses for shortcut labels by running:
```bash
grep -n "shortcutLabel\|getBindingTokens\|shortcutLabels" src/modules/workspaces/PaneTabBar.tsx | head -5
```

Follow the same pattern as `PaneTabBar.tsx` for rendering shortcut labels in context menus.

Update `WorkspaceItem` type to include `color`:
```typescript
type WorkspaceItem = { id: string; title: string; kind: string; cwd?: string; color?: string | null };
```

Update `WorkspaceSidebarProps`:
```typescript
export type WorkspaceSidebarProps = {
  workspaces: WorkspaceItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onReorder: (fromId: string, toId: string) => void;
  onClose?: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onOpenSettings: (id: string) => void;
  // sidebar resize:
  width: number;
  onWidthChange: (w: number) => void;
};
```

Update `SortableWorkspaceItem` to wrap the button in a `ContextMenu` with:
- "Rename Workspace" + icon `PencilEdit01Icon` + shortcut label for `workspace.rename`
- "Workspace Settings" + icon `Settings01Icon` + shortcut label for `workspace.settings`
- Separator
- "Close Workspace" + icon `Cancel01Icon` + shortcut label for `workspace.close`

When `renamingId === ws.id`, render a `Popover` with an `<input>` (like the tab rename in `PaneTabBar.tsx`). On Enter or blur, call `onRename(ws.id, inputValue)` and `clearRename()`.

Leave the X hover button as-is.

- [ ] **Step 4: Wire rename shortcut in App.tsx**

In `src/app/App.tsx`, find the `useGlobalShortcuts` call. Add a handler for `"workspace.rename"`:

```typescript
"workspace.rename": () => {
  if (activeWorkspaceId) {
    useWorkspaceRenameStore.getState().startRename(activeWorkspaceId);
  }
},
```

Pass `onRename={(id, title) => setWorkspaceTitle(id, title)}` and `onOpenSettings={(id) => workspaceSettingsStore.openSettings(id)}` (the settings store comes in Task 6) to `<WorkspaceSidebar>`.

For now (until Task 6), `onOpenSettings` can be a no-op: `() => {}`.

Also pass the new `setWorkspaceTitle` action from `useWorkspaces` (destructure it).

- [ ] **Step 5: Test rename**

```bash
pnpm check-types && pnpm test
```

Also run the app manually:
```bash
pnpm tauri dev
```

Right-click a workspace → "Rename Workspace" → type a new name → Enter. Verify the sidebar button shows the new abbreviation.

- [ ] **Step 6: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts \
        src/modules/workspaces/lib/workspaceRenameStore.ts \
        src/app/components/WorkspaceSidebar.tsx \
        src/app/App.tsx
git commit -m "feat(workspace): rename inline via context menu and Cmd+Shift+R"
```

---

## Task 3: Color system + sidebar color visualization

**Files:**
- Create: `src/modules/workspaces/lib/workspaceColor.ts`
- Modify: `src/app/components/WorkspaceSidebar.tsx`
- Modify: `src/app/App.tsx` (pass `color` in the workspace item list)
- Test: `src/modules/workspaces/lib/workspaceColor.test.ts`

**Interfaces — Consumes:** `Workspace.color` (Task 1), `idHue` helper (currently in `WorkspaceSidebar.tsx` — move it to `workspaceColor.ts`)
**Interfaces — Produces:**
```typescript
// workspaceColor.ts
export const WORKSPACE_COLOR_PALETTE: string[]; // 8 hex values
export function initialColorForId(id: string): string; // picks from palette via idHue
export function resolveWorkspaceColor(color: string | null | undefined, id: string): string | null;
// null = no color (sin color option); string = hex color to use
```

- [ ] **Step 1: Create workspaceColor.ts**

Create `src/modules/workspaces/lib/workspaceColor.ts`:

```typescript
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

// Stable hue 0-359 from a string ID (same algorithm as WorkspaceSidebar.tsx idHue).
// Move idHue here and delete it from WorkspaceSidebar.tsx.
export function idHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

export function initialColorForId(id: string): string {
  return WORKSPACE_COLOR_PALETTE[idHue(id) % WORKSPACE_COLOR_PALETTE.length]!;
}

/**
 * Resolves the display color for a workspace.
 * - undefined/not set: use initialColorForId (new workspace, not yet explicitly colored)
 * - null: no color (user chose "Sin color")
 * - string: the explicit hex color
 */
export function resolveWorkspaceColor(
  color: string | null | undefined,
  id: string,
): string | null {
  if (color === null) return null;
  if (color === undefined) return initialColorForId(id);
  return color;
}
```

- [ ] **Step 2: Write tests**

Create `src/modules/workspaces/lib/workspaceColor.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  WORKSPACE_COLOR_PALETTE,
  idHue,
  initialColorForId,
  resolveWorkspaceColor,
} from "./workspaceColor";

describe("idHue", () => {
  test("returns 0-359", () => {
    const h = idHue("abc");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
  test("same id always same hue", () => {
    expect(idHue("fixed-id")).toBe(idHue("fixed-id"));
  });
});

describe("initialColorForId", () => {
  test("returns a palette color", () => {
    const color = initialColorForId("some-workspace-id");
    expect(WORKSPACE_COLOR_PALETTE).toContain(color);
  });
});

describe("resolveWorkspaceColor", () => {
  test("null → no color", () => {
    expect(resolveWorkspaceColor(null, "id")).toBeNull();
  });
  test("undefined → palette color from id", () => {
    const c = resolveWorkspaceColor(undefined, "id");
    expect(WORKSPACE_COLOR_PALETTE).toContain(c);
  });
  test("hex string → returned as-is", () => {
    expect(resolveWorkspaceColor("#ff0000", "id")).toBe("#ff0000");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- src/modules/workspaces/lib/workspaceColor.test.ts
```

Expected: PASS.

- [ ] **Step 4: Update WorkspaceSidebar to show color**

In `src/app/components/WorkspaceSidebar.tsx`:

1. Remove the `idHue` function (now in `workspaceColor.ts`).
2. Import `resolveWorkspaceColor` from `@/modules/workspaces/lib/workspaceColor`.
3. In `SortableWorkspaceItem`, compute `const displayColor = resolveWorkspaceColor(ws.color, ws.id);`.
4. **Active workspace**: use `displayColor` in `backgroundColor` when `displayColor !== null`. When `displayColor === null`, use a neutral fill (e.g. `hsl(var(--muted))` and keep the ring using `hsl(var(--border))`).
5. **Inactive with color**: Add a 3px left border stripe. Change the button wrapper div to position `relative` and add an absolute child:

```tsx
{/* left color stripe, only for inactive workspaces with a color */}
{!active && displayColor && (
  <span
    className="absolute inset-y-2 left-0 w-[3px] rounded-full"
    style={{ backgroundColor: displayColor }}
  />
)}
```

- [ ] **Step 5: Pass color from App.tsx**

In `src/app/App.tsx`, find the `WorkspaceSidebar` call and update the `workspaces` mapping:

```typescript
workspaces={workspaces.map((w) => ({
  id: w.id,
  title: w.title,
  kind: "terminal",
  cwd: w.cwd,
  color: w.color,  // <-- add this
}))}
```

- [ ] **Step 6: Verify type-check + tests**

```bash
pnpm check-types && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/workspaces/lib/workspaceColor.ts \
        src/modules/workspaces/lib/workspaceColor.test.ts \
        src/app/components/WorkspaceSidebar.tsx \
        src/app/App.tsx
git commit -m "feat(workspace): color palette + sidebar color stripe for inactive workspaces"
```

---

## Task 4: Rust sidebar width persistence + tauri-plugin-dialog

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`
- Modify: `src-tauri/src/modules/window_state.rs`
- Create: `src/modules/workspaces/lib/workspaceSidebarState.ts`

**Interfaces — Produces:**
```typescript
// workspaceSidebarState.ts
export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 52;
export function getSavedWorkspaceSidebarWidth(): number
export function setSavedWorkspaceSidebarWidth(raw: unknown): void
export function saveWorkspaceSidebarWidth(label: string, width: number): void
```

- [ ] **Step 1: Add tauri-plugin-dialog to Cargo.toml**

In `src-tauri/Cargo.toml`, in the `[dependencies]` section alongside the other `tauri-plugin-*` entries:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Add plugin to lib.rs**

In `src-tauri/src/lib.rs`, find the `.run(tauri::generate_context!())` builder chain. Add the dialog plugin alongside the others (look for `.plugin(tauri_plugin_opener::init())` as a reference):

```rust
.plugin(tauri_plugin_dialog::init())
```

Also add the new command to the `invoke_handler` alongside `window_save_right_panel`:

```rust
window_save_workspace_sidebar,
```

Add the command function. Find `window_save_right_panel` (around line 420) and add after it:

```rust
#[tauri::command]
fn window_save_workspace_sidebar(
    app: tauri::AppHandle,
    label: String,
    width: u32,
) {
    let mgr = app.state::<window_state::WindowStateManager>();
    mgr.update_workspace_sidebar_width(&label, width);
    mgr.save();
}
```

- [ ] **Step 3: Add workspace_sidebar_width to window_state.rs**

In `src-tauri/src/modules/window_state.rs`:

Find `pub struct IndexEntry` and add:
```rust
#[serde(default)]
pub workspace_sidebar_width: Option<u32>,
```

Find `pub struct WindowEntry` and add:
```rust
#[serde(default)]
pub workspace_sidebar_width: Option<u32>,
```

Find `impl WindowStateManager` and add the method `update_workspace_sidebar_width`. Look at `update_right_panel` as a reference — it finds the entry by label and updates a field. Add:

```rust
pub fn update_workspace_sidebar_width(&self, label: &str, width: u32) {
    let mut inner = self.inner.write().unwrap();
    if let Some(entry) = inner.windows.get_mut(label) {
        entry.workspace_sidebar_width = Some(width);
    }
}
```

Make sure `IndexEntry` also serializes the new field when saving to disk. Since it derives `Serialize`/`Deserialize`, adding the field with `#[serde(default)]` is sufficient.

- [ ] **Step 4: Add dialog permission to capabilities**

In `src-tauri/capabilities/default.json`, find the `"permissions"` array and add:

```json
"dialog:default"
```

- [ ] **Step 5: Add frontend package**

In `package.json`, in the `"dependencies"` section alongside other `@tauri-apps/plugin-*` entries:

```json
"@tauri-apps/plugin-dialog": "~2.3.0"
```

Run:
```bash
pnpm install
```

- [ ] **Step 6: Create workspaceSidebarState.ts**

Create `src/modules/workspaces/lib/workspaceSidebarState.ts`. Model it after `src/modules/workspaces/lib/windowUiState.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 52;
const SIDEBAR_WIDTH_MIN = 52;
const SIDEBAR_WIDTH_MAX = 220;

function clamp(v: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, v));
}

let cached = DEFAULT_WORKSPACE_SIDEBAR_WIDTH;

export function setSavedWorkspaceSidebarWidth(raw: unknown): void {
  cached =
    typeof raw === "number" && Number.isFinite(raw)
      ? clamp(raw)
      : DEFAULT_WORKSPACE_SIDEBAR_WIDTH;
}

export function getSavedWorkspaceSidebarWidth(): number {
  return cached;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { label: string; width: number } | null = null;

export function saveWorkspaceSidebarWidth(label: string, width: number): void {
  pending = { label, width: Math.round(clamp(width)) };
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    void invoke("window_save_workspace_sidebar", { label: p.label, width: p.width }).catch(
      (err) => console.error("[workspace-sidebar-state] save error:", err)
    );
  }, 250);
}
```

- [ ] **Step 7: Build Rust to verify**

```bash
cd src-tauri && cargo clippy && cargo test --locked
```

Expected: no errors. Fix any compile errors (missing imports, wrong method signatures).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml \
        src-tauri/src/lib.rs \
        src-tauri/src/modules/window_state.rs \
        src-tauri/capabilities/default.json \
        package.json \
        pnpm-lock.yaml \
        src/modules/workspaces/lib/workspaceSidebarState.ts
git commit -m "feat(workspace): add tauri-plugin-dialog + sidebar width persistence (Rust + frontend)"
```

---

## Task 5: Sidebar resizable + adaptive display + explorer max width

**Files:**
- Modify: `src/app/components/WorkspaceSidebar.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/modules/workspaces/lib/windowUiState.ts`

**Interfaces — Consumes:** `getSavedWorkspaceSidebarWidth`, `saveWorkspaceSidebarWidth` (Task 4), `WorkspaceSidebarProps.width + onWidthChange` (Task 2)

- [ ] **Step 1: Increase explorer max width**

In `src/modules/workspaces/lib/windowUiState.ts`, change:

```typescript
const RIGHT_PANEL_WIDTH_MAX = 70; // was 35
```

- [ ] **Step 2: Add resize handle to WorkspaceSidebar**

In `src/app/components/WorkspaceSidebar.tsx`, the `WorkspaceSidebar` component renders a `<nav>` with fixed `w-[52px]`. Replace the fixed width with a dynamic style and add a resize handle.

The `<nav>` element should become:

```tsx
<nav
  aria-label="Workspaces"
  className={cn(
    "relative flex shrink-0 flex-col items-center gap-1.5 border-r border-border/60 bg-card/60 py-2",
    isDragging && "[&_*]:!cursor-grabbing cursor-grabbing",
  )}
  style={{ width: props.width }}
>
  {/* ... existing content ... */}

  {/* Resize handle on the right edge */}
  <div
    className="absolute inset-y-0 right-0 w-1 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50"
    onPointerDown={(e) => {
      const startX = e.clientX;
      const startWidth = props.width;
      e.currentTarget.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const next = Math.min(220, Math.max(52, startWidth + (ev.clientX - startX)));
        props.onWidthChange(next);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }}
  />
</nav>
```

- [ ] **Step 3: Adaptive display (icon-only vs icon+name)**

In `SortableWorkspaceItem`, the button currently shows `{abbrev(ws.title, ws.kind)}`. Make it adaptive based on `props.width` (pass `width` down as a prop or read from context/store):

```tsx
// Pass sidebarWidth down to SortableWorkspaceItem
const compact = sidebarWidth <= 80;

<button
  className={cn(
    "flex items-center justify-center rounded-lg font-semibold transition-all select-none",
    compact ? "h-9 w-9 text-[11px]" : "h-auto w-full flex-col gap-0.5 px-2 py-1.5 text-[11px]",
    active ? "text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
  )}
>
  <span className={compact ? "text-[11px]" : "text-[14px] font-bold"}>
    {abbrev(ws.title, ws.kind)}
  </span>
  {!compact && (
    <span className="max-w-full truncate text-center text-[10px] font-normal leading-tight">
      {ws.title || ws.kind}
    </span>
  )}
</button>
```

The `sidebarWidth` value should be passed as a prop to `SortableWorkspaceItem` from the parent.

- [ ] **Step 4: Wire sidebar width state in App.tsx**

In `src/app/App.tsx`:

1. Import `getSavedWorkspaceSidebarWidth`, `setSavedWorkspaceSidebarWidth`, `saveWorkspaceSidebarWidth` from `@/modules/workspaces/lib/workspaceSidebarState`.

2. Find where `getSavedRightPanelState()` is called during init (look for `window_get_state` usage). In the same init code, call:
   ```typescript
   setSavedWorkspaceSidebarWidth(windowState?.workspaceSidebarWidth);
   ```

3. Add state near the other sidebar state:
   ```typescript
   const [workspaceSidebarWidth, setWorkspaceSidebarWidth] = useState(getSavedWorkspaceSidebarWidth);
   ```

4. Add a handler that saves on change:
   ```typescript
   const handleSidebarWidthChange = useCallback((w: number) => {
     setWorkspaceSidebarWidth(w);
     saveWorkspaceSidebarWidth(windowLabel, w);
   }, [windowLabel]);
   ```

5. Pass to `<WorkspaceSidebar>`:
   ```tsx
   width={workspaceSidebarWidth}
   onWidthChange={handleSidebarWidthChange}
   ```

Find `windowLabel`: look for how the window label is obtained in the file (likely `getCurrentWindow().label` or a constant).

- [ ] **Step 5: Verify**

```bash
pnpm check-types && pnpm test
```

Run `pnpm tauri dev` and manually:
- Drag the workspace sidebar to verify it resizes.
- Verify the name appears below the icon when wide (>80px).
- Verify the width persists after restart.
- Verify the explorer panel can now be dragged to 70% width.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/WorkspaceSidebar.tsx \
        src/app/App.tsx \
        src/modules/workspaces/lib/windowUiState.ts
git commit -m "feat(workspace): resizable sidebar (52-220px) with adaptive display and persistence"
```

---

## Task 6: Workspace Settings modal — name + color + pinnedRoot + explorer cleanup

**Files:**
- Create: `src/modules/workspaces/lib/workspaceSettingsStore.ts`
- Create: `src/app/components/WorkspaceSettingsDialog.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/modules/explorer/FileExplorer.tsx`

**Interfaces — Consumes:** `setWorkspaceTitle`, `setWorkspaceColor`, `setPinnedRoot` (Task 1), `WORKSPACE_COLOR_PALETTE`, `resolveWorkspaceColor` (Task 3), `tauri-plugin-dialog` (Task 4)

- [ ] **Step 1: Create workspaceSettingsStore.ts**

Create `src/modules/workspaces/lib/workspaceSettingsStore.ts`:

```typescript
import { create } from "zustand";

type WorkspaceSettingsStore = {
  open: boolean;
  workspaceId: string | null;
  initialTab?: "run-configs";
  openSettings: (id: string, tab?: "run-configs") => void;
  closeSettings: () => void;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>((set) => ({
  open: false,
  workspaceId: null,
  initialTab: undefined,
  openSettings: (id, tab) => set({ open: true, workspaceId: id, initialTab: tab }),
  closeSettings: () => set({ open: false, workspaceId: null, initialTab: undefined }),
}));
```

- [ ] **Step 2: Wire settings shortcut in App.tsx**

Find the `useGlobalShortcuts` call. Add:

```typescript
"workspace.settings": () => {
  if (activeWorkspaceId) {
    useWorkspaceSettingsStore.getState().openSettings(activeWorkspaceId);
  }
},
```

Update `onOpenSettings` on `<WorkspaceSidebar>` (currently a no-op from Task 2):

```tsx
onOpenSettings={(id) => useWorkspaceSettingsStore.getState().openSettings(id)}
```

- [ ] **Step 3: Create WorkspaceSettingsDialog.tsx — structure**

Create `src/app/components/WorkspaceSettingsDialog.tsx`. Start with the shell:

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspaceSettingsStore } from "@/modules/workspaces/lib/workspaceSettingsStore";
// ... other imports

export function WorkspaceSettingsDialog(props: {
  workspaces: { id: string; title: string; color?: string | null; pinnedRoot?: string; runConfigs?: RunConfig[] }[];
  onSetTitle: (id: string, title: string) => void;
  onSetColor: (id: string, color: string | null) => void;
  onSetPinnedRoot: (id: string, path: string | undefined) => void;
  onSetExplorerRootMode: (id: string, mode: ExplorerRootMode) => void;
  // run config actions wired in Task 7:
  onAddRunConfig: (id: string, config: RunConfig) => void;
  onUpdateRunConfig: (id: string, configId: string, patch: Partial<RunConfig>) => void;
  onRemoveRunConfig: (id: string, configId: string) => void;
  onReorderRunConfigs: (id: string, fromId: string, toId: string) => void;
}) {
  const { open, workspaceId, closeSettings } = useWorkspaceSettingsStore();
  const ws = props.workspaces.find((w) => w.id === workspaceId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Workspace Settings</DialogTitle>
        </DialogHeader>
        {ws && (
          <WorkspaceSettingsForm ws={ws} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add General section (name + color)**

Inside `WorkspaceSettingsForm` (a sub-component in the same file):

**Name field:**
```tsx
<div className="flex flex-col gap-1">
  <label className="text-xs font-medium">Name</label>
  <input
    className="h-8 rounded-md border border-border bg-background px-3 text-sm"
    defaultValue={ws.title}
    onBlur={(e) => props.onSetTitle(ws.id, e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
  />
</div>
```

**Color picker:**

```tsx
const displayColor = resolveWorkspaceColor(ws.color, ws.id);

<div className="flex flex-col gap-2">
  <label className="text-xs font-medium">Color</label>
  <div className="flex flex-wrap gap-1.5">
    {/* "Sin color" chip */}
    <button
      type="button"
      title="Sin color"
      onClick={() => props.onSetColor(ws.id, null)}
      className={cn(
        "size-6 rounded-full border-2 flex items-center justify-center",
        ws.color === null ? "border-foreground" : "border-transparent",
        "bg-muted text-muted-foreground text-[10px]"
      )}
    >
      ✕
    </button>
    {/* Palette chips */}
    {WORKSPACE_COLOR_PALETTE.map((hex) => (
      <button
        key={hex}
        type="button"
        title={hex}
        onClick={() => props.onSetColor(ws.id, hex)}
        className={cn(
          "size-6 rounded-full border-2",
          ws.color === hex ? "border-foreground" : "border-transparent"
        )}
        style={{ backgroundColor: hex }}
      />
    ))}
  </div>
  {/* Custom hex input */}
  <div className="flex items-center gap-2">
    <div
      className="size-6 rounded-full border border-border"
      style={{ backgroundColor: displayColor ?? undefined }}
    />
    <input
      className="h-7 w-28 rounded border border-border bg-background px-2 text-xs font-mono"
      placeholder="#rrggbb"
      value={ws.color && ws.color !== null && !WORKSPACE_COLOR_PALETTE.includes(ws.color as any) ? ws.color : ""}
      onChange={(e) => {
        const v = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) props.onSetColor(ws.id, v);
      }}
    />
  </div>
</div>
```

- [ ] **Step 5: Add Working Directory section**

Import `open` from `@tauri-apps/plugin-dialog` and `invoke` for `fs_stat`:

```tsx
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
```

State for validation:

```tsx
const [cwdValue, setCwdValue] = useState(ws.pinnedRoot ?? "");
const [cwdValid, setCwdValid] = useState<boolean | null>(null); // null = not checked yet

// Debounced validation
useEffect(() => {
  if (!cwdValue) { setCwdValid(null); return; }
  const t = setTimeout(async () => {
    try {
      const stat = await invoke<{ isDir: boolean }>("fs_stat", { path: cwdValue });
      setCwdValid(stat.isDir);
    } catch {
      setCwdValid(false);
    }
  }, 400);
  return () => clearTimeout(t);
}, [cwdValue]);
```

Check the exact signature of `fs_stat` in `docs/IPC.md` or `src-tauri/src/lib.rs`. It may return a different shape — use `{ kind: "dir" | "file" }` or whatever the existing command returns.

```tsx
<div className="flex flex-col gap-1">
  <label className="text-xs font-medium">Working Directory</label>
  <div className="flex items-center gap-1">
    <input
      className={cn(
        "h-8 flex-1 rounded-md border bg-background px-3 text-sm",
        cwdValid === false ? "border-destructive" : "border-border",
      )}
      value={cwdValue}
      onChange={(e) => setCwdValue(e.target.value)}
      onBlur={() => {
        if (cwdValid !== false) props.onSetPinnedRoot(ws.id, cwdValue || undefined);
      }}
      placeholder="Not set"
    />
    {cwdValue && (
      <button
        type="button"
        title="Clear"
        onClick={() => {
          setCwdValue("");
          props.onSetPinnedRoot(ws.id, undefined);
          props.onSetExplorerRootMode(ws.id, "filesystem");
        }}
        className="size-[22px] flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
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
      className="size-[22px] flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
    >
      <HugeiconsIcon icon={FolderOpenIcon} size={12} strokeWidth={2} />
    </button>
  </div>
  {cwdValid === false && (
    <p className="text-[11px] text-destructive">Folder does not exist</p>
  )}
</div>
```

- [ ] **Step 6: Wire the modal in App.tsx**

Mount `<WorkspaceSettingsDialog>` near the other global dialogs in the `return` block of `App.tsx`:

```tsx
<WorkspaceSettingsDialog
  workspaces={workspaces}
  onSetTitle={setWorkspaceTitle}
  onSetColor={setWorkspaceColor}
  onSetPinnedRoot={(id, path) => {
    if (path) setPinnedRoot(id, path);
    else setPinnedRoot(id, "");  // or clear action — check setPinnedRoot signature
  }}
  onSetExplorerRootMode={handleChangeRootMode}
  onAddRunConfig={addRunConfig}
  onUpdateRunConfig={updateRunConfig}
  onRemoveRunConfig={removeRunConfig}
  onReorderRunConfigs={reorderRunConfigs}
/>
```

Destructure the new actions from `useWorkspaces()`.

- [ ] **Step 7: Remove "pinned" from FileExplorer.tsx**

In `src/modules/explorer/FileExplorer.tsx`, find the `ROOT_MODES` array (or similar constant). Remove any object with `id: "pinned"`. This is the dropdown in the explorer header — the "Workspace" and "Filesystem" options remain.

```bash
grep -n "pinned" src/modules/explorer/FileExplorer.tsx
```

Remove all `"pinned"` references.

- [ ] **Step 8: Verify**

```bash
pnpm check-types && pnpm test
```

Run `pnpm tauri dev`. Right-click workspace → "Workspace Settings". Verify:
- Name edits save correctly.
- Color palette chips update the sidebar in real-time.
- "Sin color" removes the stripe.
- Custom hex input works.
- Folder picker opens native OS dialog.
- Red border shows for non-existent paths.
- X button clears the path.

- [ ] **Step 9: Commit**

```bash
git add src/modules/workspaces/lib/workspaceSettingsStore.ts \
        src/app/components/WorkspaceSettingsDialog.tsx \
        src/modules/explorer/FileExplorer.tsx \
        src/app/App.tsx
git commit -m "feat(workspace): settings modal (name, color, working directory) + explorer pinned mode removal"
```

---

## Task 7: Run Configurations in the settings modal

**Files:**
- Modify: `src/app/components/WorkspaceSettingsDialog.tsx` — add Run Configs section
- Modify: `src/app/App.tsx` — no new wiring needed (props already passed in Task 6)

**Interfaces — Consumes:** `RunConfig` type (Task 1), `addRunConfig`, `updateRunConfig`, `removeRunConfig`, `reorderRunConfigs` (Task 1 via App.tsx Task 6)

- [ ] **Step 1: Add Run Configurations section to the modal**

In `WorkspaceSettingsForm` (inside `WorkspaceSettingsDialog.tsx`), add below the Working Directory section:

```tsx
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

The section UI:

```tsx
<div className="flex flex-col gap-2">
  <div className="flex items-center justify-between">
    <label className="text-xs font-medium">Run Configurations</label>
    <button
      type="button"
      onClick={() => {
        props.onAddRunConfig(ws.id, {
          id: crypto.randomUUID(),
          name: "",
          command: "",
        });
      }}
      className="text-[11px] text-primary hover:underline"
    >
      + Add
    </button>
  </div>

  <DndContext
    sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))}
    collisionDetection={closestCenter}
    onDragEnd={(event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        props.onReorderRunConfigs(ws.id, String(active.id), String(over.id));
      }
    }}
  >
    <SortableContext
      items={(ws.runConfigs ?? []).map((c) => c.id)}
      strategy={verticalListSortingStrategy}
    >
      {(ws.runConfigs ?? []).map((cfg) => (
        <RunConfigRow
          key={cfg.id}
          config={cfg}
          onUpdate={(patch) => props.onUpdateRunConfig(ws.id, cfg.id, patch)}
          onRemove={() => props.onRemoveRunConfig(ws.id, cfg.id)}
        />
      ))}
    </SortableContext>
  </DndContext>

  {(ws.runConfigs ?? []).length === 0 && (
    <p className="text-[11px] text-muted-foreground">No run configurations yet.</p>
  )}
</div>
```

- [ ] **Step 2: Implement RunConfigRow**

Add `RunConfigRow` in the same file:

```tsx
function RunConfigRow({
  config,
  onUpdate,
  onRemove,
}: {
  config: RunConfig;
  onUpdate: (patch: Partial<Omit<RunConfig, "id">>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: config.id });
  const [showCwd, setShowCwd] = useState(!!config.cwd);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex flex-col gap-1 rounded-md border border-border/60 p-2"
    >
      <div className="flex items-center gap-1">
        {/* drag handle */}
        <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
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

Check `DragDropVerticalIcon` — search for a drag/grip icon in `@hugeicons/core-free-icons`:
```bash
grep -rn "Drag\|Grip\|Handle" node_modules/@hugeicons/core-free-icons/dist/index.d.ts | grep -i "drag" | head -5
```

Use whichever drag-handle icon is available.

- [ ] **Step 3: Verify**

```bash
pnpm check-types && pnpm test
```

Run `pnpm tauri dev`. Open Workspace Settings. Add, edit, reorder, and remove run configurations. Verify they persist after closing and reopening the modal.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/WorkspaceSettingsDialog.tsx
git commit -m "feat(workspace): run configurations list in workspace settings modal"
```

---

## Task 8: Run button in header + isRunning state

**Files:**
- Modify: `src/modules/workspaces/lib/terminalEphemeralStore.ts`
- Create: `src/app/components/RunButton.tsx`
- Modify: `src/app/App.tsx`
- Modify: Header component (find path: `grep -rn "WorkspaceSidebar\|HeaderProps\|function Header" src/app --include="*.tsx" -l`)
- Modify: `docs/ARCHITECTURE.md`, `docs/IPC.md`, `docs/WORKSPACES.md`, `docs/FORK.md`

**Interfaces — Consumes:** `RunConfig` (Task 1), `setActiveRunConfig`, `updateRunConfig` (Task 1), `splitPaneAndOpenPanel`, `findPanelGlobal` (existing in useWorkspaces), `TerminalPaneHandle.write` (existing), OSC 133 `onRunningCommand` callback in App.tsx

- [ ] **Step 1: Add isRunning to terminalEphemeralStore.ts**

The file currently exports `runningCommands` state (a `Map<panelId, string>`). Add a parallel section for `runConfigRunning` — a `Map<panelId, boolean>` that only the Run button touches:

```typescript
// ── Run config running state ──────────────────────────────────────────────
// Only set to true by the Run button; set to false by OSC 133;D.
// Manual commands typed by the user do NOT touch this map.

const runConfigRunning = new Map<string, boolean>();
const rcListeners = new Set<Listener>();
let rcSnapshot: ReadonlyMap<string, boolean> = new Map();

function notifyRc(): void {
  rcSnapshot = new Map(runConfigRunning);
  for (const l of rcListeners) l();
}

export function subscribeToRunConfigRunning(listener: Listener): () => void {
  rcListeners.add(listener);
  return () => { rcListeners.delete(listener); };
}

export function getRunConfigRunningSnapshot(): ReadonlyMap<string, boolean> {
  return rcSnapshot;
}

export function setRunConfigRunning(panelId: string, running: boolean): void {
  if (running) {
    if (runConfigRunning.get(panelId) === true) return;
    runConfigRunning.set(panelId, true);
  } else {
    if (!runConfigRunning.has(panelId)) return;
    runConfigRunning.delete(panelId);
  }
  notifyRc();
}

export function clearRunConfigRunningEntry(panelId: string): void {
  if (!runConfigRunning.has(panelId)) return;
  runConfigRunning.delete(panelId);
  notifyRc();
}
```

- [ ] **Step 2: Hook isRunning into App.tsx onRunningCommand**

In `src/app/App.tsx`, find the `onRunningCommand` callback (around line 1605):

```typescript
onRunningCommand: (panelId, cmd) => {
  const found = findPanelGlobal(panelId);
  if (found) setTerminalRunningCommand(found.workspace.id, panelId, cmd);
},
```

Add the run config running state update. When `cmd === null` (command ended), check if this panel was a run-config terminal and clear its running flag:

```typescript
onRunningCommand: (panelId, cmd) => {
  const found = findPanelGlobal(panelId);
  if (found) setTerminalRunningCommand(found.workspace.id, panelId, cmd);
  // If a run config was running here and the command ended, clear the flag
  if (cmd === null && getRunConfigRunningSnapshot().has(panelId)) {
    setRunConfigRunning(panelId, false);
  }
},
```

Import `setRunConfigRunning`, `getRunConfigRunningSnapshot` from `@/modules/workspaces/lib/terminalEphemeralStore`.

- [ ] **Step 3: Add run config execution logic to App.tsx**

Add a `runWorkspaceConfig` callback in App.tsx:

```typescript
const runWorkspaceConfig = useCallback(
  async (config: RunConfig) => {
    if (!activeWorkspace) return;

    // If panel already exists, navigate to it
    if (config.panelId) {
      const found = findPanelGlobal(config.panelId);
      if (found) {
        setActiveWorkspaceId(found.workspace.id);
        // activate the panel's pane + the panel itself
        activatePanel(found.workspace.id, config.panelId);
        return;
      }
    }

    // Panel doesn't exist — split the active pane downward
    const activePaneId = activeWorkspace.activePaneId;
    const newPanelId = crypto.randomUUID();
    const panelCwd =
      config.cwd ?? activeWorkspace.pinnedRoot ?? activeWorkspace.cwd;

    splitPaneAndOpenPanel(activeWorkspace.id, activePaneId, "bottom", {
      id: newPanelId,
      kind: "terminal",
      cwd: panelCwd,
      dirty: false, // not used for terminal, but Panel type may need it — check Panel type
    } as Panel);

    // Save the panelId on the run config
    updateRunConfig(activeWorkspace.id, config.id, { panelId: newPanelId });

    // Mark as running
    setRunConfigRunning(newPanelId, true);

    // Write command to the terminal once its handle is registered
    // The handle registers when the component mounts (~100-200ms after state update)
    const tryWrite = (attempts = 0) => {
      const handle = terminalHandles.current.get(newPanelId);
      if (handle) {
        handle.write(config.command + "\r");
      } else if (attempts < 20) {
        setTimeout(() => tryWrite(attempts + 1), 100);
      }
    };
    setTimeout(tryWrite, 150);
  },
  [activeWorkspace, findPanelGlobal, setActiveWorkspaceId, activatePanel,
   splitPaneAndOpenPanel, updateRunConfig]
);

const stopWorkspaceConfig = useCallback(
  (config: RunConfig) => {
    if (!config.panelId) return;
    const handle = terminalHandles.current.get(config.panelId);
    handle?.write("\x03"); // Ctrl+C
    // isRunning will clear itself when OSC 133;D fires
  },
  []
);
```

Note: Check the actual `Panel` discriminated union — the `kind: "terminal"` variant may not require a `dirty` field. Look at how existing terminal panels are created in App.tsx (e.g., in `openNewTab`).

- [ ] **Step 4: Create RunButton.tsx**

Create `src/app/components/RunButton.tsx`:

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon, StopIcon, Settings01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
// verify exact icon names:
// grep -n "Play\|Stop\b" node_modules/@hugeicons/core-free-icons/dist/index.d.ts | head -10
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
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

export function RunButton({
  runConfigs, activeRunConfigId, onSelectConfig, onRun, onStop, onOpenSettings,
}: Props) {
  const runningMap = useSyncExternalStore(
    subscribeToRunConfigRunning,
    getRunConfigRunningSnapshot,
  );

  const activeConfig =
    runConfigs.find((c) => c.id === activeRunConfigId) ?? runConfigs[0];

  const isRunning = !!(activeConfig?.panelId && runningMap.get(activeConfig.panelId));

  // 0 configs
  if (runConfigs.length === 0) {
    return (
      <button
        type="button"
        title="Configure Run in Workspace Settings"
        onClick={onOpenSettings}
        className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
        <span>Run</span>
      </button>
    );
  }

  // 1 config — simple button
  if (runConfigs.length === 1 && activeConfig) {
    return (
      <button
        type="button"
        title={isRunning ? "Stop" : `Run: ${activeConfig.command}`}
        onClick={() => isRunning ? onStop(activeConfig) : onRun(activeConfig)}
        className={cn(
          "flex h-7 items-center gap-1 rounded px-2 text-[11px] transition-colors",
          isRunning
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <HugeiconsIcon
          icon={isRunning ? StopIcon : PlayIcon}
          size={13}
          strokeWidth={2}
        />
        <span className="max-w-[120px] truncate">{activeConfig.name || activeConfig.command}</span>
      </button>
    );
  }

  // 2+ configs — split button: [config selector ▼] [▶/■]
  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded-l px-2 text-[11px] text-muted-foreground hover:text-foreground border-r border-border/40"
          >
            <span className="max-w-[120px] truncate">
              {activeConfig?.name || activeConfig?.command || "Run"}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {runConfigs.map((cfg) => (
            <DropdownMenuItem key={cfg.id} onSelect={() => onSelectConfig(cfg.id)}>
              <span className={cn("flex-1", cfg.id === activeRunConfigId && "font-medium")}>
                {cfg.name || cfg.command}
              </span>
              {cfg.id === activeRunConfigId && (
                <HugeiconsIcon icon={PlayIcon} size={11} strokeWidth={2} className="text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {activeConfig && (
        <button
          type="button"
          title={isRunning ? "Stop" : "Run"}
          onClick={() => isRunning ? onStop(activeConfig) : onRun(activeConfig)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-r text-[11px] transition-colors",
            isRunning
              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <HugeiconsIcon
            icon={isRunning ? StopIcon : PlayIcon}
            size={13}
            strokeWidth={2}
          />
        </button>
      )}
    </div>
  );
}
```

Check that `PlayIcon` and `StopIcon` exist in `@hugeicons/core-free-icons`:
```bash
grep -n "PlayIcon\|StopIcon\|Play01Icon\|Stop01Icon" node_modules/@hugeicons/core-free-icons/dist/index.d.ts | head -5
```

Use the actual available icon names.

- [ ] **Step 5: Add RunButton to the Header**

Find the Header component:
```bash
grep -rn "function Header\|export.*Header" src/app --include="*.tsx" -l
```

Open the file. Find a good position in the header bar (right of the workspace title / left of search). Add:

```tsx
import { RunButton } from "@/app/components/RunButton";

// In the Header JSX, passing props from App.tsx:
<RunButton
  runConfigs={activeWorkspace?.runConfigs ?? []}
  activeRunConfigId={activeWorkspace?.activeRunConfigId}
  onSelectConfig={(id) => onSetActiveRunConfig(activeWorkspaceId, id)}
  onRun={onRunConfig}
  onStop={onStopConfig}
  onOpenSettings={() => onOpenWorkspaceSettings(activeWorkspaceId, "run-configs")}
/>
```

Adjust `Header`'s props interface to accept these new callbacks. Wire them in `App.tsx` where `<Header>` is rendered.

- [ ] **Step 6: validateRunConfigPanels on workspace load**

In `App.tsx`, find where workspaces are loaded/initialized. After the workspaces are set, call `validateRunConfigPanels` for each workspace to clear stale `panelId` references. The living panel IDs can be derived from the pane tree:

```typescript
useEffect(() => {
  workspaces.forEach((ws) => {
    const allPanelIds = new Set<string>();
    // collect all panel IDs from the pane tree
    for (const pane of allPanes(ws.paneTree)) {
      for (const panel of pane.panels) allPanelIds.add(panel.id);
    }
    validateRunConfigPanels(ws.id, allPanelIds);
  });
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // intentionally empty deps — runs only once at startup
```

- [ ] **Step 7: Update living docs**

In `docs/ARCHITECTURE.md`, under the `workspaces/` module description, add:
- New fields `color`, `runConfigs`, `activeRunConfigId` on `Workspace`
- `RunButton` in `header/` area
- `isRunning` flag in `terminalEphemeralStore`

In `docs/IPC.md`, add the new command:
```
window_save_workspace_sidebar(label: String, width: u32) → ()
  Persists the workspace sidebar pixel width for the given window label.
```

In `docs/WORKSPACES.md`, update `ExplorerRootMode` from 3 to 2 values and note the migration.

In `docs/FORK.md`, add F12 (Run configurations + Run button) as a feature added in this fork.

- [ ] **Step 8: Final checks**

```bash
pnpm exec biome lint ./src
pnpm check-types
pnpm test
cd src-tauri && cargo clippy && cargo test --locked
```

Fix any remaining errors.

- [ ] **Step 9: Commit docs + Run button**

```bash
git add src/modules/workspaces/lib/terminalEphemeralStore.ts \
        src/app/components/RunButton.tsx \
        src/app/App.tsx \
        docs/ARCHITECTURE.md \
        docs/IPC.md \
        docs/WORKSPACES.md \
        docs/FORK.md
git commit -m "feat(workspace): Run button in header + isRunning state via OSC 133 (F12)"
```

---

## Post-implementation

After all tasks are complete:
- Run full test suite one final time: `pnpm test && cargo test --locked`
- Verify manually: rename, settings modal, color, folder picker, sidebar resize, run config with stop, isRunning clears on process exit
- Merge `workspace-settings` worktree branch into `main`
