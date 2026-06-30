# Workspace Statuses

**Date**: 2026-06-29

## Overview

Add a workspace status system: a global list of status labels (managed in Settings), each workspace can have one status assigned, and the sidebar groups workspaces by status.

## Data Model

### `WorkspaceStatus` type (new, in `store.ts`)

```ts
export type WorkspaceStatus = { id: string; label: string };
```

ID is generated with `newStatusId()` (new export in `src/lib/ids.ts`, random nid-based, prefix `st-`). IDs are immutable once created; renaming the label does not change the ID.

Predefined defaults (hardcoded in `DEFAULT_WORKSPACE_STATUSES`):

```ts
{ id: "archived",         label: "Archived" }
{ id: "work-in-progress", label: "Work in progress" }
{ id: "on-hold",          label: "On hold" }
{ id: "canceled",         label: "Canceled" }
{ id: "completed",        label: "Completed" }
```

### `Preferences` changes (`store.ts`)

New field: `workspaceStatuses: WorkspaceStatus[]`

- Stored in `settings-general.json` with key `workspaceStatuses`
- Default value: `DEFAULT_WORKSPACE_STATUSES`
- Load: if not on disk, load defaults
- Setter: `setWorkspaceStatuses(value: WorkspaceStatus[])`
- Cross-window sync via existing `PREFS_CHANGED_EVENT` + `GENERAL_PREF_KEY_MAP`

### `Workspace` type change (`types.ts`)

Add `statusId?: string` to the `Workspace` type.

On workspace load (`workspaceState.ts`): if `statusId` does not match any ID in the current `workspaceStatuses` list, normalize it to `undefined`. This happens in `sanitizeWorkspace` / `migrateWorkspace`.

## Settings: New "Workspaces" Section

### Tab registration

- Add `"workspaces"` to `SettingsTab` union in `openSettingsWindow.ts`
- Insert between `"general"` and `"terminal"` in `SECTIONS` array in `SettingsApp.tsx`
- Icon: a suitable hugeicons icon (e.g. `WorkflowSquare10Icon`)
- Component: `WorkspacesSection` in `src/settings/sections/WorkspacesSection.tsx`

### `WorkspacesSection` UI

A managed list of statuses with drag-to-reorder, inline rename, and delete:

```
Workspace Statuses

[drag]  [Archived            ]  [delete]
[drag]  [Work in progress    ]  [delete]
[drag]  [On hold             ]  [delete]
[drag]  [Canceled            ]  [delete]
[drag]  [Completed           ]  [delete]

                          [+ Add status]
```

Behavior:
- **Label input**: `INPUT_CLASS` style (from `ExternalEditorsSection` pattern). On blur, saves immediately via `setWorkspaceStatuses`.
- **Delete**: removes the status and calls `setWorkspaceStatuses`. Workspaces that had that `statusId` will show up in "no status" group (handled by the sidebar filtering against valid IDs at render time, not requiring a data migration).
- **Reorder**: `@dnd-kit` `SortableContext` + `useSortable`, same pattern as `RunConfigSection`.
- **Add**: clicking "+ Add status" when an empty-label item already exists focuses that item instead of creating another. Otherwise, creates a new `WorkspaceStatus` with `id = newStatusId()`, empty label, and focuses the input.
- **Empty cleanup**: when leaving the section (component unmounts or user navigates away), any items with empty `label.trim()` are removed from the list.

## Workspace Properties: Status Selector

In `WorkspaceSettingsDialog`, tab "Properties", add a "Status" field below "Color".

A pill-based selector (same visual pattern as the color palette):

```
Status
[×]  [Archived]  [Work in progress]  [On hold]  [Canceled]  [Completed]
```

- `[×]` is a cancel button (no status). Active/selected state: `border-foreground`. Inactive: `border-transparent hover:border-muted-foreground/50`.
- Each status pill shows its label. Selected pill: `border-foreground`. Pills use `flex-wrap` for overflow.
- Clicking a pill calls `onSetStatus(ws.id, status.id)`. Clicking `[×]` calls `onSetStatus(ws.id, null)`.
- If `workspaceStatuses` is empty, the entire "Status" section is hidden.

### Props changes to `WorkspaceSettingsDialog`

```ts
workspaceStatuses: WorkspaceStatus[];
onSetStatus: (id: string, statusId: string | null) => void;
```

## Sidebar: Grouped by Status with Multi-container DnD

### `WorkspaceItem` extension

Add `statusId?: string` to the local `WorkspaceItem` type in `WorkspaceSidebar.tsx`.

### `WorkspaceSidebarProps` additions

```ts
workspaceStatuses: WorkspaceStatus[];
onSetStatus: (id: string, statusId: string | null) => void;
```

### Grouping logic

Groups are derived at render time:

1. **No-status group**: workspaces where `statusId` is undefined, null, or not in `workspaceStatuses`. No header.
2. **Status groups**: one per entry in `workspaceStatuses`, in order. Only rendered if non-empty.

Empty groups (no workspaces assigned) are not rendered.

### Group header

- **Expanded mode** (sidebar > 80px): `text-[10px] font-medium uppercase text-muted-foreground/60`, padded to match workspace item horizontal padding.
- **Compact mode** (sidebar <= 80px): just a thin horizontal `<hr>` / `<div>` separator (1px, `bg-border/40`).

### DnD multi-container

- Single `DndContext` wraps the whole sidebar (replaces current single `SortableContext`).
- Each group has its own `SortableContext` keyed by group id (`"__none__"` for no-status, or the `status.id`).
- `onDragEnd`:
  - Determine source group and target group from the active/over item positions.
  - If **same group**: call `onReorder(activeId, overId)` (existing behavior).
  - If **different group**: call `onSetStatus(activeId, targetGroupStatusId | null)` and `onReorder` if the position within the target group also changed.
- `DragOverlay` renders a simplified version of the workspace button while dragging.

## `useWorkspaces`: new action

Add `setWorkspaceStatus(workspaceId: string, statusId: string | null)` which updates `ws.statusId` for the matching workspace and persists state.

## Wiring in `App.tsx`

- Read `workspaceStatuses` from `usePreferencesStore`.
- Pass `workspaceStatuses` and `onSetStatus` to `WorkspaceSidebar` and `WorkspaceSettingsDialog`.
- Map `workspace.statusId` into `WorkspaceItem.statusId` when building the items array for the sidebar.

## Files changed

| File | Change |
|------|--------|
| `src/lib/ids.ts` | Add `newStatusId` |
| `src/modules/workspaces/lib/types.ts` | Add `statusId?: string` to `Workspace` |
| `src/modules/workspaces/lib/workspaceState.ts` | Normalize orphaned `statusId` to `undefined` in `migrateWorkspace` |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Add `setWorkspaceStatus` action |
| `src/modules/settings/store.ts` | Add `WorkspaceStatus`, `workspaceStatuses` to `Preferences`, key, load, save, setter |
| `src/modules/settings/openSettingsWindow.ts` | Add `"workspaces"` to `SettingsTab` |
| `src/settings/sections/WorkspacesSection.tsx` | New file |
| `src/settings/SettingsApp.tsx` | Register Workspaces section |
| `src/app/components/WorkspaceSidebar.tsx` | Grouped rendering + multi-container DnD |
| `src/app/components/WorkspaceSettingsDialog.tsx` | Status pill selector in Properties tab |
| `src/App.tsx` | Wire new props and actions |
