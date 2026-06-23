# Editor settings: per-extension visual toggles + global editor config

Date: 2026-06-22
Branch: `editor-settings`

## Goal

Make the CodeMirror editors (`EditorPane` for files, markdown raw editing, and
`GitDiffPane` for diffs) configurable along two axes:

1. **Per-extension visual toggles**, surfaced in the editor overlay bar and
   persisted in `settings.json`. They remember their state per file extension.
2. **Global editor settings**, surfaced in the Settings window (General section,
   Editor group), persisted in `settings.json` like the existing editor prefs.

Plus cursor configuration (editor + terminal) under Settings.

This is purely additive. No upstream Terax behavior is removed.

## Non-goals

- Indentation guides (VSCode-style vertical rails) are out: they need an extra
  dependency, which conflicts with the ultra-lightweight bar.
- Per-extension indentation. Indentation is a single global setting for now.
- LSP/format-on-save and other editing behaviors beyond what `basicSetup`
  already covers.

## Data model

### Per-extension map (new)

A new preference `editorViewByExt` in the settings store:

```ts
type EditorViewSettings = {
  wrap: boolean;
  lineNumbers: boolean;
  whitespace: boolean;
  foldGutter: boolean;
};

editorViewByExt: Record<string, Partial<EditorViewSettings>>;
```

- Key = lowercased file extension without the dot (`md`, `ts`, `tsx`, `py`...).
  Files with no extension use the empty-string key `""`.
- The map starts empty `{}`. Entries are created lazily the first time the user
  toggles something for that extension. A stored entry holds all four resolved
  values (so it is self-contained and stable even if defaults change later).
- Stored under a new `KEY_EDITOR_VIEW_BY_EXT` key, hydrated/persisted with the
  same pattern as the other prefs in `store.ts`.

### Resolution (defaults)

When opening a file, the effective settings for its extension are:

```
effective = editorViewByExt[ext] ?? defaultsForExt(ext)
```

`defaultsForExt` is a pure function based on two profiles:

- **prose**: extension matches `md | markdown | mdx | txt | text`
  (same set as the current `shouldWrapByDefault`).
- **code**: everything else, including the no-extension bucket `""`.

| Setting       | prose (md/txt) | code (rest) | rationale                                |
|---------------|----------------|-------------|------------------------------------------|
| `wrap`        | `true`         | `false`     | preserves current `shouldWrapByDefault`  |
| `lineNumbers` | `false`        | `true`      | numbers are noise in prose, wanted in code |
| `whitespace`  | `false`        | `false`     | whitespace rendering is opt-in, noisy    |
| `foldGutter`  | `false`        | `true`      | md/txt do not fold usefully              |

This function lives in the editor module as pure, testable logic (replacing the
ad-hoc `shouldWrapByDefault` usage for wrap). A locked-invariant test covers the
prose/code split and the no-extension bucket.

### Migration of word wrap

Word wrap moves from the current model (`panel.wordWrapOverride` per panel in
`workspace-state.json` + `shouldWrapByDefault`) into `editorViewByExt`.

- `wordWrapOverride` on the panel and `onSetWordWrap`/`setPanelWordWrapOverride`
  wiring is removed. `PanelContent` reads `wrap` from the resolved per-ext
  settings instead.
- Consequence (accepted): two open panels of the same extension can no longer
  have different wrap; wrap is now per-extension, not per-panel.
- `shouldWrapByDefault` in `src/lib/utils.ts` is removed once `defaultsForExt`
  subsumes it (or kept only if still referenced elsewhere; verify before
  deleting).

## Global editor settings (new prefs)

Added to the settings store (`store.ts`) and the Settings General section,
Editor group, following the existing `SettingRow` + `Switch`/`Select` pattern:

| Pref                    | Type                          | Default   |
|-------------------------|-------------------------------|-----------|
| `editorIndentSize`      | number (2 / 4 / 8)            | `4`       |
| `editorIndentWithTabs`  | boolean (false = spaces)      | `false`   |
| `editorScrollPastEnd`   | boolean                       | `false`   |
| `editorHighlightActiveLine` | boolean                   | `true`    |
| `editorBracketMatching` | boolean                       | `true`    |
| `editorCloseBrackets`   | boolean                       | `true`    |
| `editorAutocompletion`  | boolean                       | `true`    |

Notes:
- `editorIndentSize` drives both `indentUnit` and `EditorState.tabSize`
  (currently hardcoded to 2 in `extensions.ts`).
- `editorIndentWithTabs`: when true, `indentUnit` becomes a tab char and the
  editor inserts tabs; when false, spaces of width `editorIndentSize`.
- The three editing toggles (`bracketMatching`, `closeBrackets`,
  `autocompletion`) currently live in `basicSetup`. They move to compartments so
  they are runtime-reconfigurable and driven by these prefs.

## Cursor configuration (new prefs)

| Pref                    | Type                                  | Default |
|-------------------------|---------------------------------------|---------|
| `editorCursorBlink`     | boolean                               | `false` |
| `editorCursorStyle`     | `"bar" \| "block" \| "underline"`     | `"bar"` |
| `terminalCursorStyle`   | `"bar" \| "block" \| "underline"`     | `"bar"` |

- `terminalCursorBlink` already exists; `terminalCursorStyle` is new and feeds
  xterm's native `cursorStyle` (currently hardcoded `"bar"` in `rendererPool`).
  Applied the same way `applyCursorBlink` already works.
- `editorCursorBlink` maps to CodeMirror's cursor blink (via the `drawSelection`
  cursor blink rate: a positive rate when on, `0` when off).
- `editorCursorStyle` is NOT native in CodeMirror (only a bar caret by default).
  Block/underline are implemented with a small custom extension that draws the
  caret via a CSS class on `.cm-cursor` (block = full-cell background-style
  caret, underline = bottom border), reconfigured via a compartment. The vim
  fat-cursor styling already in `extensions.ts` is the reference for how the
  block look is themed; the non-vim block/underline reuse the same CSS variables.

## CodeMirror wiring

All toggles use `Compartment`s so they reconfigure at runtime without rebuilding
the editor state (the established pattern: `wrapCompartment`, `vimCompartment`,
`languageCompartment`, plus the unused `readOnlyCompartment`).

New compartments in `extensions.ts`:

- `lineNumbersCompartment` (holds `lineNumbers()` + active-line gutter or `[]`)
- `whitespaceCompartment` (`highlightWhitespace()` or `[]`)
- `foldGutterCompartment` (`foldGutter()` or `[]`)
- `indentCompartment` (`indentUnit` + `tabSize` from prefs)
- `activeLineCompartment` (`highlightActiveLine()` or `[]`)
- `bracketMatchingCompartment`, `closeBracketsCompartment`,
  `autocompletionCompartment`
- `scrollPastEndCompartment` (`scrollPastEnd()` from `@codemirror/view` or `[]`)
- `cursorBlinkCompartment`, `cursorStyleCompartment`

To avoid duplicate extensions, the corresponding `basicSetup` flags in
`EditorPane` and `GitDiffPane` are set to `false` and the features are provided
exclusively through compartments. `basicSetup` keeps only what we do not toggle
(history, indentOnInput, the rest).

`buildSharedExtensions()` grows to accept the resolved per-ext settings and the
global prefs, returning the compartment-wrapped extensions seeded with the
correct initial values. Both `EditorPane` and `GitDiffPane` call it, so all three
editor surfaces (file, markdown raw, git diff) stay consistent.

`GitDiffPane` is read-only; cursor/editing toggles are harmless there but
line-numbers/whitespace/fold/wrap all apply and should respect the same per-ext
settings as the editable view.

## Overlay bar UX

The overlay bar (`EditorOverlayBar`) currently shows a word-wrap icon plus the
markdown Edit/Rendered switch. With four per-ext toggles it becomes a single
**`[...]` (more options) button** opening a shadcn `DropdownMenu` of
`DropdownMenuCheckboxItem`s:

- Word wrap
- Line numbers
- Show whitespace
- Fold gutter

Each item shows a check when on and writes the toggle to `editorViewByExt[ext]`
(materializing the full entry from current effective values on first write). The
Edit/Rendered switch for markdown stays as-is next to the `[...]` button. In
rendered markdown mode the `[...]` button is hidden (the toggles have no meaning
in the preview), matching the current word-wrap hiding logic.

The dropdown is keyed by the active panel's file extension; the menu header
shows the extension it applies to (e.g. "Applies to .ts files") so the
per-extension scope is discoverable.

## Settings UI

In `GeneralSection.tsx`, under the existing **Editor** label:

- Indentation size (Select 2/4/8)
- Indent with tabs (Switch)
- Scroll past end (Switch)
- Highlight active line (Switch)
- Bracket matching / Auto close brackets / Autocompletion (Switches)
- Editor cursor blink (Switch)
- Editor cursor style (Select bar/block/underline)

Under the existing **Terminal** label, next to cursor blink:

- Terminal cursor style (Select bar/block/underline)

## Affected files

- `src/modules/settings/store.ts` — new prefs, keys, defaults, setters, hydration,
  key->pref mapping.
- `src/modules/editor/lib/editorViewSettings.ts` (new) — `EditorViewSettings`
  type, `defaultsForExt`, `resolveEditorView(ext, map)` pure functions + tests.
- `src/modules/editor/lib/extensions.ts` — new compartments, parametrized
  `buildSharedExtensions`.
- `src/modules/editor/EditorPane.tsx` — wire prefs + per-ext settings into
  compartments; trim `basicSetup`; reconfigure effects.
- `src/modules/editor/GitDiffPane.tsx` — same wiring for the diff surface.
- `src/modules/editor/EditorOverlayBar.tsx` — `[...]` dropdown of checkbox items.
- `src/modules/editor/lib/cursorExtensions.ts` (new) — editor cursor blink +
  block/underline style extension.
- `src/modules/workspaces/PanelContent.tsx`, `lib/types.ts`, `lib/useWorkspaces.ts`,
  `src/app/App.tsx` — remove `wordWrapOverride` panel model + wiring; read wrap
  from per-ext settings.
- `src/modules/terminal/lib/rendererPool.ts` + `useTerminalSession.ts` — apply
  `terminalCursorStyle`.
- `src/settings/sections/GeneralSection.tsx` — new rows.
- `src/lib/utils.ts` — remove `shouldWrapByDefault` if fully subsumed.
- `docs/ARCHITECTURE.md` — note the per-ext editor settings model.

## Testing

- `defaultsForExt` / `resolveEditorView`: prose vs code split, no-extension
  bucket, stored entry overrides defaults. Locks the defaults table invariant.
- `store.ts` test: `editorViewByExt` round-trips through hydration; setting a
  toggle for one extension does not affect another.
- Existing terminal cursor-blink test pattern extended for cursor style if it has
  a pure helper; otherwise manual verification.
- Manual: open a `.ts` and a `.md`, confirm default profiles; toggle each option,
  reopen a same-extension file, confirm it persisted; confirm git diff respects
  line numbers/whitespace/wrap; confirm indentation, scroll past end, cursor
  blink/style in both editor and terminal.

## Quality gates

`pnpm lint`, `pnpm check-types`, `pnpm test`, and (for the terminal cursor-style
change) `cd src-tauri && cargo clippy && cargo test --locked` must pass before
the work is considered done.
