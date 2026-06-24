# Editor Per-Extension Settings in Settings UI

**Date:** 2026-06-23
**Branch:** worktree-settings-editor-per-extension

## Summary

Add a "File types" subsection to Settings > Editor that lets the user view, edit, and reset the per-extension editor view settings (`editorViewByExt`). The existing `[...]` dropdown in the editor overlay already writes single-extension overrides; this feature exposes the full map in Settings with support for multi-extension groups and a catch-all `*` entry.

---

## Data Model

### Key format

`EditorViewMap = Record<string, Partial<EditorViewSettings>>` keeps the same TypeScript type. Key format evolves to support:

- **Single extension:** `"ts"`, `"py"` (existing behavior)
- **Multi-extension group:** comma-separated, always normalized -- sorted alphabetically, joined with `,` no spaces -- e.g. `"md,markdown,mdx,text,txt"`
- **Catch-all:** `"*"` (always present, never deletable)

A pure util `normalizeExtKey(exts: string[]): string` lowercase-sorts and joins. Used in all read/write paths to guarantee canonical form.

### Initial seeding

On `loadPreferences`, if `editorViewByExt` is empty (`{}`), seed two entries:

```json
{
  "md,markdown,mdx,text,txt": {
    "wrap": true, "lineNumbers": false, "whitespace": false,
    "foldGutter": false, "indentSize": 4, "indentWithTabs": false
  },
  "*": {
    "wrap": false, "lineNumbers": true, "whitespace": false,
    "foldGutter": true, "indentSize": 4, "indentWithTabs": false
  }
}
```

Existing installations with single-ext keys already stored are left untouched (full backward compatibility).

---

## Resolution Algorithm

`resolveEditorView(path, map)` updated to scan all keys:

```
ext = extOf(path)                        // e.g. "md"
bestKey = null, bestCount = Infinity

for key in map.keys() where key !== "*":
  exts = key.split(",")
  if exts.includes(ext) && exts.length < bestCount:
    bestKey = key, bestCount = exts.length

base = defaultsForExt(ext)               // PROSE_DEFAULTS or CODE_DEFAULTS
overlay = bestKey ? map[bestKey] : (map["*"] ?? {})
return { ...base, ...overlay }
```

Priority: single-ext match > multi-ext match (fewest wins) > `*` > hardcoded defaults.

---

## Store Setters

### `setEditorViewForExt(ext, value)` -- editor overlay flow

1. Load current map
2. Scan keys (excluding `*`) to find one whose comma-list includes `ext`
3. If found: update that key in place (affects all exts in the group)
4. If not found: create `map[ext] = value` (new single-ext entry)
5. Save and emit change event

### `upsertEditorViewEntry(rawExts, value)` -- Settings UI add/edit

1. `newKey = normalizeExtKey(rawExts)`
2. If `newKey` already exists exactly: update its value and return (exact match)
3. Find "first source": first existing entry (excluding `*`) that contains any of the input exts
4. `inheritedValue = firstSource?.value ?? map["*"] ?? {}`
5. For every existing entry that overlaps with input exts:
   - Remove the overlapping exts from that entry's key
   - If entry becomes empty: delete it
   - If entry is left with 1 ext: rename key to single-ext form
6. Create `map[newKey] = inheritedValue`
7. Save

### `deleteEditorViewEntry(key)` -- Settings UI delete

- Rejects if `key === "*"`
- Deletes `map[key]` and saves

### `patchEditorViewEntry(key, patch)` -- Settings UI inline edit

- Requires `key` to already exist in the map
- Merges `patch` over the existing value: `map[key] = { ...map[key], ...patch }`
- Saves

### `resetEditorViewEntry(key)` -- Settings UI reset

- If `key` is `"*"`: restore `CODE_DEFAULTS`
- If every ext in `key.split(",")` belongs to `PROSE_EXTS`: restore `PROSE_DEFAULTS`
- Otherwise: restore `CODE_DEFAULTS`
- Saves -- does NOT delete the entry (reset means restore factory values, not remove)

---

## Settings UI

### Location

New subsection at the bottom of `EditorSection.tsx`, above the "Cursor" group. Section header: **"File types"**.

### Sort order

1. Single-ext entries, sorted alphabetically by ext
2. Multi-ext entries, sorted by count ascending, then alphabetically by first ext
3. `*` always last

### Add input

Text input at top of the subsection. User types one or more extensions comma-separated (e.g. `"ts,tsx"` or `"go"`). Submit on Enter or `+` button.

- Strips whitespace, lowercases, splits by comma
- Rejects if any token is `*` mixed with others (shows inline error)
- Runs `upsertEditorViewEntry`, then scrolls to and expands the resulting row

### Row (collapsed)

```
[▶] ts            Wrap off · Line# on · Fold on · Indent 4      [↺][✕]
[▶] md, markdown, mdx, text, txt   Wrap on · Line# off ...      [↺][✕]
[▶] Default (*)   Wrap off · Line# on · Fold on · Indent 4      [↺]
```

- Extension label: `.ts` for single-ext; comma-separated list for multi-ext; `Default (*)` for catch-all
- Summary text: key=value pairs for all 6 fields, compact
- `↺` reset button; `✕` delete button (absent for `*`)

### Row (expanded)

```
[▼] md, markdown, mdx, text, txt                                [↺][✕]
    Word wrap          [●]  on
    Line numbers       [○]  off
    Show whitespace    [○]  off
    Fold gutter        [○]  off
    Indent with tabs   [○]  off     Indent size  [ 4 ]
```

Controls match the style of the rest of `EditorSection`: `Switch` components + inline number input for indent size (1-12, same clamp as `clampIndentSize`). Changes call `patchEditorViewEntry(key, patch)` (a direct patch setter, see below).

---

## Reactive Updates in Open Editors

`EditorPane` subscribes to `editorViewByExt` via `usePreferencesStore`. When the map changes, every open editor re-calls `resolveEditorView(panel.path, newMap)` and reconfigures its CodeMirror extension set. This covers the multi-editor case: if two editors have files of different extensions in the same group (e.g. `.md` and `.txt` in `"md,markdown,mdx,text,txt"`), both update when the group's settings change.

Verify that the `usePreferencesStore` selector referencing `editorViewByExt` triggers a re-render on any change (zustand shallow equality should handle this since the map reference changes on every write).

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Add exts that form same set as existing (different order) | Exact match after normalize, updates in place |
| Add subset of existing group | Extract subset, remaining group shrinks; new entry inherits first source settings |
| Group shrinks to 1 ext after extraction | Key normalized to single-ext (no comma) |
| Add exts from multiple different groups | Merge: remove from all, create new entry; settings inherited from first source found |
| Some input exts are new (not in any entry) | They join the new entry; no extra removals needed |
| `*` targeted for deletion | Rejected silently (delete button absent in UI) |
| Fresh install (empty map) | Seeded with prose group + `*` |
| Existing single-ext data from old installs | Preserved as-is, compatible with new resolution |

---

## Files to Change

- `src/modules/editor/lib/editorViewSettings.ts` -- `normalizeExtKey`, updated `resolveEditorView`, `findKeyForExt`
- `src/modules/settings/store.ts` -- updated `setEditorViewForExt`, new `upsertEditorViewEntry`, `deleteEditorViewEntry`, `resetEditorViewEntry`; seeding in `loadPreferences`
- `src/settings/sections/EditorSection.tsx` -- new "File types" subsection
- `src/modules/editor/lib/editorViewSettings.test.ts` -- tests for new resolution logic and normalizeExtKey
