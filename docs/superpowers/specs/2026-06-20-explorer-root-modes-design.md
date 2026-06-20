# Explorer root modes

## Problem

The Explorer's root is always derived dynamically from the active terminal's cwd
(OSC 7). The resolution chain in `App.tsx` is: active terminal cwd, then last
known terminal cwd, then the first workspace cwd, then `home`. There is no way to
"escape" that and browse the wider filesystem, anchor to the project root, or pin
a fixed folder.

The first terminal of a fresh workspace starts in `home`, so any attempt to
seed a fixed "workspace folder" from the initial cwd is useless: it just captures
`home`. The root must be chosen by an explicit, user-selected mode, not seeded.

A second wrinkle: when the active panel is an editor or markdown panel, the
Explorer ignores the terminal entirely and shows the file's folder (via the
panel's `explorerRoot?` field or the file's dirname). That is a second, competing
notion of "root" that this design removes.

## Goal

Give each workspace an explicit Explorer root mode, chosen by the user and
persisted. The mode is the single source of truth for the Explorer root,
regardless of whether a terminal or an editor is focused.

## The four modes

Mode is per-workspace state, persisted in `workspace-state.json`.

- **Follow terminal** (default): root = active terminal cwd. Current behavior.
- **Follow git root**: root = nearest ancestor of the active terminal cwd that
  contains a `.git`. Recomputed on every cwd change. If the current cwd is not
  inside any repo, keep showing the last known git root until the terminal enters
  another repo.
- **File system**: root = the user's home directory (fixed).
- **Pinned folder**: root = a folder the user fixed via "Set as root" (fixed).

### Follow git root details

- Git root detection reuses the Rust command `git_resolve_repo`.
- "Last known git root" is per-workspace transient state: it survives cwd changes
  that leave a repo, and is updated whenever a new repo root is detected.
- On startup, before any cwd has produced a git root, fall back to Follow terminal
  behavior (show the cwd) until a repo is detected.

### Pinned folder details

- "Set as root" is a new action in the folder context menu. It switches the mode
  to Pinned and anchors the chosen path.
- The pinned path is persisted per workspace.
- If the pinned path no longer exists (deleted, or stale after restart), the
  Explorer shows an empty state instead of a tree (see UI below).

## Single coherent root

The workspace mode always determines the Explorer root. The editor override is
removed:

- The `explorerRoot?` field on `editor` and `markdown` panels is removed from the
  data model and from `resolveActiveExplorerRoot`. Focusing an editor no longer
  changes the Explorer root.
- The fuzzy finder is scoped to the active Explorer root. You can never open a
  file outside the current view; the previously possible "open a file outside the
  visible root" case disappears.

## Data model

Add to `Workspace` (`src/modules/workspaces/lib/types.ts`):

```typescript
export type ExplorerRootMode = "terminal" | "git" | "filesystem" | "pinned";

export type Workspace = {
  id: string;
  title: string;
  cwd?: string;
  paneTree: SplitNode;
  activePaneId: string;
  explorerRootMode?: ExplorerRootMode; // default "terminal" when absent
  pinnedRoot?: string;                 // only meaningful when mode === "pinned"
};
```

- `explorerRootMode` absent is treated as `"terminal"`, so existing persisted
  workspaces migrate transparently with no behavior change.
- `pinnedRoot` is only read when the mode is `"pinned"`.
- Remove `explorerRoot?` from the `editor` and `markdown` variants of `Panel`.
- "Last known git root" is runtime-only state (not persisted): on restart, Follow
  git root re-derives it from the current cwd.

## Root resolution (functional core)

Replace the current `ambientExplorerRoot` chain and `resolveActiveExplorerRoot`
in `App.tsx` with a pure function. Suggested home in
`src/modules/workspaces/lib/explorerRoot.ts`:

```typescript
type Resolve = {
  mode: ExplorerRootMode;
  terminalCwd: string | null;   // active terminal cwd
  lastGitRoot: string | null;   // last detected git root for this workspace
  pinnedRoot: string | null;
  home: string;
};

export function resolveExplorerRoot(r: Resolve): string | null;
```

- `terminal`: `terminalCwd ?? home`.
- `git`: the git root for `terminalCwd` if any, else `lastGitRoot`, else
  `terminalCwd ?? home`.
- `filesystem`: `home`.
- `pinned`: `pinnedRoot` (the caller checks existence; non-existent triggers the
  empty state, not a different root).

Git root lookup is async (`git_resolve_repo`), so the resolved git root and the
"last known git root" are tracked in a small hook/effect keyed by the active
terminal cwd; the pure function only selects among already-known values. The
pure function stays synchronous and testable.

## UI

### Mode selector (own row above the tree)

A dedicated row at the top of the Explorer, above the existing button row:
`mode icon + root folder name + chevron`. The folder name is the basename of the
resolved root; for File system / home it shows `~`. Clicking opens a menu with
the four modes (icon + title + description + check on the active one):

- Follow terminal, icon terminal: "Sigue el cwd del terminal activo"
- Follow git root, icon git branch: "Sube a la raiz del repositorio"
- File system, icon home: "Empieza en tu carpeta home"
- Pinned folder, icon pin: "Carpeta fijada manualmente"

The selector and menu use shadcn/hugeicons primitives, matching existing Explorer
header styling.

### Folder context menu

Add a "Set as root" action (pin icon) to the folder context menu in
`FileExplorer.tsx`. Selecting it sets `explorerRootMode = "pinned"` and
`pinnedRoot = <folder path>` on the active workspace.

### Pinned-invalid empty state

When mode is `"pinned"` and `pinnedRoot` does not exist, the tree area shows an
empty state:

- Icon: `<HugeiconsIcon icon={PinOffIcon} />`.
- Message: "La carpeta fijada ya no existe" + the dead path below it.
- Three buttons to switch mode:
  - Follow terminal
  - Follow git root, with a small hint showing the root it would resolve to:
    the nearest git root walking up from the dead pinned path, or, if none is
    found, the git root of the current terminal (Follow git root is dynamic and
    tracks the terminal anyway).
  - Open file system explorer

## Persistence and migration

- `explorerRootMode` and `pinnedRoot` are added to the persisted workspace state
  (`workspace-state.json`, via the existing debounced save).
- Absent `explorerRootMode` -> `"terminal"`, so all existing state loads unchanged.
- `explorerRoot?` on editor/markdown panels is dropped; loaders ignore the field
  if present in old state (no migration step needed, it is simply unused).

## Edge cases

- Mode is `git` but no repo anywhere up the tree and no last known root: behaves
  like Follow terminal (shows cwd), never blank.
- Pinned path becomes invalid while in use (folder deleted at runtime): switch to
  empty state on the next tree read / fs error.
- Switching workspaces restores each workspace's own mode and pinned path.
- Home shown as `~` in the selector; other roots show their basename.

## Testing

Pure-function unit tests for `resolveExplorerRoot` covering every mode and its
fallbacks:

- terminal with and without cwd
- git with repo / without repo but with lastGitRoot / without either
- filesystem always home
- pinned returns pinned path

The git-root tracking hook is exercised via the existing terminal cwd plumbing;
lock the invariant that leaving a repo keeps `lastGitRoot` until a new repo is
entered.

## Affected files

- `src/modules/workspaces/lib/types.ts` (add mode + pinnedRoot, drop panel
  explorerRoot)
- `src/modules/workspaces/lib/explorerRoot.ts` (new pure resolver + tests)
- `src/app/App.tsx` (replace ambient root chain; track git root + lastGitRoot;
  pass mode/root down)
- `src/app/components/RightPanel.tsx` (pass mode + setters to FileExplorer)
- `src/modules/explorer/FileExplorer.tsx` (mode selector row, menu, "Set as
  root" context action, pinned-invalid empty state)
- `src/modules/workspaces/lib/useWorkspaces` (set mode / pinnedRoot per workspace)
- Docs: `docs/ARCHITECTURE.md` (Explorer root model), and `docs/FORK.md` if this
  diverges from upstream behavior.
```
