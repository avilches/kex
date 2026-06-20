# File System mode navigable per-workspace root — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the explorer's File System mode its own navigable root per workspace (default home), with double-click-to-enter, an up button, and a home button.

**Architecture:** A new `fsRoot` field on `Workspace` (persisted with workspace state) feeds `resolveExplorerRoot` in `filesystem` mode. App.tsx owns three handlers (enter / up / home), gated to File System mode, and derives `canNavigateUp` / `isAtHome` predicates. The explorer header renders up/home buttons (left of the selector) only in File System mode; `TreeRow` double-click enters folders. A JSON-only preference `keepFolderLayoutOnChangeExplorerRoot` gates the existing per-root expansion cache.

**Tech Stack:** React 19 + TypeScript, Zustand preferences store, `tauri-plugin-store`, Vitest, hugeicons.

## Global Constraints

- No em-dash anywhere (code, comments, commits, docs). No emojis.
- Imports always `@/...`, never relative across modules.
- Comments default to none; only `why`, never `what`.
- pnpm only. Frontend checks: `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Canonical frontend paths are forward-slash; normalize separators with `.split(/[\\/]/)` / the `pathUtils` helpers, never `.split("/")`.
- Shortcuts are out of scope here (no keybindings added).
- Commit messages in English, atomic (one logical change per commit).

---

### Task 1: `resolveExplorerRoot` + path helpers (functional core)

**Files:**
- Modify: `src/modules/workspaces/lib/explorerRoot.ts`
- Test: `src/modules/workspaces/lib/explorerRoot.test.ts`

**Interfaces:**
- Produces:
  - `resolveExplorerRoot(input)` where `input` now includes `fsRoot: string | null`; in `filesystem` mode returns `fsRoot ?? home`.
  - `isFilesystemRoot(path: string): boolean` — true for `/` and a Windows drive root (`C:` or `C:/`).
  - `parentRoot(path: string): string` — parent dir, normalizing a bare drive (`C:`) back to `C:/`.

- [ ] **Step 1: Update the failing tests**

Replace the body of `explorerRoot.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  isFilesystemRoot,
  parentRoot,
  resolveExplorerRoot,
} from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    terminalCwd: "/proj/sub",
    gitRoot: "/proj",
    pinnedRoot: "/pinned",
    fsRoot: null as string | null,
    home: "/home/u",
  };

  it("terminal mode follows the terminal cwd", () => {
    expect(resolveExplorerRoot({ ...base, mode: "terminal" })).toBe("/proj/sub");
  });

  it("terminal mode falls back to home when no cwd", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "terminal", terminalCwd: null }),
    ).toBe("/home/u");
  });

  it("git mode uses the known git root", () => {
    expect(resolveExplorerRoot({ ...base, mode: "git" })).toBe("/proj");
  });

  it("git mode falls back to terminal cwd when no git root", () => {
    expect(resolveExplorerRoot({ ...base, mode: "git", gitRoot: null })).toBe(
      "/proj/sub",
    );
  });

  it("git mode falls back to home when no git root and no cwd", () => {
    expect(
      resolveExplorerRoot({
        ...base,
        mode: "git",
        gitRoot: null,
        terminalCwd: null,
      }),
    ).toBe("/home/u");
  });

  it("filesystem mode returns fsRoot when set", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "filesystem", fsRoot: "/proj/sub" }),
    ).toBe("/proj/sub");
  });

  it("filesystem mode falls back to home when fsRoot is null", () => {
    expect(resolveExplorerRoot({ ...base, mode: "filesystem" })).toBe(
      "/home/u",
    );
  });

  it("pinned mode returns the pinned path", () => {
    expect(resolveExplorerRoot({ ...base, mode: "pinned" })).toBe("/pinned");
  });

  it("pinned mode returns null when nothing is pinned", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "pinned", pinnedRoot: null }),
    ).toBeNull();
  });
});

describe("isFilesystemRoot", () => {
  it("treats unix root as top", () => {
    expect(isFilesystemRoot("/")).toBe(true);
  });
  it("treats a windows drive root as top", () => {
    expect(isFilesystemRoot("C:/")).toBe(true);
    expect(isFilesystemRoot("C:")).toBe(true);
  });
  it("a normal path is not a root", () => {
    expect(isFilesystemRoot("/home/u")).toBe(false);
    expect(isFilesystemRoot("C:/Users")).toBe(false);
  });
});

describe("parentRoot", () => {
  it("climbs a unix path", () => {
    expect(parentRoot("/home/u")).toBe("/home");
    expect(parentRoot("/home")).toBe("/");
  });
  it("normalizes a windows drive parent back to drive root", () => {
    expect(parentRoot("C:/Users")).toBe("C:/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- explorerRoot`
Expected: FAIL (missing `fsRoot` in input type / `isFilesystemRoot` and `parentRoot` not exported).

- [ ] **Step 3: Implement**

Replace `explorerRoot.ts` with:

```ts
import { pathDirname } from "@/lib/pathUtils";

export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;
  gitRoot: string | null;
  pinnedRoot: string | null;
  fsRoot: string | null;
  home: string | null;
};

export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null {
  switch (r.mode) {
    case "filesystem":
      return r.fsRoot ?? r.home;
    case "pinned":
      return r.pinnedRoot;
    case "git":
      return r.gitRoot ?? r.terminalCwd ?? r.home;
    case "terminal":
    default:
      return r.terminalCwd ?? r.home;
  }
}

const DRIVE_ROOT = /^[A-Za-z]:\/?$/;
const BARE_DRIVE = /^[A-Za-z]:$/;

export function isFilesystemRoot(path: string): boolean {
  return path === "/" || DRIVE_ROOT.test(path);
}

export function parentRoot(path: string): string {
  const parent = pathDirname(path);
  return BARE_DRIVE.test(parent) ? `${parent}/` : parent;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- explorerRoot`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/lib/explorerRoot.ts src/modules/workspaces/lib/explorerRoot.test.ts
git commit -m "feat(explorer): resolve filesystem root from fsRoot with up-navigation helpers"
```

---

### Task 2: `fsRoot` workspace field + `applyFsRoot` setter

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts:31-39`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts` (add `applyFsRoot`, `setFsRoot`)
- Test: `src/modules/workspaces/lib/useWorkspaces.test.ts`

**Interfaces:**
- Consumes: `Workspace` type, existing `applyPinnedRoot` pattern.
- Produces:
  - `Workspace.fsRoot?: string`
  - `applyFsRoot(workspaces, workspaceId, path): Workspace[]` — sets `fsRoot` (trailing slash stripped) on the matching workspace only; does NOT change `explorerRootMode`.
  - hook method `setFsRoot(workspaceId: string, path: string): void`.

- [ ] **Step 1: Write the failing test**

Append to `useWorkspaces.test.ts` (and add `applyFsRoot` to the import on line 3):

```ts
describe("applyFsRoot", () => {
  it("sets fsRoot on the matching workspace only and keeps the mode", () => {
    const out = applyFsRoot([ws(), ws({ id: "w2" })], "w1", "/some/dir");
    expect(out[0].fsRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBeUndefined();
    expect(out[1].fsRoot).toBeUndefined();
  });

  it("strips a trailing slash from fsRoot", () => {
    const out = applyFsRoot([ws()], "w1", "/some/dir/");
    expect(out[0].fsRoot).toBe("/some/dir");
  });

  it("keeps the root slash for the filesystem root", () => {
    const out = applyFsRoot([ws()], "w1", "/");
    expect(out[0].fsRoot).toBe("/");
  });
});
```

Update the import line:

```ts
import { applyExplorerRootMode, applyFsRoot, applyPinnedRoot } from "./useWorkspaces";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- useWorkspaces`
Expected: FAIL (`applyFsRoot` not exported).

- [ ] **Step 3: Add the `fsRoot` field to the type**

In `src/modules/workspaces/lib/types.ts`, inside the `Workspace` type (after `pinnedRoot?: string;`):

```ts
  pinnedRoot?: string;
  fsRoot?: string;
```

- [ ] **Step 4: Implement `applyFsRoot` and `setFsRoot`**

In `useWorkspaces.ts`, after `applyPinnedRoot` (around line 47) add:

```ts
export function applyFsRoot(
  workspaces: Workspace[],
  workspaceId: string,
  path: string,
): Workspace[] {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, fsRoot: normalized } : w,
  );
}
```

After the `setPinnedRoot` callback (around line 440) add:

```ts
  const setFsRoot = useCallback((workspaceId: string, path: string) => {
    setWorkspaces((prev) => applyFsRoot(prev, workspaceId, path));
  }, []);
```

In the hook's returned object (after `setPinnedRoot,` around line 492) add:

```ts
    setFsRoot,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- useWorkspaces`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/useWorkspaces.ts src/modules/workspaces/lib/useWorkspaces.test.ts
git commit -m "feat(workspaces): persist per-workspace filesystem root"
```

---

### Task 3: `keepFolderLayoutOnChangeExplorerRoot` preference (JSON-only)

**Files:**
- Modify: `src/modules/settings/store.ts`

**Interfaces:**
- Produces: `Preferences.keepFolderLayoutOnChangeExplorerRoot: boolean` (default `false`), loaded from `kex-settings.json`, written into the JSON on first load via the `configDefaults` block. No setter, no UI.

- [ ] **Step 1: Add the type field**

In `store.ts`, in the `Preferences` type (after `paneSplitLimit: PaneSplitLimit;`):

```ts
  paneSplitLimit: PaneSplitLimit;
  keepFolderLayoutOnChangeExplorerRoot: boolean;
```

- [ ] **Step 2: Add the store key constant**

After `const KEY_PANE_SPLIT_LIMIT = "paneSplitLimit";`:

```ts
const KEY_PANE_SPLIT_LIMIT = "paneSplitLimit";
const KEY_KEEP_FOLDER_LAYOUT = "keepFolderLayoutOnChangeExplorerRoot";
```

- [ ] **Step 3: Add the default**

In `DEFAULT_PREFERENCES` (after `paneSplitLimit: { width: 250, height: 250 },`):

```ts
  paneSplitLimit: { width: 250, height: 250 },
  keepFolderLayoutOnChangeExplorerRoot: false,
```

- [ ] **Step 4: Load it**

In `loadPreferences`, inside the `result` object after the `paneSplitLimit` IIFE block:

```ts
    keepFolderLayoutOnChangeExplorerRoot:
      get<boolean>(KEY_KEEP_FOLDER_LAYOUT) ??
      DEFAULT_PREFERENCES.keepFolderLayoutOnChangeExplorerRoot,
```

- [ ] **Step 5: Persist it on first load (discoverable in JSON)**

In `loadPreferences`, extend the `configDefaults` block:

```ts
  if (!map.has(KEY_WORKSPACE_PANE_LIMIT)) configDefaults.push([KEY_WORKSPACE_PANE_LIMIT, DEFAULT_PREFERENCES.workspacePaneLimit]);
  if (!map.has(KEY_PANE_SPLIT_LIMIT)) configDefaults.push([KEY_PANE_SPLIT_LIMIT, DEFAULT_PREFERENCES.paneSplitLimit]);
  if (!map.has(KEY_KEEP_FOLDER_LAYOUT)) configDefaults.push([KEY_KEEP_FOLDER_LAYOUT, DEFAULT_PREFERENCES.keepFolderLayoutOnChangeExplorerRoot]);
```

- [ ] **Step 6: Verify it compiles**

Run: `pnpm check-types`
Expected: PASS (the new required `Preferences` field is satisfied everywhere because `DEFAULT_PREFERENCES` provides it).

- [ ] **Step 7: Commit**

```bash
git add src/modules/settings/store.ts
git commit -m "feat(settings): add keepFolderLayoutOnChangeExplorerRoot config flag"
```

---

### Task 4: Gate the expansion cache behind the flag

**Files:**
- Modify: `src/modules/explorer/lib/useFileTree.ts`

**Interfaces:**
- Consumes: `usePreferencesStore` (already imported), `keepFolderLayoutOnChangeExplorerRoot`.
- Behavior: in the root-change effect, restore the cached expansion only when the flag is true; otherwise start collapsed.

- [ ] **Step 1: Read the flag into a ref**

In `useFileTree`, after the `showHidden` lines (around line 83-84) add:

```ts
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const keepLayout = usePreferencesStore(
    (s) => s.keepFolderLayoutOnChangeExplorerRoot,
  );
  const keepLayoutRef = useRef(keepLayout);
```

After the existing `showHiddenRef` sync effect (around line 97-99) add:

```ts
  useEffect(() => {
    keepLayoutRef.current = keepLayout;
  }, [keepLayout]);
```

- [ ] **Step 2: Gate `recallExpansion`**

In the root-change effect (around line 196), replace:

```ts
    const restored = recallExpansion(rootPath);
```

with:

```ts
    const restored = keepLayoutRef.current ? recallExpansion(rootPath) : [];
```

- [ ] **Step 3: Verify it compiles and existing tests pass**

Run: `pnpm check-types && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/explorer/lib/useFileTree.ts
git commit -m "feat(explorer): reset folder layout on root change unless flag set"
```

---

### Task 5: Double-click a folder to enter it (TreeRow)

**Files:**
- Modify: `src/modules/explorer/TreeRow.tsx`

**Interfaces:**
- Consumes: existing `RowActions`, `onOpenFile`.
- Produces: new optional prop `onEnterFolder?: (path: string) => void`. When set and the row is a directory, double-click calls `onEnterFolder(path)`; for files double-click keeps `onOpenFile(path, true)`.

- [ ] **Step 1: Add the prop to the row props type**

In `TreeRow.tsx`, in the props type (near `onSetAsRoot?: (path: string) => void;` around line 67) add:

```ts
  onSetAsRoot?: (path: string) => void;
  onEnterFolder?: (path: string) => void;
```

- [ ] **Step 2: Destructure it**

In the component parameter destructuring (near `onSetAsRoot,` around line 91) add:

```ts
    onSetAsRoot,
    onEnterFolder,
```

- [ ] **Step 3: Update the double-click handler**

Replace (around line 196):

```ts
            onDoubleClick={() => !isDir && onOpenFile(path, true)}
```

with:

```ts
            onDoubleClick={() => {
              if (isDir) onEnterFolder?.(path);
              else onOpenFile(path, true);
            }}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/explorer/TreeRow.tsx
git commit -m "feat(explorer): double-click a folder enters it when enabled"
```

---

### Task 6: FileExplorer header buttons + thread `onEnterFolder`

**Files:**
- Modify: `src/modules/explorer/FileExplorer.tsx`

**Interfaces:**
- Consumes: `onEnterFolder` from Task 5's `EntryRow`.
- Produces: new `FileExplorer` props:
  - `onEnterFolder?: (path: string) => void`
  - `onNavigateUp?: () => void`
  - `onNavigateHome?: () => void`
  - `canNavigateUp: boolean`
  - `isAtHome: boolean`
  Up button (disabled when `!canNavigateUp`) and home button (rendered only when `!isAtHome`) appear left of the selector, only in File System mode.

- [ ] **Step 1: Import the up icon**

In the hugeicons import block, add `ArrowUp01Icon` alongside `ArrowDown01Icon`:

```ts
  ArrowDown01Icon,
  ArrowUp01Icon,
```

- [ ] **Step 2: Extend the props type**

In `type Props` (after `onSetAsRoot: (path: string) => void;` around line 72) add:

```ts
  onSetAsRoot: (path: string) => void;
  onEnterFolder?: (path: string) => void;
  onNavigateUp?: () => void;
  onNavigateHome?: () => void;
  canNavigateUp: boolean;
  isAtHome: boolean;
```

- [ ] **Step 3: Destructure the new props**

In the component destructuring (after `onSetAsRoot,` around line 257) add:

```ts
      onSetAsRoot,
      onEnterFolder,
      onNavigateUp,
      onNavigateHome,
      canNavigateUp,
      isAtHome,
```

- [ ] **Step 4: Render the up/home buttons left of the selector**

In the header `<div className="flex h-8 ...">` (around line 636), immediately before the `<DropdownMenu>`, insert:

```tsx
        {rootMode === "filesystem" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onClick={() => onNavigateUp?.()}
              disabled={!canNavigateUp}
              title="Up one folder"
              aria-label="Up one folder"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={2} />
            </Button>
            {!isAtHome && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => onNavigateHome?.()}
                title="Go to home folder"
                aria-label="Go to home folder"
              >
                <HugeiconsIcon icon={Home01Icon} size={13} strokeWidth={2} />
              </Button>
            )}
            <div className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
          </>
        )}
```

- [ ] **Step 5: Pass `onEnterFolder` down to `EntryRow`**

In `renderRow`, in the `<EntryRow ... />` props (after `onSetAsRoot={onSetAsRoot}` around line 604) add:

```tsx
              onSetAsRoot={onSetAsRoot}
              onEnterFolder={onEnterFolder}
```

- [ ] **Step 6: Verify it compiles and lints**

Run: `pnpm check-types && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/explorer/FileExplorer.tsx
git commit -m "feat(explorer): up and home navigation buttons in file system mode"
```

---

### Task 7: Wire App.tsx + RightPanel

**Files:**
- Modify: `src/app/components/RightPanel.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `setFsRoot` (Task 2), `resolveExplorerRoot` + `isFilesystemRoot` + `parentRoot` (Task 1), FileExplorer props (Task 6).
- Produces: handlers `handleEnterFolder`, `handleNavigateUp`, `handleNavigateHome` and predicates `canNavigateUp`, `isAtHome`, all forwarded through both `RightPanel` render sites.

- [ ] **Step 1: Extend `RightPanelProps` and forward the new props**

In `RightPanel.tsx`, in `RightPanelProps` (after `onSetAsRoot: (path: string) => void;` around line 37) add:

```ts
  onSetAsRoot: (path: string) => void;
  onEnterFolder?: (path: string) => void;
  onNavigateUp?: () => void;
  onNavigateHome?: () => void;
  canNavigateUp: boolean;
  isAtHome: boolean;
```

In the `<FileExplorer ... />` element (after `onSetAsRoot={props.onSetAsRoot}` around line 118) add:

```tsx
              onSetAsRoot={props.onSetAsRoot}
              onEnterFolder={props.onEnterFolder}
              onNavigateUp={props.onNavigateUp}
              onNavigateHome={props.onNavigateHome}
              canNavigateUp={props.canNavigateUp}
              isAtHome={props.isAtHome}
```

- [ ] **Step 2: Import the helpers in App.tsx**

In `App.tsx`, update the explorerRoot import block (around line 94-96) to include the new helpers:

```ts
  resolveExplorerRoot,
  isFilesystemRoot,
  parentRoot,
} from "@/modules/workspaces/lib/explorerRoot";
```

- [ ] **Step 3: Read `fsRoot` and feed `resolveExplorerRoot`**

After `const workspaceRootPath = activeWorkspace?.pinnedRoot ?? null;` (around line 443) add:

```ts
  const fsRootPath = activeWorkspace?.fsRoot ?? null;
```

In the `resolveExplorerRoot({ ... })` call (around line 447) add the `fsRoot` field and the dep:

```ts
  const explorerRoot = useMemo<string | null>(
    () =>
      resolveExplorerRoot({
        mode: activeRootMode,
        terminalCwd: terminalRootCwd,
        gitRoot,
        pinnedRoot: workspaceRootPath,
        fsRoot: fsRootPath,
        home,
      }),
    [activeRootMode, terminalRootCwd, gitRoot, workspaceRootPath, fsRootPath, home],
  );
```

- [ ] **Step 4: Grab the `setFsRoot` method from the hook**

Find where `setExplorerRootMode` / `setPinnedRoot` are destructured from `useWorkspaces(...)` and add `setFsRoot` to that destructuring.

Run to locate it:

```bash
grep -n "setPinnedRoot" src/app/App.tsx
```

Add `setFsRoot,` next to `setPinnedRoot,` in the destructuring.

- [ ] **Step 5: Add the handlers and predicates**

After `handleSetAsRoot` (around line 469) add:

```ts
  const isFilesystemMode = activeRootMode === "filesystem";

  const canNavigateUp =
    isFilesystemMode &&
    explorerRoot !== null &&
    !isFilesystemRoot(explorerRoot);

  const isAtHome = explorerRoot === home;

  const handleEnterFolder = useCallback(
    (path: string) => {
      if (activeWorkspace && activeRootMode === "filesystem") {
        setFsRoot(activeWorkspace.id, path);
      }
    },
    [activeWorkspace, activeRootMode, setFsRoot],
  );

  const handleNavigateUp = useCallback(() => {
    if (!activeWorkspace || activeRootMode !== "filesystem" || !explorerRoot) {
      return;
    }
    if (isFilesystemRoot(explorerRoot)) return;
    setFsRoot(activeWorkspace.id, parentRoot(explorerRoot));
  }, [activeWorkspace, activeRootMode, explorerRoot, setFsRoot]);

  const handleNavigateHome = useCallback(() => {
    if (activeWorkspace && activeRootMode === "filesystem" && home) {
      setFsRoot(activeWorkspace.id, home);
    }
  }, [activeWorkspace, activeRootMode, home, setFsRoot]);
```

- [ ] **Step 6: Pass the new props at BOTH RightPanel sites**

Both `<RightPanel ... />` blocks (around lines 1872 and 1945) need the new props. After `onSetAsRoot={handleSetAsRoot}` in each, add:

```tsx
                        onSetAsRoot={handleSetAsRoot}
                        onEnterFolder={handleEnterFolder}
                        onNavigateUp={handleNavigateUp}
                        onNavigateHome={handleNavigateHome}
                        canNavigateUp={canNavigateUp}
                        isAtHome={isAtHome}
```

- [ ] **Step 7: Verify the full frontend check suite**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 8: Manual smoke test**

Run: `pnpm tauri dev` (fresh process, not HMR — see CLAUDE.md HMR gotcha).
Verify:
- File System mode shows up button; disabled at `/`.
- Double-click a folder enters it and the tree refreshes.
- Home button appears only when not at home and jumps to home.
- Terminal / Git / Workspace Root modes show no up/home buttons and double-click on a folder does nothing.
- Toggle `keepFolderLayoutOnChangeExplorerRoot` to `true` in `kex-settings.json`, restart: expansions are restored on navigation; `false`: clean collapsed view.

- [ ] **Step 9: Commit**

```bash
git add src/app/App.tsx src/app/components/RightPanel.tsx
git commit -m "feat(explorer): wire navigable file system root through app and right panel"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Workspace data model: note `fsRoot`)
- Modify: `docs/FORK.md` (add to the explorer root-modes entry)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update ARCHITECTURE.md**

Find the Workspace/Pane/Panel model section and the explorer description; add one line noting that File System mode has a per-workspace navigable root (`fsRoot`, default home) with up/home navigation, and that `keepFolderLayoutOnChangeExplorerRoot` (JSON-only) gates expansion restore on root change.

Run to locate:

```bash
grep -n "explorerRootMode\|pinnedRoot\|File System\|root mode" docs/ARCHITECTURE.md
```

- [ ] **Step 2: Update FORK.md**

Add a factual bullet under the explorer phase noting the navigable File System root and the JSON-only layout flag as a fork addition.

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md docs/FORK.md
git commit -m "docs: document navigable file system explorer root"
```

---

## Self-Review

**Spec coverage:**
- Per-workspace `fsRoot` default home: Task 1 (resolve) + Task 2 (field/setter) + Task 7 (wire). ✓
- Double-click enters folder (filesystem only): Task 5 (TreeRow) + Task 6 (thread) + Task 7 (`handleEnterFolder` gated on mode, prop only meaningful in filesystem mode). ✓
- Up button capped at filesystem/drive root: Task 1 (`isFilesystemRoot`, `parentRoot`) + Task 6 (button) + Task 7 (`canNavigateUp`, `handleNavigateUp`). ✓
- Home button hidden at home: Task 6 (`!isAtHome` render) + Task 7 (`isAtHome`, `handleNavigateHome`). ✓
- Other modes unaffected (no buttons, double-click no-op): Task 6 (`rootMode === "filesystem"` guard) + Task 7 (handlers gated; props still passed but inert). ✓
- `keepFolderLayoutOnChangeExplorerRoot` JSON-only flag: Task 3 (store) + Task 4 (useFileTree gate). ✓
- Tests locking core invariants: Task 1 + Task 2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Two steps use `grep` to locate exact lines that shift with edits (App.tsx destructuring, doc sections) rather than hardcoding a fragile line number — the surrounding anchor text is given. ✓

**Type consistency:** `fsRoot` (field) ↔ `applyFsRoot`/`setFsRoot` ↔ `ResolveExplorerRootInput.fsRoot`; `onEnterFolder`/`onNavigateUp`/`onNavigateHome`/`canNavigateUp`/`isAtHome` identical across TreeRow → FileExplorer → RightPanel → App; `keepFolderLayoutOnChangeExplorerRoot` identical across store type/default/key/useFileTree. ✓
