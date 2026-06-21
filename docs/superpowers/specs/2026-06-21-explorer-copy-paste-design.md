# Explorer copy/cut/paste design

## Goal

Add copy/cut/paste of files and folders to the file explorer, reusing the
existing duplicate background-task engine (progress, cancellation, Cmd+Q quit
guard) for copy. Add `Copy` / `Cut` / `Paste` / `Rename` entries to the explorer
context menu (rename is already implemented; only the menu entry and shortcut
hint are new).

## Decisions

- **Internal clipboard only.** Copy/cut store the source path in app state. They
  do not write to the OS clipboard. Pasting in Finder/Explorer or in a terminal
  does nothing (those read the OS pasteboard, which Kex does not touch). Native
  file references (`NSPasteboardTypeFileURL` / `CF_HDROP` / `text/uri-list`) are
  explicitly out of scope.
- **Copy** uses `fs_duplicate` (background task, "Copying" modal). The clipboard
  persists after paste, so you can paste a copy multiple times.
- **Cut** is a move via `fs_rename` (with `git_mv` fallback, same as rename).
  Instant, no background task. The clipboard is cleared after a successful paste
  (one-shot).
- **Paste is direct**, no inline name editor. On copy, auto-renames on collision
  via the existing `suggestDuplicateName` (`" copy"` / `" 2"` suffix). On cut,
  a name collision aborts with a toast (a move must not silently rename).
- **Paste destination**: selected node is a folder -> paste inside it (child);
  selected node is a file -> paste into its parent (sibling); nothing selected ->
  paste into root.
- Rename the busy check `isDuplicating()` -> `isCopying()` (same semantics).

## Components

### 1. Internal clipboard (`useFileTree.ts`)

New React state next to `pendingDuplicate`:
`const [clipboard, setClipboard] = useState<{ path: string; kind: "file" | "dir"; mode: "copy" | "cut" } | null>(null)`.
Lives while the explorer is mounted. Does not touch the OS clipboard. Exposed via
`actions` and as a `clipboard` value for menu enablement and cut dimming.

### 2. Copy / Cut actions

- `copyToClipboard(path, kind)` -> `setClipboard({ path, kind, mode: "copy" })`.
- `cutToClipboard(path, kind)` -> `setClipboard({ path, kind, mode: "cut" })`.

Both are instantaneous; no background task. A cut node is dimmed in the tree
(`TreeRow` checks `path === clipboard.path && clipboard.mode === "cut"` and lowers
opacity, VSCode-style) until paste or until the clipboard is replaced/cleared.

### 3. Paste action (`pasteFromClipboard(targetPath, targetIsDir)`)

Common:

- Resolve destination dir from the selected node (folder -> inside; file ->
  parent; none -> root).
- **Self-nesting guard**: if the clipboard is a `dir` and the destination dir is
  that same folder or lives inside it, reject with a toast.
- Read the destination dir listing **fresh** (direct `fs_read_dir`, not the
  possibly-stale or unloaded React `nodes`) to detect collisions.

Mode `copy`:

- If `isCopying()` -> toast "A copy is already in progress" and return.
- If the original name exists in the destination, apply `suggestDuplicateName`;
  otherwise keep the original name.
- Call `native.duplicate(source, dest)` (existing `fs_duplicate`), then
  `fetchChildren(destDir)` and expand the destination folder.
- Clipboard persists (paste-again supported).

Mode `cut`:

- If `dest === source` (same parent, same name) -> no-op, clear clipboard.
- If the name exists in the destination -> toast "Already exists: {name}" and
  abort (no silent rename on a move).
- Move via `git_mv` first, fallback `fs_rename` (mirrors `commitRename`). Notify
  `options?.onPathRenamed?.(source, dest)` so open tabs/editors follow the move.
- `fetchChildren` both the source parent and the destination dir; clear the
  clipboard.

### 4. Background-task reuse (no Rust changes)

`fs_duplicate`, the task, progress events (`kex:duplicate-progress`),
cancellation, and the Cmd+Q quit guard are reused unchanged for copy.
`isCopying()` blocks copy-paste and duplicate while a copy is running. Cut uses
`fs_rename` / `git_mv`, which already exist.

### 5. Modal/progress label -> "Copying"

`DuplicateProgressBar.tsx`: "Duplicating {name}" -> "Copying {name}", covering
both duplicate and copy-paste. Internal event names (`kex:duplicate-*`) stay the
same; only the visible text changes. `DuplicateQuitModal` already says "Cancel
copy & quit", consistent.

### 6. Shortcuts (registry, reassignable)

Three new entries in `SHORTCUTS` with their `ShortcutId`:

- `file.copy` -> default Cmd/Ctrl+C
- `file.cut` -> default Cmd/Ctrl+X
- `file.paste` -> default Cmd/Ctrl+V

Handled **locally** in `FileExplorer.handleKeyDown` via
`matchesShortcut(e.nativeEvent, "file.copy" | "file.cut" | "file.paste", userShortcuts)`,
only when the explorer is focused and (for copy/cut) a node is selected (not
global, so they do not clash with terminal copy/paste). They do not touch
`path.copy` (Cmd/Ctrl+Shift+C, "Copy path").

### 7. Context menu

Right below New File / New Folder (in the row menu and the root menu where it
applies), add, with their shortcut hints, in standard order:

- **Cut** (`file.cut`)
- **Copy** (`file.copy`)
- **Paste** (`file.paste`) -> disabled when `clipboard == null` or `isCopying()`
- **Rename** (`file.rename`) -> already implemented, only the menu entry + hint

"Duplicate" and "Copy Path" / "Copy Relative Path" stay as they are.

## Edge cases

- Source deleted/moved before paste -> `fs_duplicate` / `fs_rename` errors; show
  a toast.
- Paste into a collapsed/unloaded destination folder -> handled by the fresh
  `fs_read_dir` read before computing the dedup name / collision check.
- Copy or cut a folder, paste inside itself -> blocked by the self-nesting guard.
- Cut + paste into the same folder -> no-op (clipboard cleared).
- Cut across filesystems (`fs_rename` cross-device fails) -> error toast;
  acceptable limitation (no copy+delete fallback for now).
- Busy (`isCopying()`) -> copy-paste blocked, matching duplicate. Cut is
  unaffected (it does not use the copy task).

## Out of scope

- Multi-selection (explorer is single-selection today).
- OS clipboard integration / native file references.
- Cross-filesystem cut fallback (copy then delete).
