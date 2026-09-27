# Live Preview Markdown Editor Design (fourth markdown engine)

**Feature:** Add a CodeMirror 6 based Obsidian-style live-preview editor as a fourth selectable
engine for the `markdown` tab, alongside TipTap, Milkdown, and the legacy Streamdown preview.
**Date:** 2026-09-27
**Related specs:** `2026-07-06-rich-markdown-editor-design.md` (TipTap), `2026-09-10-milkdown-editor-design.md` (Milkdown, current engine-selection shape)

---

## Problem

TipTap and Milkdown both parse markdown into their own document model (ProseMirror) and
serialize back to markdown on save. That round-trip normalizes formatting: whitespace,
list-marker style, escaping, and any construct their schema does not model can all change even
when the user touched nothing. The dirty-only-save policy hides this for an untouched document,
but the moment a user edits and saves, the file can come back different from what a plain text
editor would have written, and frontmatter/embedded HTML is always at risk of being reshaped or
dropped (see `docs/MARKDOWN_GOTCHAS.md`).

We want a fourth engine that structurally cannot do this: one that edits the raw markdown text
directly and only changes *how it looks*, never *what it is*. `state.doc.toString()` after
loading a file must be byte-identical to what a plain text editor would show, before and after
any amount of cursor movement, and saving must write exactly that string. This is evaluated the
same way Milkdown was: a fourth option users can pick per-tab or as their default, to compare
against the other three before any of them is treated as "the" engine.

## Scope

In scope:

- New `codemirror` engine for the `markdown` tab (labeled "Live Preview" in Settings), built on
  CodeMirror 6: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`,
  `@codemirror/lang-markdown` (`@lezer/markdown` parser, with the GFM extensions: `Strikethrough`,
  `Table`, `TaskList`).
- A `ViewPlugin` that decorates headings, bold, italic, inline code, links, and lists: syntax
  markers are hidden (`Decoration.replace`) with the remaining text styled to look formatted
  (larger/bold/etc. via CSS classes) on every line except the one the cursor or selection
  currently touches, where the raw markdown is shown untouched. Task-list checkboxes (`- [ ]` /
  `- [x]`) are the one case rendered as a real widget (`WidgetType`), since a checkbox is not text
  being restyled. Decoration computation is limited to `view.viewport`, not the whole document.
- Frontmatter (a `---`-delimited block at the very start of the document) is styled as a plain
  monospace block and never decorated as markdown content.
- Embedded HTML blocks/tags (recognized by `@lezer/markdown` as `HTMLBlock`/`HTMLTag` nodes) are
  tolerated and rendered as plain monospace text; they are never a parse error and never trigger a
  decoration.
- Reuses `useDocument` (`src/modules/editor/lib/useDocument.ts`) unchanged for load/save/dirty/
  autosave/external-conflict handling: this engine never transforms text, so it needs none of
  `useMarkdownDocument`'s baseline/round-trip bookkeeping, only plain string diffing.
- `MarkdownEngine` gains a fourth value `"codemirror"`; `MARKDOWN_ENGINES`, `sealMarkdownEngine`,
  and the `TabContent` "markdown" switch are extended the same way Milkdown was.
- Settings > Editor gets a fourth `RadioGroupItem` ("Live Preview") in the existing
  `markdownEngine` group.

Out of scope for v1 (explicit, so it does not get silently re-added mid-implementation):

- Outline panel, toolbar, slash commands. TipTap and Milkdown have these; this engine ships
  without them, evaluated as follow-up work only if the engine itself proves out.
- Any integration with `MarkdownRenderPane` (the read-only preview switch used by a plain-text
  `editor` tab's preview overlay/split on a `.md` file). This engine is reachable only by opening
  a note as a `markdown` tab with it selected as the engine.
- A Rich/Source mode toggle. TipTap and Milkdown each have two real modes (AST-rendered vs raw
  CodeMirror source) because their rich mode is a different representation of the document. This
  engine has only one representation - decorated raw text - so there is nothing to toggle between.

## Decisions (chosen vs alternatives)

1. **`useDocument`, not `useMarkdownDocument`.** `useMarkdownDocument` exists to manage a
   round-trip-safe baseline (record what the AST serializes back to, before the user can touch
   it, so a no-edit session never rewrites the file) and frontmatter separation for the AST
   engines. None of that applies here: the buffer is always exactly the file's bytes, so dirty
   tracking is a plain string comparison, which is exactly what `useDocument` (already used by the
   plain-text `EditorPane`) does. Reusing it means zero new document-lifecycle code, and it
   already has the tabId-keyed unflushed-buffer handling for pane moves. Alternative rejected:
   adapt `useMarkdownDocument` to a "no-op serializer" mode, which would carry baseline/frontmatter
   machinery this engine has no use for.
2. **`ViewPlugin`, not `StateField<DecorationSet>`, for the live-preview decorations.** A
   `ViewPlugin` gets direct access to `view.viewport` (so decoration computation is bounded to
   visible lines, not the full document, matching how Obsidian's own CM6 integration behaves) and
   to `view.hasFocus`/`view.state.selection` in one place. A `StateField` would still need to read
   selection from state and would only buy incremental decoration mapping across edits, which does
   not matter at note-sized documents. Alternative rejected: `StateField`, over-engineered for the
   document sizes this targets.
3. **Mark/replace decorations for inline formatting, a widget only for task-list checkboxes.**
   Hiding syntax characters via `Decoration.replace` while leaving the remaining span as real,
   editable text (styled via a mark decoration's CSS class) keeps native cursor placement,
   selection, and spellcheck working inside formatted text. A `WidgetType` replaces a range with an
   opaque DOM node with no native text editing inside it, which is wrong for inline formatting but
   correct for a task-list checkbox, which is not text at all. Alternative rejected: widgets for
   all formatting (loses native text editing), or marks for checkboxes too (a checkbox is not a
   text range to restyle).
4. **GFM parser extensions enabled** (`Strikethrough`, `Table`, `TaskList` from `@lezer/markdown`)
   so tables, task lists, and `~~strikethrough~~` parse as real nodes; CommonMark alone does not
   recognize them, and Obsidian supports all three.
5. **No Rich/Source toggle, no outline, no toolbar for v1** (see Scope). Keeping v1 to exactly the
   live-preview mechanic keeps the comparison focused: does the hide/reveal-on-cursor mechanic feel
   right and hold up on real notes (frontmatter, embedded HTML, long documents) before spending
   effort on chrome shared with the other two engines.
6. **Directory `src/modules/markdown/codemirror/`**, following the `tiptap/` / `milkdown/`
   precedent: a shell component, a low-level editor component, and a `lib/` for the pure
   decoration logic, kept separate from `src/modules/editor/` (the plain-text/code editor module)
   so this engine's CodeMirror configuration (theme, extensions, keymap) is independent and
   changes to one never ripple into the other.
7. **Theming via the existing `useEditorThemeExt` hook** (`src/modules/editor/lib/useEditorThemeExt.ts`),
   so syntax-highlighting colors match the user's chosen code-editor theme, without pulling in the
   rest of `buildSharedExtensions` (line numbers, fold gutter, lint gutter), which are code-editor
   concerns this note engine does not need.

---

## Architecture

```
TabContent case "markdown"   (switch on tab's resolved MarkdownEngine)
  |- "legacy"     -> current structure (EditorPathBar + hidden EditorPane +
  |                  MarkdownRenderPane)                        [unchanged]
  |- "tiptap"     -> MarkdownTab (modules/markdown/tiptap/, lazy)  [unchanged]
  |- "milkdown"   -> MilkdownTab (modules/markdown/milkdown/, lazy) [unchanged]
  |- "codemirror" -> MarkdownTab (modules/markdown/codemirror/, lazy)
       |- EditorPathBar (existing, no trailing controls: no outline, no mode toggle)
       |- useDocument(path, tabId)             (existing hook, unchanged)
       |- CodeMirrorEditor
            extensions: lang-markdown (+ GFM), livePreview ViewPlugin, useEditorThemeExt()
            onChange -> useDocument's onChange (plain string)
       |- ReloadConflictOverlay on external conflict (existing, unchanged)
```

New module layout:

```
src/modules/markdown/
  lib/            shared functional core (untouched)
  tiptap/         TipTap engine (untouched)
  milkdown/       Milkdown engine (untouched)
  codemirror/     MarkdownTab.tsx (shell), CodeMirrorEditor.tsx (low-level editor),
                  lib/livePreview.ts (pure decoration logic),
                  lib/markdownExtensions.ts (Extension[] assembly)
  MarkdownRenderPane.tsx   read-only preview switch (untouched, does not gain this engine)
```

## Error handling

- Binary/too-large/error/deleted document states: same fallback rendering `MarkdownTab` already
  uses elsewhere (`MarkdownDocFallback`), since `useDocument`'s `DocumentState` union is identical
  regardless of which engine consumes it.
- External modification while dirty: `useDocument`'s existing conflict flag drives the same
  `ReloadConflictOverlay` used by the plain-text editor and by Milkdown/TipTap's Source mode.
- A syntax-tree node the decoration logic does not recognize (unexpected/future markdown
  construct) is simply left undecorated, never an error: the raw text still renders and is still
  fully editable, which is the whole point of this engine.

## Testing

- `lib/livePreview.test.ts`: given a document string and a cursor position, which decorations are
  produced, covering headings, bold, italic, inline code, links, lists, task-list checkboxes,
  frontmatter, and an embedded HTML block; built against a real `EditorView` (happy-dom, matching
  this project's existing CodeMirror/markdown test setup).
- A round-trip test: load fixtures containing frontmatter and embedded HTML, assert
  `view.state.doc.toString()` equals the original content both immediately after load and after
  moving the cursor across every line (the mechanism that proves decorations never touch the
  document).
- Full suites green before done: `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Manual checklist in the plan: open a note with frontmatter and embedded HTML, verify byte-exact
  save with no edits, verify hide/reveal behavior on cursor movement for each decorated construct,
  verify autosave/external-reload/dirty-dot behavior matches the plain-text editor.

## Documentation updates (same commit as code)

- `docs/ARCHITECTURE.md`: fourth markdown engine, module layout.
- `docs/FORK.md`: divergence entry (Live Preview engine added for evaluation; gaps vs
  tiptap/milkdown: no outline, no toolbar, no read-only preview integration).
- `AGENTS.md`: module layout (`markdown/codemirror/`).
- `CLAUDE.md` glossary: add a row for this engine alongside the existing MilkdownTab/MilkdownEditor
  row.
