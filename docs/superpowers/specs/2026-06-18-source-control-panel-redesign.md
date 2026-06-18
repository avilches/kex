# Source Control Panel Redesign

**Date:** 2026-06-18
**Status:** Approved

## Goal

Replace the current single-list-with-checkboxes layout with a VS Code-style two-section panel
that makes the staged/unstaged split explicit and intuitive.

## Current behavior (problems)

- Single "Changes" list with a checkbox per file to toggle staged state.
- The checkbox model is unfamiliar: most users expect "checkbox = select for operation", not
  "checkbox = staged state".
- A header "All" checkbox with indeterminate state is confusing.
- A discard button hidden on hover with no obvious affordance.
- No visual separation between what goes into the next commit and what does not.

## New behavior

Two distinct sections rendered in a virtualizer, ordered top-to-bottom:

1. **Staged Changes** - files in the Git index (what goes into the next commit)
2. **Changes** - unstaged files (tracked modifications + untracked files)

Each section is visible only when it has entries. When both are empty, "Working tree clean" is
shown as before.

A file that is both staged and unstaged (partially staged) appears in both sections
simultaneously, showing different diffs: the staged diff from "Staged Changes" and the
unstaged diff from "Changes".

## Section headers

Section headers are clickable to collapse/expand the section (chevron ▼/▶).

Action buttons appear only on hover of the section header:

**Staged Changes header:**
- `[−all]` - unstage all staged files (`unstageAllEntries`)

**Changes header:**
- `[⊗all]` - discard all unstaged changes (`requestDiscardAll`, with confirm dialog)
- `[+all]` - stage all unstaged files (`stageAllEntries`)

## File rows

**Staged entry:**
- File icon + name + directory path
- On hover: `[−]` button - unstage this file (`unstageEntry`)
- Click on name: opens staged diff (mode `"+"`, HEAD → index)

**Changes entry:**
- File icon + name + directory path
- On hover: `[⊗]` discard button (with confirm dialog) + `[+]` stage button
- Click on name: opens unstaged diff (mode `"-"`, index → working tree)

Status badge (M, A, D, R, U) and color accent bar remain as-is.

## Keyboard shortcuts

Navigation is across both sections as a flat list of entry rows:

| Key | Action |
|-----|--------|
| `↑ / ↓` | Move focus between rows in both sections |
| `Enter` | Open diff for focused entry |
| `Space` / `s` | Stage if in Changes, unstage if in Staged |
| `d` | Discard (only active for Changes entries) |
| `Cmd/Ctrl+R` | Refresh |

## Diff behavior

`selectEntry` already accepts `{ path, mode }` so clicking from different sections naturally
opens the correct diff. Selection highlight tracks `(path, mode)`, meaning a file in both
sections can be highlighted only in the section from which it was opened.

## Row data model (virtualizer)

```ts
type RowDescriptor =
  | { kind: "banner-diverged"; key: string }
  | { kind: "staged-header"; key: string; count: number }
  | { kind: "staged-entry"; key: string; entry: SourceControlEntry }
  | { kind: "changes-header"; key: string; count: number }
  | { kind: "changes-entry"; key: string; entry: SourceControlEntry }
```

Collapsed state (`stagedCollapsed`, `changesCollapsed`) lives in the panel component as
`useState`. When a section is collapsed, its entry rows are omitted from the rows array -
the virtualizer never sees them.

## Hook changes

The hook already exposes all needed primitives via `stagedEntries`, `unstagedEntries`,
`stageEntry`, `unstageEntry`, `stageAllEntries`, `unstageAllEntries`, `requestDiscardEntry`,
`requestDiscardAll`, `selectEntry`.

The following become unused and should be removed from `useSourceControlPanel`:
- `fileEntries`
- `toggleStageFile`
- `headerCheckState`
- `toggleAll`
- `requestDiscardFile`

## Scope

- `src/modules/source-control/SourceControlPanel.tsx` - primary change (UI only)
- `src/modules/source-control/useSourceControlPanel.ts` - remove dead exports

No changes to Rust, IPC, or other modules.
