# Sidebar view state per workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each workspace remembers its Sidebar view (active view, open explorer folders, selected file, scroll) and restores it on switch, wake and Sidebar reopen, persisted in the workspace JSON.

**Architecture:** One Sidebar instance. `Workspace.sidebar` holds a snapshot. The explorer reports changes through a generic 10 s coalescer (extracted from the agent title sync) into workspace state, which follows the normal debounced workspace save. A pure function filters the snapshot against the current explorer root on restore. `FileExplorer` is remounted per workspace (`key`) and reads the snapshot once at mount.

**Tech Stack:** TypeScript, React 19, vitest (`pnpm vitest run <file>`), Tauri 2 / Rust (`cargo test --locked` in `src-tauri`).

**Spec:** `docs/superpowers/specs/2026-10-13-sidebar-view-state-per-workspace-design.md`

## Global Constraints

- No em-dash and no emojis anywhere (code, comments, commits, docs).
- Commit messages in English, one logical change per commit, never Co-authored-by or Generated-by lines.
- Comments: none by default; at most 1-2 lines on why.
- Imports across modules use `@/...`; within `modules/workspaces/lib/` relative imports (the existing style there).
- No backward compatibility code: old saved `view` in the window entry is simply ignored.
- Canonical frontend path form is forward-slash; use `isUnder` / `ancestorsToExpand` from `explorerRoot.ts`, never hand-split paths.
- `pnpm` only. Verify with `pnpm lint`, `pnpm check-types`, `pnpm test`, and `cd src-tauri && cargo clippy && cargo test --locked`.
- Work only inside the worktree `.claude/worktrees/task-817-sidebar-state`.
- Docs (`docs/ARCHITECTURE.md`, `docs/WORKSPACES.md`, `docs/IPC.md`) are updated in the commit that changes the behavior they describe.

## Review Focus

1. A snapshot whose `expanded` paths are not under the current root (root moved to an unrelated branch): nothing is restored, no throw. Pinned in Task 2 tests.
2. A corrupt `sidebar` field in a workspace body (wrong types, duplicates, non-strings, negative scroll): sanitized to safe values or dropped. Pinned in Task 2 tests.
3. A pending snapshot for a workspace that was closed meanwhile: ignored, never resurrects it. Pinned in Task 2 tests (`applyExplorerSnapshots` unknown id).
4. Switching A to B to A within 10 s: A's last state is back. Needs the flush on switch (Task 5) and is part of the manual checklist in Task 6.
5. Explorer root not known at mount (e.g. `home` still loading): the snapshot must not be lost nor overwritten by an empty report. Task 4 gates reporting on a restored marker; manual checklist in Task 6.

---

### Task 1: Generic coalescer

**Files:**
- Create: `src/modules/workspaces/lib/coalescer.ts`
- Create: `src/modules/workspaces/lib/coalescer.test.ts`
- Modify: `src/modules/workspaces/lib/agentTitleSync.ts`

**Interfaces:**
- Produces: `type Coalescer<K, V> = { push(key: K, value: V): void; flush(): boolean; dispose(): void }` and `createCoalescer<K, V>(apply: (batch: Map<K, V>) => void, intervalMs: number): Coalescer<K, V>`.
- `agentTitleSync.ts` keeps exporting `createTitleCoalescer(apply, intervalMs = AGENT_TITLE_SAVE_MS)` with the same behavior.

- [ ] **Step 1: Write the failing test** `coalescer.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescer } from "./coalescer";

describe("createCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the first change right away and keeps the last value per key", () => {
    const apply = vi.fn();
    const c = createCoalescer<string, { n: number }>(apply, 10_000);
    c.push("a", { n: 1 });
    expect(apply).toHaveBeenCalledWith(new Map([["a", { n: 1 }]]));
    vi.advanceTimersByTime(1000);
    c.push("a", { n: 2 });
    c.push("a", { n: 3 });
    c.push("b", { n: 9 });
    expect(apply).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9000);
    expect(apply).toHaveBeenLastCalledWith(
      new Map([["a", { n: 3 }], ["b", { n: 9 }]]),
    );
  });

  it("flush sends what is pending and reports whether it did", () => {
    const apply = vi.fn();
    const c = createCoalescer<string, number>(apply, 10_000);
    c.push("a", 1);
    vi.advanceTimersByTime(1000);
    c.push("a", 2);
    expect(c.flush()).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(new Map([["a", 2]]));
    expect(c.flush()).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("dispose flushes", () => {
    const apply = vi.fn();
    const c = createCoalescer<string, number>(apply, 10_000);
    c.push("a", 1);
    vi.advanceTimersByTime(1000);
    c.push("a", 2);
    c.dispose();
    expect(apply).toHaveBeenLastCalledWith(new Map([["a", 2]]));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/modules/workspaces/lib/coalescer.test.ts`
Expected: FAIL, cannot resolve `./coalescer`.

- [ ] **Step 3: Create `coalescer.ts`** (logic moved verbatim from `createTitleCoalescer`, made generic)

```ts
export type Coalescer<K, V> = {
  push: (key: K, value: V) => void;
  flush: () => boolean;
  dispose: () => void;
};

// One shared window for every key: a change flushes right away when the last flush is older
// than `intervalMs`, otherwise it waits for the rest of the window, and all the values that
// changed meanwhile go out together. A burst from ten keys costs one apply, not ten.
export function createCoalescer<K, V>(
  apply: (batch: Map<K, V>) => void,
  intervalMs: number,
): Coalescer<K, V> {
  let pending = new Map<K, V>();
  let lastFlush = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return false;
    const batch = pending;
    pending = new Map();
    lastFlush = Date.now();
    apply(batch);
    return true;
  };

  return {
    push(key, value) {
      pending.set(key, value);
      const wait = lastFlush + intervalMs - Date.now();
      if (wait <= 0) flush();
      else if (timer === null) timer = setTimeout(flush, wait);
    },
    flush,
    dispose() {
      flush();
    },
  };
}
```

- [ ] **Step 4: Make `agentTitleSync.ts` use it.** Replace the `Coalescer` type and the whole `createTitleCoalescer` function (lines 6-47 of the current file, from `type Coalescer = {` through the closing `}` of `createTitleCoalescer`) with:

```ts
import { createCoalescer, type Coalescer } from "./coalescer";

export function createTitleCoalescer(
  apply: (titles: Map<string, string>) => void,
  intervalMs: number = AGENT_TITLE_SAVE_MS,
): Coalescer<string, string> {
  return createCoalescer<string, string>(apply, intervalMs);
}
```

Put the new `import` with the other imports at the top of the file, and fix the later `let active: Coalescer | null` to `let active: Coalescer<string, string> | null`. Keep the comment above `flushAgentTitles` and everything below unchanged.

- [ ] **Step 5: Run both test files**

Run: `pnpm vitest run src/modules/workspaces/lib/coalescer.test.ts src/modules/workspaces/lib/agentTitleSync.test.ts && pnpm check-types`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/lib/coalescer.ts src/modules/workspaces/lib/coalescer.test.ts src/modules/workspaces/lib/agentTitleSync.ts
git commit -m "Extract a generic keyed coalescer from the agent title sync"
```

---

### Task 2: Snapshot model and pure restore logic

**Files:**
- Create: `src/modules/workspaces/lib/sidebarSnapshot.ts`
- Create: `src/modules/workspaces/lib/sidebarSnapshot.test.ts`
- Modify: `src/modules/workspaces/lib/sidebarState.ts` (export `parseView`)
- Modify: `src/modules/workspaces/lib/types.ts` (add `sidebar?: WorkspaceSidebar` to `Workspace`)
- Modify: `src/modules/workspaces/lib/workspaceState.ts` (`sanitizeWorkspace` sanitizes `sidebar`)

**Interfaces:**
- Consumes: `isUnder`, `ancestorsToExpand` from `./explorerRoot`; `SidebarView`, `parseView` from `./sidebarState`.
- Produces:

```ts
export type SidebarScroll = { root: string; top: number };
export type ExplorerSnapshot = {
  expanded: string[];
  selectedPath: string | null;
  scroll: SidebarScroll | null;
};
export type WorkspaceSidebar = ExplorerSnapshot & { view: SidebarView };
export const DEFAULT_WORKSPACE_SIDEBAR: WorkspaceSidebar;
export type RestoredExplorer = { expanded: string[]; selectedPath: string | null; scrollTop: number };
export function sanitizeWorkspaceSidebar(raw: unknown): WorkspaceSidebar | undefined;
export function restoreExplorerSnapshot(snapshot: ExplorerSnapshot | null | undefined, root: string): RestoredExplorer;
export function applySidebarView(workspaces: Workspace[], id: string, view: SidebarView): Workspace[];
export function applyExplorerSnapshots(workspaces: Workspace[], batch: Map<string, ExplorerSnapshot>): Workspace[];
```

- [ ] **Step 1: Write the failing tests** `sidebarSnapshot.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  applyExplorerSnapshots,
  applySidebarView,
  DEFAULT_WORKSPACE_SIDEBAR,
  restoreExplorerSnapshot,
  sanitizeWorkspaceSidebar,
  type ExplorerSnapshot,
} from "./sidebarSnapshot";
import type { Workspace } from "./types";

const snap = (over: Partial<ExplorerSnapshot> = {}): ExplorerSnapshot => ({
  expanded: [],
  selectedPath: null,
  scroll: null,
  ...over,
});

describe("restoreExplorerSnapshot", () => {
  it("returns an empty restore without a snapshot", () => {
    expect(restoreExplorerSnapshot(null, "/p")).toEqual({
      expanded: [],
      selectedPath: null,
      scrollTop: 0,
    });
  });

  it("keeps everything when the root is the same", () => {
    const r = restoreExplorerSnapshot(
      snap({
        expanded: ["/p/src", "/p/docs"],
        selectedPath: "/p/src/a.ts",
        scroll: { root: "/p", top: 120 },
      }),
      "/p",
    );
    expect(r.expanded).toEqual(["/p/src", "/p/docs"]);
    expect(r.selectedPath).toBe("/p/src/a.ts");
    expect(r.scrollTop).toBe(120);
  });

  it("when the root moves up, keeps all folders and opens the old root", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p/app/src"], scroll: { root: "/p/app", top: 50 } }),
      "/p",
    );
    expect(r.expanded).toEqual(["/p/app", "/p/app/src"]);
    expect(r.scrollTop).toBe(0);
  });

  it("when the root moves down, drops folders that are outside", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p/app/src", "/p/other"] }),
      "/p/app",
    );
    expect(r.expanded).toEqual(["/p/app/src"]);
  });

  it("restores nothing for an unrelated root and never throws", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p/src"], selectedPath: "/p/src/a.ts" }),
      "/elsewhere",
    );
    expect(r).toEqual({ expanded: [], selectedPath: null, scrollTop: 0 });
  });

  it("opens the parents of the selected file and ignores a selection outside the root", () => {
    const inside = restoreExplorerSnapshot(
      snap({ selectedPath: "/p/a/b/c.ts" }),
      "/p",
    );
    expect(inside.expanded).toEqual(["/p/a", "/p/a/b"]);
    const outside = restoreExplorerSnapshot(snap({ selectedPath: "/q/c.ts" }), "/p");
    expect(outside.selectedPath).toBeNull();
  });

  it("never lists the root itself as an open folder and has no duplicates", () => {
    const r = restoreExplorerSnapshot(
      snap({ expanded: ["/p", "/p/a", "/p/a/b"], selectedPath: "/p/a/b/c.ts" }),
      "/p",
    );
    expect(r.expanded).toEqual(["/p/a", "/p/a/b"]);
  });
});

describe("sanitizeWorkspaceSidebar", () => {
  it("returns undefined for anything that is not an object", () => {
    expect(sanitizeWorkspaceSidebar(undefined)).toBeUndefined();
    expect(sanitizeWorkspaceSidebar("x")).toBeUndefined();
    expect(sanitizeWorkspaceSidebar(null)).toBeUndefined();
  });

  it("falls back to safe values for wrong types", () => {
    const s = sanitizeWorkspaceSidebar({
      view: "bogus",
      expanded: ["/a", 3, "", "/a", null],
      selectedPath: 7,
      scroll: { root: 1, top: "x" },
    });
    expect(s).toEqual({ ...DEFAULT_WORKSPACE_SIDEBAR, expanded: ["/a"] });
  });

  it("drops negative or non-finite scroll and keeps a valid one", () => {
    expect(
      sanitizeWorkspaceSidebar({ scroll: { root: "/p", top: -5 } })?.scroll,
    ).toBeNull();
    expect(
      sanitizeWorkspaceSidebar({ scroll: { root: "/p", top: 40 } })?.scroll,
    ).toEqual({ root: "/p", top: 40 });
  });

  it("caps the number of open folders", () => {
    const many = Array.from({ length: 2000 }, (_, i) => `/p/d${i}`);
    expect(sanitizeWorkspaceSidebar({ expanded: many })?.expanded.length).toBe(500);
  });
});

const ws = (id: string, sidebar?: Workspace["sidebar"]) =>
  ({ id, sidebar }) as unknown as Workspace;

describe("applySidebarView / applyExplorerSnapshots", () => {
  it("sets the view of one workspace and keeps the rest of its snapshot", () => {
    const a = ws("a", { ...DEFAULT_WORKSPACE_SIDEBAR, expanded: ["/p/x"] });
    const b = ws("b");
    const out = applySidebarView([a, b], "a", "git");
    expect(out[0].sidebar).toEqual({ ...DEFAULT_WORKSPACE_SIDEBAR, expanded: ["/p/x"], view: "git" });
    expect(out[1]).toBe(b);
  });

  it("merges explorer fields without touching the view", () => {
    const a = ws("a", { ...DEFAULT_WORKSPACE_SIDEBAR, view: "git" });
    const out = applyExplorerSnapshots([a], new Map([["a", snap({ expanded: ["/p/x"] })]]));
    expect(out[0].sidebar).toEqual({ view: "git", expanded: ["/p/x"], selectedPath: null, scroll: null });
  });

  it("ignores snapshots for workspaces that no longer exist and keeps the array when nothing applies", () => {
    const list = [ws("a")];
    const out = applyExplorerSnapshots(list, new Map([["gone", snap()]]));
    expect(out).toBe(list);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/modules/workspaces/lib/sidebarSnapshot.test.ts`
Expected: FAIL, cannot resolve `./sidebarSnapshot`.

- [ ] **Step 3: Export `parseView`.** In `sidebarState.ts` change `function parseView(` to `export function parseView(`.

- [ ] **Step 4: Create `sidebarSnapshot.ts`**

```ts
import { ancestorsToExpand, isUnder } from "./explorerRoot";
import { parseView, type SidebarView } from "./sidebarState";
import type { Workspace } from "./types";

export type SidebarScroll = { root: string; top: number };

export type ExplorerSnapshot = {
  expanded: string[];
  selectedPath: string | null;
  scroll: SidebarScroll | null;
};

export type WorkspaceSidebar = ExplorerSnapshot & { view: SidebarView };

export const DEFAULT_WORKSPACE_SIDEBAR: WorkspaceSidebar = {
  view: "explorer",
  expanded: [],
  selectedPath: null,
  scroll: null,
};

export type RestoredExplorer = {
  expanded: string[];
  selectedPath: string | null;
  scrollTop: number;
};

const MAX_EXPANDED = 500;

export function sanitizeWorkspaceSidebar(raw: unknown): WorkspaceSidebar | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const expanded = Array.isArray(r.expanded)
    ? [
        ...new Set(
          r.expanded.filter((p): p is string => typeof p === "string" && p.length > 0),
        ),
      ].slice(0, MAX_EXPANDED)
    : [];
  const sc = r.scroll as Record<string, unknown> | null | undefined;
  const scroll =
    sc &&
    typeof sc.root === "string" &&
    typeof sc.top === "number" &&
    Number.isFinite(sc.top) &&
    sc.top >= 0
      ? { root: sc.root, top: sc.top }
      : null;
  return {
    view: parseView(r.view),
    expanded,
    selectedPath: typeof r.selectedPath === "string" && r.selectedPath ? r.selectedPath : null,
    scroll,
  };
}

export function restoreExplorerSnapshot(
  snapshot: ExplorerSnapshot | null | undefined,
  root: string,
): RestoredExplorer {
  if (!snapshot) return { expanded: [], selectedPath: null, scrollTop: 0 };
  const open = new Set<string>();
  const openWithParents = (path: string, isDir: boolean) => {
    const probe = isDir ? `${path.replace(/\/$/, "")}/_` : path;
    for (const dir of ancestorsToExpand(root, probe)) open.add(dir);
  };
  for (const p of snapshot.expanded) {
    if (p !== root && isUnder(p, root)) openWithParents(p, true);
  }
  const selected =
    snapshot.selectedPath && snapshot.selectedPath !== root && isUnder(snapshot.selectedPath, root)
      ? snapshot.selectedPath
      : null;
  if (selected) openWithParents(selected, false);
  const scrollTop = snapshot.scroll && snapshot.scroll.root === root ? snapshot.scroll.top : 0;
  return { expanded: [...open], selectedPath: selected, scrollTop };
}

export function applySidebarView(
  workspaces: Workspace[],
  id: string,
  view: SidebarView,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === id
      ? { ...w, sidebar: { ...(w.sidebar ?? DEFAULT_WORKSPACE_SIDEBAR), view } }
      : w,
  );
}

export function applyExplorerSnapshots(
  workspaces: Workspace[],
  batch: Map<string, ExplorerSnapshot>,
): Workspace[] {
  let changed = false;
  const next = workspaces.map((w) => {
    const snap = batch.get(w.id);
    if (!snap) return w;
    changed = true;
    return { ...w, sidebar: { ...(w.sidebar ?? DEFAULT_WORKSPACE_SIDEBAR), ...snap } };
  });
  return changed ? next : workspaces;
}
```

Note on the test "opens the old root" in the moves-up case: `ancestorsToExpand("/p", "/p/app/src/_")` returns `["/p/app", "/p/app/src"]`, which is the expected value.

- [ ] **Step 5: Add the field and sanitize on load.** In `types.ts` add `import type { WorkspaceSidebar } from "./sidebarSnapshot";` and, inside `Workspace`, after `showHidden?: boolean;`:

```ts
  // Sidebar view state of this workspace: active view and the explorer snapshot.
  sidebar?: WorkspaceSidebar;
```

In `workspaceState.ts` `sanitizeWorkspace` add `sidebar: sanitizeWorkspaceSidebar(w.sidebar),` (import it from `./sidebarSnapshot`).

- [ ] **Step 6: Run tests and type check**

Run: `pnpm vitest run src/modules/workspaces/lib && pnpm check-types`
Expected: PASS. If the "moves down" or "moves up" case differs from the asserted order, fix the code, not the expectation, unless the difference is only ordering and still semantically right (then adjust the expectation to the real order and keep parent-before-child).

- [ ] **Step 7: Commit**

```bash
git add src/modules/workspaces/lib/sidebarSnapshot.ts src/modules/workspaces/lib/sidebarSnapshot.test.ts src/modules/workspaces/lib/sidebarState.ts src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/workspaceState.ts
git commit -m "Add the per-workspace Sidebar snapshot model and its pure restore logic"
```

---

### Task 3: View moves from the window to the workspace

**Files:**
- Modify: `src/modules/workspaces/lib/sidebarState.ts`, `sidebarState.test.ts`, `useSidebarState.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`
- Modify: `src/app/App.tsx`
- Modify: `src-tauri/src/lib.rs` (`window_save_sidebar`), `src-tauri/src/modules/window_state.rs` (`SidebarState`, sanitizing, its tests)
- Modify: `docs/IPC.md` (line with `window_save_sidebar`), `docs/ARCHITECTURE.md` (the "Per-window sidebar chrome" bullet)

**Interfaces:**
- Consumes: `applySidebarView`, `DEFAULT_WORKSPACE_SIDEBAR` from Task 2.
- Produces: `useWorkspaces()` returns `setWorkspaceSidebarView(workspaceId: string, view: SidebarView): void` and `applyExplorerSnapshotBatch(batch: Map<string, ExplorerSnapshot>): void`. `SidebarUiState` becomes `{ open; side; width }` (no `view`). `window_save_sidebar(label, open, side, width)`.

- [ ] **Step 1: Update the TS window state tests first.** In `sidebarState.test.ts` remove every assertion and fixture field about `view` (defaults, sanitize, the invoke args). Add one test that an input carrying `view: "git"` is ignored (the result has no `view` key):

```ts
it("ignores a legacy view field", () => {
  expect(sanitizeSidebarState({ open: true, side: "left", width: 20, view: "git" } as never)).toEqual({
    open: true,
    side: "left",
    width: 20,
  });
});
```

Run `pnpm vitest run src/modules/workspaces/lib/sidebarState.test.ts` and confirm it fails (the result still contains `view`).

- [ ] **Step 2: Remove `view` from the TS window state.** In `sidebarState.ts`: delete `view` from `SidebarUiState`, from `DEFAULT_SIDEBAR_STATE`, from `sanitizeSidebarState`, and from the `buildArgs` of `sidebarSave`. Keep exporting the `SidebarView` type and `parseView` (used by Task 2). Update the header comment to say the view is per workspace (`Workspace.sidebar.view`). In `useSidebarState.ts` delete `setView` and the `view` fields from the returned object and from the unused import.

- [ ] **Step 3: Rust.** In `window_state.rs` remove `pub view: String` from `SidebarState`; in the sanitizing code near line 427 remove the `view` match and build `SidebarState { open, side, width }`; update the tests around lines 699-780: delete the three `view` assertions/fixtures and the `bogus` view test, keeping the side and width tests. In `lib.rs` `window_save_sidebar` drop the `view` parameter and the field. A saved `workspaces.json` that still has a `view` key must keep loading: do not add `deny_unknown_fields`; add a Rust test that deserializes a `SidebarState` JSON containing `"view":"git"` and succeeds.

Run: `cd src-tauri && cargo test --locked window_state && cargo clippy`
Expected: PASS.

- [ ] **Step 4: `useWorkspaces.ts`.** Import `applySidebarView`, `applyExplorerSnapshots`, `ExplorerSnapshot` and `SidebarView`. Next to `setShowHidden` add:

```ts
  const setWorkspaceSidebarView = useCallback((workspaceId: string, view: SidebarView) => {
    setWorkspaces((prev) => applySidebarView(prev, workspaceId, view));
  }, []);

  const applyExplorerSnapshotBatch = useCallback((batch: Map<string, ExplorerSnapshot>) => {
    setWorkspaces((prev) => applyExplorerSnapshots(prev, batch));
  }, []);
```

and add both names to the returned object.

- [ ] **Step 5: `App.tsx`.** Destructure the two new functions from `useWorkspaces()`. Replace the `view`/`setView` from `useSidebarState` with:

```ts
  const sidebarView: SidebarView =
    activeWorkspace?.sidebar?.view ?? DEFAULT_WORKSPACE_SIDEBAR.view;
  const sidebarViewRef = useRef(sidebarView);
  sidebarViewRef.current = sidebarView;
  const setSidebarView = useCallback(
    (view: SidebarView) => {
      if (activeWorkspaceId) setWorkspaceSidebarView(activeWorkspaceId, view);
    },
    [activeWorkspaceId, setWorkspaceSidebarView],
  );
```

Place it after `activeWorkspaceId` and `useSidebarState` are both in scope (the `useSidebarState` call is near line 670; `useWorkspaces` is earlier). Then replace every read of `sidebarStateRef.current.view` or `sidebar.view` with `sidebarViewRef.current` (in `focusSidebar` the local `const sidebar = sidebarStateRef.current;` keeps `.open`, but `sidebar.view !== "explorer"` becomes `sidebarViewRef.current !== "explorer"`). `grep -n "sidebarStateRef\|\.view" src/app/App.tsx` finds them all. `setSidebarView` is listed in several `useCallback` dependency arrays; keep those names.

- [ ] **Step 6: Docs.** `docs/IPC.md`: the row becomes `window_save_sidebar(label, open, side, width)` with the text "(open, dock side, width percentage)" and a note that the active view is per workspace and travels in the workspace body. `docs/ARCHITECTURE.md` bullet "Per-window sidebar chrome": remove `view` from the list and its defaults, and add one sentence that the active view lives in `Workspace.sidebar.view`.

- [ ] **Step 7: Verify**

Run: `pnpm lint && pnpm check-types && pnpm test && (cd src-tauri && cargo clippy && cargo test --locked)`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Store the active Sidebar view per workspace instead of per window"
```

---

### Task 4: Explorer restores and reports its state

**Files:**
- Modify: `src/modules/explorer/lib/useFileTree.ts`
- Modify: `src/modules/explorer/FileExplorer.tsx`
- Modify: `src/app/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `ExplorerSnapshot`, `restoreExplorerSnapshot` (Task 2).
- Produces: `FileExplorer` and `Sidebar` props `initialExplorer?: ExplorerSnapshot | null` and `onExplorerSnapshot?: (snapshot: ExplorerSnapshot) => void`; `Sidebar` also gets `workspaceId: string | null`. `useFileTree(rootPath, options)` gets `options.initialSnapshot?: ExplorerSnapshot | null` and returns `restoredRoot: string | null`.

- [ ] **Step 1: `useFileTree.ts`.** Add to `Options`: `initialSnapshot?: ExplorerSnapshot | null;`. Add state and refs near the other state:

```ts
  const [restoredRoot, setRestoredRoot] = useState<string | null>(null);
  const initialSnapshotRef = useRef(options?.initialSnapshot ?? null);
  const initialRootRef = useRef<string | null>(null);
```

In the root effect, replace the line `const restored = keepLayoutRef.current ? recallExpansion(rootPath) : [];` with:

```ts
    let restored: string[];
    const initial = initialSnapshotRef.current;
    if (initial && (initialRootRef.current ?? rootPath) === rootPath) {
      initialRootRef.current = rootPath;
      restored = restoreExplorerSnapshot(initial, rootPath).expanded;
    } else {
      initialSnapshotRef.current = null;
      restored = keepLayoutRef.current ? recallExpansion(rootPath) : [];
    }
    setRestoredRoot(rootPath);
```

and in the `!rootPath` branch add `setRestoredRoot(null);`. Return `restoredRoot` from the hook next to `expanded`. This keeps the in-session behavior (`keepFolderLayoutOnChangeExplorerRoot`, `expansionCache`) intact: the snapshot only wins for the root the explorer had at mount, and survives a root that is null at mount (the first non-null root is adopted).

- [ ] **Step 2: `FileExplorer.tsx`.** Add the two props to `Props`. Make `selectedPath` initial state stay `null`, then add, after the `selectedPath` state:

```ts
    const initialExplorerRef = useRef(initialExplorer ?? null);
    const pendingScrollRef = useRef(0);
    useEffect(() => {
      const snap = initialExplorerRef.current;
      if (!rootPath || !snap) return;
      initialExplorerRef.current = null;
      const r = restoreExplorerSnapshot(snap, rootPath);
      setSelectedPath(r.selectedPath);
      pendingScrollRef.current = r.scrollTop;
    }, [rootPath]);
```

Apply the pending scroll once the tree is tall enough (children of restored folders load asynchronously, so retry on each row change until it fits), and drop it if the user scrolls first:

```ts
    useEffect(() => {
      const top = pendingScrollRef.current;
      const el = scrollRef.current;
      if (!top || !el) return;
      if (el.scrollHeight - el.clientHeight >= top) {
        el.scrollTop = top;
        pendingScrollRef.current = 0;
      }
    }, [rows]);
```

Report changes, gated until the hook says the tree was restored for the current root, and reading scroll from the element:

```ts
    const reportRef = useRef(onExplorerSnapshot);
    reportRef.current = onExplorerSnapshot;
    const report = useCallback(() => {
      if (!rootPath || tree.restoredRoot !== rootPath) return;
      reportRef.current?.({
        expanded: [...tree.expanded],
        selectedPath,
        scroll: { root: rootPath, top: scrollRef.current?.scrollTop ?? 0 },
      });
    }, [rootPath, tree.restoredRoot, tree.expanded, selectedPath]);
    useEffect(() => {
      report();
    }, [report]);
```

On the scroll container (the element that receives `scrollRef.current = node` around line 1326) add `onScroll={report}` and `onWheel={() => { pendingScrollRef.current = 0; }}`. Pass `initialSnapshot: initialExplorer` in the options of the existing `useFileTree(rootPath, {...})` call. Import `restoreExplorerSnapshot` and `ExplorerSnapshot`.

Important: the first report after mount must not carry an empty state that overwrites the stored snapshot. That is what the `tree.restoredRoot !== rootPath` gate is for; the `selectedPath` restore and the hook's `setExpanded` run in the same commit and re-render together.

- [ ] **Step 3: `Sidebar.tsx`.** Add to `SidebarProps`: `workspaceId: string | null; initialExplorer?: ExplorerSnapshot | null; onExplorerSnapshot?: (s: ExplorerSnapshot) => void;`. On the `<FileExplorer` element add `key={props.workspaceId ?? "none"}`, `initialExplorer={props.initialExplorer}` and `onExplorerSnapshot={props.onExplorerSnapshot}`.

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: PASS. (Behavior is verified end to end in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/modules/explorer/lib/useFileTree.ts src/modules/explorer/FileExplorer.tsx src/app/components/Sidebar.tsx
git commit -m "Let the explorer restore and report its open folders, selection and scroll"
```

---

### Task 5: Wire the sync, flush points and autofocus rule

**Files:**
- Create: `src/modules/workspaces/lib/sidebarSnapshotSync.ts`
- Create: `src/modules/workspaces/lib/autofocusDecision.ts`
- Create: `src/modules/workspaces/lib/autofocusDecision.test.ts`
- Modify: `src/app/App.tsx`, `src/main.tsx`, `src/modules/workspaces/lib/useHibernateFlow.ts`

**Interfaces:**
- Produces:
  - `startSidebarSnapshotSync(apply: (batch: Map<string, ExplorerSnapshot>) => void): () => void`
  - `pushSidebarSnapshot(workspaceId: string, snapshot: ExplorerSnapshot): void`
  - `flushSidebarSnapshotsNow(): boolean` and `flushSidebarSnapshots(): Promise<void>`
  - `autofocusDecision(prev: AutofocusKey | undefined, next: AutofocusKey): boolean` with `type AutofocusKey = { workspaceId: string | null; signal: string | null }`

- [ ] **Step 1: Write the failing test** `autofocusDecision.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { autofocusDecision } from "./autofocusDecision";

describe("autofocusDecision", () => {
  it("never fires on the first observation", () => {
    expect(autofocusDecision(undefined, { workspaceId: "a", signal: "t1|" })).toBe(false);
  });

  it("fires when the signal changes inside the same workspace", () => {
    expect(
      autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "a", signal: "t2|" }),
    ).toBe(true);
  });

  it("does not fire when the workspace changed, even with a new signal", () => {
    expect(
      autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "b", signal: "t9|" }),
    ).toBe(false);
  });

  it("does not fire when there is no signal or it did not change", () => {
    expect(autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "a", signal: null })).toBe(false);
    expect(autofocusDecision({ workspaceId: "a", signal: "t1|" }, { workspaceId: "a", signal: "t1|" })).toBe(false);
  });
});
```

Run `pnpm vitest run src/modules/workspaces/lib/autofocusDecision.test.ts`. Expected: FAIL, cannot resolve.

- [ ] **Step 2: Create `autofocusDecision.ts`**

```ts
export type AutofocusKey = { workspaceId: string | null; signal: string | null };

// A workspace switch changes the active tab too, but the Sidebar must keep the state it
// restored for that workspace, so only a change inside the same workspace may reveal.
export function autofocusDecision(
  prev: AutofocusKey | undefined,
  next: AutofocusKey,
): boolean {
  if (!prev) return false;
  if (prev.workspaceId !== next.workspaceId) return false;
  return next.signal !== null && next.signal !== prev.signal;
}
```

- [ ] **Step 3: Create `sidebarSnapshotSync.ts`**

```ts
import { createCoalescer, type Coalescer } from "./coalescer";
import type { ExplorerSnapshot } from "./sidebarSnapshot";

export const SIDEBAR_SNAPSHOT_SAVE_MS = 10_000;

let active: Coalescer<string, ExplorerSnapshot> | null = null;

export function startSidebarSnapshotSync(
  apply: (batch: Map<string, ExplorerSnapshot>) => void,
): () => void {
  const coalescer = createCoalescer(apply, SIDEBAR_SNAPSHOT_SAVE_MS);
  active = coalescer;
  window.addEventListener("beforeunload", coalescer.flush);
  return () => {
    window.removeEventListener("beforeunload", coalescer.flush);
    coalescer.dispose();
    if (active === coalescer) active = null;
  };
}

export function pushSidebarSnapshot(workspaceId: string, snapshot: ExplorerSnapshot): void {
  active?.push(workspaceId, snapshot);
}

export function flushSidebarSnapshotsNow(): boolean {
  return active?.flush() ?? false;
}

// Same beat as flushAgentTitles: lets the state the flush set reach the debounced
// workspace save before the caller flushes that.
export async function flushSidebarSnapshots(): Promise<void> {
  if (flushSidebarSnapshotsNow()) await new Promise((r) => setTimeout(r, 50));
}
```

- [ ] **Step 4: Wire `App.tsx`.**
  1. Start the sync, next to `useEffect(() => startAgentTitleSync(setAgentTitles), [setAgentTitles]);`:
     `useEffect(() => startSidebarSnapshotSync(applyExplorerSnapshotBatch), [applyExplorerSnapshotBatch]);`
  2. Flush when the active workspace changes or the Sidebar closes/reopens, so a restore never reads a stale snapshot:
     `useEffect(() => () => { flushSidebarSnapshotsNow(); }, [activeWorkspaceId, sidebarOpen]);`
  3. Pass to `<Sidebar`: `workspaceId={activeWorkspaceId}`, `initialExplorer={activeWorkspace?.sidebar ?? null}`, `onExplorerSnapshot={(s) => { if (activeWorkspaceId) pushSidebarSnapshot(activeWorkspaceId, s); }}`.
  4. Replace the autofocus effect (the one using `prevAutofocusSignalRef`, near line 1225):

```ts
  const prevAutofocusRef = useRef<AutofocusKey | undefined>(undefined);
  useEffect(() => {
    const ap = activeTab;
    const target = ap && isAutofocusActive(ap, autofocusMode) ? activeTabFocusTarget : null;
    const next: AutofocusKey = {
      workspaceId: activeWorkspaceId,
      signal: target ? `${activeTabId}|${agentWorktree ?? ""}` : null,
    };
    const fire = autofocusDecision(prevAutofocusRef.current, next);
    prevAutofocusRef.current = next;
    if (fire && target) focusSidebar(target, { fromShortcut: false });
  }, [activeWorkspaceId, activeTabId, activeTab, agentWorktree, activeTabFocusTarget, focusSidebar, autofocusMode]);
```

     and next to it reset the "second press" heuristic: `useEffect(() => { lastFocusFolderRef.current = null; }, [activeWorkspaceId]);`
  5. Add the imports (`startSidebarSnapshotSync`, `pushSidebarSnapshot`, `flushSidebarSnapshotsNow`, `autofocusDecision`, `AutofocusKey`) and remove `prevAutofocusSignalRef`.

- [ ] **Step 5: Flush on hibernate and window close.** In `useHibernateFlow.ts` line ~102 add `await flushSidebarSnapshots();` right after `await flushAgentTitles();` (import it). In `src/main.tsx` at both places that `await flushAgentTitles();` (lines ~87 and ~99) add `await flushSidebarSnapshots();` right after.

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Sync Sidebar snapshots through a 10 s coalescer and stop autofocus from overriding a restored workspace"
```

---

### Task 6: Docs, manual verification and task bookkeeping

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/WORKSPACES.md`, `docs/FORK.md`, `docs/superpowers/specs/2026-10-13-sidebar-view-state-per-workspace-design.md` (nothing to change unless behavior diverged)

- [ ] **Step 1: `docs/ARCHITECTURE.md`.** In the Sidebar/explorer section add a short subsection "Sidebar view state per workspace": the `Workspace.sidebar` field (view, expanded, selectedPath, scroll), that open/side/width stay per window, the restore rule (filter by `isUnder`, add intermediate folders, scroll only on the same root), the 10 s coalescer with its flush points (workspace switch, Sidebar close/reopen, hibernate, window close), and that `expansionCache` plus `keepFolderLayoutOnChangeExplorerRoot` still govern root changes inside a session. Also fix the sentence on line 124 only if it now reads as contradictory.

- [ ] **Step 2: `docs/WORKSPACES.md`.** In the hibernation paragraph (line ~208) add that the Sidebar stays unmounted while the workspace sleeps and gets its `Workspace.sidebar` back on wake. Add the autofocus rule (no reveal on workspace switch or wake) next to the autofocus description if one exists, else in the Sidebar paragraph.

- [ ] **Step 3: `docs/FORK.md`.** One factual line under the sidebar/explorer feature list: the Sidebar view state is per workspace and persisted.

- [ ] **Step 4: Manual verification in the real app.** Run `pnpm tauri dev` from this worktree (kill any older dev process first, see HMR note in CLAUDE.md). Check each, and record failures instead of papering over them:
  1. Open some explorer folders and select a file in workspace A, switch to B, switch back: same folders, selection, view.
  2. A to B to A in under 10 s: still restored (flush on switch).
  3. Hibernate A, wake it: same state, overlay was centered while asleep.
  4. Close the Sidebar and reopen it: same state.
  5. Restart Kex: workspace A state is back.
  6. With a terminal tab with autofocus on, switch workspaces: the explorer does not jump; change tab inside the workspace: it does.
  7. In A change the root (enter a folder, then use go-up): folders under the new root stay open, the rest are dropped.
  8. Filesystem mode, root not known at startup (cold start): state is not blanked.
  9. In-session root change with `keepFolderLayoutOnChangeExplorerRoot` false: tree still starts collapsed as before.

- [ ] **Step 5: Full verification**

Run: `pnpm lint && pnpm check-types && pnpm test && (cd src-tauri && cargo clippy && cargo test --locked)`
Expected: all PASS.

- [ ] **Step 6: Commit the docs**

```bash
git add docs
git commit -m "Document the per-workspace Sidebar view state"
```

- [ ] **Step 7: Task bookkeeping.** Read `backlog instructions task-finalization`, check each acceptance criterion of TASK-817 with the evidence from Steps 4-5, write the final summary with `backlog task edit`, and only then move the task to Done. Then follow the project rule: merge the branch straight into `main` (no PR) and delete the worktree and branch.
