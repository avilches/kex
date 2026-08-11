# Milkdown Markdown Editor Design (third markdown engine)

**Feature:** Add a Milkdown (Crepe) WYSIWYG editor as a third selectable engine for the `markdown`
tab, alongside the TipTap rich editor and the legacy Streamdown preview
**Date:** 2026-07-07
**Related spec:** `2026-07-06-rich-markdown-editor-design.md` (TipTap port from HelixNotes)

---

## Problem

The rich-markdown-editor plan (in progress on branch `rich-markdown-editor`) turns the `markdown`
tab into a TipTap 3 WYSIWYG editor selected by a JSON-only preference
`markdownEditor: "rich" | "legacy"`. We want a third engine, Milkdown, to compare a
markdown-native ProseMirror distribution (remark-based parse/serialize, no HTML round-trip)
against the TipTap port, using the exact same tab integration: same document lifecycle, same
Rich|Source toggle, same shortcuts, same lazy-loading discipline, same JSON-only selection.

After this feature the `markdown` tab has three engines:

- `legacy` - the original read-only Streamdown preview (JSON-only escape hatch, untouched).
- `tiptap` - the HelixNotes port (previously preference value `"rich"`).
- `milkdown` - new, this spec.

## Prerequisite

This work starts only after the `rich-markdown-editor` branch has fully landed on `main`
(all 18 tasks of `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`, including
`MarkdownTab`, `useMarkdownDocument`, the `markdownEditor` preference and the
`markdown.toggleSource` / `markdown.toggleOutline` shortcut ids). The plan reuses those pieces
and cannot run without them. If interface details drifted during that implementation, the merged
code wins over the line references in this spec.

---

## Scope

In scope:

- New `milkdown` engine for the `markdown` tab built on **Milkdown 7 Crepe** (`@milkdown/crepe`):
  headings, lists, GFM task lists, GFM tables (Crepe table block), fenced code blocks with
  language picker (Crepe CodeMirror feature), links (link tooltip), images (image block),
  blockquotes, strikethrough, inline/block math via KaTeX (Crepe Latex feature), slash menu
  (Crepe BlockEdit), floating selection toolbar (Crepe Toolbar), placeholder, drag handle.
- Mermaid fenced blocks rendered via `@milkdown/plugin-diagram` with the same lazy-import and
  Kex-theme discipline as the TipTap mermaid extension (escape hatch: see decision 6).
- Outline panel for the milkdown engine (headings navigation), same toggle shortcut as tiptap.
- Rich|Source mode toggle identical in behavior to the TipTap `MarkdownTab` (Source mounts the
  existing CodeMirror `EditorPane`, mode switches sync through disk).
- Shared-shell refactor: extract the mode-agnostic tab logic that `MarkdownTab` and the new
  `MilkdownTab` would otherwise duplicate (decision 8).
- Preference rename `"rich"` -> `"tiptap"` and extension to three values (decision 2).
- Round-trip idempotence test corpus for the Milkdown serializer, docs updates, bundle
  measurement.

Out of scope (documented gaps vs the TipTap engine, see the parity matrix):

- Callout nodes, details/summary collapsibles, multicolor highlight, underline, sub/sup, text
  color, color swatches, page break, wiki-links, in-note find bar, move-line shortcuts, fixed
  formatting toolbar. Rationale in decision 5.
- Any change to the legacy preview or to the TipTap engine beyond the shared-shell refactor and
  the preference rename.

---

## Decisions (chosen vs alternatives)

All decisions below were taken unilaterally (per request) and are listed for review; challenge
any of them before implementation starts.

1. **Engine: Milkdown 7 with Crepe** (`@milkdown/crepe`, latest 7.x at install time), not
   `@milkdown/kit` core with hand-picked plugins. Crepe ships the whole feature set (slash menu,
   toolbar, tables, CodeMirror code blocks, latex, image block, link tooltip) in one package and
   is the upstream-recommended way to consume Milkdown; core-plus-plugins would re-implement all
   of that UI by hand for no benefit in an evaluation engine. Alternative rejected: `@milkdown/kit`
   (more control, far more code to own).
2. **Preference becomes `markdownEditor: "tiptap" | "milkdown" | "legacy"`, default `"tiptap"`.**
   The value `"rich"` is renamed to `"tiptap"` with **no migration code** (project rule: no
   backward compatibility). `parseMarkdownEditor` maps any unknown value, including a stale
   `"rich"` in an existing `settings-editor.json`, to the default `"tiptap"`, which preserves
   behavior for existing users by construction. The preference stays JSON-only (no Settings UI):
   the point of three engines is side-by-side evaluation by editing JSON, and a Settings control
   would be premature until one engine wins. Alternatives rejected: keeping `"rich"` as the
   tiptap value (ambiguous once two rich engines exist), adding a Settings UI (YAGNI until the
   evaluation ends).
3. **Directory rename `src/modules/markdown/rich/` -> `src/modules/markdown/tiptap/`.** With two
   WYSIWYG engines, "rich" no longer identifies one of them. Mechanical rename (imports are
   caught by tsc/biome), done in its own commit with docs/glossary updated in the same commit.
   Component names inside (`RichMarkdownEditor`, `MarkdownTab`) keep their names: they are the
   TipTap implementation's internals and renaming them buys nothing. New code goes to
   `src/modules/markdown/milkdown/`. Alternative rejected: leaving `rich/` as-is (permanent
   naming confusion for a one-commit mechanical fix).
4. **No HTML round-trip for Milkdown.** Milkdown parses and serializes markdown natively
   (remark). `MilkdownTab` feeds `doc.body` (markdown string) straight into Crepe and reads
   markdown back on update (`getMarkdown()`). `markdownToHtml` / `htmlToMarkdown` are TipTap-only
   and are not touched. `useMarkdownDocument` is reused unchanged: it already speaks markdown
   strings and owns frontmatter stripping, skip-if-equal saves, dirty state, autosave and
   external-change reload.
5. **Parity target is integration parity, not feature-for-feature parity.** "Same
   characteristics" means: same tab kind, same document lifecycle (dirty dot, Ctrl+S, autosave,
   external reload), same Rich|Source toggle, same shortcut ids, same lazy-chunk discipline, same
   theming approach, same testing bar, same docs obligations. It does not mean porting every
   HelixNotes extension to Milkdown: non-CommonMark constructs (callouts, details, highlight,
   sub/sup, text color, wiki-links) would need custom remark syntax plugins each, which defeats
   the purpose of evaluating Milkdown's idiomatic feature set. Documents containing those
   constructs still round-trip safely: Milkdown preserves raw inline/block HTML it does not
   model, and the skip-if-equal + dirty-only save policy means a no-edit session never rewrites
   a file. The parity matrix below is the explicit contract.
6. **Mermaid via `@milkdown/plugin-diagram`, with a verified escape hatch.** The plugin is
   official but its compatibility with Crepe must be verified at implementation time (both
   configure the code-block node). If they conflict, v1 renders `mermaid` fences as plain code
   blocks (Crepe CodeMirror) and the gap is documented in FORK.md; the plan carries this as an
   explicit checkpoint, not a silent failure. `mermaid` and `katex` are already dependencies
   (TipTap plan); both stay dynamic imports.
7. **Selection toolbar instead of fixed toolbar; no find bar.** Crepe's floating selection
   toolbar and slash menu are its idiomatic UX; porting the TipTap fixed `Toolbar.tsx` on top
   would fight the library. In milkdown mode `search.focus` is not intercepted (no in-note find
   in v1); users switch to Source mode for CodeMirror search. Documented gap.
8. **Shared tab shell extracted to `src/modules/markdown/lib/`.** `MilkdownTab` would duplicate
   from `MarkdownTab`: mode state + disk-synced toggle, the registry-driven keydown handler
   (`editor.save`, `markdown.toggleSource`, `markdown.toggleOutline`), `EditorPathBar` wiring,
   and the binary/toolarge/error/loading fallbacks. Extract exactly that into a
   `useMarkdownTabController` hook plus a `MarkdownDocFallback` component in `lib/`, refactor
   `MarkdownTab` to consume them (behavior-preserving, covered by existing tests plus new hook
   tests), then build `MilkdownTab` on the same pieces. Alternative rejected: copy-paste the
   shell (two divergent copies of subtle save/flush logic).
9. **Outline panel is engine-specific but style-shared.** `milkdown/OutlinePanel.tsx` reads
   headings from Milkdown's listener API; markup and classes mirror the tiptap outline so both
   look identical. `markdown.toggleOutline` works in both engines. Alternative rejected: one
   shared outline component abstracting over both editors (an abstraction over two APIs used
   once each).
10. **Theming: Crepe structural CSS + a Kex variable theme.** Import Crepe's base stylesheet
    inside the lazy chunk and override its theme tokens in `milkdown/milkdownTheme.css` mapped to
    Kex CSS variables (`--background`, `--foreground`, prose styles consistent with
    `richMarkdown.css`), instead of shipping one of Crepe's stock themes. Code block colors come
    from the same theme tokens the TipTap code blocks use.
11. **Lazy loading identical to the TipTap engine.** `MilkdownTab` is a `React.lazy` chunk
    mounted from `TabContent`; Crepe and its CSS load only inside that chunk; katex/mermaid stay
    dynamic imports inside their features. Bundle delta measured before/after in the plan's final
    task and recorded in `docs/BUILD.md`. If the Crepe chunk is disproportionate (it bundles its
    own CodeMirror surface for code blocks), that is a finding of the evaluation, not a blocker.
12. **Testing bar mirrors the TipTap plan.** Vitest idempotence corpus for the Milkdown
    round-trip (`getMarkdown()` after load is stable for the supported constructs: headings,
    nested lists, task lists, GFM tables, fenced code with languages, math, mermaid fences,
    links, images, blockquotes) running against a headless Crepe instance in the DOM test
    environment; corpus cases shared with the TipTap corpus where the syntax overlaps.
    Controller-hook tests for the extracted shell (mode toggle flush ordering, dirty plumbing).
    `parseMarkdownEditor` unit tests for the three values + unknown fallback.

---

## Architecture

```
TabContent case "markdown"   (switch on Preferences.markdownEditor)
  |- "legacy"   -> current structure (EditorPathBar + hidden EditorPane +
  |                MarkdownPreviewPane)                       [unchanged]
  |- "tiptap"   -> MarkdownTab (modules/markdown/tiptap/, lazy)  [existing, refactored
  |                onto the shared shell, behavior identical]
  |- "milkdown" -> MilkdownTab (modules/markdown/milkdown/, lazy)
       |- EditorPathBar (existing, trailing slot: Outline toggle + Rich|Source control)
       |- useMarkdownTabController (shared shell, lib/)
       |    mode "rich" | "source", disk-synced toggle, registry keydown,
       |    wraps useMarkdownDocument(path)
       |- mode === "rich":   MilkdownEditor (Crepe)
       |    content = doc.body (markdown); listener -> markdown -> onChange (debounced)
       |    Crepe features: BlockEdit, Toolbar, Table, CodeMirror, Latex, ImageBlock,
       |    LinkTooltip, ListItem, Cursor, Placeholder (+ plugin-diagram for mermaid)
       |    OutlinePanel (milkdown/, listener-driven)
       |- mode === "source": EditorPane (existing CodeMirror, lang-markdown)
```

New module layout:

```
src/modules/markdown/
  lib/            shared functional core (+ new: useMarkdownTabController, MarkdownDocFallback)
  tiptap/         TipTap engine (renamed from rich/, otherwise untouched by this feature)
  milkdown/       MilkdownTab.tsx, MilkdownEditor.tsx, OutlinePanel.tsx, milkdownTheme.css
  MarkdownPreviewPane.tsx   legacy preview (untouched)
```

## Feature parity matrix (tiptap vs milkdown v1)

| Capability | tiptap | milkdown v1 |
|---|---|---|
| Headings, lists, blockquotes, hr | yes | yes |
| Task lists (clickable) | yes | yes (GFM) |
| Tables | yes (resizable) | yes (Crepe table block) |
| Code blocks + language picker + copy | yes | yes (Crepe CodeMirror feature) |
| Math KaTeX inline/block | yes | yes (Crepe Latex) |
| Mermaid | yes | yes via plugin-diagram, escape hatch decision 6 |
| Slash commands | yes | yes (BlockEdit) |
| Toolbar | fixed toolbar | floating selection toolbar |
| Outline panel | yes | yes |
| Source mode toggle | yes | yes (same shortcut) |
| In-note find | yes (FindBar) | no (use Source mode) |
| Callouts | yes | no (rendered as blockquote) |
| Details/summary | yes | no |
| Highlight/underline/sub/sup/color | yes | no (raw HTML preserved) |
| Wiki-links (pref-gated) | yes | no |
| Move-line / tab-indent shortcuts | yes | no custom port (Crepe's own keymap applies) |
| Images | markdown syntax, convertFileSrc | yes (Crepe ImageBlock, convertFileSrc) |
| Dirty/autosave/external reload | yes | yes (same hook) |

## Error handling

- Binary/too-large/error/loading states: same `MarkdownDocFallback` rendering as tiptap.
- Crepe initialization failure (bad document, plugin conflict): catch, show an inline error pane
  with a "Open in Source mode" action; never crash the tab.
- Mermaid/KaTeX load or render failure: plain code block with inline error note (same policy as
  tiptap).
- Serializer produces unexpected output: skip-if-equal + dirty-only saves guarantee a no-edit
  session never rewrites the file; the idempotence corpus guards edited documents.
- External modification while dirty: same policy as the code editor (reload only when clean).

## Testing

- Vitest: Milkdown round-trip idempotence corpus (decision 12); `useMarkdownTabController` tests;
  `parseMarkdownEditor` three-value + fallback tests; existing tiptap and lib tests stay green
  through the rename and shell refactor.
- Full suites green before done: `pnpm exec biome lint ./src`, `pnpm check-types`, `pnpm test`
  (Rust untouched).
- Manual checklist in the plan: each Crepe feature, slash menu, table ops, math, mermaid, outline
  navigation, source toggle round-trip, autosave, external edit reload, all three preference
  values, dirty dot.

## Documentation updates (same commit as code)

- `docs/ARCHITECTURE.md`: three-engine markdown tab, renamed preference values, new module dir,
  JSON-only preference doc.
- `docs/FORK.md`: divergence entry (Milkdown engine added for evaluation; gaps vs tiptap engine).
- `docs/BUILD.md`: Crepe lazy-chunk bundle impact.
- `AGENTS.md`: module layout (`markdown/tiptap/`, `markdown/milkdown/`).
- `CLAUDE.md` glossary: MilkdownTab/MilkdownEditor term; update any glossary row referencing
  `markdown/rich/`.
