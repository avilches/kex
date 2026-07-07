# Rich Markdown Editor Design (HelixNotes editor port)

**Feature:** Replace the markdown tab content with a TipTap-based WYSIWYG editor ported from
HelixNotes, keeping the current Streamdown preview code in the tree as a fallback
**Date:** 2026-07-06
**Reference app:** HelixNotes (`/Users/avilches/Work/Proy/Repos/HelixNotes`), editor in
`src/lib/components/Editor.svelte` (TipTap 3) plus `src/lib/editor/`

---

## Problem

Kex's `markdown` tab is read-only: a Streamdown preview fed by a hidden CodeMirror instance
(`TabContent.tsx` case `"markdown"`). HelixNotes ships a full WYSIWYG markdown editor (TipTap 3
over ProseMirror) with editing, tasks, tables, callouts, math, diagrams and a source mode. The
goal is to port that editor to Kex as the new default experience for `.md` tabs, without deleting
the current preview implementation.

Independent from the Notes Sidebar plan (`2026-07-06-notes-sidebar-view-design.md`): both touch
markdown but neither depends on the other. When both land, notes open into this editor
automatically because both use the `markdown` tab kind.

---

## Scope

Port from HelixNotes (markdown-relevant features, "all the options Helix has"):

- TipTap 3 core with the same extension set: StarterKit (minus its code block), Placeholder,
  TaskList/TaskItem (nested, clickable), Table (resizable) + custom cell/header, Link, Image
  (inline), Highlight (multicolor), Typography, Underline, Subscript, Superscript, TextStyle,
  Color, CodeBlockLowlight (+ language selector + copy button), Details/Summary/Content
  (collapsibles), TextAlign, MathBlock/MathInline (KaTeX), MermaidRenderer, Callout (+ live
  typing), PageBreak, HeadingShortcuts, WrapSelectedText, SlashCommands, MoveLineShortcuts,
  TabIndent, in-note find (NoteSearchExtension), ColorSwatch, wiki-links (behind a preference,
  resolved against workspace notes), CtrlEndScrollPastEnd, collapsibleKeymap.
- Formatting toolbar (buttons + heading/color/highlight/align/insert dropdowns) and outline
  side panel (headings navigation, toggle).
- Source mode toggle: raw markdown editing.
- Markdown round-trip: `markdownToHtml` (markdown-it + plugins) on load, `htmlToMarkdown` on
  save, both ported as pure TS modules. Note: Helix's regex-based `htmlToMarkdown`
  (Editor.svelte:3639) is dead code; the real save path is the ProseMirror-walking serializer
  (`prosemirrorToMarkdown`, Editor.svelte:3063-3354, plus `serializeCallout` in callouts.ts).
  The port keeps the `htmlToMarkdown(html): string` contract but transcribes the semantics of
  the real serializer (DOMParser walk), using the regex version only as a mark-syntax reference.

Explicitly excluded (decisions, see below): AI menu (no-AI fork), Secret blocks, PDF embeds,
image paste-to-attachments. Task metadata menu (due/priority) excluded in v1.

---

## Decisions (chosen vs alternatives)

1. **Engine: TipTap 3 via `@tiptap/react`**, same major version as Helix (3.19), so Helix's
   custom extensions (plain TipTap `Node`/`Extension` objects, framework-agnostic) port with
   minimal edits. Alternatives considered: Milkdown Crepe (recommendation of the older
   `docs/NOTES_AND_BOOKMARKS_PLAN.md`, rejected: would mean rewriting every Helix feature) and
   CodeMirror live-preview (rejected: not WYSIWYG, does not match "the same editor as Helix").
2. **The old preview stays in the tree, unused by default** (explicit requirement: replace
   without deleting). `MarkdownPreviewPane.tsx` and its Streamdown dependency remain. A JSON-only
   preference `markdownEditor: "rich" | "legacy"` (default `"rich"`) selects which component the
   `markdown` tab mounts. Marked `// JSON-only` in `Preferences` and listed in
   `docs/ARCHITECTURE.md` per convention. No UI toggle in Settings (YAGNI; flip the JSON to
   compare). Alternative rejected: deleting Streamdown (violates the requirement) or a per-tab
   toggle button (adds UI surface for a transition aid).
3. **Module placement**: new `src/modules/markdown/rich/` inside the existing markdown module
   (the module keeps owning the `markdown` tab kind). Pure conversion code in
   `src/modules/markdown/lib/` (`markdownToHtml.ts`, `htmlToMarkdown.ts`, `frontmatter.ts`).
   Helix's `Editor.svelte` is 5000+ lines; the port splits it: extensions one file each under
   `rich/extensions/`, toolbar `rich/Toolbar.tsx`, outline `rich/OutlinePanel.tsx`, editor shell
   `rich/RichMarkdownEditor.tsx`.
4. **Round-trip fidelity over prettiness**:
   - Frontmatter: stripped before `markdownToHtml`, kept verbatim in memory, re-prepended on
     save. The editor never parses or mutates it (Helix does manage frontmatter because it owns
     note metadata; Kex files are user files, see the Notes spec's non-invasive principle).
   - Never write to disk if the serialized markdown equals the loaded content.
   - Idempotence test corpus (headings, nested lists, task lists, tables, fenced code with
     languages, callouts, details, math, mermaid, links with titles, images with size suffix,
     highlight marks, sub/sup) asserting serialize(parse(x)) is stable after the first pass.
5. **Persistence/dirty/autosave**: reuse the semantics of the current editor stack. The rich
   editor loads via `fs_read_file`, tracks dirty (tab dot), saves with Ctrl+S (existing
   `file.save` shortcut id) and autosave per `editorAutoSave`/`editorAutoSaveDelay`, and reloads
   on external `fs:file-written` (skipping self-writes via the `source` field). The hidden
   CodeMirror currently mounted by the markdown tab goes away in rich mode; the file is read
   directly. Alternative rejected: keeping the hidden EditorPane as the buffer owner (an
   invisible editor as IO layer is the pattern this replaces).
6. **Source mode uses CodeMirror**, not Helix's plain textarea: the markdown tab gets a
   Rich | Source toggle in its header bar; Source mounts the existing `EditorPane`
   (lang-markdown, all editor settings apply). Switching modes syncs through the serialized
   markdown and never drops unsaved changes (serialize/flush before swapping). Helix parity
   with a better source editor than upstream Helix.
7. **Heavy dependencies are lazy**. Performance is the product:
   - The whole rich editor is a `React.lazy` chunk (like every non-terminal tab content).
   - `katex` and `mermaid` are dynamic imports inside their extensions, loaded only when a
     document actually contains math / a mermaid fence. Mermaid renders on idle, themed from the
     active Kex theme.
   - `lowlight` uses the common-languages bundle only.
   - Bundle deltas measured and documented in the plan's final phase (`pnpm build` before/after).
8. **Exclusions**:
   - AI menu/commands: Kex is explicitly a no-AI fork (`docs/FORK.md`); permanently excluded.
   - Secret blocks (passphrase-encrypted regions): niche, crypto surface, non-standard fences.
     Excluded; documented as a possible later port.
   - PDF embeds: depends on Helix's vault attachments dir; no equivalent in Kex. Excluded.
   - Image insert: v1 supports markdown image syntax pointing at existing paths (rendered via
     `convertFileSrc` for local files) but does not implement paste/drop-to-attachments, which
     in Helix writes into `.helixnotes/attachments/`. Deferred; pasting an image is a no-op with
     a toast in v1.
   - Task due/priority metadata menu (`# DUE:`/`# PRIORITY:` comments): Helix-specific task
     system; excluded until/unless a tasks feature lands.
   - Wiki-links: ported but off by default behind `markdownWikiLinks` (JSON-only preference),
     because bare `[[...]]` in arbitrary repo docs should not silently become links. When on,
     resolution uses the workspace markdown index (title map built lazily from `notes_list` if
     plan A landed, else a cheap `fs_glob` scan).
9. **Theme integration**: editor CSS uses Kex theme variables (`--background`, `--foreground`,
   prose styles aligned with the existing preview), not Helix's theme system. Code blocks reuse
   the highlight theme already used by Streamdown or a lowlight CSS mapped to theme tokens.
10. **Shortcuts policy compliance**: TipTap's intrinsic editing keymap (Bold Cmd+B etc.) counts
    as widget-intrinsic behavior and stays internal to the editor, like CodeMirror's own keymap.
    App-level actions (save, find-in-note open, toggle source mode, toggle outline) go through
    the `SHORTCUTS` registry (`matchesShortcut` in local handlers), reusing existing ids where
    they exist (`editor.save`, `search.focus`) and adding new ones (`markdown.toggleSource`,
    `markdown.toggleOutline`).

---

## Architecture

```
TabContent case "markdown"
  |- preference markdownEditor === "legacy" -> current structure (EditorPathBar +
  |     hidden EditorPane + MarkdownPreviewPane)   [unchanged code path]
  |- preference markdownEditor === "rich" (default):
       MarkdownTab (rich/MarkdownTab.tsx, lazy)
         |- EditorPathBar (existing, path + actions)
         |- mode state: "rich" | "source" (per tab, transient; default "rich")
         |- useMarkdownDocument(path)   <- functional-core doc lifecycle
         |    load -> { frontmatter, body, raw }
         |    save(body) -> skip-if-equal -> fs_write_file(frontmatter + body)
         |    dirty, autosave timer, external-change reload
         |- mode === "rich":   RichMarkdownEditor (TipTap)
         |    content = markdownToHtml(body); onUpdate (debounced) -> htmlToMarkdown -> dirty
         |    Toolbar / OutlinePanel / SlashCommands / find bar
         |- mode === "source": EditorPane (existing CodeMirror, lang-markdown)
```

- `useMarkdownDocument` is the single owner of the file buffer for both modes; mode switches
  serialize into it first. It mirrors `useDocument`'s contract (dirty reporting to the tab via
  the existing `onDirtyChange` plumbing used by editor tabs).
- The `Tab` union's `markdown` member stays `{ id, kind: "markdown", path, title? }` plus a
  `dirty?: boolean` field so the tab dot works (type change in `types.ts`; persisted states
  without the field parse fine since it is optional).
- Conversion functions are pure and dependency-injected where Helix reached into Svelte stores
  (`markdownToHtml(md, opts: { wikiLinks?: WikiLinkResolver })`).

---

## Error handling

- Binary / too-large file behind a `.md` extension: `fs_read_file` kind drives a fallback
  message pane (same behavior as the editor today).
- `htmlToMarkdown` producing unexpected output: the skip-if-equal check plus dirty-only saves
  mean a no-edit session never rewrites the file; the idempotence corpus guards edits.
- Mermaid/KaTeX load or render failure: render the fenced block as a plain code block with an
  inline error note, never crash the editor.
- External modification while dirty: same policy as the code editor today (external reload only
  when not dirty; if dirty, keep buffer and surface the conflict on save like current behavior).

---

## Testing

- Vitest: round-trip idempotence corpus for `htmlToMarkdown(markdownToHtml(x))`; frontmatter
  preserve/strip/re-prepend; skip-if-equal save logic in `useMarkdownDocument` (fs mocked);
  wiki-link resolver (pipe alias, heading anchor strip, shallowest-path disambiguation).
- Type/lint/clippy/cargo suites all green per AGENTS.md before claiming done.
- Manual checklist in the plan: every toolbar action, slash command, task click, table ops,
  math/mermaid render, source toggle round-trip, autosave, external edit reload, legacy
  preference fallback.

---

## Documentation updates (same commit as code)

- `docs/ARCHITECTURE.md`: markdown module restructure, new JSON-only preferences
  (`markdownEditor`, `markdownWikiLinks`), lazy chunks.
- `docs/FORK.md`: divergence entry (rich markdown editor ported from HelixNotes).
- `docs/BUILD.md`: bundle impact of the TipTap/katex/mermaid lazy chunks.
- `AGENTS.md`: module layout update.
- `CLAUDE.md` glossary: RichMarkdownEditor canonical term.
