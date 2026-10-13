# Sidebar view state per workspace (TASK-817)

## Problem

The Sidebar is a single instance shared by every workspace. Switching workspace changes its props and loses the view state: which explorer folders are open, which file is selected, the scroll position and the active view (explorer, git, history, notes). A hibernated workspace, or a closed Sidebar, unmounts it and loses the same state. The only memory was `expansionCache` in `useFileTree.ts` (since removed): in memory, keyed by root path (not by workspace), 8 entries, gone after a restart, and it covered neither selection, scroll nor view.

## Decisions

- **Scope: per workspace.** Not per tab. The explorer root already follows the active tab cwd, and per-tab state would multiply what is stored.
- **Persistence: in the workspace JSON.** It survives workspace switches, hibernation and restarts. No migration: a workspace saved before this change starts from the defaults.
- **Approach: one Sidebar instance, one snapshot per workspace.** Nothing stays mounted for a workspace that is not shown, so hibernation keeps freeing resources and its overlay stays centered.

## Data model

`Workspace` gains an optional field:

```ts
sidebar?: {
  view: SidebarView;
  expanded: string[];       // absolute paths of open explorer folders
  selectedPath: string | null;
  scroll: { root: string; top: number } | null;
}
```

`open`, `side` and `width` stay per window (`sidebarState.ts`). Only `view` changes owner: it is read from the active workspace's `sidebar.view` (default `explorer`) and `setSidebarView` writes there. `sanitizeSidebarState` and the Rust command `window_save_sidebar` stop carrying `view`.

## Restore rule (pure function)

`restoreSidebarSnapshot(snapshot, root)` returns the `expanded`, `selectedPath` and `scrollTop` that can be applied under the current explorer root. Paths are absolute, so nothing is rewritten:

1. Keep the `expanded` paths that are under `root` (`isUnder`). The rest are dropped.
2. Add the intermediate folders between `root` and each kept path (`ancestorsToExpand`). This matters when the root moved up: the old root is not in `expanded` because the root is always drawn, and it must be open to show what was inside.
3. `selectedPath` is kept if it is under `root`, and its ancestors are added the same way. Otherwise it is null.
4. `scroll.top` is applied only when `scroll.root === root`. Otherwise the explorer starts at the top.
5. `view` does not depend on the root and is always restored.

A root that moves up keeps everything, a root that moves down keeps what is still under it, and an unrelated root keeps nothing. A restored folder that no longer exists on disk fails its directory read and is dropped silently; the rest still opens.

The snapshot is applied only when a workspace becomes active or the Sidebar mounts (workspace switch, wake, reopening a closed Sidebar). A root change inside a session carries the current open folders over through the same rule (`carryOverExpanded`: the previous root is added to the set and `restoreExplorerSnapshot` keeps what lies under the new root plus the folders in between); `expansionCache` and the JSON-only preference `keepFolderLayoutOnChangeExplorerRoot` are removed, and there is no per-root memory. `useFileTree` takes an optional initial expanded set from the snapshot for the first load of a root, and keeps reporting its expanded set outward, so the snapshot always mirrors what the tree shows (a root change saves the carried-over list).

## Saving

The explorer reports changes to expanded folders, selection and scroll. They go through a generic coalescer and then into `Workspace.sidebar`; from there they follow the normal debounced workspace save, exactly like agent titles.

- `createTitleCoalescer` in `agentTitleSync.ts` is generalised to `createCoalescer<K, V>` (new file in `modules/workspaces/lib/`). `agentTitleSync.ts` uses it with no behaviour change and its tests keep passing. The sidebar uses it keyed by workspace id with the snapshot as value.
- The 10 s window applies: the first change goes out at once, later ones wait and go out together.
- `flush` runs on workspace switch, on hibernation, on window close and before any restore (including reopening a closed Sidebar), so a restore never reads a stale snapshot.
- Closing a workspace drops its pending change.
- The only loss case is a crash or forced quit within the 10 s window.

## Autofocus

The autofocus effect in `App.tsx` fires when the active tab changes. Switching workspace also changes it, and the reveal would overwrite the restored state. So:

- Changing tab inside the same workspace: autofocus behaves as today.
- Switching workspace or waking a hibernated one: the restored state wins and autofocus does not fire for that transition. `prevAutofocusSignalRef` includes the workspace id, so a workspace change only updates the signal without calling `focusSidebar`.
- `lastFocusFolderRef` (the "second press" heuristic) is reset on workspace switch, since today it leaks between workspaces.
- Explicit actions (F4, reveal in explorer, the toolbar button) are unchanged and always act.

## Hibernation and wake

Hibernating leaves the Sidebar unmounted as today; the snapshot is already saved because of the flush. Waking mounts the Sidebar, which receives the snapshot and applies the restore rule. The wake overlay stays centered.

## Tests

- The restore function: root moves up, moves down, switches to an unrelated branch, stays the same; selection inside and outside the root; scroll with same and different root; empty and missing snapshot.
- The generic coalescer: the existing title tests move to it, plus a case with a non-string value.
- The autofocus signal: a workspace change does not trigger `focusSidebar`, a tab change inside the workspace does.
- Sanitizing `Workspace.sidebar` on load (wrong types, duplicates, non-absolute paths).

## Documentation

`docs/ARCHITECTURE.md` and `docs/WORKSPACES.md` describe the state model and the restore rule, and state that a root change inside a session carries the open folders over through the same rule. `docs/IPC.md` is updated for the `window_save_sidebar` signature.

## Out of scope

Per-tab state, internal state of the git, history and notes views (the notes view keeps its own `kex.json`), and a snapshot per past root.
