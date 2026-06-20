# Explorer Root Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each workspace an explicit, persisted Explorer root mode (Follow terminal, Follow git root, File system, Pinned folder) that is the single source of truth for the Explorer root.

**Architecture:** A pure resolver (`resolveExplorerRoot`) selects the root from the active workspace's mode plus a few already-known values (terminal cwd, last known git root, pinned path, home). `App.tsx` tracks the last known git root per workspace via an effect over `git_resolve_repo`, and validates the pinned path via `fs_stat`. The editor/markdown "explorerRoot" override is removed so there is one coherent root. The mode selector and the pinned-invalid empty state live in `FileExplorer`.

**Tech Stack:** React 19 + TypeScript, vitest (pure-logic tests only, no component testing libs), Tauri `invoke` via `@/lib/native`, hugeicons, shadcn ContextMenu/DropdownMenu primitives.

## Global Constraints

- Package manager: **pnpm only**, never npm/npx/yarn.
- Frontend imports: always `@/...`, never relative across modules.
- No em-dash, no emojis anywhere (code, comments, commits, docs).
- Comments: default to none; 1-2 lines on *why* only if genuinely needed.
- Canonical frontend path form is forward-slash; normalize separators with `.split(/[\\/]/)` or `.replace(/\\/g, "/")` where paths may carry backslashes.
- Verify before done: `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Commit messages in English, atomic (one logical change per commit).
- Work happens in the worktree `.claude/worktrees/explore-overhaul` on branch `explore-overhaul`. Run all commands from that directory.

---

## File Structure

- `src/modules/workspaces/lib/explorerRoot.ts` — pure root resolution. Gains `ExplorerRootMode` + `resolveExplorerRoot`; loses `resolveActiveExplorerRoot` + `resolveOpenRoot` (Task 4).
- `src/modules/workspaces/lib/explorerRoot.test.ts` — tests for the resolver; old tests removed (Task 4).
- `src/modules/workspaces/lib/types.ts` — `Workspace` gains `explorerRootMode?` + `pinnedRoot?`; `editor`/`markdown` panels lose `explorerRoot?` (Task 4).
- `src/modules/workspaces/lib/useWorkspaces.ts` — new setters `setExplorerRootMode`, `setPinnedRoot`; drop `explorerRoot` plumbing (Task 4).
- `src/app/App.tsx` — compute `explorerRoot` via resolver, track git root per workspace, validate pinned path, pass mode + setters down.
- `src/app/components/RightPanel.tsx` — forward mode + setters to `FileExplorer`.
- `src/modules/explorer/FileExplorer.tsx` — mode selector row + menu, "Set as root" context action, pinned-invalid empty state.
- `docs/ARCHITECTURE.md`, `docs/FORK.md` — documentation.

---

## Task 1: Pure resolver `resolveExplorerRoot`

Add the new mode type and pure resolver alongside the existing functions (nothing removed yet, so everything keeps compiling).

**Files:**
- Modify: `src/modules/workspaces/lib/explorerRoot.ts`
- Test: `src/modules/workspaces/lib/explorerRoot.test.ts`

**Interfaces:**
- Produces:
  - `export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned"`
  - `export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null`
  - `export type ResolveExplorerRootInput = { mode: ExplorerRootMode; terminalCwd: string | null; gitRoot: string | null; pinnedRoot: string | null; home: string }`

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/workspaces/lib/explorerRoot.test.ts`:

```typescript
import { resolveExplorerRoot } from "./explorerRoot";

describe("resolveExplorerRoot", () => {
  const base = {
    terminalCwd: "/proj/sub",
    gitRoot: "/proj",
    pinnedRoot: "/pinned",
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
    expect(
      resolveExplorerRoot({ ...base, mode: "git", gitRoot: null }),
    ).toBe("/proj/sub");
  });

  it("git mode falls back to home when no git root and no cwd", () => {
    expect(
      resolveExplorerRoot({ ...base, mode: "git", gitRoot: null, terminalCwd: null }),
    ).toBe("/home/u");
  });

  it("filesystem mode always returns home", () => {
    expect(resolveExplorerRoot({ ...base, mode: "filesystem" })).toBe("/home/u");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- explorerRoot`
Expected: FAIL with `resolveExplorerRoot is not a function` (or import error).

- [ ] **Step 3: Implement the resolver**

Append to `src/modules/workspaces/lib/explorerRoot.ts`:

```typescript
export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned";

export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;
  gitRoot: string | null;
  pinnedRoot: string | null;
  home: string;
};

export function resolveExplorerRoot(r: ResolveExplorerRootInput): string | null {
  switch (r.mode) {
    case "filesystem":
      return r.home;
    case "pinned":
      return r.pinnedRoot;
    case "git":
      return r.gitRoot ?? r.terminalCwd ?? r.home;
    case "terminal":
    default:
      return r.terminalCwd ?? r.home;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- explorerRoot`
Expected: PASS (new suite green; old `resolveOpenRoot`/`resolveActiveExplorerRoot` suites still green).

- [ ] **Step 5: Typecheck**

Run: `pnpm check-types`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/lib/explorerRoot.ts src/modules/workspaces/lib/explorerRoot.test.ts
git commit -m "feat(explorer): add pure resolveExplorerRoot and ExplorerRootMode"
```

---

## Task 2: Workspace model fields and setters

Add `explorerRootMode` and `pinnedRoot` to `Workspace`, plus immutable setters. The editor/markdown `explorerRoot` field stays for now (removed in Task 4), so compilation is unaffected.

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts:29-35`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts` (near `setWorkspaceCwd` at 401-406)
- Test: `src/modules/workspaces/lib/useWorkspaces.test.ts` (create if absent)

**Interfaces:**
- Consumes: `ExplorerRootMode` from Task 1.
- Produces:
  - `Workspace.explorerRootMode?: ExplorerRootMode` (absent means `"terminal"`)
  - `Workspace.pinnedRoot?: string`
  - `setExplorerRootMode(workspaceId: string, mode: ExplorerRootMode): void`
  - `setPinnedRoot(workspaceId: string, path: string): void` (also sets mode to `"pinned"`)

- [ ] **Step 1: Add the type fields**

In `src/modules/workspaces/lib/types.ts`, import the mode and extend `Workspace`:

```typescript
import type { ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";

export type Workspace = {
  id: string;
  title: string;
  cwd?: string;
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode;
  pinnedRoot?: string;
};
```

Note: if importing from `explorerRoot` into `types` creates a circular import (types is imported by explorerRoot's neighbors), instead declare the union inline in `types.ts` and have `explorerRoot.ts` import `ExplorerRootMode` from `types`. Pick whichever direction keeps `pnpm check-types` clean; the type definition lives in exactly one file.

- [ ] **Step 2: Write the failing setter test**

Create `src/modules/workspaces/lib/useWorkspaces.test.ts` (pure reducer-style test of the setter logic). If `useWorkspaces` setters cannot be unit-tested in isolation (they close over `setWorkspaces`), extract the pure update into a helper and test that. Minimal helper + test:

```typescript
import { describe, expect, it } from "vitest";
import type { Workspace } from "./types";
import { applyExplorerRootMode, applyPinnedRoot } from "./useWorkspaces";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  title: "W",
  paneTree: { kind: "pane", id: "p1", panels: [], activePanelId: null },
  activePaneId: "p1",
  ...over,
});

describe("applyExplorerRootMode", () => {
  it("sets the mode on the matching workspace only", () => {
    const out = applyExplorerRootMode([ws(), ws({ id: "w2" })], "w1", "git");
    expect(out[0].explorerRootMode).toBe("git");
    expect(out[1].explorerRootMode).toBeUndefined();
  });
});

describe("applyPinnedRoot", () => {
  it("sets pinnedRoot and switches mode to pinned", () => {
    const out = applyPinnedRoot([ws()], "w1", "/some/dir");
    expect(out[0].pinnedRoot).toBe("/some/dir");
    expect(out[0].explorerRootMode).toBe("pinned");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- useWorkspaces`
Expected: FAIL with `applyExplorerRootMode is not a function`.

- [ ] **Step 4: Implement helpers and setters**

In `src/modules/workspaces/lib/useWorkspaces.ts`, add the pure helpers near the top (module scope) and the setters next to `setWorkspaceCwd`:

```typescript
export function applyExplorerRootMode(
  workspaces: Workspace[],
  workspaceId: string,
  mode: ExplorerRootMode,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, explorerRootMode: mode } : w,
  );
}

export function applyPinnedRoot(
  workspaces: Workspace[],
  workspaceId: string,
  path: string,
): Workspace[] {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return workspaces.map((w) =>
    w.id === workspaceId
      ? { ...w, pinnedRoot: normalized, explorerRootMode: "pinned" }
      : w,
  );
}
```

```typescript
const setExplorerRootMode = useCallback(
  (workspaceId: string, mode: ExplorerRootMode) => {
    setWorkspaces((prev) => applyExplorerRootMode(prev, workspaceId, mode));
  },
  [],
);

const setPinnedRoot = useCallback(
  (workspaceId: string, path: string) => {
    setWorkspaces((prev) => applyPinnedRoot(prev, workspaceId, path));
  },
  [],
);
```

Add `ExplorerRootMode` to the imports from `./explorerRoot` (or `./types`) at the top of `useWorkspaces.ts`, and add `setExplorerRootMode` and `setPinnedRoot` to the object the hook returns (match the existing return shape next to `setWorkspaceCwd`).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- useWorkspaces`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm check-types && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/useWorkspaces.ts src/modules/workspaces/lib/useWorkspaces.test.ts
git commit -m "feat(workspaces): add explorerRootMode and pinnedRoot state with setters"
```

---

## Task 3: Wire resolver and git-root tracking into App.tsx

Replace `ambientExplorerRoot` + `resolveActiveExplorerRoot` with the new resolver. Track the last known git root per workspace. The editor `explorerRoot` field and `resolveOpenRoot` stay untouched here (removed in Task 4); after this task they are simply dead data.

**Files:**
- Modify: `src/app/App.tsx` (around 350-371 for root computation; add a git-root effect)

**Interfaces:**
- Consumes: `resolveExplorerRoot`, `ExplorerRootMode` (Task 1); `setExplorerRootMode`, `setPinnedRoot` (Task 2); `native.gitResolveRepo` returning `GitRepoInfo | null` where `GitRepoInfo.repoRoot: string`.
- Produces: a recomputed `const explorerRoot: string | null` with the same name and downstream usage as today (consumed by title, command palette, source control, RightPanel, etc., unchanged).

- [ ] **Step 1: Add git-root-per-workspace state and effect**

In `src/app/App.tsx`, replace the `ambientExplorerRoot` / `explorerRoot` block (currently lines ~350-371) with:

```typescript
  const lastTerminalCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeCwd) lastTerminalCwdRef.current = activeCwd;
  }, [activeCwd]);

  const activeRootMode: ExplorerRootMode =
    activeWorkspace?.explorerRootMode ?? "terminal";

  // Per-workspace last known git root (runtime only, re-derived on restart).
  const [gitRootByWs, setGitRootByWs] = useState<Record<string, string>>({});
  useEffect(() => {
    const ws = activeWorkspace;
    if (!ws || activeRootMode !== "git") return;
    const cwd = activeCwd ?? lastTerminalCwdRef.current;
    if (!cwd) return;
    let cancelled = false;
    void native
      .gitResolveRepo(cwd)
      .then((info) => {
        if (cancelled || !info?.repoRoot) return;
        setGitRootByWs((prev) =>
          prev[ws.id] === info.repoRoot
            ? prev
            : { ...prev, [ws.id]: info.repoRoot },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace, activeRootMode, activeCwd]);

  const terminalRootCwd = useMemo<string | null>(() => {
    if (activeCwd) return activeCwd;
    if (lastTerminalCwdRef.current) return lastTerminalCwdRef.current;
    for (const ws of workspaces) {
      for (const pane of allPanes(ws.paneTree)) {
        for (const panel of pane.panels) {
          if (panel.kind === "terminal" && panel.cwd) return panel.cwd;
        }
      }
    }
    return null;
  }, [activeCwd, workspaces]);

  const explorerRoot = useMemo<string | null>(
    () =>
      resolveExplorerRoot({
        mode: activeRootMode,
        terminalCwd: terminalRootCwd,
        gitRoot: activeWorkspace ? (gitRootByWs[activeWorkspace.id] ?? null) : null,
        pinnedRoot: activeWorkspace?.pinnedRoot ?? null,
        home,
      }),
    [activeRootMode, terminalRootCwd, gitRootByWs, activeWorkspace, home],
  );
```

- [ ] **Step 2: Update imports**

At the top of `App.tsx`, change the `explorerRoot` import line (currently `import { resolveActiveExplorerRoot, resolveOpenRoot } from "@/modules/workspaces/lib/explorerRoot";`) to also pull in the new resolver and type. Keep `resolveOpenRoot` for now (still used by `openFileInPanel`):

```typescript
import {
  resolveExplorerRoot,
  resolveOpenRoot,
  type ExplorerRootMode,
} from "@/modules/workspaces/lib/explorerRoot";
```

(`resolveActiveExplorerRoot` is no longer referenced after Step 1; remove it from this import.)

- [ ] **Step 3: Destructure the new setters from useWorkspaces**

Find where `setWorkspaceCwd` / `setTerminalPanelCwd` are destructured from the `useWorkspaces()` result in `App.tsx` and add `setExplorerRootMode` and `setPinnedRoot` to that destructuring.

- [ ] **Step 4: Typecheck**

Run: `pnpm check-types`
Expected: no errors. (If `resolveActiveExplorerRoot` is reported unused anywhere else, it is only referenced in `explorerRoot.ts`/its test, which remain until Task 4.)

- [ ] **Step 5: Lint and test**

Run: `pnpm lint && pnpm test`
Expected: all green. Existing resolver tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(explorer): drive explorer root from workspace mode and git-root tracking"
```

---

## Task 4: Remove the editor/markdown root override

Now that the workspace mode drives the root, delete the editor override end to end: the `explorerRoot` field on `editor`/`markdown` panels, `resolveOpenRoot`, `resolveActiveExplorerRoot`, their tests, and all plumbing.

**Files:**
- Modify: `src/modules/workspaces/lib/explorerRoot.ts` (remove `resolveOpenRoot`, `resolveActiveExplorerRoot`, and now-unused `isUnder`/`normalize`/`pathDirname` import if unused)
- Modify: `src/modules/workspaces/lib/explorerRoot.test.ts` (remove old suites)
- Modify: `src/modules/workspaces/lib/types.ts:4,6` (drop `explorerRoot?` from editor + markdown)
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts:229,240,391,395` (drop `explorerRoot` param + fields)
- Modify: `src/app/App.tsx:444,461,471-472,1489` (drop `resolveOpenRoot` usage and `explorerRoot` panel fields)

**Interfaces:**
- Produces: `Panel` editor/markdown variants without `explorerRoot`; `openFileInPanel` no longer computes or stores a per-panel root.

- [ ] **Step 1: Remove the old resolver functions and their tests**

In `src/modules/workspaces/lib/explorerRoot.ts`, delete `resolveOpenRoot` and `resolveActiveExplorerRoot` (and `isUnder` if only they used it; keep `normalize` only if still referenced). Remove the `pathDirname` import if it becomes unused.

In `src/modules/workspaces/lib/explorerRoot.test.ts`, delete the `describe("resolveOpenRoot", ...)` and `describe("resolveActiveExplorerRoot", ...)` blocks and their now-unused imports, leaving only the `resolveExplorerRoot` suite.

- [ ] **Step 2: Drop the panel field**

In `src/modules/workspaces/lib/types.ts`, edit the editor and markdown variants:

```typescript
  | { id: string; kind: "editor"; path: string; title?: string; dirty: boolean; preview: boolean; locked?: boolean }
  | { id: string; kind: "markdown";        path: string;  title?: string }
```

- [ ] **Step 3: Remove explorerRoot plumbing in useWorkspaces**

In `src/modules/workspaces/lib/useWorkspaces.ts`:
- Remove the `explorerRoot: string,` parameter (line ~229) from the open-editor helper and its use at line ~240 (`{ ..., explorerRoot }` becomes `{ id: newPanelId(), kind: "editor", path, preview: false, dirty: false }`).
- At lines ~391 and ~395 (sanitize/restore mapping), drop `explorerRoot: p.explorerRoot` from the editor and markdown objects.
- Update the helper's call sites (if the open-editor helper is called elsewhere in the hook) to stop passing the removed argument.

- [ ] **Step 4: Remove resolveOpenRoot usage in App.tsx**

In `src/app/App.tsx`:
- Delete `const panelExplorerRoot = resolveOpenRoot(explorerRootRef.current, path);` (line ~444).
- In `openFileInPanel`, remove `explorerRoot: panelExplorerRoot,` from the `replacePanel` editor object (line ~461) and from the `openPanel` markdown/editor objects (lines ~471-472).
- At line ~1489, remove the `resolveOpenRoot(explorerRootRef.current, path)` argument from whatever call uses it (adjust that call to the open-editor helper's new signature).
- Remove `resolveOpenRoot` from the import added in Task 3 Step 2, leaving `resolveExplorerRoot` and `ExplorerRootMode`.
- If `explorerRootRef` becomes unused after this, remove its declaration and the `explorerRootRef.current = explorerRoot;` assignment (line ~374). If it is still read elsewhere, keep it.

- [ ] **Step 5: Typecheck (this is the safety net)**

Run: `pnpm check-types`
Expected: no errors. Fix any remaining references the compiler flags (e.g. other call sites passing `explorerRoot` to a panel).

- [ ] **Step 6: Lint and test**

Run: `pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(explorer): remove per-editor explorer root override"
```

---

## Task 5: Mode selector row and menu in FileExplorer

Add a selector row above the existing button row showing `mode icon + root folder name + chevron`, with a dropdown listing the four modes.

**Files:**
- Modify: `src/modules/explorer/FileExplorer.tsx` (props, header row ~540-553, imports ~10-17)
- Modify: `src/app/components/RightPanel.tsx:28-51` (props) and the `<FileExplorer>` call (~101-112)
- Modify: `src/app/App.tsx` (both `<RightPanel>` render sites ~1507 and ~1568)

**Interfaces:**
- Consumes: `ExplorerRootMode`, `setExplorerRootMode` (per active workspace id).
- Produces: `FileExplorer` props `rootMode: ExplorerRootMode` and `onChangeRootMode: (mode: ExplorerRootMode) => void`; `RightPanel` props of the same name forwarded through.

- [ ] **Step 1: Add the icon imports**

In `src/modules/explorer/FileExplorer.tsx`, extend the hugeicons import block. Use these existing hugeicons names: `Holdphone01Icon` is wrong; use `ComputerTerminal01Icon` (terminal), `GitBranchIcon` (git), `ComputerIcon` (filesystem/home — or `Home01Icon`), `PinIcon` (pinned), and the chevron `ArrowDown01Icon`. Verify each name exists in `@hugeicons/core-free-icons` (the package exports thousands; if one is missing, `pnpm check-types` will flag it and you pick the nearest sibling). Suggested block:

```typescript
import {
  ArrowDown01Icon,
  ComputerTerminal01Icon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  GitBranchIcon,
  Home01Icon,
  PinIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
```

Also import the dropdown primitives:

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

(If `dropdown-menu` is not yet in `src/components/ui/`, add it with `pnpm dlx shadcn add dropdown-menu` rather than hand-writing it.)

- [ ] **Step 2: Add the props**

Extend the `Props` type in `FileExplorer.tsx` (after `rootPath`):

```typescript
  rootMode: import("@/modules/workspaces/lib/explorerRoot").ExplorerRootMode;
  onChangeRootMode: (
    mode: import("@/modules/workspaces/lib/explorerRoot").ExplorerRootMode,
  ) => void;
```

Prefer a top-of-file `import { type ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";` and use the bare name in the `Props` type. Add `rootMode` and `onChangeRootMode` to the destructured params of the `forwardRef` function.

- [ ] **Step 3: Add a mode descriptor table (module scope)**

Above the component in `FileExplorer.tsx`:

```typescript
const ROOT_MODES: {
  id: ExplorerRootMode;
  label: string;
  description: string;
  icon: typeof Search01Icon;
}[] = [
  { id: "terminal", label: "Follow terminal", description: "Sigue el cwd del terminal activo", icon: ComputerTerminal01Icon },
  { id: "git", label: "Follow git root", description: "Sube a la raiz del repositorio", icon: GitBranchIcon },
  { id: "filesystem", label: "File system", description: "Empieza en tu carpeta home", icon: Home01Icon },
  { id: "pinned", label: "Pinned folder", description: "Carpeta fijada manualmente", icon: PinIcon },
];
```

- [ ] **Step 4: Replace the header title span with the selector**

In the header row (lines ~540-553), replace the `<span ...>{basename(rootPath)}</span>` block with a dropdown trigger. The selector occupies its own row above the action buttons; restructure so the header has two rows (selector row, then the existing buttons row). Selector markup:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      className="flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-xs font-medium text-foreground/80 hover:bg-accent"
      title={rootPath ?? undefined}
    >
      <HugeiconsIcon
        icon={(ROOT_MODES.find((m) => m.id === rootMode) ?? ROOT_MODES[0]).icon}
        size={13}
        strokeWidth={2}
        className="text-primary"
      />
      <span className="truncate">
        {rootMode === "filesystem" ? "~" : basename(rootPath)}
      </span>
      <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="ml-auto text-muted-foreground" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-64">
    {ROOT_MODES.map((m) => (
      <DropdownMenuItem
        key={m.id}
        onSelect={() => onChangeRootMode(m.id)}
        className="flex items-start gap-2.5"
      >
        <HugeiconsIcon icon={m.icon} size={14} strokeWidth={2} className="mt-0.5 text-primary" />
        <span className="flex flex-col">
          <span className="text-xs font-medium">{m.label}</span>
          <span className="text-[11px] text-muted-foreground">{m.description}</span>
        </span>
        {rootMode === m.id && <span className="ml-auto text-primary">{"✓"}</span>}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

Keep the existing Search / New file / New folder / Refresh buttons in a second header row below the selector. Match surrounding class conventions.

- [ ] **Step 5: Forward props through RightPanel**

In `src/app/components/RightPanel.tsx`, add to `RightPanelProps` (near `rootPath`):

```typescript
  rootMode: ExplorerRootMode;
  onChangeRootMode: (mode: ExplorerRootMode) => void;
```

Import the type: `import { type ExplorerRootMode } from "@/modules/workspaces/lib/explorerRoot";`. In the `<FileExplorer>` call, pass `rootMode={props.rootMode}` and `onChangeRootMode={props.onChangeRootMode}`.

- [ ] **Step 6: Pass props from App.tsx at both RightPanel sites**

At both `<RightPanel ... />` render sites (~1507 and ~1568) add:

```tsx
                      rootMode={activeWorkspace?.explorerRootMode ?? "terminal"}
                      onChangeRootMode={(mode) => {
                        if (activeWorkspace) setExplorerRootMode(activeWorkspace.id, mode);
                      }}
```

- [ ] **Step 7: Typecheck, lint, test**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 8: Manual verification**

Run: `pnpm tauri dev` (fresh process, not HMR, per the HMR gotcha). Open the Explorer, click the selector, switch between Follow terminal / Follow git root / File system and confirm the tree root changes accordingly and the active mode shows a check.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(explorer): add root mode selector to the explorer header"
```

---

## Task 6: "Set as root" folder context action

Add a "Set as root" item to the folder-row context menu that pins that folder and switches the workspace to Pinned mode.

**Files:**
- Modify: `src/modules/explorer/FileExplorer.tsx` (folder-row context menu; the per-entry row component referenced around lines 497-511 receives `onRevealInTerminal` and `isDir`)
- Modify: `src/app/components/RightPanel.tsx` (forward `onSetAsRoot`)
- Modify: `src/app/App.tsx` (provide `onSetAsRoot`)

**Interfaces:**
- Consumes: `setPinnedRoot(workspaceId, path)` from Task 2.
- Produces: `FileExplorer`/`RightPanel` prop `onSetAsRoot: (path: string) => void`.

- [ ] **Step 1: Add the prop and thread it to the row**

In `FileExplorer.tsx` `Props`, add `onSetAsRoot: (path: string) => void;`. Destructure it and pass it down to the per-entry row component the same way `onRevealInTerminal` is passed (follow the existing prop at line ~511). Locate the row component (the one rendering a `ContextMenu` per entry with `isDir`); add `onSetAsRoot` to its props.

- [ ] **Step 2: Add the context menu item (folders only)**

In the per-entry row's `ContextMenuContent`, add, shown only when `isDir`:

```tsx
{isDir && (
  <ContextMenuItem className={COMPACT_ITEM} onSelect={() => onSetAsRoot(path)}>
    Set as root
  </ContextMenuItem>
)}
```

Place it near "Open in Terminal" / before the separator, matching the existing item styling (`COMPACT_ITEM`). Use the row's own `path` variable for that entry.

- [ ] **Step 3: Forward through RightPanel**

In `RightPanelProps` add `onSetAsRoot: (path: string) => void;` and pass `onSetAsRoot={props.onSetAsRoot}` to `<FileExplorer>`.

- [ ] **Step 4: Provide from App.tsx**

At both `<RightPanel>` sites add:

```tsx
                      onSetAsRoot={(path) => {
                        if (activeWorkspace) setPinnedRoot(activeWorkspace.id, path);
                      }}
```

- [ ] **Step 5: Typecheck, lint, test**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 6: Manual verification**

`pnpm tauri dev`: right-click a folder in the tree, choose "Set as root". The selector should switch to Pinned and the tree should reroot to that folder. Switch workspaces and back; the pinned root persists for that workspace.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(explorer): add Set as root folder context action"
```

---

## Task 7: Pinned-invalid empty state

When the mode is Pinned but the pinned path no longer exists, show an empty state with `PinOffIcon`, the dead path, and three buttons to switch mode (Follow terminal, Follow git root with a resolved hint, Open file system explorer).

**Files:**
- Modify: `src/app/App.tsx` (validate pinned path; compute git-root hint)
- Modify: `src/app/components/RightPanel.tsx` (forward props)
- Modify: `src/modules/explorer/FileExplorer.tsx` (render empty state instead of tree)

**Interfaces:**
- Consumes: `native.fsStat(path)` (rejects/returns for a missing path), `native.gitResolveRepo`.
- Produces: `FileExplorer`/`RightPanel` props:
  - `pinnedInvalid: boolean`
  - `pinnedPath: string | null`
  - `gitRootHint: string | null`
  - `onChangeRootMode` (reused from Task 5) for the Follow terminal / Follow git root / File system buttons.

- [ ] **Step 1: Validate the pinned path in App.tsx**

Add near the `explorerRoot` computation:

```typescript
  const [pinnedInvalid, setPinnedInvalid] = useState(false);
  const [gitRootHint, setGitRootHint] = useState<string | null>(null);
  const pinnedPath = activeWorkspace?.pinnedRoot ?? null;

  useEffect(() => {
    if (activeRootMode !== "pinned" || !pinnedPath) {
      setPinnedInvalid(false);
      return;
    }
    let cancelled = false;
    void native
      .fsStat(pinnedPath)
      .then(() => {
        if (!cancelled) setPinnedInvalid(false);
      })
      .catch(() => {
        if (!cancelled) setPinnedInvalid(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRootMode, pinnedPath]);

  useEffect(() => {
    if (!pinnedInvalid) {
      setGitRootHint(null);
      return;
    }
    let cancelled = false;
    const probe = pinnedPath ?? activeCwd ?? lastTerminalCwdRef.current;
    const fallback = activeCwd ?? lastTerminalCwdRef.current;
    void (async () => {
      let hint: string | null = null;
      if (probe) {
        const info = await native.gitResolveRepo(probe).catch(() => null);
        hint = info?.repoRoot ?? null;
      }
      if (!hint && fallback) {
        const info = await native.gitResolveRepo(fallback).catch(() => null);
        hint = info?.repoRoot ?? null;
      }
      if (!cancelled) setGitRootHint(hint ?? fallback ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [pinnedInvalid, pinnedPath, activeCwd]);
```

(If `native.fsStat` resolves for a path that exists but is a file, that is fine: a pinned root is always a directory created via "Set as root".)

- [ ] **Step 2: Forward the props through RightPanel and both App render sites**

Add to `RightPanelProps`: `pinnedInvalid: boolean; pinnedPath: string | null; gitRootHint: string | null;` and pass them to `<FileExplorer>`. At both `<RightPanel>` sites in App.tsx pass `pinnedInvalid={pinnedInvalid}`, `pinnedPath={pinnedPath}`, `gitRootHint={gitRootHint}`.

- [ ] **Step 3: Render the empty state in FileExplorer**

Add the `PinOff` icon to the imports:

```typescript
  PinOffIcon,
```

(from `@hugeicons/core-free-icons`). Add props `pinnedInvalid`, `pinnedPath`, `gitRootHint` to `Props` and the destructuring. Right after the header rows, before the tree body, short-circuit:

```tsx
{pinnedInvalid ? (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
    <HugeiconsIcon icon={PinOffIcon} size={26} strokeWidth={1.8} className="text-destructive/80" />
    <div className="text-sm font-medium text-foreground">La carpeta fijada ya no existe</div>
    {pinnedPath && <div className="break-all text-[11px] text-muted-foreground">{pinnedPath}</div>}
    <div className="mt-2 flex w-full flex-col gap-2">
      <button
        type="button"
        onClick={() => onChangeRootMode("terminal")}
        className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs hover:bg-accent"
      >
        <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} className="text-primary" />
        Follow terminal
      </button>
      <button
        type="button"
        onClick={() => onChangeRootMode("git")}
        className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs hover:bg-accent"
      >
        <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={2} className="text-primary" />
        Follow git root
        {gitRootHint && (
          <span className="ml-auto max-w-[150px] truncate text-[10px] text-muted-foreground">
            {gitRootHint}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onChangeRootMode("filesystem")}
        className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs hover:bg-accent"
      >
        <HugeiconsIcon icon={Home01Icon} size={14} strokeWidth={2} className="text-primary" />
        Open file system explorer
      </button>
    </div>
  </div>
) : (
  /* existing tree body JSX */
)}
```

Wrap the existing tree body (the scroll container with the rows) as the `else` branch. Keep the selector + button header rows always visible (outside this conditional).

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm check-types && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 5: Manual verification**

`pnpm tauri dev`: create a temp folder, "Set as root" it, then delete the folder from disk. The Explorer shows the empty state with the dead path and three buttons; "Follow git root" shows the resolved hint; clicking a button switches mode and restores a tree.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(explorer): empty state for invalid pinned folder"
```

---

## Task 8: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Explorer root model + the removed editor override)
- Modify: `docs/FORK.md` (this fork adds explorer root modes)

- [ ] **Step 1: Update ARCHITECTURE.md**

In the explorer / workspace section, document: the four Explorer root modes are per-workspace state in `workspace-state.json` (`explorerRootMode`, `pinnedRoot`); the root is resolved by the pure `resolveExplorerRoot`; the last known git root is runtime-only and re-derived on restart; the editor/markdown `explorerRoot` override was removed so there is one coherent root; the fuzzy finder is scoped to that root. Keep it to the non-obvious "why", no restating code.

- [ ] **Step 2: Update FORK.md**

Add an entry under the appropriate phase/theme: "Explorer root modes" as a fork-added feature (Follow terminal / Follow git root / File system / Pinned folder), noting it diverges from upstream's terminal-cwd-only Explorer root.

- [ ] **Step 3: Verify full suite**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/FORK.md
git commit -m "docs: document explorer root modes"
```

---

## Self-Review notes

- **Spec coverage:** four modes (Task 1 resolver + Task 5 UI), per-workspace persistence (Task 2 + existing `saveWorkspaceState` serializes the whole `Workspace`, so the new fields persist with no extra work; `explorerRoot` on panels simply stops being written), git-root fallback to last known (Task 3 `gitRootByWs` is kept until a new repo is detected; leaving a repo does not clear it), single coherent root + editor override removal (Task 4), fuzzy finder scoped to root (already true: `ExplorerSearch` searches `rootPath` which is `explorerRoot`), selector UI variant A (Task 5), "Set as root" (Task 6), pinned-invalid empty state with PinOffIcon and 3 buttons + git-root hint (Task 7).
- **Migration:** absent `explorerRootMode` resolves to `"terminal"` (Task 3 `activeRootMode` default), so existing persisted workspaces behave exactly as today. Old persisted panels with a stale `explorerRoot` field are ignored (field dropped from the type; not read).
- **Persistence confirmation:** `saveWorkspaceState` maps `workspaces.map(sanitizeWorkspace)` and `sanitizeWorkspace` spreads the whole workspace, so `explorerRootMode`/`pinnedRoot` are saved automatically. No change needed in `workspaceState.ts`.
- **Type consistency:** `ExplorerRootMode` defined once and imported everywhere; `GitRepoInfo.repoRoot` used consistently; setters named `setExplorerRootMode` / `setPinnedRoot` across Tasks 2, 3, 5, 6.
