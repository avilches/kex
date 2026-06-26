# Terminal New Folder Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Open new terminals in" setting with two options: "Current folder" (inherits cwd from active terminal or editor) and "Workspace folder" (always opens at the workspace root).

**Architecture:** Add `TerminalNewFolderMode` preference to `store.ts` following the established writePref/PREF_KEY_MAP/parseXxx pattern. In `App.tsx`, compute a `contextCwdRef` that captures cwd from both terminal and editor panels, then gate the four terminal-creation callbacks on the new preference. Add a `SettingRow` with a `Select` in `TerminalSection.tsx` after "Default shell".

**Tech Stack:** React 19, TypeScript, Zustand (`usePreferencesStore`), `tauri-plugin-store` via `LazyStore`.

## Global Constraints

- No em-dash anywhere in code, comments, or strings.
- No emojis anywhere.
- Imports always `@/...` on the frontend, never relative across modules.
- All frontend checks must pass: `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Working directory for all commands: `.claude/worktrees/open-terminal-in`.

---

### Task 1: Add `terminalNewFolderMode` preference to `store.ts`

**Files:**
- Modify: `src/modules/settings/store.ts`
- Test: `src/modules/settings/store.test.ts`

**Interfaces:**
- Produces:
  - `type TerminalNewFolderMode = "workspace" | "context"` (exported)
  - `parseTerminalNewFolderMode(value: unknown): TerminalNewFolderMode` (exported)
  - `setTerminalNewFolderMode(v: TerminalNewFolderMode): Promise<void>` (exported)
  - `DEFAULT_PREFERENCES.terminalNewFolderMode === "context"`
  - `usePreferencesStore((s) => s.terminalNewFolderMode)` returns `TerminalNewFolderMode`

- [ ] **Step 1: Write the failing test**

Add to `src/modules/settings/store.test.ts` after the `scmViewMode` describe block:

```ts
describe("terminalNewFolderMode", () => {
  it("defaults to context", () => {
    expect(DEFAULT_PREFERENCES.terminalNewFolderMode).toBe("context");
  });

  it("parses only the exact 'workspace' string as workspace", () => {
    expect(parseTerminalNewFolderMode("workspace")).toBe("workspace");
    expect(parseTerminalNewFolderMode("context")).toBe("context");
    expect(parseTerminalNewFolderMode("WORKSPACE")).toBe("context");
    expect(parseTerminalNewFolderMode(undefined)).toBe("context");
    expect(parseTerminalNewFolderMode(null)).toBe("context");
    expect(parseTerminalNewFolderMode(42)).toBe("context");
  });
});
```

Also add `parseTerminalNewFolderMode` to the import at the top of `store.test.ts`:

```ts
import {
  clampToStep,
  CURSOR_INACTIVE_STYLE_DEFAULT,
  CURSOR_STYLE_DEFAULT,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  LETTER_SPACING_STEP,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  parseCursorInactiveStyle,
  parseCursorStyle,
  parseScmViewMode,
  parseTerminalNewFolderMode,
  DEFAULT_PREFERENCES,
} from "./store";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- --reporter=verbose store.test
```

Expected: FAIL -- `parseTerminalNewFolderMode` not exported from `./store`.

- [ ] **Step 3: Implement in `store.ts`**

**3a. Add the type and parser** -- after the `ScmViewMode` type (around line 16):

```ts
export type TerminalNewFolderMode = "workspace" | "context";
```

**3b. Add the parser function** -- after `parseScmViewMode` (around line 388):

```ts
export function parseTerminalNewFolderMode(value: unknown): TerminalNewFolderMode {
  return value === "workspace" ? "workspace" : "context";
}
```

**3c. Add the storage key constant** -- after `KEY_KEEP_FOLDER_LAYOUT` (around line 226):

```ts
const KEY_TERMINAL_NEW_FOLDER_MODE = "terminalNewFolderMode";
```

**3d. Add field to the `Preferences` type** -- after `terminalScrollSensitivity` (around line 149):

```ts
  terminalNewFolderMode: TerminalNewFolderMode;
```

**3e. Add default** -- in `DEFAULT_PREFERENCES`, after `terminalScrollSensitivity` (around line 345):

```ts
  terminalNewFolderMode: "context",
```

**3f. Add load entry** -- in `loadPreferences()`, after the `terminalScrollSensitivity` block (around line 514):

```ts
    terminalNewFolderMode: parseTerminalNewFolderMode(
      get<string>(KEY_TERMINAL_NEW_FOLDER_MODE),
    ),
```

**3g. Add to PREF_KEY_MAP** -- after `[KEY_TAB_BAR_STYLE]: "tabBarStyle"` (around line 1027):

```ts
  [KEY_TERMINAL_NEW_FOLDER_MODE]: "terminalNewFolderMode",
```

**3h. Add setter** -- after `setWarnOnCloseWorkspace` (around line 735):

```ts
export async function setTerminalNewFolderMode(
  value: TerminalNewFolderMode,
): Promise<void> {
  await writePref(KEY_TERMINAL_NEW_FOLDER_MODE, value);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- --reporter=verbose store.test
```

Expected: all tests pass including the two new `terminalNewFolderMode` ones.

- [ ] **Step 5: Check types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/settings/store.ts src/modules/settings/store.test.ts
git commit -m "feat(settings): add terminalNewFolderMode preference"
```

---

### Task 2: Wire the preference in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes:
  - `TerminalNewFolderMode` from `@/modules/settings/store`
  - `usePreferencesStore` (already imported in `App.tsx`)
- No new exports (internal wiring only).

- [ ] **Step 1: Add `contextCwdRef`**

In `src/app/App.tsx`, find the block where `activeCwd` is calculated (around line 214):

```ts
const activeCwd = isTerminalPanel
  ? ((activePanel as { cwd?: string }).cwd ?? null)
  : null;
activeCwdRef.current = activeCwd;
```

Add `contextCwdRef` immediately after:

```ts
const contextCwd =
  activePanel?.kind === "terminal"
    ? (activePanel.cwd ?? null)
    : activePanel && "path" in activePanel
      ? (activePanel.path.split(/[\\/]/).slice(0, -1).join("/") || null)
      : null;
const contextCwdRef = useRef<string | null>(null);
contextCwdRef.current = contextCwd;
```

- [ ] **Step 2: Update `openNewTerminal`**

Find `openNewTerminal` (around line 665):

```ts
const openNewTerminal = useCallback(
  (targetPaneId?: string, targetWsId?: string) => {
    const ws = targetWsId
      ? workspacesRef.current.find((w) => w.id === targetWsId)
      : workspacesRef.current.find(
          (w) => w.id === activeWorkspaceIdRef.current,
        );
    if (!ws) return;
    openPanel(ws.id, targetPaneId ?? ws.activePaneId, {
      id: newPanelId(),
      kind: "terminal",
      cwd: activeCwdRef.current ?? ws.cwd,
    });
  },
  [openPanel],
);
```

Replace the `cwd` line:

```ts
const openNewTerminal = useCallback(
  (targetPaneId?: string, targetWsId?: string) => {
    const ws = targetWsId
      ? workspacesRef.current.find((w) => w.id === targetWsId)
      : workspacesRef.current.find(
          (w) => w.id === activeWorkspaceIdRef.current,
        );
    if (!ws) return;
    const { terminalNewFolderMode } = usePreferencesStore.getState();
    const cwd =
      terminalNewFolderMode === "workspace"
        ? ws.cwd
        : (contextCwdRef.current ?? ws.cwd);
    openPanel(ws.id, targetPaneId ?? ws.activePaneId, {
      id: newPanelId(),
      kind: "terminal",
      cwd,
    });
  },
  [openPanel],
);
```

- [ ] **Step 3: Update `openNewBlock`**

Find `openNewBlock` (around line 682):

```ts
const openNewBlock = useCallback(
  (targetPaneId?: string) => {
    if (!activeWorkspace) return;
    openPanel(
      activeWorkspace.id,
      targetPaneId ?? activeWorkspace.activePaneId,
      {
        id: newPanelId(),
        kind: "terminal",
        blocks: true,
        cwd: activeCwd ?? activeWorkspace.cwd,
      },
    );
  },
  [activeWorkspace, activeCwd, openPanel],
);
```

Replace the `cwd` line and update the dependency array:

```ts
const openNewBlock = useCallback(
  (targetPaneId?: string) => {
    if (!activeWorkspace) return;
    const { terminalNewFolderMode } = usePreferencesStore.getState();
    const cwd =
      terminalNewFolderMode === "workspace"
        ? activeWorkspace.cwd
        : (contextCwd ?? activeWorkspace.cwd);
    openPanel(
      activeWorkspace.id,
      targetPaneId ?? activeWorkspace.activePaneId,
      {
        id: newPanelId(),
        kind: "terminal",
        blocks: true,
        cwd,
      },
    );
  },
  [activeWorkspace, contextCwd, openPanel],
);
```

- [ ] **Step 4: Update `onSplitTerminalRightStable`**

Find the callback (around line 906). It contains:

```ts
      openPanel(wsId, newPaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd: activeCwdRef.current ?? ws.cwd,
      });
```

Replace the `cwd` line only:

```ts
      const { terminalNewFolderMode } = usePreferencesStore.getState();
      openPanel(wsId, newPaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd:
          terminalNewFolderMode === "workspace"
            ? ws.cwd
            : (contextCwdRef.current ?? ws.cwd),
      });
```

- [ ] **Step 5: Update `onSplitTerminalDownStable`**

Find the callback (around line 933). It contains the same pattern:

```ts
      openPanel(wsId, newPaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd: activeCwdRef.current ?? ws.cwd,
      });
```

Replace the `cwd` line the same way:

```ts
      const { terminalNewFolderMode } = usePreferencesStore.getState();
      openPanel(wsId, newPaneId, {
        id: newPanelId(),
        kind: "terminal",
        cwd:
          terminalNewFolderMode === "workspace"
            ? ws.cwd
            : (contextCwdRef.current ?? ws.cwd),
      });
```

- [ ] **Step 6: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(terminal): use terminalNewFolderMode when opening new terminals"
```

---

### Task 3: Add the UI in `TerminalSection.tsx`

**Files:**
- Modify: `src/settings/sections/TerminalSection.tsx`

**Interfaces:**
- Consumes:
  - `TerminalNewFolderMode` from `@/modules/settings/store`
  - `setTerminalNewFolderMode` from `@/modules/settings/store`
  - `usePreferencesStore` (already imported via `@/modules/settings/preferences`)

- [ ] **Step 1: Add imports to `TerminalSection.tsx`**

Find the existing import from `@/modules/settings/store`:

```ts
import {
  type CursorInactiveStyle,
  type CursorStyle,
  CURSOR_INACTIVE_STYLES,
  CURSOR_STYLES,
  ...
  setTerminalShell,
  setTerminalWebglEnabled,
  setWarnOnCloseTabWithRunningProcess,
} from "@/modules/settings/store";
```

Add the two new exports:

```ts
import {
  type CursorInactiveStyle,
  type CursorStyle,
  type TerminalNewFolderMode,
  CURSOR_INACTIVE_STYLES,
  CURSOR_STYLES,
  ...
  setTerminalNewFolderMode,
  setTerminalShell,
  setTerminalWebglEnabled,
  setWarnOnCloseTabWithRunningProcess,
} from "@/modules/settings/store";
```

- [ ] **Step 2: Read the preference in the component**

Inside `TerminalSection`, after `const terminalShell = ...` (around line 104):

```ts
const terminalNewFolderMode = usePreferencesStore(
  (s) => s.terminalNewFolderMode,
);
```

- [ ] **Step 3: Add the SettingRow**

In the JSX, after the closing `</SettingRow>` of "Default shell" and before the `<div className="flex flex-col gap-2">` that starts the Font section, add:

```tsx
<SettingRow
  title="Open new terminals in"
  description="Where new terminal tabs and splits open."
>
  <Select
    value={terminalNewFolderMode}
    onValueChange={(v) =>
      void setTerminalNewFolderMode(v as TerminalNewFolderMode)
    }
  >
    <SelectTrigger size="sm" className="h-8 w-52 text-[12px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="context" className="text-[12px]">
        Current folder
        <span className="block text-[10px] text-muted-foreground leading-tight">
          based on the terminal cwd or the path in the editor
        </span>
      </SelectItem>
      <SelectItem value="workspace" className="text-[12px]">
        Workspace folder
      </SelectItem>
    </SelectContent>
  </Select>
</SettingRow>
```

- [ ] **Step 4: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/settings/sections/TerminalSection.tsx
git commit -m "feat(settings): add Open new terminals in setting to Terminal section"
```

---

## Self-Review

**Spec coverage:**
- [x] `TerminalNewFolderMode` type and parser -- Task 1
- [x] `terminalNewFolderMode` in `Preferences`, `DEFAULT_PREFERENCES`, `loadPreferences`, `PREF_KEY_MAP`, setter -- Task 1
- [x] `contextCwdRef` covering terminal cwd and editor/markdown/git-diff dirname -- Task 2
- [x] `openNewTerminal` gated on preference -- Task 2
- [x] `openNewBlock` gated on preference -- Task 2
- [x] `onSplitTerminalRightStable` gated on preference -- Task 2
- [x] `onSplitTerminalDownStable` gated on preference -- Task 2
- [x] `SettingRow` with `Select` after "Default shell" in `TerminalSection.tsx` -- Task 3
- [x] Secondary text "based on the terminal cwd or the path in the editor" under "Current folder" -- Task 3

**Edge cases from spec:**
- Workspace with no `cwd`: both modes produce `undefined` -- correctly propagated as `ws.cwd` (undefined).
- Editor at root (path = `/foo.txt`): `"".split(...).slice(0,-1).join("/")` = `""`, coerced to `null` via `|| null`, falls back to `ws.cwd`. Correct.
- Active panel is browser or git-history: `contextCwd` = `null`, falls back to `ws.cwd`. Correct.

**No placeholders found.**

**Type consistency:** `TerminalNewFolderMode`, `parseTerminalNewFolderMode`, `setTerminalNewFolderMode`, `contextCwdRef`, `terminalNewFolderMode` are used consistently across all three tasks.
