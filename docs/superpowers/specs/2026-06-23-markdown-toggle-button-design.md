# Markdown Edit/Preview Toggle Button

**Date:** 2026-06-23

## Goal

Replace the two text buttons "Edit" and "Rendered" in the markdown editor overlay bar with a single icon toggle button that communicates the current mode.

## Scope

Single file change: `src/modules/editor/EditorOverlayBar.tsx`.

## Design

### Behavior

- One button, always visible when `view` prop is provided.
- Click toggles between `"raw"` and `"rendered"` modes: `view.onChange(view.mode === "raw" ? "rendered" : "raw")`.
- Disabled when `view.renderedDisabled === true` and current mode is `"raw"` (cannot switch to rendered).

### Icons (from `@hugeicons/core-free-icons`)

| Mode | Icon | Title |
|------|------|-------|
| `raw` (editing) | `PencilEdit01Icon` | `"Edit mode"` |
| `rendered` (preview) | `EyeIcon` | `"Preview mode"` |
| disabled | `PencilEdit01Icon` (raw) | `view.renderedHint` |

### Styling

- Size: `size-[22px]` with `flex items-center justify-center rounded` (matches `[...]` button).
- Icon size: 12px.
- Colors: `text-muted-foreground transition-colors hover:text-foreground`.
- Disabled: `cursor-not-allowed opacity-40`.
- The vertical separator between `[...]` and the toggle is kept as-is (only shown when `showToggles && v`).

## What Does Not Change

- `view` prop shape (`mode`, `onChange`, `renderedDisabled`, `renderedHint`) is unchanged.
- Persistence, state management, and all other `EditorOverlayBar` logic are unchanged.
