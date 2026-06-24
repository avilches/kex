# HTML Preview + Editor Save Fix

Date: 2026-06-24
Worktree: html-preview

## Scope

Two related features:

1. **Live preview** for `.html` and `.md` files: a floating toggle button in the editor that shows
   a rendered preview of the current buffer (without requiring save).
2. **Save shortcut**: move `editor.save` from hardcoded keymap to the shortcuts registry, and add
   a global handler so Cmd+S works even when CodeMirror does not have focus.

---

## Feature 1: Live preview

### User experience

- Opening a `.html` or `.md` file shows a floating button (Eye icon) in the top-right corner of
  the editor, identical to the current Markdown preview button.
- Clicking it switches to preview mode: the editor hides, the rendered preview fills the panel.
- The preview shows the **current buffer content** - no save required.
- While preview is active, edits made in the editor (which stays mounted but hidden) are reflected
  in the preview with ~300ms debounce.
- If the file changes on disk (external edit, auto-save, manual Cmd+S), the editor reloads the
  file (existing behavior via `useEditorFileSync`) and `onContentChange` propagates the update to
  the preview automatically. No separate disk watcher in the preview pane.
- Clicking the Edit button (DocumentCode icon) returns to the editor with cursor position preserved
  (the editor was never unmounted).
- The preview state (`previewMode: true/false`) persists across tab switches because it is stored
  in the panel data.

### Conflict behavior (unsaved changes + external disk change)

Inherited from existing `useDocument` behavior: if the editor buffer is dirty, disk changes are
ignored. The preview always reflects the buffer, so there is no inconsistency.

### Future: split view

Not in scope now. The overlay architecture (editor always mounted) makes it a layout-only change
later: instead of hiding the editor, render editor and preview side by side. Tracked in
`docs/TODO.md`.

---

### Architecture

#### Panel data (`src/modules/workspaces/lib/types.ts`)

Add `previewMode?: boolean` to the editor panel variant:

```typescript
| { id: string; kind: "editor"; path: string; title?: string; dirty: boolean;
    preview: boolean; previewMode?: boolean; locked?: boolean; autofocus?: boolean }
```

#### `kind: "markdown"` backward compatibility

The `kind: "markdown"` variant stays in the `Panel` union type to avoid breaking stored workspace
state. In `PanelContent`, the `"markdown"` switch case is updated to render the same overlay
layout as an editor with `previewMode: true`, treating the panel as if it were
`{ kind: "editor", previewMode: true }`. No migration or store conversion needed.

#### `EditorPane` (`src/modules/editor/EditorPane.tsx`)

Add optional prop:

```typescript
onContentChange?: (content: string) => void
```

Call it inside CodeMirror's `onChange` callback. The debounce (300ms) is applied at the call site
in `PanelContent`, not inside `EditorPane`, to keep the component generic.

#### `PanelContent` (`src/modules/workspaces/PanelContent.tsx`)

For `kind: "editor"` panels:

- Track `liveContent: string | null` in local state.
- Pass a debounced `onContentChange` to `EditorPane` that updates `liveContent`.
- When `previewMode` toggles on: if `liveContent` is null (no change has fired yet), call
  `editorRef.current?.getContent()` to seed the initial value.
- Render layout:
  - Editor div: `className={previewMode ? "invisible pointer-events-none absolute inset-0" : "h-full w-full"}`
  - Preview div: `className={previewMode ? "absolute inset-0 z-10" : "hidden"}`
- The toggle button calls `onTogglePreview(panel.id)` (new callback, see App.tsx).

#### `EditorOverlayBar` (`src/modules/editor/EditorOverlayBar.tsx`)

The existing `view` prop already handles toggle button rendering. Extend so callers can pass
`isHtml: boolean` to select the correct shortcut label:

- Markdown: uses shortcut `editor.markdown.toggleView`
- HTML: uses shortcut `editor.html.toggleView`

Both show the same Eye/DocumentCode icons. No other change needed.

#### New `HtmlPreviewPane` (`src/modules/html-preview/HtmlPreviewPane.tsx`)

Props: `{ content: string; path: string; onSetView: (mode: "rendered" | "raw") => void }`

- Derives the base URL: `convertFileSrc(parentDir(path))` to resolve relative assets.
- Injects `<base href="{baseUrl}">` into the content before inserting into `srcdoc`:
  - If `<head>` tag exists: insert after it.
  - Otherwise: prepend.
- Renders:

```tsx
<iframe
  srcdoc={contentWithBase}
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  title="HTML preview"
  className="h-full w-full border-0"
/>
```

- Shows `EditorOverlayBar` with `view={{ mode: "rendered", onChange: onSetView }}` and `isHtml: true`.

Changing `srcdoc` on an existing iframe re-renders its content natively; no key-based remounting
needed.

#### `MarkdownPreviewPane` (`src/modules/markdown/MarkdownPreviewPane.tsx`)

Change signature: replace `path` + `visible` props with `content: string` + `onSetView`.
Remove the `fs_read_file` call, the `useEffect` that loads from disk, and the loading/error/binary
states (content always comes from the editor buffer, which already handles those states).
Keep `EditorOverlayBar`. The `path` prop is no longer needed since disk watching is handled
entirely by `useEditorFileSync` through the mounted editor.

#### `src/lib/utils.ts`

Add:

```typescript
export function isHtmlPath(path: string): boolean {
  return /\.(html|htm)$/i.test(path)
}
```

#### Shortcuts (`src/modules/shortcuts/shortcuts.ts`)

Add two entries (see Feature 2 for `editor.save`):

- `editor.html.toggleView` - label "Toggle HTML preview", group "Editor",
  defaultBindings `["Mod-Shift-P"]` (same default as `editor.markdown.toggleView`).

#### `App.tsx`

- Add `onTogglePreview` callback: reads the active panel, calls `updatePanelData` to flip
  `previewMode` on the editor panel.
- Wire up shortcut handlers for `editor.markdown.toggleView` and `editor.html.toggleView`
  (both call `onTogglePreview`).
- `onSetMarkdownView` and `setPanelView` in `useWorkspaces` can be removed once the `kind:
  "markdown"` case in PanelContent no longer calls them.

---

## Feature 2: Save shortcut

### Problem

- `Mod-s` is hardcoded in `EditorPane`'s CodeMirror keymap. It does not appear in Settings and
  cannot be reassigned by the user (violates project convention).
- When CodeMirror does not have focus (e.g., preview is active or user clicked elsewhere), the
  keystroke reaches the WKWebView default handler and causes an unexpected full-page refresh.

### Fix

#### `src/modules/shortcuts/shortcuts.ts`

Add:

```typescript
{ id: "editor.save", label: "Save file", group: "Editor", defaultBindings: ["Mod-s"] }
```

#### `EditorPane`

Remove the hardcoded `keymap.of([{ key: "Mod-s", ... }])` entry.

#### `App.tsx` (global shortcut handler)

Add `editor.save` handler in the `useGlobalShortcuts` map:

```typescript
"editor.save": () => {
  const handle = activeEditorRef.current;
  if (handle) void handle.save();
}
```

This fires regardless of focus, prevents the event from reaching WKWebView, and calls the active
editor's `save()` (which already triggers `onSaved` and dirty-flag reset).

---

## Files changed (summary)

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Add `isHtmlPath` |
| `src/modules/workspaces/lib/types.ts` | Add `previewMode?` to editor panel |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Migrate `kind:"markdown"` on load; add toggle handler |
| `src/modules/workspaces/PanelContent.tsx` | Overlay layout, `liveContent` state, pass `onContentChange` |
| `src/modules/editor/EditorPane.tsx` | Add `onContentChange` prop; remove hardcoded `Mod-s` keymap |
| `src/modules/editor/EditorOverlayBar.tsx` | Add `isHtml` flag for shortcut label selection |
| `src/modules/markdown/MarkdownPreviewPane.tsx` | Accept `content` prop, remove disk read |
| `src/modules/html-preview/HtmlPreviewPane.tsx` | New component |
| `src/modules/shortcuts/shortcuts.ts` | Add `editor.save`, `editor.html.toggleView` |
| `src/app/App.tsx` | Add `onTogglePreview`; wire `editor.save`, `editor.markdown.toggleView`, `editor.html.toggleView` |
| `src/modules/workspaces/lib/panelTitle.tsx` | Handle `kind: "markdown"` tab title (already exists, verify no changes needed) |
| `docs/TODO.md` | Add split-view note |

---

## Out of scope

- Split view (editor + preview side by side) - tracked in `docs/TODO.md`.
- SVG preview (`.svg` files are already rendered as images in `EditorPane`).
- Live reload from disk in preview without going through the editor buffer.
