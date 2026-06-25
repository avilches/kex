# Undo Close Tab (F5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Cmd/Ctrl+Shift+T to reopen the last closed panel, restoring its type and context (cwd, path, etc.).

**Architecture:** A LIFO stack (cap 10) stored in a non-reactive `useRef` inside `useWorkspaces` captures each closed panel before `applyClosePanel` removes it. Pure helper functions (`captureClosedEntry`, `findReopenTarget`) encapsulate the logic and are unit-tested independently. A new `reopenClosed` callback consumes the stack and calls the existing `openPanel`. A new `tab.reopenClosed` shortcut wires the keyboard binding; `tab.newBlock` moves from Cmd+Shift+T to Cmd+B.

**Tech Stack:** React 19, TypeScript, Vitest, existing `useWorkspaces` hook pattern.

## Global Constraints

- No em-dash anywhere: code, comments, commits, docs.
- No emojis anywhere.
- Comments only when the WHY is non-obvious (1 line max).
- All imports use `@/...` alias on the frontend, never relative across modules.
- pnpm only (never npm/npx/yarn).
- Shortcuts never hardcoded: all bindings live in `src/modules/shortcuts/shortcuts.ts`.
- No persistence of the closed-tab stack (ephemeral state, never written to `workspace-state.json`).

---

### Task 1: Rebind `tab.newBlock` and register `tab.reopenClosed` shortcut

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`

**Interfaces:**
- Produces: `ShortcutId` union includes `"tab.reopenClosed"`. The `SHORTCUTS` array has `tab.newBlock` bound to `Cmd+B`/`Ctrl+B` and `tab.reopenClosed` bound to `Cmd+Shift+T`/`Ctrl+Shift+T`.

- [ ] **Step 1: Add `"tab.reopenClosed"` to the `ShortcutId` union type**

  In `src/modules/shortcuts/shortcuts.ts`, locate the `ShortcutId` type (around line 14) and add the new id after `"tab.close"`:

  ```ts
  // Before (line 14):
  | "tab.close"
  | "tab.rename"
  
  // After:
  | "tab.close"
  | "tab.reopenClosed"
  | "tab.rename"
  ```

- [ ] **Step 2: Move `tab.newBlock` binding from Cmd+Shift+T to Cmd+B**

  Locate the `tab.newBlock` entry in the `SHORTCUTS` array (around line 227):

  ```ts
  // Before:
  {
    id: "tab.newBlock",
    label: "New Blocks Terminal",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "t" }],
  },

  // After:
  {
    id: "tab.newBlock",
    label: "New Blocks Terminal",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "b" }],
  },
  ```

- [ ] **Step 3: Add `tab.reopenClosed` entry to the SHORTCUTS array**

  Add a new entry immediately after the `tab.close` entry (around line 250):

  ```ts
  {
    id: "tab.reopenClosed",
    label: "Reopen Closed Tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "t" }],
  },
  ```

- [ ] **Step 4: Run type check to verify no errors**

  ```bash
  pnpm check-types
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/modules/shortcuts/shortcuts.ts
  git commit -m "feat(shortcuts): move newBlock to Cmd+B, add tab.reopenClosed Cmd+Shift+T"
  ```

---

### Task 2: Pure history helpers and unit tests

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type ClosedEntry = { panel: Panel; paneId: string; workspaceId: string };

  // useWorkspaces.ts (exported pure functions)
  export function captureClosedEntry(
    entries: ClosedEntry[],
    entry: ClosedEntry,
    cap?: number,         // default 10
  ): ClosedEntry[]

  export function findReopenTarget(
    workspaces: Workspace[],
    activeWorkspaceId: string,
    entry: ClosedEntry,
  ): { workspaceId: string; paneId: string } | null
  ```

- [ ] **Step 1: Add `ClosedEntry` type to `types.ts`**

  Append at the end of `src/modules/workspaces/lib/types.ts`:

  ```ts
  export type ClosedEntry = {
    panel: Panel;
    paneId: string;
    workspaceId: string;
  };
  ```

- [ ] **Step 2: Write the failing tests for `captureClosedEntry` and `findReopenTarget`**

  First, update the existing import lines at the top of `src/modules/workspaces/lib/useWorkspaces.test.ts` to include the new type and functions (merge into the lines already there - do not add duplicate import lines):

  ```ts
  // Existing line 2 - add ClosedEntry:
  import type { ClosedEntry, Panel, SplitNode, Workspace } from "./types";

  // Existing line 3 - add the two new functions:
  import { applyClosePanel, applyExplorerRootMode, applyFsRoot, applyGitConfig, applyPinnedRoot, captureClosedEntry, collectRunningTerminals, findReopenTarget } from "./useWorkspaces";
  ```

  Then add these two `describe` blocks at the end of the file:

  describe("captureClosedEntry", () => {
    const entry = (id: string): ClosedEntry => ({
      panel: { id, kind: "terminal" },
      paneId: "p1",
      workspaceId: "w1",
    });

    it("prepends the new entry (LIFO order)", () => {
      const out = captureClosedEntry([entry("t1")], entry("t2"));
      expect(out.map((e) => e.panel.id)).toEqual(["t2", "t1"]);
    });

    it("enforces the cap by dropping the oldest entry", () => {
      const initial = Array.from({ length: 10 }, (_, i) => entry(`t${i}`));
      const out = captureClosedEntry(initial, entry("t10"));
      expect(out).toHaveLength(10);
      expect(out[0].panel.id).toBe("t10");
      expect(out[9].panel.id).toBe("t8");
    });

    it("starts from empty correctly", () => {
      const out = captureClosedEntry([], entry("t1"));
      expect(out).toEqual([entry("t1")]);
    });
  });

  describe("findReopenTarget", () => {
    const makeWs = (id: string, paneId: string): Workspace => ({
      id,
      title: "W",
      paneTree: { kind: "pane", id: paneId, panels: [], activePanelId: null },
      activePaneId: paneId,
    });

    it("returns the original workspace and pane when both exist", () => {
      const workspaces = [makeWs("w1", "p1")];
      const entry: ClosedEntry = {
        panel: { id: "t1", kind: "terminal" },
        paneId: "p1",
        workspaceId: "w1",
      };
      expect(findReopenTarget(workspaces, "w1", entry)).toEqual({
        workspaceId: "w1",
        paneId: "p1",
      });
    });

    it("falls back to active pane when the original pane no longer exists", () => {
      const workspaces = [makeWs("w1", "p2")]; // p1 was destroyed, now p2 is active
      const entry: ClosedEntry = {
        panel: { id: "t1", kind: "terminal" },
        paneId: "p1",
        workspaceId: "w1",
      };
      expect(findReopenTarget(workspaces, "w1", entry)).toEqual({
        workspaceId: "w1",
        paneId: "p2",
      });
    });

    it("falls back to the active workspace when the original workspace was closed", () => {
      const workspaces = [makeWs("w2", "p3")]; // w1 is gone
      const entry: ClosedEntry = {
        panel: { id: "t1", kind: "terminal" },
        paneId: "p1",
        workspaceId: "w1",
      };
      expect(findReopenTarget(workspaces, "w2", entry)).toEqual({
        workspaceId: "w2",
        paneId: "p3",
      });
    });

    it("returns null when no workspaces exist", () => {
      const entry: ClosedEntry = {
        panel: { id: "t1", kind: "terminal" },
        paneId: "p1",
        workspaceId: "w1",
      };
      expect(findReopenTarget([], "w1", entry)).toBeNull();
    });
  });
  ```

- [ ] **Step 3: Run tests to confirm they fail (functions not yet exported)**

  ```bash
  pnpm test --run src/modules/workspaces/lib/useWorkspaces.test.ts
  ```

  Expected: errors about `captureClosedEntry` and `findReopenTarget` not being exported.

- [ ] **Step 4: Add `captureClosedEntry` and `findReopenTarget` to `useWorkspaces.ts`**

  Add these two exported pure functions just before the `withNewTabAutofocus` function at the top of `src/modules/workspaces/lib/useWorkspaces.ts` (before the existing imports use `findPanelPane` / `findPane` which are already imported):

  ```ts
  import type { ClosedEntry } from "./types";   // add to existing type import line

  export function captureClosedEntry(
    entries: ClosedEntry[],
    entry: ClosedEntry,
    cap = 10,
  ): ClosedEntry[] {
    return [entry, ...entries].slice(0, cap);
  }

  export function findReopenTarget(
    workspaces: Workspace[],
    activeWorkspaceId: string,
    entry: ClosedEntry,
  ): { workspaceId: string; paneId: string } | null {
    const targetWs =
      workspaces.find((w) => w.id === entry.workspaceId) ??
      workspaces.find((w) => w.id === activeWorkspaceId);
    if (!targetWs) return null;
    const pane = findPane(targetWs.paneTree, entry.paneId);
    return {
      workspaceId: targetWs.id,
      paneId: pane ? entry.paneId : targetWs.activePaneId,
    };
  }
  ```

  `findPane` is already imported from `./splitNode` in `useWorkspaces.ts`. `ClosedEntry` and `Workspace` types are already/will-be imported from `./types`.

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm test --run src/modules/workspaces/lib/useWorkspaces.test.ts
  ```

  Expected: all tests pass including the new `captureClosedEntry` and `findReopenTarget` suites.

- [ ] **Step 6: Commit**

  ```bash
  git add src/modules/workspaces/lib/types.ts \
          src/modules/workspaces/lib/useWorkspaces.ts \
          src/modules/workspaces/lib/useWorkspaces.test.ts
  git commit -m "feat(workspaces): add ClosedEntry type and pure history helpers"
  ```

---

### Task 3: Wire history into the hook and add App.tsx shortcut handler

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes:
  - `captureClosedEntry(entries, entry, cap): ClosedEntry[]` (Task 2)
  - `findReopenTarget(workspaces, activeWorkspaceId, entry): { workspaceId, paneId } | null` (Task 2)
  - `ClosedEntry` type (Task 2)
  - `"tab.reopenClosed"` shortcut id (Task 1)
- Produces:
  - `useWorkspaces` return object gains `reopenClosed: () => void`
  - `App.tsx` shortcut handler map handles `"tab.reopenClosed"`

- [ ] **Step 1: Add `closedPanelsRef` inside `useWorkspaces` and capture on `closePanel`**

  In `src/modules/workspaces/lib/useWorkspaces.ts`, inside the `useWorkspaces` function body, add the ref right after `previousWorkspaceIdRef` (around line 198):

  ```ts
  const closedPanelsRef = useRef<ClosedEntry[]>([]);
  ```

  Then modify the `closePanel` callback (around line 418) to capture before removing:

  ```ts
  // Before:
  const closePanel = useCallback((workspaceId: string, panelId: string) => {
    setWorkspaces((prev) => applyClosePanel(prev, workspaceId, panelId));
  }, []);

  // After:
  const closePanel = useCallback((workspaceId: string, panelId: string) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (ws) {
      const found = findPanelPane(ws.paneTree, panelId);
      if (found) {
        closedPanelsRef.current = captureClosedEntry(closedPanelsRef.current, {
          panel: found.panel,
          paneId: found.pane.id,
          workspaceId,
        });
      }
    }
    setWorkspaces((prev) => applyClosePanel(prev, workspaceId, panelId));
  }, []);
  ```

  `findPanelPane` and `workspacesRef` are already available in scope.

- [ ] **Step 2: Add `reopenClosed` callback**

  Add the following callback immediately after the `closePanel` callback:

  ```ts
  const reopenClosed = useCallback(() => {
    const [entry, ...rest] = closedPanelsRef.current;
    if (!entry) return;
    const target = findReopenTarget(workspacesRef.current, activeWorkspaceId, entry);
    if (!target) return;
    closedPanelsRef.current = rest;
    const newPanel: Panel = { ...entry.panel, id: newPanelId() };
    openPanel(target.workspaceId, target.paneId, newPanel);
  }, [openPanel, activeWorkspaceId]);
  ```

  `newPanelId` is already imported from `@/lib/ids` at the top of the file. `activeWorkspaceId` is the state variable declared earlier in the hook.

- [ ] **Step 3: Expose `reopenClosed` in the hook's return object**

  In the `return { ... }` block at the bottom of `useWorkspaces`, add `reopenClosed` after `closePanel`:

  ```ts
  closePanel,
  reopenClosed,
  ```

- [ ] **Step 4: Run type check and tests**

  ```bash
  pnpm check-types && pnpm test --run
  ```

  Expected: no type errors, 496+ tests passing.

- [ ] **Step 5: Add `"tab.reopenClosed"` handler in `App.tsx`**

  In `src/app/App.tsx`, find where `reopenClosed` is destructured from `useWorkspaces` (near the other callbacks around line 167). Add it:

  ```ts
  // Locate the existing destructure of useWorkspaces return values, e.g.:
  const {
    // ... existing items ...
    closePanel,
    // add:
    reopenClosed,
    // ...
  } = useWorkspaces(...);
  ```

  Then in the `shortcutHandlers` useMemo (around line 1757), add the handler after `"tab.close"` handling:

  ```ts
  "tab.reopenClosed": () => {
    if (activeWorkspace) reopenClosed();
  },
  ```

  Add `reopenClosed` to the `useMemo` dependency array of `shortcutHandlers`.

- [ ] **Step 6: Run full check**

  ```bash
  pnpm check-types && pnpm test --run
  ```

  Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/modules/workspaces/lib/useWorkspaces.ts src/app/App.tsx
  git commit -m "feat(workspaces): implement reopenClosed and wire Cmd+Shift+T shortcut"
  ```

---

### Task 4: Remove F5 from PENDING.md

**Files:**
- Modify: `docs/PENDING.md`

- [ ] **Step 1: Remove the F5 entry from PENDING.md**

  In `docs/PENDING.md`, remove the line:

  ```
  - [F5](pending/features/F5-reabrir-tab-cerrado.md) — Reabrir tab cerrado
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/PENDING.md
  git commit -m "docs(pending): remove F5 (reopen closed tab, now implemented)"
  ```
