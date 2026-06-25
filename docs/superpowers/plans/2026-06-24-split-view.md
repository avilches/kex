# Split View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split view mode to the editor for `.html` and `.md` files — editor on the left, live preview on the right, in the same panel/tab.

**Architecture:** Three display states for previewable editor panels: raw (editor only), overlay (preview covers editor), and split (editor left + preview right, fixed 50/50). The split uses CSS positioning to keep `EditorPane` always mounted in the same DOM position (switching layout via `right-1/2` vs `right-0` on the editor container), which preserves editor buffer content and cursor position across mode switches. No `ResizablePanelGroup` is used for the editor/preview split to avoid the EditorPane remounting; a static 1px divider is rendered instead. Two separate buttons in `EditorOverlayBar` — Eye for overlay, LayoutTwoColumnIcon for split.

**Tech Stack:** React 19, TypeScript, Tailwind v4, `@hugeicons/core-free-icons`, CodeMirror 6 (via `EditorPane`), `tauri-plugin-store` (workspace state persistence).

## Global Constraints

- No `em-dash`, no emojis in code, comments, or commit messages.
- All shortcuts must be registered in `src/modules/shortcuts/shortcuts.ts`; no hardcoded key comparisons.
- Comments only for non-obvious WHY; never WHAT.
- Imports always `@/...` on the frontend, never relative across modules.
- Commit messages in English, atomic commits.
- Run `pnpm exec biome lint ./src` (NOT `pnpm lint`) and `pnpm check-types` and `pnpm test --run` before each commit.

---

### Task 1: Update panel type and add shortcut registry entry

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Modify: `src/modules/shortcuts/shortcuts.ts`

**Interfaces:**
- Produces:
  - `Panel` type where `kind: "editor"` has `previewMode?: "overlay" | "split"` instead of `previewMode?: boolean`
  - `ShortcutId` union includes `"editor.preview.toggleSplit"`
  - `SHORTCUTS` array includes entry for `"editor.preview.toggleSplit"`

---

- [ ] **Step 1: Update `previewMode` type in `types.ts`**

In `src/modules/workspaces/lib/types.ts`, change line 6:

```typescript
// Before:
| { id: string; kind: "editor"; path: string; title?: string; dirty: boolean; preview: boolean; previewMode?: boolean; locked?: boolean; autofocus?: boolean }

// After:
| { id: string; kind: "editor"; path: string; title?: string; dirty: boolean; preview: boolean; previewMode?: "overlay" | "split"; locked?: boolean; autofocus?: boolean }
```

- [ ] **Step 2: Add `editor.preview.toggleSplit` to `ShortcutId` union in `shortcuts.ts`**

In `src/modules/shortcuts/shortcuts.ts`, add to the `ShortcutId` union (after `"editor.html.toggleView"`):

```typescript
| "editor.preview.toggleSplit"
```

- [ ] **Step 3: Add SHORTCUTS entry for the new shortcut**

In `src/modules/shortcuts/shortcuts.ts`, add after the `editor.html.toggleView` entry:

```typescript
{
  id: "editor.preview.toggleSplit",
  label: "Toggle split preview",
  group: "Editor",
  defaultBindings: [],
},
```

- [ ] **Step 4: Verify types compile**

```bash
pnpm check-types
```

Expected: no errors. If TypeScript complains about `previewMode` usages elsewhere (e.g. places that set `previewMode: true` or `previewMode: false`), fix those in the same step — they will be addressed in Tasks 2 and 4, but TypeScript may flag them now.

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/lib/types.ts src/modules/shortcuts/shortcuts.ts
git commit -m "feat(split-view): add previewMode string union type and toggleSplit shortcut"
```

---

### Task 2: Replace `togglePreviewMode` with two focused actions in `useWorkspaces`

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`

**Interfaces:**
- Consumes: `updatePanelData` (existing, same signature)
- Produces (replaces `togglePreviewMode`):
  - `toggleOverlayPreview(workspaceId: string, panelId: string): void` — if current `previewMode === "overlay"`, sets it to `undefined`; otherwise sets it to `"overlay"`
  - `toggleSplitPreview(workspaceId: string, panelId: string): void` — if current `previewMode === "split"`, sets it to `undefined`; otherwise sets it to `"split"`

---

- [ ] **Step 1: Replace `togglePreviewMode` with two new callbacks**

In `src/modules/workspaces/lib/useWorkspaces.ts`, replace the existing `togglePreviewMode` callback (lines 482–487) with:

```typescript
const toggleOverlayPreview = useCallback((workspaceId: string, panelId: string) => {
  updatePanelData(workspaceId, panelId, (p) => {
    if (p.kind !== "editor") return p;
    return { ...p, previewMode: p.previewMode === "overlay" ? undefined : "overlay" };
  });
}, [updatePanelData]);

const toggleSplitPreview = useCallback((workspaceId: string, panelId: string) => {
  updatePanelData(workspaceId, panelId, (p) => {
    if (p.kind !== "editor") return p;
    return { ...p, previewMode: p.previewMode === "split" ? undefined : "split" };
  });
}, [updatePanelData]);
```

- [ ] **Step 2: Update the return object**

In the `return` block of `useWorkspaces` (around line 544), replace `togglePreviewMode` with the two new functions:

```typescript
// Remove:
togglePreviewMode,

// Add:
toggleOverlayPreview,
toggleSplitPreview,
```

- [ ] **Step 3: Verify types compile**

```bash
pnpm check-types
```

Expected: TypeScript will now flag callers of `togglePreviewMode` in `App.tsx` — that is expected and will be fixed in Task 5. If there are no callers other than `App.tsx`, this is fine.

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/lib/useWorkspaces.ts
git commit -m "feat(split-view): replace togglePreviewMode with toggleOverlayPreview and toggleSplitPreview"
```

---

### Task 3: Update `EditorOverlayBar` to support three modes and a split button

**Files:**
- Modify: `src/modules/editor/EditorOverlayBar.tsx`

**Interfaces:**
- Consumes (new `view` prop shape — replaces old `mode: "rendered" | "raw"` + `onChange`):
  ```typescript
  view?: {
    mode: "raw" | "overlay" | "split";
    onToggleOverlay: () => void;
    onToggleSplit?: () => void;   // absent for legacy kind:"markdown" panels
    isHtml?: boolean;
  }
  ```
- Produces: updated component that renders a `LayoutTwoColumnIcon` button (split) when `onToggleSplit` is provided, and an Eye/DocumentCode button (overlay). Active button shown with `text-foreground`, inactive with `text-muted-foreground`.

---

- [ ] **Step 1: Add `LayoutTwoColumnIcon` import**

In `src/modules/editor/EditorOverlayBar.tsx`, add `LayoutTwoColumnIcon` to the HugeIcons import:

```typescript
import { DocumentCodeIcon, EyeIcon, LayoutTwoColumnIcon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
```

- [ ] **Step 2: Remove `MarkdownViewMode` type and update the `Props` type**

Replace the `MarkdownViewMode` type alias and the `view` section of `Props`:

```typescript
// Remove this line:
type MarkdownViewMode = "rendered" | "raw";

// Update Props — replace the existing view?: {...} block with:
type Props = {
  view?: {
    mode: "raw" | "overlay" | "split";
    onToggleOverlay: () => void;
    onToggleSplit?: () => void;
    isHtml?: boolean;
  };
  viewToggles?: {
    ext: string;
    value: EditorViewSettings;
    onChange: (next: EditorViewSettings) => void;
  };
  globalToggles?: {
    value: EditorGlobalToggles;
    onToggle: (key: EditorGlobalToggleKey, value: boolean) => void;
  };
};
```

- [ ] **Step 3: Update the `shortcutId` derivation and `showToggles` logic**

In `EditorOverlayBar` function body, update:

```typescript
// Keep this line unchanged:
const userShortcuts = usePreferencesStore((s) => s.shortcuts);

// Update shortcutId — the overlay toggle shortcut (same as before):
const shortcutId = view?.isHtml ? "editor.html.toggleView" : "editor.markdown.toggleView";
const toggleLabel = view ? getShortcutLabel(shortcutId, userShortcuts) : null;

// Update showToggles: only show the [...] dropdown in raw mode (not overlay or split):
const showToggles = view?.mode === "raw" && !!viewToggles;
```

- [ ] **Step 4: Update the button rendering section**

Replace the existing `{view && (` button block at the bottom of the JSX with two buttons:

```tsx
{view && onToggleSplit && (
  <button
    type="button"
    onClick={view.onToggleSplit}
    title={view.mode === "split" ? "Close split" : "Split view"}
    className={cn(
      "flex size-[22px] items-center justify-center rounded transition-colors",
      view.mode === "split"
        ? "text-foreground"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    <HugeiconsIcon icon={LayoutTwoColumnIcon} size={13} strokeWidth={2} />
  </button>
)}
{view && view.onToggleSplit && <div className="h-4 w-px bg-border/60" />}
{view && (
  <button
    type="button"
    onClick={view.onToggleOverlay}
    title={
      view.mode === "raw"
        ? toggleLabel ? `Preview (${toggleLabel})` : "Preview"
        : toggleLabel ? `Edit (${toggleLabel})` : "Edit"
    }
    className={cn(
      "flex size-[22px] items-center justify-center rounded transition-colors",
      view.mode === "overlay"
        ? "text-foreground"
        : "text-muted-foreground hover:text-foreground",
    )}
  >
    <HugeiconsIcon
      icon={view.mode === "raw" ? EyeIcon : DocumentCodeIcon}
      size={13}
      strokeWidth={2}
    />
  </button>
)}
```

Note: use `view.onToggleSplit` (not just `onToggleSplit`) since `onToggleSplit` is not destructured from `view`. Access it as `view?.onToggleSplit` or destructure `const { onToggleSplit } = view ?? {}` at the top of the function.

To avoid repetition, add this line in the function body before the return:

```typescript
const onToggleSplit = view?.onToggleSplit;
```

Also update the separator between the `[...]` dropdown and the view buttons:

```tsx
{/* Replace the old separator line: */}
{view && showToggles && v && <div className="h-4 w-px bg-border/60" />}

{/* With: */}
{showToggles && v && <div className="h-4 w-px bg-border/60" />}
```

- [ ] **Step 5: Verify the component builds without TypeScript errors**

```bash
pnpm check-types
```

Expected: errors only in callers (`PanelContent.tsx`) that still pass the old `onChange`-based `view` prop — those are fixed in Task 4.

- [ ] **Step 6: Lint**

```bash
pnpm exec biome lint ./src/modules/editor/EditorOverlayBar.tsx
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/editor/EditorOverlayBar.tsx
git commit -m "feat(split-view): add split button to EditorOverlayBar with three-mode view prop"
```

---

### Task 4: Implement split layout in `PanelContent` and update `PanelCallbacks`

**Files:**
- Modify: `src/modules/workspaces/PanelContent.tsx`

**Interfaces:**
- Consumes:
  - New `EditorOverlayBar` `view` prop: `{ mode, onToggleOverlay, onToggleSplit?, isHtml? }`
  - New `PanelCallbacks`:
    - `onToggleOverlayPreview?: (panelId: string) => void` (replaces `onTogglePreview`)
    - `onToggleSplitPreview?: (panelId: string) => void` (new)
- Produces: updated `PanelCallbacks` type, CSS-based three-layout rendering for `kind: "editor"` panels

**Implementation note on EditorPane mount stability:** The split layout uses CSS to change the width of the editor container (`right-1/2` vs `right-0`) rather than moving EditorPane inside a `ResizablePanelGroup`. This keeps EditorPane at the same position in the React tree across all three modes, so it never unmounts. The divider between editor and preview is a static 1px border div (not resizable). This is the deliberate tradeoff to preserve buffer content and cursor position.

---

- [ ] **Step 1: Update `PanelCallbacks` type**

In the `PanelCallbacks` type definition (around line 62), replace `onTogglePreview` with two callbacks:

```typescript
// Remove:
onTogglePreview?: (panelId: string) => void;

// Add in its place:
onToggleOverlayPreview?: (panelId: string) => void;
onToggleSplitPreview?: (panelId: string) => void;
```

- [ ] **Step 2: Add a backward-compat helper at the top of the `case "editor"` block**

In the `case "editor"` branch of the switch (around line 187), add before the existing `const ismd = ...` lines:

```typescript
// Resolve previewMode to a string union, handling legacy boolean `true` from
// old saved workspace state (previewMode was boolean before this feature).
const rawPM = panel.previewMode as "overlay" | "split" | boolean | undefined;
const effectivePreviewMode: "overlay" | "split" | undefined =
  rawPM === true ? "overlay" : !rawPM ? undefined : (rawPM as "overlay" | "split");
```

- [ ] **Step 3: Update the `previewMode` derived value and the `prevPreviewModeRef` effect**

Replace the existing `const previewMode = ...` and its associated `useEffect` that seeds `liveContent`:

```typescript
// OLD (remove these):
const previewMode =
  panel.kind === "editor"
    ? (panel.previewMode ?? false)
    : panel.kind === "markdown";

useEffect(() => {
  if (previewMode && !prevPreviewModeRef.current) {
    const content = editorRef.current?.getContent();
    if (content != null) setLiveContent(content);
  }
  prevPreviewModeRef.current = previewMode;
}, [previewMode]);
```

```typescript
// NEW: seed liveContent whenever preview becomes active (any non-raw mode)
const prevEffectivePreviewModeRef = useRef<"overlay" | "split" | undefined>(undefined);
useEffect(() => {
  const prev = prevEffectivePreviewModeRef.current;
  if (effectivePreviewMode != null && prev == null) {
    // Transitioning from raw to a preview mode: seed from buffer
    const content = editorRef.current?.getContent();
    if (content != null) setLiveContent(content);
  }
  prevEffectivePreviewModeRef.current = effectivePreviewMode;
}, [effectivePreviewMode]);
```

Note: this `useEffect` and the `effectivePreviewMode` const MUST be declared inside the `case "editor"` block since they use panel-specific derived values. If the switch structure makes this awkward, move the common state (liveContent, debounceRef, handleContentChange) above the switch as before, and declare the `effectivePreviewMode` const and its effect inside the case. The existing `prevPreviewModeRef` above the switch can be removed or replaced by `prevEffectivePreviewModeRef` declared inside the case.

Actually, to minimize structural changes, keep the common state declarations above the switch unchanged, move `prevPreviewModeRef` inside the `case "editor"` block (alongside the new `effectivePreviewMode` const), and replace the existing `useEffect` in the case with the new one. The existing `useEffect(() => { if (previewMode && ...) }, [previewMode])` that is currently above the switch must be moved inside the case.

The safest restructuring:
1. Keep `liveContent`, `debounceRef`, `handleContentChange`, `handleReady` above the switch (unchanged).
2. Remove `prevPreviewModeRef` and its associated effect from above the switch entirely.
3. Inside `case "editor"`: declare `effectivePreviewMode`, `prevEffectivePreviewModeRef`, and the seed effect.

- [ ] **Step 4: Replace the JSX for `case "editor"`**

Replace the entire return in `case "editor"` (lines 199–248 approximately) with the new three-layout CSS approach:

```tsx
return (
  <Suspense fallback={null}>
    <div className="relative h-full w-full">
      {/*
        EditorOverlayBar is positioned in a pointer-events-none wrapper sized
        to the editor area. In split mode this constrains it to the left half
        so it doesn't float over the preview. pointer-events-auto on the bar
        itself makes buttons clickable despite the wrapper.
      */}
      {showPreviewToggle && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-20",
            effectivePreviewMode === "split" ? "right-1/2" : "right-0",
          )}
        >
          <EditorOverlayBar
            view={{
              mode: effectivePreviewMode ?? "raw",
              onToggleOverlay: () => callbacks.onToggleOverlayPreview?.(panel.id),
              onToggleSplit: () => callbacks.onToggleSplitPreview?.(panel.id),
              isHtml: ishtml,
            }}
            viewToggles={effectivePreviewMode == null ? viewToggles : undefined}
            globalToggles={effectivePreviewMode == null ? globalToggles : undefined}
          />
        </div>
      )}

      {/* Editor: always mounted. CSS width/visibility changes per mode. */}
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          effectivePreviewMode === "overlay"
            ? "invisible pointer-events-none right-0"
            : effectivePreviewMode === "split"
              ? "right-1/2"
              : "right-0",
        )}
      >
        <EditorPane
          ref={(h: EditorPaneHandle | null) => {
            (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
            callbacks.registerEditorHandle?.(panel.id, h);
          }}
          path={panel.path}
          onDirtyChange={(dirty: boolean) =>
            callbacks.onEditorDirtyChange?.(panel.id, dirty)
          }
          onClose={() => callbacks.onEditorClose?.(panel.id)}
          onContentChange={handleContentChange}
        />
      </div>

      {/* 1px divider in split mode */}
      {effectivePreviewMode === "split" && (
        <div className="absolute inset-y-0 left-1/2 z-20 w-px -translate-x-px bg-border" />
      )}

      {/* Preview: visible in overlay (full) and split (right half) */}
      {(effectivePreviewMode === "overlay" || effectivePreviewMode === "split") && (
        <div
          className={cn(
            "absolute inset-y-0 z-10",
            effectivePreviewMode === "split" ? "right-0" : "inset-0",
          )}
          style={effectivePreviewMode === "split" ? { left: "calc(50% + 1px)" } : undefined}
        >
          {ismd && <MarkdownPreviewPane content={liveContent} />}
          {ishtml && <HtmlPreviewPane content={liveContent} path={panel.path} />}
        </div>
      )}
    </div>
  </Suspense>
);
```

Add `pointer-events-auto` to `EditorOverlayBar`'s root div to make buttons clickable through the pointer-events-none wrapper — this is done in `EditorOverlayBar.tsx` itself: add `pointer-events-auto` to the className of the root `<div>`:

```tsx
// In EditorOverlayBar.tsx, update the root div className:
<div className="pointer-events-auto absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/85 p-0.5 text-[11px] shadow-sm backdrop-blur">
```

- [ ] **Step 5: Update the `case "markdown"` block to use the new `view` prop shape**

Find the `case "markdown"` block (around line 270). Update the `EditorOverlayBar` call:

```tsx
// Old:
<EditorOverlayBar
  view={{
    mode: "rendered",
    onChange: (mode: "rendered" | "raw") =>
      callbacks.onSetMarkdownView?.(panel.id, mode),
  }}
/>

// New:
<EditorOverlayBar
  view={{
    mode: "overlay",
    onToggleOverlay: () => callbacks.onSetMarkdownView?.(panel.id, "raw"),
    // no onToggleSplit — legacy markdown panels don't support split
  }}
/>
```

- [ ] **Step 6: Verify types compile and tests pass**

```bash
pnpm check-types
pnpm test --run
```

Expected: type errors only in `App.tsx` callers (fixed in Task 5). Tests pass.

- [ ] **Step 7: Lint**

```bash
pnpm exec biome lint ./src/modules/workspaces/PanelContent.tsx
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/workspaces/PanelContent.tsx src/modules/editor/EditorOverlayBar.tsx
git commit -m "feat(split-view): implement CSS-based split layout in PanelContent"
```

---

### Task 5: Wire new actions and shortcut handlers in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes:
  - `toggleOverlayPreview(workspaceId, panelId)` from `useWorkspaces` (Task 2)
  - `toggleSplitPreview(workspaceId, panelId)` from `useWorkspaces` (Task 2)
  - Updated `PanelCallbacks`: `onToggleOverlayPreview`, `onToggleSplitPreview` (Task 4)
  - New `ShortcutId`: `"editor.preview.toggleSplit"` (Task 1)

---

- [ ] **Step 1: Destructure the new actions from `useWorkspaces`**

In `App.tsx` around line 178, replace `togglePreviewMode` in the destructuring:

```typescript
// Remove:
togglePreviewMode,

// Add:
toggleOverlayPreview,
toggleSplitPreview,
```

- [ ] **Step 2: Update the `panelCallbacks` useMemo**

Find the `useMemo` block that builds `panelCallbacks` (the object with `onTogglePreview` etc.).

Replace `onTogglePreview`:
```typescript
// Remove:
onTogglePreview: (panelId) => {
  const found = findPanelGlobal(panelId);
  if (found) togglePreviewMode(found.workspace.id, panelId);
},

// Add:
onToggleOverlayPreview: (panelId) => {
  const found = findPanelGlobal(panelId);
  if (found) toggleOverlayPreview(found.workspace.id, panelId);
},
onToggleSplitPreview: (panelId) => {
  const found = findPanelGlobal(panelId);
  if (found) toggleSplitPreview(found.workspace.id, panelId);
},
```

Update the `useMemo` dependency array: replace `togglePreviewMode` with `toggleOverlayPreview` and `toggleSplitPreview`:

```typescript
// In the dependency array (around line 1227):
// Remove: togglePreviewMode,
// Add:
toggleOverlayPreview,
toggleSplitPreview,
```

- [ ] **Step 3: Update the shortcut handlers**

Find the `useGlobalShortcuts` handlers block. Update `editor.markdown.toggleView` and `editor.html.toggleView` to use the new action:

```typescript
"editor.markdown.toggleView": () => {
  if (!activePanel || !activePanelId || !activeWorkspaceId) return;
  if (activePanel.kind === "editor" && isMarkdownPath(activePanel.path)) {
    toggleOverlayPreview(activeWorkspaceId, activePanelId);
  } else if (activePanel.kind === "markdown") {
    setPanelView(activeWorkspaceId, activePanelId, "raw");
  }
},
"editor.html.toggleView": () => {
  if (!activePanel || !activePanelId || !activeWorkspaceId) return;
  if (activePanel.kind === "editor" && isHtmlPath(activePanel.path)) {
    toggleOverlayPreview(activeWorkspaceId, activePanelId);
  }
},
```

Add the new split shortcut handler after `"editor.html.toggleView"`:

```typescript
"editor.preview.toggleSplit": () => {
  if (!activePanel || !activePanelId || !activeWorkspaceId) return;
  if (
    activePanel.kind === "editor" &&
    (isMarkdownPath(activePanel.path) || isHtmlPath(activePanel.path))
  ) {
    toggleSplitPreview(activeWorkspaceId, activePanelId);
  }
},
```

- [ ] **Step 4: Update the second `useGlobalShortcuts` dependency array**

Find the dependency array around line 1884. Replace `togglePreviewMode` with `toggleOverlayPreview` and `toggleSplitPreview`:

```typescript
// Remove: togglePreviewMode,
// Add:
toggleOverlayPreview,
toggleSplitPreview,
```

- [ ] **Step 5: Add `shortcutsDisabled` check for the new shortcut**

Find the `shortcutsDisabled` callback (around line 1888). After the `editor.html.toggleView` check, add:

```typescript
if (id === "editor.preview.toggleSplit") {
  return !(
    activePanel?.kind === "editor" &&
    (isMarkdownPath(activePanel.path) || isHtmlPath(activePanel.path))
  );
}
```

- [ ] **Step 6: Verify types compile and tests pass**

```bash
pnpm check-types
pnpm test --run
```

Expected: no type errors, all tests pass.

- [ ] **Step 7: Lint**

```bash
pnpm exec biome lint ./src/app/App.tsx
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(split-view): wire split preview actions and shortcut handler in App.tsx"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|-------------|------------|
| Three display states: raw, overlay, split | Task 4 (`effectivePreviewMode`) |
| Eye button for overlay | Task 3 |
| LayoutTwoColumnIcon button for split | Task 3 |
| Mutually exclusive buttons | Task 2 (each toggle sets its own mode, clearing the other) |
| Active button highlighted with `text-foreground` | Task 3 |
| EditorPane stays mounted across all modes | Task 4 (CSS positioning, no DOM move) |
| Split is fixed 50/50 (no resizable divider) | Task 4 (by design, avoids EditorPane remount) |
| `liveContent` seeded on transition to any preview mode | Task 4 (`useEffect` on `effectivePreviewMode`) |
| `editor.preview.toggleSplit` shortcut (no default binding) | Tasks 1, 5 |
| `editor.markdown.toggleView` + `editor.html.toggleView` updated | Task 5 |
| Backward compat: old `previewMode: true` → `"overlay"` | Task 4 (`rawPM === true ? "overlay"`) |
| Legacy `kind: "markdown"` panels unaffected | Task 4 (`case "markdown"` updated) |
| `shortcutsDisabled` guard for new shortcut | Task 5 |

**Placeholder scan:** None found.

**Type consistency:**
- `toggleOverlayPreview` / `toggleSplitPreview` defined in Task 2, consumed in Tasks 4 and 5 — consistent.
- `onToggleOverlayPreview` / `onToggleSplitPreview` defined in Task 4 (`PanelCallbacks`), wired in Task 5 — consistent.
- `effectivePreviewMode: "overlay" | "split" | undefined` used in Task 4 JSX matches the derived type.
- `view.mode: "raw" | "overlay" | "split"` defined in Task 3, passed from Task 4 as `effectivePreviewMode ?? "raw"` — consistent.
