# File System mode: navigable per-workspace root

## Problem

The explorer's File System mode always shows the user's home directory as its
root. Users cannot browse into a subtree as if it were the top of the explorer,
nor navigate back up. The root is fixed to `home`.

We want File System mode to have its own navigable root, stored per workspace,
that defaults to home. Double-clicking a folder enters it (it becomes the new
root and the tree refreshes). An up button climbs to the parent, all the way to
the filesystem root (`/` on Unix, drive root on Windows), where climbing stops.
A home button jumps back to the user's home and is hidden when already there.

The other modes (Follow Terminal, Follow Git Root, Workspace Root) are
unaffected: no up/home buttons, and double-clicking a folder does nothing.

## Scope

In scope:

- Per-workspace navigable filesystem root (`fsRoot`), defaulting to home.
- Double-click on a folder enters it (File System mode only).
- Up button (File System mode only), capped at the filesystem/drive root.
- Home button (File System mode only), hidden when the root is already home.
- A JSON-only settings flag `keepFolderLayoutOnChangeExplorerRoot` to choose
  whether the expanded-folder layout resets or is preserved when the root
  changes.

Out of scope:

- Any change to Follow Terminal / Follow Git Root / Workspace Root behavior.
- A breadcrumb / path bar beyond the two navigation buttons.
- Windows "list of drives" view above a drive root (up stops at the drive root).
- Settings UI for the new flag (JSON only for now).

## Design

### Data model and persistence

Add an optional field to `Workspace` (`src/modules/workspaces/lib/types.ts`):

```ts
fsRoot?: string;
```

This is the navigable root for File System mode, stored per workspace and
persisted automatically with the rest of the workspace state to
`workspace-state.json` (the existing 300ms-debounced save). No new persistence
plumbing is needed.

`resolveExplorerRoot` (`src/modules/workspaces/lib/explorerRoot.ts`) gains an
`fsRoot` input and, in `filesystem` mode, returns `fsRoot ?? home` instead of
`home`. All other modes are unchanged.

```ts
export type ResolveExplorerRootInput = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;
  gitRoot: string | null;
  pinnedRoot: string | null;
  fsRoot: string | null;
  home: string | null;
};

// filesystem: return fsRoot ?? home
```

### Functional core: setter

A new pure helper in `useWorkspaces.ts`, mirroring `applyPinnedRoot` but without
switching the mode (File System mode is already active when it is used):

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

Exposed from the hook as `setFsRoot(workspaceId, path)`, alongside the existing
`setExplorerRootMode` / `setPinnedRoot`.

### Imperative shell: App.tsx

`fsRoot` is read from the active workspace and fed into `resolveExplorerRoot`:

```ts
const fsRootPath = activeWorkspace?.fsRoot ?? null;
// resolveExplorerRoot({ ..., fsRoot: fsRootPath })
```

Three handlers, each a no-op unless `activeRootMode === "filesystem"`:

- `handleEnterFolder(path)` -> `setFsRoot(activeWorkspace.id, path)`.
- `handleNavigateUp()` -> compute the parent of the current `explorerRoot` with
  `pathDirname`; if it differs from the current root, `setFsRoot` to it. At the
  filesystem root (`/`) or a Windows drive root, `pathDirname` returns the same
  path, so this is a natural no-op.
- `handleNavigateHome()` -> `setFsRoot(activeWorkspace.id, home)`.

The "can go up" predicate and "is at home" predicate are derived in App and
passed to the explorer so the buttons can disable/hide correctly. Concretely:

- `canNavigateUp = isFilesystemMode && explorerRoot != null && pathDirname(explorerRoot) !== explorerRoot`
- `isAtHome = explorerRoot === home`

### UI: FileExplorer header (Option A placement)

Only in File System mode, rendered to the **left of the mode selector**, in this
order:

1. Up button (arrow up icon). Disabled (not hidden) when `!canNavigateUp`, so
   the header layout stays stable at the top of the tree.
2. Home button (home icon). Rendered only when `!isAtHome`.
3. A thin vertical separator before the selector.

In all other modes none of these render, and the header is exactly as today.

New `FileExplorer` props:

```ts
onEnterFolder?: (path: string) => void; // only passed in filesystem mode
onNavigateUp?: () => void;
onNavigateHome?: () => void;
canNavigateUp: boolean;
isAtHome: boolean;
```

`RightPanel` forwards these straight through, matching the existing pattern for
`onSetAsRoot` / `onChangeRootMode`.

### Double-click to enter a folder

In `TreeRow`, the current handler:

```ts
onDoubleClick={() => !isDir && onOpenFile(path, true)}
```

becomes:

```ts
onDoubleClick={() => {
  if (isDir) onEnterFolder?.(path);
  else onOpenFile(path, true);
}}
```

`onEnterFolder` is only non-null when File System mode is active (App passes
`undefined` otherwise), so in the other modes a double-click on a folder does
nothing. Single-click keeps toggling expand/collapse as today.

### Expanded-layout flag

A new boolean preference `keepFolderLayoutOnChangeExplorerRoot` in the
preferences store (`src/modules/settings/`), default **false**, with **no UI**
(editable only via the store JSON). Semantics:

- `false` (default): when the explorer root changes, the tree starts collapsed,
  showing only the new root's direct contents. This matches "entering" a folder
  and refreshing.
- `true`: the set of expanded folders is preserved across a root change (those
  still under the new root remain expanded).

Implementation lives in `useFileTree` (`src/modules/explorer/lib/useFileTree.ts`),
which is keyed on `rootPath`. When `rootPath` changes and the flag is false,
reset the expanded set (and any transient tree state that should not survive a
root change). When the flag is true, leave the expanded set intact. The flag is
read where `useFileTree` is consumed (FileExplorer) and threaded into the hook,
so the hook stays free of store coupling.

This flag exists to A/B the two behaviors in real use before committing to one;
it is intentionally not surfaced in Settings UI.

## Error handling and edge cases

- **Stale `fsRoot`**: a saved `fsRoot` may no longer exist on disk after a
  restart. The explorer already renders a load error state for a missing root
  directory (the `root?.status === "error"` branch). The user can use the home
  button or the mode selector to recover. No special handling beyond reusing the
  existing error UI.
- **Up at the top**: `pathDirname("/")` returns `/`; `pathDirname("C:/")`
  returns `C:/`. `handleNavigateUp` becomes a no-op and `canNavigateUp` is
  false, so the button is disabled/hidden. No drive-list view.
- **Windows paths**: canonical frontend paths are forward-slash; `pathDirname`
  already handles both separators. `fsRoot` is stored in canonical
  forward-slash form, consistent with the other roots.
- **Mode switching**: leaving and returning to File System mode restores the
  saved `fsRoot` (it lives on the workspace). Switching to pinned via "Set as
  root folder" is unchanged and independent of `fsRoot`.
- **Double-click net effect**: a double-click fires two single-clicks (toggle
  open then closed) and then the double-click handler. Since the root changes
  and the tree rebuilds for the new root, the transient toggle is not visible.

## Testing

Pure-function unit tests (the functional core):

- `explorerRoot.test.ts`: extend with cases for `filesystem` mode returning
  `fsRoot` when set and `home` when `fsRoot` is null; other modes ignore
  `fsRoot`.
- `useWorkspaces.test.ts`: `applyFsRoot` sets and normalizes the trailing slash,
  targets only the matching workspace, and does not change the mode.

Behavioral checks (manual or component-level where practical):

- Double-click a folder in File System mode enters it; in other modes it does
  nothing.
- Up button climbs to parent and stops at `/` (disabled at the top).
- Home button appears only when not at home and jumps to home.
- `keepFolderLayoutOnChangeExplorerRoot` false resets the layout on root change;
  true preserves it.

A change to the explorer root resolution is core enough to lock the
`resolveExplorerRoot` and `applyFsRoot` invariants with tests in the same commit
as the code.
