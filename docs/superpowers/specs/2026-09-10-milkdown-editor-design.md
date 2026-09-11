# Milkdown Markdown Editor Design (third engine, per-tab selection)

**Feature:** Add a Milkdown (Crepe) WYSIWYG editor as a third engine for the `markdown` tab, make
the engine a per-tab property persisted in the workspace JSON, expose the default engine in
Settings, and render the editor tab's markdown preview with that engine instead of always with the
legacy renderer
**Date:** 2026-09-10
**Revises:** `2026-07-07-milkdown-editor-design.md` (same goal, engine selection redesigned)
**Related:** `2026-07-06-rich-markdown-editor-design.md` (TipTap port), `docs/MARKDOWN_GOTCHAS.md`,
`TIPTAP_VS_MILKDOWN.md`

---

## Problem

The TipTap engine converts markdown to HTML, edits a ProseMirror document, and serializes back
through HTML. `docs/MARKDOWN_GOTCHAS.md` records the consequence and its verdict: once the user
edits a single word and the document is saved, the whole file is reflowed, and that cannot be fixed
inside this architecture because CommonMark treats a soft line break as a space, so the ProseMirror
document has nowhere to keep "there was a soft break here". A no-edit session no longer rewrites the
file (that was fixed with a baseline body), but an edited one still does.

`TIPTAP_VS_MILKDOWN.md` named the way out: a markdown-native ProseMirror distribution, where the
document model is the markdown AST (remark) and the round-trip preserves the original syntax.
Milkdown 7 with the Crepe preset is that distribution.

This feature adds Milkdown as a third engine rather than replacing TipTap, so both can be compared
on the same file before deciding which one stays. Making that comparison possible is what drives the
per-tab engine below: the point is to have the same document open twice, once per engine, side by
side, and watch what each one writes to disk.

## Prerequisite

The TipTap rich editor is merged on `main` (verified 2026-09-10): `src/modules/markdown/rich/`
exists with `MarkdownTab`, `useMarkdownDocument` and `RichMarkdownEditor`, `parseMarkdownEditor`
lives in `src/modules/settings/store.ts`, and the `markdown.toggleSource` / `markdown.toggleOutline`
shortcut ids are in the registry. The merged code is ground truth: where this spec cites a symbol or
a line, re-read the file first.

---

## Scope

In scope:

- New `milkdown` engine for the `markdown` tab built on **Milkdown 7 Crepe** (`@milkdown/crepe`):
  headings, lists, GFM task lists, GFM tables, fenced code blocks with language picker (Crepe
  CodeMirror feature), links (link tooltip), images (image block), blockquotes, strikethrough,
  inline and block math via KaTeX (Crepe Latex feature), slash menu (Crepe BlockEdit), floating
  selection toolbar (Crepe Toolbar), placeholder, drag handle.
- Mermaid fenced blocks via `@milkdown/plugin-diagram`, lazily imported, with a verified escape
  hatch (decision 8).
- Outline panel for the milkdown engine, same toggle shortcut as tiptap.
- Rich|Source mode toggle identical in behavior to the TipTap `MarkdownTab` (Source mounts the
  existing CodeMirror `EditorPane`, mode switches sync through disk).
- Shared-shell refactor: extract the mode-agnostic tab logic that `MarkdownTab` and the new
  `MilkdownTab` would otherwise duplicate (decision 9).
- Preference renamed to `markdownEngine` with three values, exposed in Settings (decisions 2 and 3).
- Per-tab engine persisted in the workspace JSON for `markdown` and `editor` tabs (decision 4).
- The editor tab's markdown preview (split and overlay) rendered with the tab's engine, read-only
  (decision 6).
- Directory rename `markdown/rich/` to `markdown/tiptap/` (decision 5).
- Round-trip idempotence corpus for the Milkdown serializer, docs updates, bundle measurement.

Out of scope:

- Any engine picker inside a tab's bar, and any "Open with" submenu in the explorer context menu.
  Comparing two engines is done by editing the workspace JSON by hand and reloading the window,
  which is the requested workflow. The engine is data on the tab, not a command in the UI.
- Relaxing the same-path deduplication in `openFileInTab` (`src/app/App.tsx`). Opening a file from
  the UI keeps activating the tab that already shows it.
- Porting TipTap's non-CommonMark constructs to Milkdown: callouts, details/summary, multicolor
  highlight, underline, sub/sup, text color, page break, wiki-links, the in-note find bar, the
  move-line shortcuts, the fixed formatting toolbar. Rationale in decision 7.
- Any change to the legacy renderer or to the TipTap engine's behavior beyond the rename and the
  shared-shell refactor, both behavior-preserving.

---

## Decisions

1. **Engine: Milkdown 7 with Crepe** (`@milkdown/crepe`, latest 7.x at install time), not
   `@milkdown/kit` core with hand-picked plugins. Crepe ships the whole feature set (slash menu,
   toolbar, tables, CodeMirror code blocks, latex, image block, link tooltip) in one package and is
   the upstream-recommended way to consume Milkdown. Core-plus-plugins would re-implement all of
   that UI by hand for no benefit in an engine whose purpose is evaluation.

2. **Preference renamed from `markdownEditor` to `markdownEngine`**, keys and type together:
   `type MarkdownEngine = "tiptap" | "milkdown" | "legacy"`, default `"tiptap"`, parsed by
   `parseMarkdownEngine` which maps any unknown value to the default. It stays in
   `settings-editor.json`. No migration code and no old-key fallback, per the project rule: a
   `markdownEditor` key left in an existing file is ignored and the user starts from the default,
   which is now a one-click fix in Settings. The rename is what makes the whole feature legible,
   because the same word `markdownEngine` then names the preference key, the type, the per-tab field
   and the resolver, and the user edits both JSON files by hand.

3. **The preference is the default for new tabs, and it gets a Settings control.** Settings >
   Editor gains a `RadioGroup` with the three engines, following the project convention that a
   global editor setting lives both in the editor's own context menu and in the Settings window.
   The `// JSON-only` marker is removed from the `Preferences` type and from the JSON-only list in
   `docs/ARCHITECTURE.md`. Changing it does not convert tabs that are already open: each tab carries
   its own engine (decision 4), so the preference only decides what a newly created tab is sealed
   with. This is the intended semantics, and it supersedes TASK-652, which filed the lack of
   reactivity as a bug. TASK-727 asked for this same control with two values and is absorbed here.

4. **The engine is a per-tab field persisted in the workspace JSON.** Both tab kinds that render
   markdown gain it: `markdown` (the engine that edits the document) and `editor` (the engine that
   renders its preview). The field is named `markdownEngine`, the same word as the preference, and
   is optional in the type:

   ```ts
   | (TabCommon & { kind: "editor"; path: string; dirty: boolean; preview: boolean;
       previewMode?: "overlay" | "split"; overrideLanguage?: string | null;
       markdownEngine?: MarkdownEngine })
   | (TabCommon & { kind: "markdown"; path: string; dirty?: boolean;
       markdownEngine?: MarkdownEngine })
   ```

   Every code path that creates one of those tabs seals the field with the current preference, so
   the JSON always carries it explicitly and can be edited by hand. It is optional rather than
   required because a hand-edited JSON with the field deleted must keep working: a tab without an
   engine resolves to the preference. That is the defined behavior of a missing field, not
   backward-compatibility code for an old format.

   Sealing goes through one helper so no creation site can forget it, and resolution goes through
   one pure function, both in `src/modules/markdown/lib/`:

   ```ts
   export function resolveMarkdownEngine(
     tabEngine: MarkdownEngine | undefined,
     preference: MarkdownEngine,
   ): MarkdownEngine;
   ```

   Rendering always reads the resolved engine of the tab, never the preference directly. Rust needs
   no change: `window_state.rs` stores workspace bodies as opaque `serde_json::Value`.

5. **Directory rename `src/modules/markdown/rich/` to `src/modules/markdown/tiptap/`.** With two
   WYSIWYG engines, "rich" no longer identifies one of them. Mechanical rename in its own commit,
   with docs and glossary updated in the same commit. The component names inside
   (`RichMarkdownEditor`, `MarkdownTab`) keep their names: they are that engine's internals. New
   code goes to `src/modules/markdown/milkdown/`.

6. **The editor tab's preview uses the tab's engine, read-only.** Today `TabContent` mounts
   `MarkdownPreviewPane` (Streamdown) in two places: the `editor` tab's split preview and its
   overlay preview. Both become a single new component, `MarkdownRenderPane`
   (`src/modules/markdown/MarkdownRenderPane.tsx`), which takes the live markdown text and the
   resolved engine and mounts:

   - `legacy` -> `MarkdownPreviewPane`, unchanged.
   - `tiptap` -> the TipTap editor with editing disabled.
   - `milkdown` -> the Crepe editor with editing disabled.

   `MarkdownRenderPane` receives content as a string and has no document layer, no path-based
   loading and no save path of any kind, so it is structurally incapable of writing to the file.
   That matters because the same file is being edited by CodeMirror right next to it; two editors
   competing to save the same path is the failure this shape rules out.

   The content comes from the CodeMirror pane and changes on every keystroke, so the two rich
   engines debounce before re-parsing (200 ms) instead of replacing a ProseMirror document per
   keypress. The `legacy` branch keeps forwarding the live text with no debounce, exactly as today,
   so unifying the mount point does not slow down the renderer that is already cheap.

   The `markdown` tab's own `legacy` branch also routes through `MarkdownRenderPane`, so there is one
   place in the tree that maps an engine to a read-only renderer. `MarkdownPreviewPane` itself is not
   modified.

   `RichMarkdownEditor` already takes its markdown as a `body` string plus a `revision` counter and
   does not read the disk, so it is reused with a new `editable` prop defaulting to true. If its
   prop surface turns out to demand meaningless stubs when not editing (it currently requires
   change, navigation and find callbacks plus a wiki-link index), extract a `RichMarkdownView` that
   reuses the same extension set instead of passing stubs. The read-only mode mounts no toolbar, no
   outline and no slash menu.

7. **Parity target is integration parity, not feature-for-feature parity.** Same tab kind, same
   document lifecycle (dirty dot, Ctrl+S, autosave, external reload), same Rich|Source toggle, same
   shortcut ids, same lazy-chunk discipline, same theming approach, same testing bar, same docs
   obligations. It does not mean porting every TipTap extension: the non-CommonMark constructs would
   each need a custom remark syntax plugin, which defeats the purpose of evaluating Milkdown's
   idiomatic feature set. Documents containing them still round-trip safely, because Milkdown
   preserves raw inline and block HTML it does not model, and the skip-if-equal plus dirty-only save
   policy means a no-edit session never rewrites a file. The parity matrix below is the contract.

8. **Mermaid via `@milkdown/plugin-diagram`, with a verified escape hatch.** The plugin is official,
   but its compatibility with Crepe must be verified at implementation time, because both configure
   the code-block node. If they conflict, v1 renders `mermaid` fences as plain code blocks and the
   gap is documented in `docs/FORK.md`. This is an explicit checkpoint in the plan, not a silent
   failure. `mermaid` and `katex` are already dependencies and stay dynamic imports.

9. **Shared tab shell extracted to `src/modules/markdown/lib/`.** `MilkdownTab` would otherwise
   duplicate from `MarkdownTab`: mode state and the disk-synced Rich|Source toggle, the
   registry-driven keydown handler (`editor.save`, `markdown.toggleSource`,
   `markdown.toggleOutline`), the `EditorPathBar` wiring, and the binary / too-large / error /
   loading fallbacks. Extract exactly that into a `useMarkdownTabController` hook plus a
   `MarkdownDocFallback` component, refactor `MarkdownTab` onto them (behavior-preserving, covered
   by the existing tests plus new hook tests), then build `MilkdownTab` on the same pieces. The
   alternative, copy-pasting the shell, would leave two divergent copies of subtle save and flush
   logic.

10. **Selection toolbar instead of a fixed toolbar, and no find bar.** Crepe's floating selection
    toolbar and slash menu are its idiomatic UX; porting TipTap's fixed `Toolbar.tsx` on top would
    fight the library. In milkdown mode `search.focus` is not intercepted: users switch to Source
    mode for CodeMirror search. Documented gap.

11. **Outline panel is engine-specific but style-shared.** `milkdown/OutlinePanel.tsx` reads
    headings from Milkdown's listener API; markup and classes mirror the tiptap outline so both look
    identical. `markdown.toggleOutline` works in both engines. One shared component abstracting over
    two editor APIs used once each would be an abstraction with no second customer.

12. **Theming: Crepe structural CSS plus a Kex variable theme.** Import Crepe's base stylesheet
    inside the lazy chunk and override its theme tokens in `milkdown/milkdownTheme.css`, mapped to
    Kex CSS variables and consistent with `richMarkdown.css`, instead of shipping a stock Crepe
    theme. Code block colors come from the same tokens the TipTap code blocks use.

13. **Lazy loading identical to the TipTap engine.** `MilkdownTab` is a `React.lazy` chunk mounted
    from `TabContent`; Crepe and its CSS load only inside that chunk; `@milkdown/plugin-diagram`
    (and therefore mermaid) loads only for documents containing a mermaid fence; katex loads on
    demand through Crepe's Latex feature. The read-only preview path loads the same chunk, so an
    editor tab previewing markdown with a rich engine pays that cost only when such a preview is
    opened. Bundle delta measured before and after and recorded in `docs/BUILD.md`. If the Crepe
    chunk is disproportionate, that is a finding of the evaluation, not a blocker.

14. **Testing bar mirrors the TipTap plan.** Details in the Testing section.

---

## Architecture

```
TabContent case "markdown"   (engine = resolveMarkdownEngine(tab.markdownEngine, pref))
  |- "legacy"   -> EditorPathBar + hidden EditorPane + MarkdownRenderPane(legacy)
  |- "tiptap"   -> MarkdownTab   (modules/markdown/tiptap/, lazy)
  |- "milkdown" -> MilkdownTab   (modules/markdown/milkdown/, lazy)
       |- EditorPathBar (trailing slot: Outline toggle + Rich|Source control)
       |- useMarkdownTabController (shared shell, lib/)
       |    mode "rich" | "source", disk-synced toggle, registry keydown,
       |    wraps useMarkdownDocument(path)
       |- mode "rich":   MilkdownEditor (Crepe)
       |    content = doc.body (markdown); listener -> markdown -> onChange (debounced)
       |    OutlinePanel (milkdown/, listener-driven)
       |- mode "source": EditorPane (existing CodeMirror, lang-markdown)

TabContent case "editor", markdown file with previewMode "split" | "overlay"
  |- EditorPane (CodeMirror, owns the document and the saves)
  |- MarkdownRenderPane(content = live text, engine = resolved engine, editable = false)
       |- legacy   -> MarkdownPreviewPane
       |- tiptap   -> RichMarkdownEditor (editable false)
       |- milkdown -> MilkdownEditor (readonly)
```

Module layout:

```
src/modules/markdown/
  lib/                    shared functional core
                          + markdownEngine.ts (resolveMarkdownEngine, sealing helper)
                          + useMarkdownTabController.ts, MarkdownDocFallback.tsx
  tiptap/                 TipTap engine (renamed from rich/)
  milkdown/               MilkdownTab.tsx, MilkdownEditor.tsx, OutlinePanel.tsx,
                          milkdownTheme.css
  MarkdownRenderPane.tsx  engine switch for read-only rendering
  MarkdownPreviewPane.tsx legacy renderer (untouched)
```

## Feature parity matrix (tiptap vs milkdown v1)

| Capability | tiptap | milkdown v1 |
|---|---|---|
| Headings, lists, blockquotes, hr | yes | yes |
| Task lists (clickable) | yes | yes (GFM) |
| Tables | yes (resizable) | yes (Crepe table block) |
| Code blocks + language picker + copy | yes | yes (Crepe CodeMirror feature) |
| Math KaTeX inline and block | yes | yes (Crepe Latex) |
| Mermaid | yes | yes via plugin-diagram, escape hatch decision 8 |
| Slash commands | yes | yes (BlockEdit) |
| Toolbar | fixed toolbar | floating selection toolbar |
| Outline panel | yes | yes |
| Source mode toggle | yes | yes (same shortcut) |
| In-note find | yes (FindBar) | no (use Source mode) |
| Callouts | yes | no (rendered as blockquote) |
| Details/summary | yes | no |
| Highlight, underline, sub/sup, color | yes | no (raw HTML preserved) |
| Wiki-links (pref-gated) | yes | no |
| Move-line and tab-indent shortcuts | yes | no custom port (Crepe's own keymap applies) |
| Images | markdown syntax, convertFileSrc | yes (Crepe ImageBlock, convertFileSrc) |
| Dirty, autosave, external reload | yes | yes (same hook) |
| Read-only preview for an editor tab | yes (decision 6) | yes (decision 6) |

## Error handling

- Binary, too-large, error and loading states: the same `MarkdownDocFallback` rendering as tiptap.
- Crepe initialization failure (bad document, plugin conflict): catch, show an inline error pane
  with an "Open in Source mode" action, never crash the tab.
- Crepe failure inside `MarkdownRenderPane`: fall back to the legacy renderer for that preview, so a
  broken engine never blanks the preview of a file the user is editing.
- Mermaid or KaTeX load and render failure: plain code block with an inline error note, the same
  policy as tiptap.
- Unexpected serializer output: skip-if-equal plus dirty-only saves guarantee that a no-edit session
  never rewrites the file; the idempotence corpus guards edited documents.
- External modification while dirty: the same policy as the code editor, reload only when clean.
- An unknown engine string in a hand-edited workspace JSON resolves to the preference, exactly like
  a missing field, so a typo degrades to the default instead of rendering nothing.

## Testing

- `parseMarkdownEngine`: the three values, unknown values, and the stale `markdownEditor` key
  scenario all landing on `"tiptap"`.
- `resolveMarkdownEngine`: tab value wins, missing value falls back to the preference, unknown value
  falls back to the preference.
- Milkdown round-trip idempotence corpus against a headless Crepe instance: `getMarkdown()` after
  load is stable for headings, nested lists, task lists, GFM tables, fenced code with languages,
  math, mermaid fences, links, images, blockquotes, and for the raw-HTML constructs Milkdown does
  not model. Cases shared with the TipTap corpus where the syntax overlaps.
- The shared shell's decisions (which save path a mode switch takes and in what order, which action a
  key event routes to) and the preview's decisions (which renderer an engine maps to, whether the
  text is debounced) are extracted as pure functions and tested there. This project has no React
  component or hook test anywhere and no testing-library dependency, and this feature is not the
  place to introduce one: the components stay thin shells over tested logic, which is what
  `AGENTS.md` asks for, and the shells are covered by the manual checklist.
- Sealing: every creation path produces a tab carrying `markdownEngine`.
- Workspace restore: a workspace JSON with two tabs of the same path and different engines restores
  as two tabs, each with its engine, and the restore does not collapse them.
- Existing tiptap and lib tests stay green through the rename and the shell refactor.
- Full suites green before done: `pnpm exec biome lint ./src`, `pnpm check-types`, `pnpm test`. Rust
  is untouched.
- Manual checklist in the plan: each Crepe feature, slash menu, table ops, math, mermaid, outline
  navigation, source toggle round-trip, autosave, external edit reload, the three preference values,
  the dirty dot, the two-tabs-same-file comparison through a hand-edited workspace JSON, and the
  read-only preview in split and overlay for each engine.

## Documentation updates (same commit as the code)

- `docs/ARCHITECTURE.md`: three-engine markdown tab, the per-tab `markdownEngine` field, the renamed
  preference with its Settings control, the new module directories, and the removal of
  `markdownEditor` from the JSON-only list.
- `docs/FORK.md`: divergence entry (Milkdown engine added for evaluation, gaps versus the tiptap
  engine).
- `docs/BUILD.md`: Crepe lazy-chunk bundle impact.
- `docs/MARKDOWN_GOTCHAS.md`: note that the reflow-on-edit limitation is what this engine exists to
  measure, and record what the corpus found.
- `AGENTS.md`: module layout (`markdown/tiptap/`, `markdown/milkdown/`).
- `CLAUDE.md` glossary: `MilkdownTab` / `MilkdownEditor` / `MarkdownRenderPane` terms, and every row
  that referenced `markdown/rich/` or the old preference name.
