# Editor Preview on Click

**Date:** 2026-06-20
**Status:** Approved

## Summary

Add a user setting "Click for preview" (default on) that makes single-clicking a file in the explorer open it in a temporary preview tab with an italic title. A second single-click on a different file replaces the preview tab in place. The preview tab becomes permanent (no longer italic) when the user edits the file or locks the tab. When the setting is off, single-clicking a file does nothing.

## Context

The `preview: boolean` field already exists on the `editor` panel type in `types.ts` and is already set to `true` by `openFileInPanel` when called without `pin`. However, none of the preview behavior (italic title, tab replacement, flag clearing) is implemented yet.

## New Preference

**Key:** `editorPreviewOnClick`
**Type:** `boolean`
**Default:** `true`
**Store key:** `"editorPreviewOnClick"`

Changes required in `src/modules/settings/store.ts`:
- Add to `Preferences` type
- Add to `DEFAULT_PREFERENCES`
- Add `KEY_EDITOR_PREVIEW_ON_CLICK` constant
- Add to `loadPreferences`
- Add `setEditorPreviewOnClick` setter
- Add to `PREF_KEY_MAP`

## Explorer behavior

### Single click (TreeRow `handleClick`)

- `editorPreviewOnClick = true`: calls `onOpenFile(path)` without pin (existing behavior, results in `preview: true`)
- `editorPreviewOnClick = false`: only calls `onSelectPath(path)`, does NOT call `onOpenFile`

`TreeRow` receives `editorPreviewOnClick` as a new prop. `FileExplorer` reads it from `usePreferencesStore` and passes it down.

### Enter key (FileExplorer `handleKeyDown`, `"Enter"` case for files)

- `editorPreviewOnClick = true`: `onOpenFile(row.path)` without pin (preview mode)
- `editorPreviewOnClick = false`: no-op

Directories toggle regardless of the setting.

### Context menu "Open"

Calls `onOpenFile(path, true)` (pin = true), always opens permanently. Unaffected by the setting.

## Tab replacement logic

In `openFileInPanel` (App.tsx), when called without `pin` (preview mode):

1. If the requested file is already open in any pane as editor or markdown: activate it and return its ID. No replacement.
2. Find the existing preview panel in the **active pane**: `pane.panels.find(p => p.kind === "editor" && p.preview)`.
3. If found: replace that panel in-place at the same array index with a new panel (new ID, new path, `preview: true`, `dirty: false`). Activate the new panel.
4. If not found: open a new tab as currently done.

This requires a new function in `useWorkspaces`:

```typescript
replacePanel(workspaceId: string, paneId: string, oldPanelId: string, newPanel: Panel): void
```

It updates the panels array, swapping the old panel at its index for the new one, and sets `activePanelId` to the new panel's ID.

Markdown files (`.md`, `.mdx`) opened via single click still go through the `openFileInPanel` path. Since they produce a `markdown` panel (not `editor`), they do not get `preview: true` and do not participate in preview replacement. Opening a markdown file via single click never replaces a preview tab and never becomes a preview tab itself.

## Clearing the preview flag

### On edit (dirty change)

In `onEditorDirtyChange` (App.tsx), when `dirty` becomes `true`:

```typescript
updatePanelData(found.workspace.id, panelId, (p) =>
  p.kind === "editor" ? { ...p, dirty, preview: dirty ? false : p.preview } : p,
);
```

Once `preview` is cleared to `false`, it is never set back to `true` on subsequent dirty changes.

### On lock

Wherever a lock is toggled to `true` via `onUpdatePanel` in `PaneTabBar.tsx` (the lock button click and the hover card lock toggle), add `preview: false` to the same updater:

```typescript
onUpdatePanel?.(panel.id, (p) => ({ ...p, locked: true, preview: false }))
```

Only when locking (not unlocking).

## Visual: italic tab title

In `PaneTabBar.tsx`, on the `<span>` that renders `displayTitle`, add:

```tsx
panel.kind === "editor" && panel.preview && "italic"
```

No other visual change. The dirty dot, lock icon, and close button are unaffected.

## Settings UI

In `src/settings/sections/GeneralSection.tsx`, under the "Editor" section, between "Vim mode" and "Auto save":

```
Click for preview
Single click opens a file in a temporary preview tab. Opening another file replaces it. The tab becomes permanent once you edit or lock it.
[Switch]
```

## Files to change

| File | Change |
|---|---|
| `src/modules/settings/store.ts` | Add `editorPreviewOnClick` preference |
| `src/modules/settings/preferences.ts` | No change needed (already generic) |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Add `replacePanel` function |
| `src/app/App.tsx` | Update `openFileInPanel` (replacement logic) and `onEditorDirtyChange` (clear preview on dirty) |
| `src/modules/workspaces/PaneTabBar.tsx` | Italic class for preview tabs; clear preview on lock |
| `src/modules/explorer/FileExplorer.tsx` | Read `editorPreviewOnClick`, pass to TreeRow, update Enter handler |
| `src/modules/explorer/TreeRow.tsx` | Receive `editorPreviewOnClick` prop, gate `onOpenFile` in `handleClick` |
| `src/settings/sections/GeneralSection.tsx` | Add Switch for the new setting |

## What does not change

- Double-click in the explorer (currently triggers rename via F2 and the double-click handler; unrelated to this feature).
- Drag-and-drop opening of files into panes: always opens permanently (`preview: false`).
- `WorkspaceDndProvider` file drops: always `preview: false`.
- `splitPaneAndOpenFile`: always `preview: false`.
- Markdown panels (`kind: "markdown"`): never get `preview: true`, not affected by the setting.
