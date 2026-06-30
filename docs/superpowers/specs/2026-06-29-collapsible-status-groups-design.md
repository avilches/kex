# Collapsible Status Groups in Workspace Sidebar

**Date:** 2026-06-29  
**Status:** Approved

## Overview

Status groups in the workspace sidebar can be collapsed or expanded by the user.
Collapsed groups hide their workspaces from the sidebar and from keyboard navigation.
When any workspace inside a collapsed group becomes active (for any reason), the group
auto-expands. Collapsed state is persisted per OS window and restored on startup.
Each group label shows a count of its workspaces.

## Requirements

1. Each status group header is a clickable row with a chevron icon (rotates when collapsed).
2. Clicking the header toggles the group collapsed/expanded.
3. In compact mode (sidebar width <= 80px), the horizontal divider line is also clickable to toggle.
4. When collapsed, the workspaces of that group are hidden in the sidebar.
5. When a workspace in a collapsed group becomes active (any source: keyboard, notification,
   command palette, direct click from another mechanism), the group auto-expands.
6. `workspace.prev` / `workspace.next` keyboard shortcuts skip workspaces in collapsed groups.
   If all groups are collapsed, only workspaces with no status (the __none__ group) remain
   navigable. If even that is empty or collapsed, cycling does nothing.
7. The group label shows a workspace count: `"Working (3)"`.
8. In compact mode the count is not visible (no label to attach it to).
9. Collapsed state is persisted per window and restored on startup.

## Architecture

### Rust: `window_state.rs`

Add to `WindowEntry`:
```rust
#[serde(default)]
pub collapsed_status_groups: Vec<String>,
```

Add to `WindowStateManager` a method `update_collapsed_status_groups(&self, label, ids)`.

### Rust: `lib.rs`

New Tauri command:
```rust
#[tauri::command]
fn window_save_collapsed_groups(app: tauri::AppHandle, label: String, ids: Vec<String>) {
    let mgr = app.state::<window_state::WindowStateManager>();
    mgr.update_collapsed_status_groups(&label, ids);
    mgr.save();
}
```
Register alongside the other `window_save_*` commands.

### Frontend: `collapsedGroupsState.ts`

New module at `src/modules/workspaces/lib/collapsedGroupsState.ts`.
Mirrors the pattern of `workspaceSidebarState.ts`:

- `setSavedCollapsedGroups(raw: unknown): void` - called from `initWorkspaceState` with `entry?.collapsedStatusGroups`
- `getSavedCollapsedGroups(): string[]` - returns cached value
- `saveCollapsedGroups(label: string, ids: string[]): void` - debounced invoke of `window_save_collapsed_groups`

### Frontend: `workspaceState.ts`

- Add `collapsedStatusGroups?: string[]` to the `WindowEntry` TypeScript type.
- In `initWorkspaceState`, call `setSavedCollapsedGroups(entry?.collapsedStatusGroups)`.
- Import `setSavedCollapsedGroups` from `collapsedGroupsState`.

### Frontend: `App.tsx`

- Import `getSavedCollapsedGroups`, `saveCollapsedGroups` from `collapsedGroupsState`.
- Add state: `const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(getSavedCollapsedGroups()))`.
- Add `handleToggleGroup(statusId: string)`: toggles the id in the set and calls `saveCollapsedGroups`.
- Add `useEffect` watching `activeWorkspaceId`: if the newly active workspace has a `statusId` that
  is currently in `collapsedGroups`, remove it from the set and persist. This handles all sources
  of workspace activation uniformly (keyboard, notification, click, etc.).
- Update `cycleWorkspace`: filter `workspaces` to exclude those whose `statusId` is in `collapsedGroups`
  before computing the next index.
- Pass `collapsedGroups` and `onToggleGroup={handleToggleGroup}` to `WorkspaceSidebar`.

### Frontend: `WorkspaceSidebar.tsx`

New props added to `WorkspaceSidebarProps`:
- `collapsedGroups: Set<string>`
- `onToggleGroup: (statusId: string) => void`

**Normal mode group header (when label !== null):**
- Replace the current `<div>` with a `<button>` row.
- Left: a `ChevronRight` icon that rotates 90deg when expanded.
- Center: label text truncated.
- Right: count badge `(N)` in muted text.
- Full row clickable, calls `onToggleGroup(group.id)`.

**Compact mode group separator (label === null handled separately; for status groups with label):**
- Replace `<div className="mx-1.5 my-1 h-px ...">` with a `<button>` that has the same appearance
  but is clickable. A small visual indicator (slightly different opacity or a dot) shows when collapsed.

**Items rendering:**
- When `collapsedGroups.has(group.id)`, skip rendering items and the `SortableContext` for that group.
  The group still appears in the DnD context array (empty items list) so the overall context is valid.

## Data Flow

```
startup:
  initWorkspaceState() -> invoke window_get_state -> entry.collapsedStatusGroups
    -> setSavedCollapsedGroups(array)
  App.tsx init: useState(() => new Set(getSavedCollapsedGroups()))

user toggles group:
  WorkspaceSidebar header click -> onToggleGroup(statusId) -> App.tsx handleToggleGroup
    -> setCollapsedGroups(next) -> saveCollapsedGroups(label, [...next])
      -> invoke window_save_collapsed_groups (debounced)

workspace becomes active:
  setActiveWorkspaceId(id) [any source]
  useEffect([activeWorkspaceId]) -> if group collapsed -> expand -> persist

keyboard nav:
  cycleWorkspace(delta) -> filter out workspaces in collapsedGroups -> cycle remaining
```

## Out of Scope

- Dragging into collapsed groups.
- Keyboard shortcut to toggle a group.
- The `__none__` group (workspaces with no status) is never collapsible - it has no label/header.
