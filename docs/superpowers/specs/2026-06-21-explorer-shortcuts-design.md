# Explorer Shortcuts & Sidebar UX Design

## Summary

Add 4 keyboard shortcuts for explorer view modes, decouple "show panel" from
"toggle panel", add a dedicated Toggle Sidebar shortcut, and fix the native
macOS View menu to use checkmarks.

## Scope

- `src/modules/shortcuts/shortcuts.ts` — new IDs, new group "Sidebar"
- `src/app/App.tsx` — handler changes, new helpers
- `src/modules/explorer/FileExplorer.tsx` — shortcut hints in dropdown
- `src-tauri/src/lib.rs` — CheckMenuItem for View menu items

## New ShortcutGroup

Add `"Sidebar"` between "General" and "Tabs" in `SHORTCUT_GROUPS`.

## New/Changed ShortcutIds

Remove: `pane.source`, `rightPanel.toggle`

Add:

| id | label | default binding |
|---|---|---|
| `sidebar.toggle` | Toggle Sidebar | MOD+Alt+B |
| `sidebar.showExplorer` | Show Explorer | MOD+E |
| `sidebar.showGit` | Show Git Changes | MOD+G |
| `sidebar.showHistory` | Show Git History | MOD+Alt+H |
| `explorer.viewFilesystem` | Explorer: File System | Ctrl+1 |
| `explorer.viewPinned` | Explorer: Workspace Root | Ctrl+2 |
| `explorer.viewTerminal` | Explorer: Follow Terminal | Ctrl+3 |
| `explorer.viewGit` | Explorer: Follow Git Root | Ctrl+4 |

Note: `explorer.view*` use `ctrl: true` (not MOD_PROP) so they are Ctrl+1-4
on all platforms including macOS.

## Behavior changes in App.tsx

- `sidebar.toggle` -> `toggleRightPanel()` (open/close)
- `sidebar.showExplorer` -> `showRightPanelTab("explorer")` (open + show, never close)
- `sidebar.showGit` -> `showRightPanelTab("git")`
- `sidebar.showHistory` -> `showRightPanelTab("history")`
- `explorer.view*` -> `showExplorerWithMode(mode)` (open panel + switch to explorer + change mode)

New helpers:
- `showRightPanelTab(tab)`: if closed, open + set tab. If open, set tab only.
- `showExplorerWithMode(mode)`: open panel + set explorer tab + call onChangeRootMode.

`navigateRightPanelTo` is kept only for cases that genuinely toggle (none after
this change); its usages are replaced by the new helpers.

## Explorer dropdown

Map each `ExplorerRootMode` to its `ShortcutId`:
- `"filesystem"` -> `"explorer.viewFilesystem"`
- `"pinned"` -> `"explorer.viewPinned"`
- `"terminal"` -> `"explorer.viewTerminal"`
- `"git"` -> `"explorer.viewGit"`

Show the shortcut hint as plain menu-style text (not pills) at the far right of
each `DropdownMenuItem`, after the selected-mode checkmark. Uses `userShortcuts`
from `usePreferencesStore` already available in the component.

## Native macOS menu

Change `DynMenuItems.sidebar/explorer/git/history` from `MenuItem` to `CheckMenuItem`.
Import `CheckMenuItemBuilder` alongside the existing builders.

Labels become static: "Sidebar", "Explorer", "Git Changes", "Git History".

`sync_menu` calls `.set_checked(bool)` on each:
- sidebar: `state.sidebar_open`
- explorer: `state.sidebar_open && state.active_tab == "explorer"`
- git: `state.sidebar_open && state.active_tab == "git"`
- history: `state.sidebar_open && state.active_tab == "history"`

Menu actions:
- `toggle_sidebar` -> `sidebar.toggle` (toggle)
- `toggle_explorer` -> `sidebar.showExplorer` (open only)
- `toggle_git` -> `sidebar.showGit` (open only)
- `toggle_history` -> `sidebar.showHistory` (open only)
