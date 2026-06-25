# Split View for Editor Preview

Date: 2026-06-24
Worktree: html-preview (will use a new worktree at implementation time)

## Scope

Add a split view mode to the editor for `.html` and `.md` files: editor on the left, live preview
on the right, separated by a resizable divider. This is a third display state alongside the
existing raw editor (no preview) and overlay preview (preview replaces editor).

---

## User experience

- When a `.html` or `.md` file is open, the `EditorOverlayBar` shows two buttons:
  - **Eye icon** (existing): toggles overlay mode (editor only ↔ full-panel preview)
  - **Columns icon** (new): toggles split mode (editor only ↔ editor + preview side by side)
- The two modes are mutually exclusive. Activating one while the other is active switches
  directly to the new mode.
- In split mode, a horizontal resizable divider separates editor (left) and preview (right).
  Default split is 50/50. The divider position is not persisted (resets to 50/50 each time).
- The preview in split mode is live: reflects the current editor buffer with ~300ms debounce
  (same as overlay mode, reusing the existing `liveContent` state).
- The editor remains fully interactive in split mode (cursor, selection, typing all work normally).
- The active button (overlay or split) is visually highlighted to indicate the current mode.
- Clicking the active button deactivates it and returns to raw editor mode.
- In split mode the `EditorOverlayBar` is positioned over the editor panel (left side), not the
  preview panel, so the preview iframe is unobstructed.

---

## Architecture

### Panel data (`src/modules/workspaces/lib/types.ts`)

Change `previewMode?: boolean` to `previewMode?: "overlay" | "split"` on the editor panel variant:

```typescript
| { id: string; kind: "editor"; path: string; title?: string; dirty: boolean;
    preview: boolean; previewMode?: "overlay" | "split"; locked?: boolean; autofocus?: boolean }
```

#### Backward compatibility

Existing workspace state saved with `previewMode: true` (old boolean format) is handled in
`PanelContent.tsx` at render time: treat any truthy non-string value as `"overlay"`. No explicit
migration step needed since the value is coerced at read time.

### `PanelContent.tsx`

Derive `effectivePreviewMode`:

```typescript
const rawPreviewMode = panel.kind === "editor" ? panel.previewMode : panel.kind === "markdown" ? "overlay" : undefined;
// backward compat: old boolean true → "overlay"
const effectivePreviewMode: "overlay" | "split" | undefined =
  rawPreviewMode === true ? "overlay" : rawPreviewMode === false ? undefined : rawPreviewMode;
```

Three layout branches for `kind === "editor"` with a previewable file:

**No preview** (`effectivePreviewMode` is undefined):
```tsx
<div className="h-full w-full">
  <EditorOverlayBar ... />
  <EditorPane ... />
</div>
```

**Overlay** (`effectivePreviewMode === "overlay"`):
Same as current: editor `absolute inset-0 invisible pointer-events-none`, preview `absolute inset-0 z-10`.

**Split** (`effectivePreviewMode === "split"`):
```tsx
<ResizablePanelGroup direction="horizontal" className="h-full w-full">
  <ResizablePanel defaultSize={50} minSize={20}>
    <div className="relative h-full w-full">
      <EditorOverlayBar ... />
      <EditorPane ... />
    </div>
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize={50} minSize={20}>
    {ismd && <MarkdownPreviewPane content={liveContent} />}
    {ishtml && <HtmlPreviewPane content={liveContent} path={panel.path} />}
  </ResizablePanel>
</ResizablePanelGroup>
```

The `EditorPane` is always mounted in all three states (no unmounting on mode switch). The
`onContentChange` and `onReady` callbacks are always wired up regardless of mode so `liveContent`
stays current even when no preview is visible.

### `EditorOverlayBar` (`src/modules/editor/EditorOverlayBar.tsx`)

Extend the `view` prop to support a second toggle. Replace the current single `onChange` callback
with two separate callbacks:

```typescript
type Props = {
  view?: {
    mode: "raw" | "overlay" | "split";
    onToggleOverlay: () => void;       // replaces onChange
    onToggleSplit?: () => void;        // optional: absent for legacy kind:"markdown" panels
    isHtml?: boolean;
  };
  // ... rest unchanged
};
```

When `onToggleSplit` is provided (i.e. for `kind: "editor"` panels), render two buttons:
- **`LayoutTwoColumnIcon` button** (split): highlighted when `mode === "split"`, calls `onToggleSplit`
- **Eye/DocumentCode button** (overlay): highlighted when `mode === "overlay"`, calls `onToggleOverlay`

When `onToggleSplit` is absent (legacy `kind: "markdown"` panels), render only the Eye/DocumentCode
button — same single-button layout as before.

Both buttons use the same `size-[22px]` style. The active button uses `text-foreground`; inactive
uses `text-muted-foreground`.

The `[...]` view-options dropdown remains hidden when `mode !== "raw"` (same logic as before).

Icon for split: `LayoutTwoColumnIcon` from `@hugeicons/core-free-icons` (two vertical columns).

### `useWorkspaces.ts`

Replace `togglePreviewMode` with two separate actions:

```typescript
toggleOverlayPreview(workspaceId: string, panelId: string): void
toggleSplitPreview(workspaceId: string, panelId: string): void
```

Each reads the current `previewMode` of the target panel and sets it:
- `toggleOverlayPreview`: if `previewMode === "overlay"` → undefined; else → `"overlay"`
- `toggleSplitPreview`: if `previewMode === "split"` → undefined; else → `"split"`

Both use the existing `updatePanelData` helper.

### `App.tsx`

Replace the single `onTogglePreview` callback with two:
- `onToggleOverlayPreview(panelId)` — wired to `toggleOverlayPreview`
- `onToggleSplitPreview(panelId)` — wired to `toggleSplitPreview`

Add global shortcut handler for `editor.preview.toggleSplit`:
```typescript
"editor.preview.toggleSplit": () => {
  const panel = activePanel();
  if (panel?.kind === "editor") onToggleSplitPreview(panel.id);
}
```

The existing `editor.markdown.toggleView` and `editor.html.toggleView` handlers call
`onToggleOverlayPreview` instead of the old `onTogglePreview`.

### Shortcuts (`src/modules/shortcuts/shortcuts.ts`)

Add one new entry:

```typescript
{
  id: "editor.preview.toggleSplit",
  label: "Toggle split preview",
  group: "Editor",
  defaultBindings: [],   // no default binding; user assigns from Settings
}
```

Add `"editor.preview.toggleSplit"` to the `ShortcutId` union.

---

## Files changed (summary)

| File | Change |
|------|--------|
| `src/modules/workspaces/lib/types.ts` | `previewMode?: boolean` → `previewMode?: "overlay" \| "split"` |
| `src/modules/workspaces/PanelContent.tsx` | Three layout branches; backward compat coercion; split uses `ResizablePanelGroup` |
| `src/modules/editor/EditorOverlayBar.tsx` | Two-button view prop; active state highlight; new split icon |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Replace `togglePreviewMode` with `toggleOverlayPreview` + `toggleSplitPreview` |
| `src/app/App.tsx` | Wire new toggle actions; add `editor.preview.toggleSplit` handler |
| `src/modules/shortcuts/shortcuts.ts` | Add `editor.preview.toggleSplit` entry and `ShortcutId` |

---

## Out of scope

- Persisting the divider position across sessions.
- Vertical split (editor top, preview bottom).
- Separate tab for linked preview (content bus architecture).
- Three-way keyboard shortcut cycle.
