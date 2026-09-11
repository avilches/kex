# Milkdown engine: manual verification checklist

The milkdown branch (per-tab `markdownEngine`, third value `"milkdown"` on `@milkdown/crepe`) was implemented,
unit-tested and code-reviewed entirely in a headless environment: no display, no way to click through the real
app. Every item below needs a human (or a future computer-use-capable session) running a fresh `pnpm tauri dev`
(not an HMR session carrying over stale module state, see `AGENTS.md` "Diagnostico de bugs con Vite HMR") to
actually confirm it. Nothing here has been run against a live GUI. Do not check an item, or write a result next
to it, without having actually done it.

How to use this file: check a box and add a one-line result (pass / fail + what you saw) as you go. Leave failing
items open with enough detail to file a follow-up; do not silently mark something as passing to close the list out.

## Milkdown engine: core editing surface

- [ ] **Headings** render with the right levels (H1-H6) and the outline panel lists them.
- [ ] **Nested lists** (bullet and ordered, at least two levels deep) create, indent/outdent, and edit correctly.
- [ ] **Task list toggling**: create a task list, click a checkbox, confirm the markdown round-trips with `- [x]`.
- [ ] **Table creation and cell editing**: insert a table via the slash menu, add/remove a row and column, edit a
  cell, tab between cells.
- [ ] **Fenced code with the language picker**: insert a code fence, change its language via the picker, confirm
  syntax highlighting updates.
- [ ] **Inline and block math**: type inline `$x^2$` and a block `$$ ... $$`, confirm KaTeX renders both.
- [ ] **A mermaid fence renders as a plain code block, not a diagram and not an error.** This is expected, not a
  bug: `@milkdown/plugin-diagram` was removed in this branch because it does not actually render diagrams (see
  `docs/FORK.md`, "Milkdown markdown engine"). Trigger: paste a ` ```mermaid ` fence with valid diagram syntax
  (e.g. `graph TD;\nA-->B;`) and confirm it displays as syntax-highlighted text, with no diagram attempt and no
  console error.
- [ ] **The slash menu** opens on `/` and inserts each block type it offers.
- [ ] **The floating selection toolbar** appears on text selection and its marks (bold, italic, etc.) apply.
- [ ] **The drag handle** (block hover, left margin) can reorder at least two adjacent blocks.
- [ ] **The placeholder on an empty document** shows on a brand-new or emptied note and disappears once text is
  typed.
- [ ] **Image rendering from a relative path.** Flagged by code reading, not confirmed live: `MilkdownEditor.tsx`
  hands the raw markdown straight to `Crepe` with no `convertFileSrc` rewrite, unlike `RichMarkdownEditor.tsx`
  (`resolveImageSrc`). Test with a note that has `![alt](./relative.png)` pointing at a real local file next to
  it: expect this to be broken (image does not load) unless Crepe does its own path resolution internally. If it
  turns out to work, figure out why before assuming the gap does not exist; if it is broken, this is a known,
  already-documented gap (`docs/FORK.md`), not a new bug to file blind.
- [ ] **The outline panel and navigation**: open the outline, click a heading, confirm it scrolls to that heading.
- [ ] **Outline navigation with punctuation in the heading text** (e.g. `# Intro: Overview`) navigates correctly.
- [ ] **Outline navigation to a duplicate heading's second occurrence does NOT work correctly.** This is a known,
  documented, accepted gap (`docs/FORK.md`, "Outline navigation to a repeated heading is unreliable"), not a
  regression to chase if confirmed. Test with two headings sharing exact text; confirm the first navigates
  correctly and note what actually happens on the second (scrolls to the first again, does nothing, or something
  else) so the gap description stays accurate.
- [ ] **Milkdown theme in a light Kex theme**: open a note in milkdown with a light theme active, confirm colors
  and contrast look correct (no unreadable text, no clashing backgrounds).
- [ ] **Milkdown theme in a dark Kex theme**: same, with a dark theme active.
- [ ] **Heading weight/line-height compared side by side against the tiptap engine.** Known minor gap: milkdown
  headings may render visibly thinner. Open the same document in a tiptap tab and a milkdown tab side by side (or
  in quick succession) and compare heading boldness and vertical spacing; record whether the gap is actually
  visible or was only a theoretical concern.
- [ ] **Rich to Source toggle**, both directions: confirm the source view shows the exact current markdown and
  that toggling back to Rich re-renders it without data loss or a duplicate/ghost editor instance.
- [ ] **The dirty dot** appears on the first real edit and clears on save; does NOT appear just from opening a
  file (the load-time baseline gate, `baselineGate.ts`, exists specifically to prevent this).
- [ ] **Ctrl+S / Cmd+S** saves explicitly and clears the dirty dot.
- [ ] **Autosave** (`editorAutoSaveDelay`, default 15000ms, JSON-only in `settings-editor.json`) writes to disk
  after the configured delay without user action.
- [ ] **Reload after an external edit**: with the tab clean (not dirty), edit the file from outside Kex (another
  editor or a terminal), confirm the milkdown tab picks up the change. With the tab dirty, confirm it does NOT
  clobber unsaved local changes (same policy as the code editor, per the design spec).
- [ ] **The inline error pane and its "Open in Source mode" action.** Trigger method: temporarily add
  `throw new Error("forced init failure")` at the top of the `boot` function in
  `src/modules/markdown/milkdown/MilkdownEditor.tsx`, run `pnpm tauri dev`, open any markdown file with the
  milkdown engine. Confirm the inline error pane shows with the thrown message, and that clicking "Open in Source
  mode" switches the tab to Source mode showing the file's raw content. Revert the temporary throw afterward; do
  not leave it in the codebase.

## Settings: the three-value radio and default engine

- [ ] **Settings > Editor shows the three-value radio** for "Markdown editor" (labels: TipTap, Milkdown, Preview
  only) under the Editor section.
- [ ] **The current choice is pre-selected** when Settings is opened (matches whatever `markdownEngine` currently
  is in `user-data/support/settings-editor.json`).
- [ ] **Changing it persists across a Settings reopen**: pick a different value, close the Settings window,
  reopen it, confirm the new value is still selected. Also confirm the on-disk value changed in
  `user-data/support/settings-editor.json` (key `markdownEngine`).
- [ ] **Each of the three Settings values produces a new tab with that engine**: for each of TipTap, Milkdown,
  and Preview only, set it as the default, open a markdown file as a brand-new tab, confirm it opens with that
  engine.
- [ ] **A tab keeps its engine when the preference changes**: open a markdown tab with one engine active, change
  the Settings default to a different engine, confirm the already-open tab is unaffected (still the engine it
  was opened with). This is `sealMarkdownEngine`'s contract: the field is stamped once, not re-resolved on every
  render.

## Two tabs, same file, different engines (hand-edited workspace JSON)

- [ ] **Hand-edit a workspace JSON** (`user-data/support/workspaces/<id>.json`) to give two tabs the same `path`
  pointing at the same markdown file, one with `markdownEngine: "tiptap"` and the other with
  `markdownEngine: "milkdown"` (or any two distinct values). Reload the window (or restart Kex). Confirm both
  tabs open as live tabs, each rendering with its own engine, and that editing in one does not corrupt the
  other's in-memory buffer (they only meet at disk, per `docs/ARCHITECTURE.md` 4.10).
- [ ] **Drag one of the two tabs into a split**: confirm both are visible at once, side by side, each still on
  its own engine.

## Editor-tab preview (overlay and split), engine-aware

- [ ] **The editor tab's overlay preview renders with the tab's resolved engine**, for all three engine values
  (tiptap, milkdown, legacy/Preview only) -- not always legacy. Open a `.md` file as a raw `editor` tab, toggle
  the overlay preview on, confirm it matches the tab's `markdownEngine`.
- [ ] **The editor tab's split preview** does the same, side by side with the source `editor` pane instead of as
  an overlay.
- [ ] **Typing in the code pane updates the preview after a short delay** (the render pane debounces at
  `RICH_DEBOUNCE_MS` = 200ms for both rich engines, no debounce for legacy) without the preview side ever writing
  back to the file. Confirm by typing, watching the preview update, and confirming no extra disk write happens
  from the preview (e.g. check mtime, or that undo history in the source pane is unaffected).
- [ ] **Switching Kex themes restyles the preview** live, for both the tiptap and the milkdown preview renderer,
  without needing to reopen the tab.

## Notes on what could not be verified in this environment

This environment has a real shell (used for the `pnpm build` bundle measurement in `docs/BUILD.md`) but no
display and no way to drive the actual Tauri window, so every item above is unchecked by design. The image-path
and duplicate-heading-navigation items additionally carry a specific code-reading finding (see the item text)
that narrows what to expect, so the person running this checklist is not starting from zero on those two.
