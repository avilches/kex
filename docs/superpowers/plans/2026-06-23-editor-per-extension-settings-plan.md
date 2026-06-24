# Implementation Plan: Editor Per-Extension Settings in Settings UI

**Spec:** `docs/superpowers/specs/2026-06-23-editor-per-extension-settings-design.md`
**Worktree:** `.claude/worktrees/settings-editor-per-extension`
**Branch:** `worktree-settings-editor-per-extension`

## Tasks

### Task 1: Pure logic layer -- editorViewSettings.ts

**File:** `src/modules/editor/lib/editorViewSettings.ts`

Changes:
- Export `PROSE_EXTS` (currently private `const`)
- Add `normalizeExtKey(exts: string[]): string` -- lowercase, sort, join(",")
- Add `findKeyForExt(ext: string, map: EditorViewMap): string | null` -- finds first key (shortest comma-list) containing ext, skipping "*"
- Update `resolveEditorView(path, map)` -- iterate keys to find best match (fewest exts), fall back to `map["*"]`, then hardcoded defaults
- Keep `defaultsForExt` and `extOf` unchanged

### Task 2: Tests for logic layer

**File:** `src/modules/editor/lib/editorViewSettings.test.ts`

Add test suites for:
- `normalizeExtKey`: sorts, lowercases, joins
- `findKeyForExt`: finds single-ext, finds within multi-ext, returns null when absent, prefers shortest match
- Updated `resolveEditorView`: multi-ext match, `*` fallback, single-ext beats multi-ext, `*` beats hardcoded defaults

### Task 3: Store setters

**File:** `src/modules/settings/store.ts`

Changes:
- Update `setEditorViewForExt(ext, value)` to use `findKeyForExt` -- updates existing entry or creates single-ext
- Add `upsertEditorViewEntry(rawExts, value)` -- full add/edit/merge logic
- Add `patchEditorViewEntry(key, patch)` -- merges patch into existing key
- Add `deleteEditorViewEntry(key)` -- rejects `*`, deletes key
- Add `resetEditorViewEntry(key)` -- restores PROSE_DEFAULTS or CODE_DEFAULTS based on key exts
- In `loadPreferences`: after parsing `editorViewByExt`, if result is `{}`, seed with prose group + `*` defaults

### Task 4: Settings UI -- File types subsection

**File:** `src/settings/sections/EditorSection.tsx`

Add `FileTypesSection` component (or inline in EditorSection) with:
- Add input at top (text field + button), calls `upsertEditorViewEntry`
- Sorted list of entries (single-ext alpha, multi-ext by count, `*` last)
- Each row: collapsed (key label + summary text + reset + delete buttons) and expanded (6 controls)
- Collapsed summary: "Wrap on · Line# off · Whitespace off · Fold on · Tabs off · Indent 4"
- Expanded: Switch for each boolean, number input for indentSize (1-12)
- Changes in expanded row call `patchEditorViewEntry`
- Reset calls `resetEditorViewEntry`, delete calls `deleteEditorViewEntry`
- `*` row: no delete button, labeled "Default (*)"
- Error state in add input when `*` is mixed with other exts

### Task 5: Verify reactive updates in EditorPane

**File:** `src/modules/editor/EditorPane.tsx`

Verify (and fix if needed) that `EditorPane` re-resolves settings when `editorViewByExt` changes.
The component must select `editorViewByExt` from the preferences store and pass it (along with the file path) to `resolveEditorView` in a way that triggers re-render and CodeMirror extension reconfiguration.

### Task 6: Commit

Atomic commit with all changes:
```
feat(settings): editor per-extension settings in Settings UI
```

## Execution order

1 → 2 → 3 → 4 → 5 → 6 (sequential, each builds on previous)

Run `pnpm test` after task 2 and after task 6. Run `pnpm check-types` and `pnpm lint` before task 6.
