# Rich Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only `markdown` tab content with a TipTap 3 WYSIWYG editor ported from HelixNotes (toolbar, outline, slash commands, tasks, tables, callouts, details, math, mermaid, find-in-note, optional wiki-links, Rich|Source toggle), keeping the current Streamdown preview selectable via a JSON-only preference.

**Architecture:** New `src/modules/markdown/rich/` module (React shell + one file per TipTap extension) over a functional core in `src/modules/markdown/lib/` (`frontmatter.ts`, `markdownToHtml.ts`, `htmlToMarkdown.ts`, `useMarkdownDocument.ts`). `TabContent` case `"markdown"` bifurcates on the JSON-only preference `markdownEditor: "rich" | "legacy"` (default `"rich"`); the legacy path (hidden CodeMirror + `MarkdownPreviewPane`) stays byte-identical. `useMarkdownDocument` is the single buffer owner for both Rich and Source modes; Source mounts the existing `EditorPane`, and mode switches flush to disk before swapping.

**Tech Stack:** React 19, TypeScript, @tiptap/react + @tiptap/* 3.19.x, markdown-it 14 (+mark/sub/sup), lowlight 3 (common bundle), katex 0.16 (dynamic import), mermaid 11 (dynamic import), CodeMirror 6 (existing, Source mode), vitest (+happy-dom for DOM-dependent tests).

**Spec:** `docs/superpowers/specs/2026-07-06-rich-markdown-editor-design.md`. **Reference app:** HelixNotes at `/Users/avilches/Work/Proy/Repos/HelixNotes`; the editor is `src/lib/components/Editor.svelte` (11273 lines, referenced below as `Editor.svelte:<lines>`) plus `src/lib/editor/callouts.ts`, `src/lib/editor/selectionPairs.ts` and `src/lib/editor/extensions/wrapSelectedText.ts`.

## Global Constraints

- pnpm only, never npm/npx/yarn.
- No em-dash anywhere (code, comments, commits, docs). No emojis anywhere.
- Frontend imports always `@/...`, never relative across modules.
- Comments: default none; if needed, 1-2 lines on why. No AI filler.
- Strict lazy-loading: the whole rich editor is a `React.lazy` chunk mounted from `TabContent`; `katex` and `mermaid` are `import()`-ed inside their extensions only when a document actually contains math or a mermaid fence; lowlight uses the `common` bundle only.
- Shortcuts only via the `SHORTCUTS` registry (`src/modules/shortcuts/shortcuts.ts`) and `matchesShortcut` in local handlers; never compare raw keys. TipTap's intrinsic editing keymap (Mod+B etc.) is widget-intrinsic and stays internal.
- No backward compatibility code, no migrations, no fallbacks for old keys.
- Do NOT delete `MarkdownPreviewPane.tsx`, the Streamdown dependency, or any part of the current markdown tab code path; the legacy branch must remain byte-identical.
- Entity IDs (if any new ones are needed) via `nid()` exports in `src/lib/ids.ts`; this plan needs none.
- Living docs (`docs/ARCHITECTURE.md`, `docs/FORK.md`, `docs/BUILD.md`, `AGENTS.md`, `CLAUDE.md` glossary) updated in the same commit as the code they describe.
- Commit messages in English, atomic, no Co-authored-by, no Claude mentions.
- Verification before claiming any task done: `pnpm exec biome lint ./src && pnpm check-types && pnpm test` and, when Rust is touched (it is not in this plan), `cd src-tauri && cargo clippy && cargo test --locked`. Note: run the linter directly (`pnpm exec biome lint ./src`), not through `pnpm lint`, per the RTK proxy note in the user CLAUDE.md.

## Plan-level decisions (deviations from the spec, with reasons)

1. **`htmlToMarkdown` is a DOM-walking serializer, not the regex function.** The spec names Helix's `htmlToMarkdown` (Editor.svelte:3639-3747) as the save serializer, but that regex function has zero call sites in Helix; the real save path is `editorToMarkdown -> prosemirrorToMarkdown -> serializeNode/serializeListItem/serializeInline/tableToMarkdown` (Editor.svelte:3063-3354) plus `serializeCallout` (callouts.ts:153-171). The regex version cannot round-trip callouts, math, details or tables, so the spec's own idempotence corpus would fail. The port keeps the spec's contract (`htmlToMarkdown(html: string): string`, fed from `editor.getHTML()`), but implements it as a DOMParser walk that transcribes the semantics of the real serializer, using the regex version as reference for mark syntax and entity decoding.
2. **Existing shortcut ids:** the spec says "file.save"; the real registry id is `editor.save` (shortcuts.ts:452). Find-in-note reuses `search.focus` (shortcuts.ts:391). New ids added: `markdown.toggleSource`, `markdown.toggleOutline`.
3. **markdown-it plugins:** only `markdown-it-mark`, `markdown-it-sub`, `markdown-it-sup` are wired (matching Helix's real `mdit` chain at Editor.svelte:532-537). `markdown-it-task-lists` is in Helix's package.json but unused; task lists go through the ported custom `<tiptask>` preprocessing instead. It is not added as a dependency.
4. **Mermaid diagram toolbar:** the Copy button is ported using `navigator.clipboard.write` with a `ClipboardItem` (Helix uses a custom `copyPngToClipboard` Rust command). The Save-as-file button is dropped in v1 (needs a byte-write IPC command Kex does not have). Retry and Re-render are ported as-is.
5. **Toolbar "Image" insert** opens a small inline prompt for a path/URL and inserts standard markdown image syntax (Helix copies files into vault attachments, which is excluded by the spec). Pasting an image is a no-op with a toast.
6. **Wiki-link index** uses an `fs_glob` scan for `**/*.md` under the workspace root (the spec's "plan A" `notes_list` command does not exist in the tree today).
7. **Mode-switch sync point is disk:** toggling Rich to Source (or back) serializes the active buffer and awaits `save()` before swapping, because `EditorPane`'s `useDocument` always loads from disk. This satisfies the spec invariant "never drops unsaved changes" with one owner of truth per mode and zero shared-buffer plumbing into CodeMirror.

## Source map: Editor.svelte piece by piece

| Helix source | Piece | Kex destination |
|---|---|---|
| Editor.svelte:529-537 | lowlight setup + `mdit` (markdown-it) chain | `rich/extensions/codeBlock.ts` (lowlight) / `lib/markdownToHtml.ts` (mdit) |
| Editor.svelte:552-565 | `CustomImage` (data-size attribute) | `rich/extensions/image.ts` |
| Editor.svelte:567-597 | `cellColorAttributes`, `CustomTableCell`, `CustomTableHeader` | `rich/extensions/table.ts` |
| Editor.svelte:416-471 | `renderKatex`, `observeMath`, math preview | `rich/extensions/math.ts` (made async, dynamic import) |
| Editor.svelte:781-816, 818-854 | `MathBlock`, `MathInline` nodes | `rich/extensions/math.ts` |
| Editor.svelte:856-991 | `Callout` node (NodeView with header/title/fold) | `rich/extensions/callout.ts` |
| Editor.svelte:993-1008 | `HeadingShortcuts` | `rich/extensions/headingShortcuts.ts` |
| Editor.svelte:1010-1085 | `CalloutTyping` (Enter + paste) | `rich/extensions/callout.ts` |
| Editor.svelte:1087-1109 | `CtrlEndScrollPastEnd` | `rich/extensions/ctrlEndScrollPastEnd.ts` |
| Editor.svelte:1111-1130 | `PageBreak` node | `rich/extensions/pageBreak.ts` |
| Editor.svelte:1133-1162 | `lazyDecorationPlugin` | `rich/extensions/lazyDecorationPlugin.ts` |
| Editor.svelte:1164-1425 | `MermaidRenderer` (opt-in render, svg cache, toolbar) | `rich/extensions/mermaid.ts` |
| Editor.svelte:1427-1461 | `CopyButtonExtension` (code blocks) | `rich/extensions/codeBlock.ts` |
| Editor.svelte:1463-1494, 1724-1785 | code language dropdown state + `CodeBlockLanguageSelect` | `rich/extensions/codeBlock.ts` + `rich/CodeLangDropdown.tsx` |
| Editor.svelte:1497-1519, 3363-3599 | `NoteSearchExtension` + search fns (`updateNoteSearchWysiwyg`, `applySearchDecorations`, next/prev) | `rich/extensions/noteSearch.ts` + `rich/FindBar.tsx` |
| Editor.svelte:1521-1559 | `ColorSwatch` decorations | `rich/extensions/colorSwatch.ts` |
| Editor.svelte:1601-1698 | `MoveLineShortcuts` (Alt+Up/Down, Shift for list items) | `rich/extensions/moveLineShortcuts.ts` |
| Editor.svelte:1700-1722 | `TabIndent` | `rich/extensions/tabIndent.ts` |
| Editor.svelte:231-321, 1787-2004 | slash state, `getSlashCommands`, `executeSlashCommand`, `updateSlashMenu`, `SlashCommands` | `rich/extensions/slashCommands.ts` + `rich/SlashMenu.tsx` |
| Editor.svelte:2300-2533 | `WikiLink` mark, `WikiLinkAutocomplete`, `updateWikiLinkMenu`, `insertWikiLink` | `rich/extensions/wikiLink.ts` + `rich/WikiLinkMenu.tsx` |
| Editor.svelte:3784-3818, 2535-2560 | wiki-link resolution (pipe alias, anchor strip, shallowest path) | `lib/wikiLinks.ts` |
| Editor.svelte:4107-4154 | `collapsibleKeymap` | `rich/extensions/details.ts` |
| Editor.svelte:4156-4190 | `detailsOpenAttrSync` | `rich/extensions/details.ts` |
| Editor.svelte:4845-4858 | `insertDetails` (+ `openDetailsEl`, grep `function openDetailsEl` in Editor.svelte) | `rich/extensions/details.ts` |
| Editor.svelte:4780-4843 | `insertCallout`, `openCalloutTypeMenu` | `rich/extensions/callout.ts` |
| src/lib/editor/extensions/wrapSelectedText.ts (whole file) + src/lib/editor/selectionPairs.ts (whole file) | `WrapSelectedText` + `getSelectionPair` | `rich/extensions/wrapSelectedText.ts` |
| src/lib/editor/callouts.ts:1-146 | aliases, groups, icons, `transformCalloutBlockquotes` | `lib/callouts.ts` |
| src/lib/editor/callouts.ts:148-171 | `serializeCallout` semantics | folded into `lib/htmlToMarkdown.ts` |
| Editor.svelte:3780-3960 | `markdownToHtml` + `escapeHtml` | `lib/markdownToHtml.ts` |
| Editor.svelte:3063-3354 (semantics) + 3639-3747 (reference) | serializer | `lib/htmlToMarkdown.ts` |
| Editor.svelte:4053-4349 | `createEditor` (extension list, editorProps DOM handlers, `transformPastedHTML`, onUpdate/onTransaction) | `rich/RichMarkdownEditor.tsx` |
| Editor.svelte:2621-2641 | `textColors`, `highlightColors` | `rich/Toolbar.tsx` |
| Editor.svelte:6370-6700 + 4443-4468 | desktop formatting bar (buttons, dropdowns, table picker) + `insertTable`/`setTextColor`/`setHighlightColor` | `rich/Toolbar.tsx` |
| Editor.svelte:168-195, 6065-6100 | outline state, `updateOutline`, `scrollToHeading`, panel markup | `rich/OutlinePanel.tsx` |
| Editor.svelte:7579-9500 (CSS) | `.editor-content` prose, callout, code block, mermaid, task, table, slash menu styles | `rich/richMarkdown.css` (re-themed to Kex CSS variables) |

**Excluded (per spec):** `PdfEmbed` (599-641), `SecretBlock` (642-779), `TaskMetaDim`/`TaskMetaMenu` (1564-1599, 2006-2098), AI menu, image paste-to-attachments, note title bar / tags / pin / snapshots / graph (Helix note-management chrome).

---

### Task 1: Dependencies and test environment

**Files:**
- Modify: `package.json` (via pnpm commands)

**Interfaces:**
- Consumes: nothing.
- Produces: all `@tiptap/*` 3.19.x packages, markdown-it stack, lowlight, katex, mermaid importable; `happy-dom` available for vitest.

- [ ] **Step 1: Add runtime dependencies**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm add @tiptap/core@^3.19.0 @tiptap/react@^3.19.0 @tiptap/starter-kit@^3.19.0 @tiptap/pm@^3.19.0 \
  @tiptap/extension-placeholder@^3.19.0 @tiptap/extension-task-list@^3.19.0 @tiptap/extension-task-item@^3.19.0 \
  @tiptap/extension-table@^3.19.0 @tiptap/extension-table-row@^3.19.0 @tiptap/extension-table-cell@^3.19.0 \
  @tiptap/extension-table-header@^3.19.0 @tiptap/extension-link@^3.19.0 @tiptap/extension-image@^3.19.0 \
  @tiptap/extension-highlight@^3.19.0 @tiptap/extension-typography@^3.19.0 @tiptap/extension-underline@^3.19.0 \
  @tiptap/extension-subscript@^3.19.0 @tiptap/extension-superscript@^3.19.0 @tiptap/extension-color@^3.19.0 \
  @tiptap/extension-text-style@^3.19.0 @tiptap/extension-code-block-lowlight@^3.19.0 \
  @tiptap/extension-details@^3.19.0 @tiptap/extension-text-align@^3.19.0 \
  markdown-it@^14.1.0 markdown-it-mark@^4.0.0 markdown-it-sub@^2.0.0 markdown-it-sup@^2.0.0 \
  lowlight@^3.3.0 highlight.js@^11.11.1 katex@^0.16.28 mermaid@^11.14.0
```

- [ ] **Step 2: Add dev dependencies**

```bash
pnpm add -D @types/markdown-it@^14.1.2 @types/katex@^0.16.8 happy-dom
```

- [ ] **Step 3: Verify the build still passes with the new dependency graph**

Run: `pnpm check-types && pnpm build`
Expected: both succeed; note the `dist/` output sizes printed by vite (they are the "before" baseline only in the sense that nothing new is imported yet; the real before/after measurement happens in Task 18).

- [ ] **Step 4: Verify tests still run**

Run: `pnpm test`
Expected: existing suite green.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add tiptap 3.19, markdown-it, lowlight, katex, mermaid dependencies"
```

### Task 2: Frontmatter split/join (functional core)

**Files:**
- Create: `src/modules/markdown/lib/frontmatter.ts`
- Test: `src/modules/markdown/lib/frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type FrontmatterSplit = { frontmatter: string; body: string }`
  - `function splitFrontmatter(raw: string): FrontmatterSplit` (frontmatter includes both `---` delimiter lines and the trailing newline; empty string when the file has none)
  - `function joinFrontmatter(frontmatter: string, body: string): string` (byte-exact inverse: `joinFrontmatter(f, b) === raw` for every split)

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/markdown/lib/frontmatter.test.ts
import { describe, expect, it } from "vitest";
import { joinFrontmatter, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

describe("splitFrontmatter", () => {
  it("splits a standard frontmatter block including delimiters", () => {
    const raw = "---\ntitle: Foo\ntags: [a, b]\n---\n\n# Hello\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe("---\ntitle: Foo\ntags: [a, b]\n---\n");
    expect(body).toBe("\n# Hello\n");
  });

  it("returns empty frontmatter when the file does not start with ---", () => {
    const raw = "# Hello\n---\nnot frontmatter\n---\n";
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: "", body: raw });
  });

  it("returns empty frontmatter when the block is unterminated", () => {
    const raw = "---\ntitle: Foo\nno closing";
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: "", body: raw });
  });

  it("handles CRLF files without corrupting them", () => {
    const raw = "---\r\ntitle: Foo\r\n---\r\nbody\r\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter + body).toBe(raw);
    expect(body).toBe("body\r\n");
  });

  it("round-trips byte-exact through joinFrontmatter", () => {
    for (const raw of ["---\na: 1\n---\nbody", "no fm at all", "", "---\n---\nx"]) {
      const { frontmatter, body } = splitFrontmatter(raw);
      expect(joinFrontmatter(frontmatter, body)).toBe(raw);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/modules/markdown/lib/frontmatter.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/modules/markdown/lib/frontmatter.ts
// YAML frontmatter is never parsed or mutated: the editor treats it as an
// opaque prefix, preserved byte-exact and re-prepended on save.
export type FrontmatterSplit = { frontmatter: string; body: string };

const OPEN_RE = /^---\r?\n/;
const CLOSE_RE = /^---\r?\n|^---$/m;

export function splitFrontmatter(raw: string): FrontmatterSplit {
  const open = raw.match(OPEN_RE);
  if (!open) return { frontmatter: "", body: raw };
  const rest = raw.slice(open[0].length);
  const close = rest.match(CLOSE_RE);
  if (!close || close.index === undefined) return { frontmatter: "", body: raw };
  // The close delimiter must sit at a line start; regex is multiline-anchored.
  const end = open[0].length + close.index + close[0].length;
  return { frontmatter: raw.slice(0, end), body: raw.slice(end) };
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  return frontmatter + body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/modules/markdown/lib/frontmatter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint, types, commit**

```bash
pnpm exec biome lint ./src && pnpm check-types
git add src/modules/markdown/lib/frontmatter.ts src/modules/markdown/lib/frontmatter.test.ts
git commit -m "feat(markdown): frontmatter split/join with byte-exact round-trip"
```

### Task 3: Callout helpers and markdownToHtml (functional core)

**Files:**
- Create: `src/modules/markdown/lib/callouts.ts`
- Create: `src/modules/markdown/lib/wikiLinks.ts`
- Create: `src/modules/markdown/lib/markdownToHtml.ts`
- Test: `src/modules/markdown/lib/markdownToHtml.test.ts`, `src/modules/markdown/lib/wikiLinks.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` is internal; nothing from other tasks.
- Produces:
  - `lib/callouts.ts`: `calloutGroup(type: string): string`, `calloutLabel(type: string): string`, `calloutIcon(type: string, size?: number): string`, `CALLOUT_MENU: { type: string; label: string }[]`, `transformCalloutBlockquotes(root: Element): void`
  - `lib/wikiLinks.ts`: `type WikiLinkEntry = { title: string; path: string }`, `type WikiLinkContext = { entries: WikiLinkEntry[]; root: string }`, `function resolveWikiRef(ref: string, ctx: WikiLinkContext): WikiLinkEntry | null`, `async function buildWikiLinkIndex(root: string): Promise<WikiLinkEntry[]>`
  - `lib/markdownToHtml.ts`: `type MarkdownToHtmlOptions = { wikiLinks?: WikiLinkContext; resolveImageSrc?: (src: string) => string }`, `function markdownToHtml(md: string, opts?: MarkdownToHtmlOptions): string`

- [ ] **Step 1: Port `lib/callouts.ts`**

Transcribe HelixNotes `src/lib/editor/callouts.ts` lines 1-146 verbatim (ALIASES map, `calloutGroup`, `calloutLabel`, ICONS, `calloutIcon`, `CALLOUT_MENU`, `CALLOUT_RE`, `BLOCK_SELECTOR`, `transformCalloutBlockquotes`, `convertBlockquote`). Adaptations:
- Drop `div[data-secret-block]` and `div[data-pdf-src]` from `BLOCK_SELECTOR` (excluded nodes).
- Do NOT port `serializeCallout` (153-171); its semantics move into `htmlToMarkdown` in Task 4.
- Convert tab indentation to the project style and Helix doc comments to at most the 1-2 line why-comments already present.

- [ ] **Step 2: Write the failing wiki resolver test**

```ts
// src/modules/markdown/lib/wikiLinks.test.ts
import { describe, expect, it } from "vitest";
import { resolveWikiRef, type WikiLinkContext } from "@/modules/markdown/lib/wikiLinks";

const ctx: WikiLinkContext = {
  root: "/ws",
  entries: [
    { title: "Roadmap", path: "/ws/Roadmap.md" },
    { title: "Notes", path: "/ws/team/Notes.md" },
    { title: "Notes", path: "/ws/team/deep/Notes.md" },
  ],
};

describe("resolveWikiRef", () => {
  it("resolves by exact title, case-insensitive", () => {
    expect(resolveWikiRef("roadmap", ctx)?.path).toBe("/ws/Roadmap.md");
  });
  it("strips #heading and ^block anchors before lookup", () => {
    expect(resolveWikiRef("Roadmap#Q3", ctx)?.path).toBe("/ws/Roadmap.md");
    expect(resolveWikiRef("Roadmap^abc", ctx)?.path).toBe("/ws/Roadmap.md");
  });
  it("prefers the shallowest path on ambiguous titles", () => {
    expect(resolveWikiRef("Notes", ctx)?.path).toBe("/ws/team/Notes.md");
  });
  it("resolves root-relative path refs (folder/note)", () => {
    expect(resolveWikiRef("team/deep/Notes", ctx)?.path).toBe("/ws/team/deep/Notes.md");
  });
  it("returns null for unknown refs", () => {
    expect(resolveWikiRef("Missing", ctx)).toBeNull();
  });
});
```

Run: `pnpm exec vitest run src/modules/markdown/lib/wikiLinks.test.ts` - Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/wikiLinks.ts`**

Port the resolution algorithm from Editor.svelte:3784-3818 (inside `markdownToHtml`) as a pure function, replacing `$appConfig.active_vault` with `ctx.root` and `wikiLinkTitlesCache` with `ctx.entries`:

```ts
// src/modules/markdown/lib/wikiLinks.ts
import { invoke } from "@tauri-apps/api/core";

export type WikiLinkEntry = { title: string; path: string };
export type WikiLinkContext = { entries: WikiLinkEntry[]; root: string };

export function resolveWikiRef(ref: string, ctx: WikiLinkContext): WikiLinkEntry | null {
  const titleForLookup = ref.replace(/#.*$/, "").replace(/\^.*$/, "").trim();
  if (titleForLookup.includes("/") && ctx.root) {
    const fullPath = `${ctx.root}/${titleForLookup}.md`;
    const byPath = ctx.entries.find((e) => e.path === fullPath);
    if (byPath) return byPath;
  }
  const titleOnly = titleForLookup.includes("/")
    ? titleForLookup.split("/").pop() ?? titleForLookup
    : titleForLookup;
  const titleLower = titleOnly.toLowerCase();
  const matches = ctx.entries.filter((e) => e.title.toLowerCase() === titleLower);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return matches.reduce((a, b) =>
    a.path.split("/").length <= b.path.split("/").length ? a : b,
  );
}

// Title = filename stem. Lazy, cheap: one fs_glob round-trip, built on demand
// when the wiki-link feature first needs it in a session.
export async function buildWikiLinkIndex(root: string): Promise<WikiLinkEntry[]> {
  const paths = await invoke<string[]>("fs_glob", { root, pattern: "**/*.md" });
  return paths.map((p) => {
    const norm = p.replace(/\\/g, "/");
    const stem = (norm.split("/").pop() ?? norm).replace(/\.md$/i, "");
    return { title: stem, path: norm };
  });
}
```

Before committing, check the real `fs_glob` argument names in `src-tauri/src/modules/fs/grep.rs` (or `docs/IPC.md`) and match them exactly; adjust `{ root, pattern }` if the command uses different parameter names.

Run: `pnpm exec vitest run src/modules/markdown/lib/wikiLinks.test.ts` - Expected: PASS.

- [ ] **Step 4: Write the failing markdownToHtml test (happy-dom)**

```ts
// src/modules/markdown/lib/markdownToHtml.test.ts
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { markdownToHtml } from "@/modules/markdown/lib/markdownToHtml";

describe("markdownToHtml", () => {
  it("renders headings, emphasis, mark, sub, sup", () => {
    const html = markdownToHtml("# H1\n\n**b** *i* ==m== H~2~O x^2^\n");
    expect(html).toContain("<h1>H1</h1>");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<mark>m</mark>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<sup>2</sup>");
  });

  it("converts task list syntax to TipTap taskItem markup", () => {
    const html = markdownToHtml("- [x] done\n- [ ] todo\n");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
  });

  it("converts $$ blocks and inline $ math to data-math nodes, skipping code fences", () => {
    const html = markdownToHtml("$$\nx^2\n$$\n\nInline $a+b$ here\n\n```\n$not math$\n```\n");
    expect(html).toContain('data-math-block="x%5E2"');
    expect(html).toContain('data-math-inline="a%2Bb"');
    expect(html).not.toContain('data-math-inline="not%20math"');
  });

  it("transforms Obsidian callout blockquotes into div[data-callout]", () => {
    const html = markdownToHtml("> [!warning]- Look out\n> Body line\n");
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('data-callout-folded="true"');
    expect(html).toContain('data-callout-title="Look out"');
  });

  it("parses image size suffix into data-size", () => {
    const html = markdownToHtml("![alt|size=small](img.png)\n");
    expect(html).toContain('data-size="small"');
    expect(html).toContain('alt="alt"');
  });

  it("does not touch wiki links unless enabled", () => {
    expect(markdownToHtml("[[Note]]\n")).not.toContain("data-wiki-link");
    const html = markdownToHtml("[[Note]]\n", {
      wikiLinks: { root: "/ws", entries: [{ title: "Note", path: "/ws/Note.md" }] },
    });
    expect(html).toContain('data-wiki-link');
    expect(html).toContain('data-path="/ws/Note.md"');
  });

  it("honors the pipe alias in wiki links", () => {
    const html = markdownToHtml("[[Note|Shown text]]\n", {
      wikiLinks: { root: "/ws", entries: [{ title: "Note", path: "/ws/Note.md" }] },
    });
    expect(html).toContain(">Shown text</span>");
    expect(html).toContain('data-title="Note"');
  });

  it("preserves empty paragraphs via the <!-- --> sentinel", () => {
    const html = markdownToHtml("a\n\n<!-- -->\n\nb\n");
    expect(html).toContain("<p></p>");
  });
});
```

Run: `pnpm exec vitest run src/modules/markdown/lib/markdownToHtml.test.ts` - Expected: FAIL (module not found).

- [ ] **Step 5: Implement `lib/markdownToHtml.ts`**

Port Editor.svelte:3780-3960 as a pure function. File structure:

```ts
// src/modules/markdown/lib/markdownToHtml.ts
import MarkdownIt from "markdown-it";
import markdownItMark from "markdown-it-mark";
import markdownItSub from "markdown-it-sub";
import markdownItSup from "markdown-it-sup";
import { transformCalloutBlockquotes } from "@/modules/markdown/lib/callouts";
import { resolveWikiRef, type WikiLinkContext } from "@/modules/markdown/lib/wikiLinks";

export type MarkdownToHtmlOptions = {
  wikiLinks?: WikiLinkContext;
  resolveImageSrc?: (src: string) => string;
};

// Module-level singleton, mirrors Editor.svelte:532-537 exactly.
const mdit = MarkdownIt({ html: true, linkify: false, breaks: false })
  .use(markdownItMark)
  .use(markdownItSup)
  .use(markdownItSub);
mdit.disable("code");

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToHtml(md: string, opts: MarkdownToHtmlOptions = {}): string {
  let src = md;
  // 1) wiki-links pre-pass       (port of 3784-3818, gated on opts.wikiLinks)
  // 2) link/image URL normalization pre-passes (port of 3820-3847 verbatim)
  // 3) math pre-pass             (port of 3862-3896 verbatim)
  // 4) task list pre-pass        (port of 3898-3903 verbatim)
  // 5) empty-para + image-gap sentinels (port of 3905-3913 verbatim)
  // 6) html = mdit.render(src)   (3916)
  // 7) post-passes: img-gap, code-block newlines, empty-para, taskItem, image size/src (3918-3945)
  // 8) callout transform         (3947-3953, uses document.createElement: DOM required)
  return html;
}
```

Port each numbered block by transcribing the cited lines. Adaptations, all mandatory:
- Delete `stripTitleH1` (3781) and `secretFencesToHtml` (3782): Kex never strips titles and secrets are excluded.
- Delete the PDF embed pre-pass (3849-3860).
- Wiki-links block: replace the `$appConfig?.enable_wiki_links` guard with `if (opts.wikiLinks)`, and the whole `wikiLinkTitlesCache` lookup (3794-3814) with `const match = resolveWikiRef(noteRef, opts.wikiLinks)`. Keep pipe-alias and display handling identical.
- Image post-pass (3936-3945): replace `resolveImageSrc(imgSrc)` with `(opts.resolveImageSrc ?? ((s) => s))(imgSrc)`.
- Delete the `/home/` multiple-slash fixup (3821): it is a Helix-vault artifact.
- Keep the math regexes, the `<tiptask>` regexes and the sentinel regexes character-for-character; they are load-bearing.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run src/modules/markdown/lib`
Expected: PASS (frontmatter + wikiLinks + markdownToHtml suites).

- [ ] **Step 7: Lint, types, commit**

```bash
pnpm exec biome lint ./src && pnpm check-types
git add src/modules/markdown/lib
git commit -m "feat(markdown): port callout helpers, wiki-link resolver and markdownToHtml as pure modules"
```

### Task 4: htmlToMarkdown serializer and round-trip corpus (functional core)

**Files:**
- Create: `src/modules/markdown/lib/htmlToMarkdown.ts`
- Test: `src/modules/markdown/lib/roundTrip.test.ts`

**Interfaces:**
- Consumes: `markdownToHtml` (Task 3) in tests only.
- Produces: `function htmlToMarkdown(html: string): string`. Input is TipTap `editor.getHTML()` output or `markdownToHtml` output (both use the same data-attribute vocabulary). Output ends with exactly one trailing newline.

- [ ] **Step 1: Write the failing round-trip corpus test**

The corpus asserts the spec invariant: `serialize(parse(x))` is stable after the first pass. `md1 = htmlToMarkdown(markdownToHtml(x))` may normalize `x`; `md2 = htmlToMarkdown(markdownToHtml(md1))` must equal `md1`.

```ts
// src/modules/markdown/lib/roundTrip.test.ts
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/modules/markdown/lib/htmlToMarkdown";
import { markdownToHtml } from "@/modules/markdown/lib/markdownToHtml";

const CORPUS: Record<string, string> = {
  headings: "# H1\n\n## H2\n\n###### H6\n",
  paragraphsAndMarks:
    "Plain **bold** *italic* ~~strike~~ `code` <u>under</u> ==mark== H~2~O x^2^\n",
  markColor: '<mark data-color="rgba(250, 230, 100, 0.25)">colored</mark>\n',
  nestedLists: "- a\n- b\n    - b1\n    - b2\n        1. deep\n- c\n",
  orderedStart: "3. three\n4. four\n",
  taskLists: "- [x] done\n- [ ] open\n    - [ ] nested\n",
  table: "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n",
  fencedCode: '```ts\nconst x: number = 1;\nif (x < 2) console.log("a & b");\n```\n',
  fencedCodeNoLang: "```\nplain\n```\n",
  callout: "> [!warning]+ Watch out\n> First line\n> \n> Second paragraph\n",
  calloutBare: "> [!note]\n> Body\n",
  blockquote: "> quoted line\n> second line\n",
  details:
    '<details class="editor-details" open><summary>Title</summary><div data-type="detailsContent"><p>Body</p></div></details>\n',
  mathBlock: "$$\nE = mc^2\n$$\n",
  mathInline: "Inline $a_i + b^2$ math\n",
  mermaid: "```mermaid\ngraph TD\n  A-->B\n```\n",
  links: "[text](https://example.com/a%20b) and <https://example.com>\n",
  linkWithTitle: '[text](https://example.com "My title")\n',
  imageWithSize: "![diagram|size=medium](assets/d.png)\n",
  horizontalRule: "before\n\n---\n\nafter\n",
  pageBreak: '<div style="page-break-after: always;"></div>\n',
  emptyParagraphs: "a\n\n<!-- -->\n\nb\n",
  hardBreak: "line one  \nline two\n",
  frontmatterFree: "no frontmatter here, just text\n",
};

describe("round-trip idempotence", () => {
  for (const [name, md] of Object.entries(CORPUS)) {
    it(`is stable after first normalization: ${name}`, () => {
      const md1 = htmlToMarkdown(markdownToHtml(md));
      const md2 = htmlToMarkdown(markdownToHtml(md1));
      expect(md2).toBe(md1);
    });
  }

  it("preserves task checked state through the trip", () => {
    const md1 = htmlToMarkdown(markdownToHtml("- [x] done\n- [ ] open\n"));
    expect(md1).toContain("- [x] done");
    expect(md1).toContain("- [ ] open");
  });

  it("keeps callout syntax portable", () => {
    const md1 = htmlToMarkdown(markdownToHtml("> [!tip]- Folded\n> Body\n"));
    expect(md1).toContain("> [!tip]- Folded");
    expect(md1).toContain("> Body");
  });

  it("keeps code fences with language intact", () => {
    const md1 = htmlToMarkdown(markdownToHtml("```rust\nfn main() {}\n```\n"));
    expect(md1).toBe("```rust\nfn main() {}\n```\n");
  });
});
```

Run: `pnpm exec vitest run src/modules/markdown/lib/roundTrip.test.ts` - Expected: FAIL (module not found).

- [ ] **Step 2: Implement `lib/htmlToMarkdown.ts`**

DOM-walking port of Helix's real serializer (see plan decision 1). Parse with `new DOMParser().parseFromString(html, "text/html")` and walk `doc.body` children. File structure with the non-trivial parts spelled out:

```ts
// src/modules/markdown/lib/htmlToMarkdown.ts
// DOM-walking serializer transcribing Helix's save path semantics
// (Editor.svelte:3081-3354 serializeNode/serializeListItem/serializeInline/
// tableToMarkdown, callouts.ts:153-171 serializeCallout). Operates on the
// HTML vocabulary produced by markdownToHtml and by TipTap's getHTML().

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries: { text: string; isImage: boolean }[] = [];
  for (const el of Array.from(doc.body.children)) {
    if (el.tagName === "P" && el.childNodes.length === 0) {
      entries.push({ text: "<!-- -->", isImage: false });      // 3084-3090
      continue;
    }
    entries.push({ text: serializeBlock(el), isImage: isImageOnlyParagraph(el) });
  }
  while (entries.length > 0 && entries[entries.length - 1].text === "<!-- -->") entries.pop();
  let result = "";
  for (let i = 0; i < entries.length; i++) {                    // 3097-3105
    if (i === 0) result = entries[i].text;
    else result += (entries[i].isImage ? "" : "\n") + entries[i].text;
  }
  return result.replace(/\n{3,}/g, "\n\n").trim() + "\n";       // 3106
}
```

`serializeBlock(el: Element): string` transcribes the `serializeNode` switch (3164-3271) keyed on tag/data attributes instead of PM node names:

| DOM shape | Output (source lines) |
|---|---|
| `p` (with `style="text-align: X"` other than left) | inline text, or `<p style="text-align: X">...</p>` (3166-3171) |
| `h1..h6` (+ text-align) | `#`.repeat(level) + inline (3173-3178) |
| `pre > code` | fence with language from `data-language` attr or `class="language-X"`, inner `textContent` with trailing newlines stripped (3180-3184) |
| `blockquote` | each child block prefixed `> `, blocks joined with `\n>\n` (3185-3192) |
| `div[data-callout]` | serializeCallout port: header `> [!type]{+|-}{ title}` from `data-callout`, `data-callout-foldable`, `data-callout-folded`, `data-callout-title`; body = child blocks of the content area serialized recursively then each line prefixed `> ` (callouts.ts:153-171). TipTap getHTML() renders the callout children directly inside the div; markdownToHtml output does too, so recurse over element children skipping any `.callout-header` element |
| `ul[data-type="taskList"]` | per `li[data-type="taskItem"]`: `- [x] ` / `- [ ] ` from `data-checked` + list-item body (3206-3213). TipTap wraps item content as `<label><input...></label><div><p>...` so the item body is the `div`'s children when present, else the li children minus the label |
| `ul` | `- ` + list-item body per li (3195-3199) |
| `ol` | `${start + i}. ` with `start` attr default 1 (3200-3205) |
| `hr` | `---` (3217-3218) |
| `div[data-page-break]` or `div[style*="page-break-after"]` | `<div style="page-break-after: always;"></div>` (3219-3220) |
| `table` | if any cell has `data-bg-color`/`colspan>1`/`rowspan>1`: emit `el.outerHTML` raw (3222-3237); else pipe table via `tableToMarkdown` port (3109-3135): header row detection by `th`, cell text = inline-serialized cell paragraphs joined with space, `|` escaped, newlines collapsed |
| `div[data-math-block]` | `$$\n{decodeURIComponent(attr)}\n$$` (3249-3252) |
| `details` | `el.outerHTML` raw (3253-3259), minus any TipTap toggle `<button>` children (strip them from a clone before serializing) |
| `img` / image-only `p` | `![alt{|size=X}](src)` with `data-size` suffix when not "full" (3260-3267) |
| anything else | `el.textContent ?? ""` (3268-3269) |

`serializeListItem(li: Element): string` transcribes 3273-3289: paragraphs inline-serialized, nested `ul/ol/ul[taskList]` serialized recursively and indented 4 spaces, parts joined with `\n`, single trailing `\n`.

`serializeInline(el: Element): string` transcribes 3291-3354 as a recursive walk over child nodes. For each text-bearing element wrap the recursively serialized inner text:

```ts
function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  const inner = () => Array.from(node.childNodes).map(serializeInline).join("");
  switch (node.tagName) {
    case "STRONG": case "B": return `**${inner()}**`;
    case "EM": case "I": return `*${inner()}*`;
    case "S": case "DEL": return `~~${inner()}~~`;
    case "CODE": return `\`${inner()}\``;
    case "U": return `<u>${inner()}</u>`;
    case "SUB": return `~${inner()}~`;
    case "SUP": return `^${inner()}^`;
    case "MARK": {
      const color = node.getAttribute("data-color");
      return color ? `<mark data-color="${color}">${inner()}</mark>` : `==${inner()}==`;
    }
    case "SPAN": {
      if (node.hasAttribute("data-math-inline"))
        return `$${decodeURIComponent(node.getAttribute("data-math-inline") ?? "")}$`;
      if (node.hasAttribute("data-wiki-link")) {
        const title = node.getAttribute("data-title") || inner();
        const text = inner();
        return title !== text ? `[[${title}|${text}]]` : `[[${title}]]`;
      }
      const color = node.style?.color;
      return color ? `<span style="color: ${color}">${inner()}</span>` : inner();
    }
    case "A": return `[${inner()}](${decodeURIComponent(node.getAttribute("href") ?? "")})`;
    case "IMG": return serializeImage(node);
    case "BR": return "  \n";
    default: return inner();
  }
}
```

Plus the leading tab/em-space preservation from 3297-3302 applied to the first text node of a block (`text.replace(/^[\t ]+/, (ws) => "&emsp;".repeat(ws.length))`).

Iterate against the corpus test until green; when a corpus case disagrees, the fix goes here (the parser side from Task 3 is already locked by its own tests).

- [ ] **Step 3: Run the full round-trip suite**

Run: `pnpm exec vitest run src/modules/markdown/lib`
Expected: PASS, all corpus cases stable.

- [ ] **Step 4: Lint, types, commit**

```bash
pnpm exec biome lint ./src && pnpm check-types
git add src/modules/markdown/lib/htmlToMarkdown.ts src/modules/markdown/lib/roundTrip.test.ts
git commit -m "feat(markdown): DOM-walking htmlToMarkdown serializer with round-trip idempotence corpus"
```

### Task 5: Document buffer, useMarkdownDocument hook, Tab.dirty field

**Files:**
- Create: `src/modules/markdown/lib/documentBuffer.ts`
- Create: `src/modules/markdown/lib/useMarkdownDocument.ts`
- Modify: `src/modules/workspaces/lib/types.ts:26` (markdown Tab member)
- Test: `src/modules/markdown/lib/documentBuffer.test.ts`

**Interfaces:**
- Consumes: `splitFrontmatter`, `joinFrontmatter` (Task 2).
- Produces:

```ts
// documentBuffer.ts
export class MarkdownDocumentBuffer {
  constructor(raw: string);                 // splits frontmatter internally
  readonly frontmatter: string;
  getBody(): string;
  setBody(next: string): void;
  isDirty(): boolean;
  contentToSave(): string | null;           // full file text, or null when it equals the loaded content (skip-if-equal)
  markSaved(): void;
  replaceFromDisk(raw: string): boolean;    // adopt external content; false when raw equals current saved text (self-write echo)
}

// useMarkdownDocument.ts
export type MarkdownDocState =
  | { status: "loading" }
  | { status: "ready"; body: string; revision: number }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };
export function useMarkdownDocument(opts: {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
}): {
  doc: MarkdownDocState;
  dirty: boolean;
  onChange: (body: string) => void;   // updates buffer, schedules autosave
  save: () => Promise<void>;          // flush; no-op when clean
  reload: () => boolean;              // external re-read; false (skipped) while dirty
};
```

`revision` increments every time the body is replaced from disk, so the TipTap editor knows when to `setContent` (user edits never bump it).

- [ ] **Step 1: Write the failing buffer test**

```ts
// src/modules/markdown/lib/documentBuffer.test.ts
import { describe, expect, it } from "vitest";
import { MarkdownDocumentBuffer } from "@/modules/markdown/lib/documentBuffer";

describe("MarkdownDocumentBuffer", () => {
  const raw = "---\ntitle: T\n---\n# Body\n";

  it("splits frontmatter and exposes only the body", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    expect(buf.frontmatter).toBe("---\ntitle: T\n---\n");
    expect(buf.getBody()).toBe("# Body\n");
    expect(buf.isDirty()).toBe(false);
  });

  it("skip-if-equal: no save content when the body did not change", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    buf.setBody("# Body\n");
    expect(buf.isDirty()).toBe(false);
    expect(buf.contentToSave()).toBeNull();
  });

  it("re-prepends frontmatter verbatim on save", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    buf.setBody("# Edited\n");
    expect(buf.isDirty()).toBe(true);
    expect(buf.contentToSave()).toBe("---\ntitle: T\n---\n# Edited\n");
    buf.markSaved();
    expect(buf.isDirty()).toBe(false);
    expect(buf.contentToSave()).toBeNull();
  });

  it("replaceFromDisk returns false for self-write echoes", () => {
    const buf = new MarkdownDocumentBuffer(raw);
    expect(buf.replaceFromDisk(raw)).toBe(false);
    expect(buf.replaceFromDisk("---\ntitle: T\n---\n# New\n")).toBe(true);
    expect(buf.getBody()).toBe("# New\n");
    expect(buf.isDirty()).toBe(false);
  });
});
```

Run: `pnpm exec vitest run src/modules/markdown/lib/documentBuffer.test.ts` - Expected: FAIL.

- [ ] **Step 2: Implement `documentBuffer.ts`**

```ts
// src/modules/markdown/lib/documentBuffer.ts
import { joinFrontmatter, splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

export class MarkdownDocumentBuffer {
  readonly frontmatter: string;
  private savedBody: string;
  private body: string;
  private savedRaw: string;

  constructor(raw: string) {
    const { frontmatter, body } = splitFrontmatter(raw);
    this.frontmatter = frontmatter;
    this.savedBody = body;
    this.body = body;
    this.savedRaw = raw;
  }

  getBody(): string { return this.body; }
  setBody(next: string): void { this.body = next; }
  isDirty(): boolean { return this.body !== this.savedBody; }

  contentToSave(): string | null {
    if (!this.isDirty()) return null;
    return joinFrontmatter(this.frontmatter, this.body);
  }

  markSaved(): void {
    this.savedBody = this.body;
    this.savedRaw = joinFrontmatter(this.frontmatter, this.body);
  }

  replaceFromDisk(raw: string): boolean {
    if (raw === this.savedRaw) return false;
    const { body } = splitFrontmatter(raw);
    (this as { frontmatter: string }).frontmatter = splitFrontmatter(raw).frontmatter;
    this.savedRaw = raw;
    this.savedBody = body;
    this.body = body;
    return true;
  }
}
```

(Replace the cast hack with a plain mutable private field plus a getter if biome complains; the public surface stays the same.)

Run: `pnpm exec vitest run src/modules/markdown/lib/documentBuffer.test.ts` - Expected: PASS.

- [ ] **Step 3: Implement `useMarkdownDocument.ts`**

Model it on `src/modules/editor/lib/useDocument.ts` (read it first; same `ReadResult`, same autosave pattern, same unmount flush at its lines 168-177). Differences:
- The buffer is a `MarkdownDocumentBuffer` in a ref, created when `fs_read_file` returns `kind: "text"`.
- `save()` uses `buf.contentToSave()`; when null it returns without IPC. On success `invoke("fs_write_file", { path, content, workspace: currentWorkspaceEnv(), source: "editor" })` then `buf.markSaved()` (the `source: "editor"` field is what makes `fs:file-written` self-write skipping work, see `useEditorFileSync.ts:26`).
- Autosave: read `editorAutoSave` / `editorAutoSaveDelay` from `usePreferencesStore` exactly like useDocument lines 28-29 and 145-166.
- External reload: the hook installs its own listener (markdown tabs are not covered by `useEditorFileSync`, which filters `kind === "editor"`):

```ts
useEffect(() => {
  const unlistenPromise = getCurrentWebviewWindow().listen<{ path: string; source?: string }>(
    "fs:file-written",
    (event) => {
      if (event.payload.source === "editor") return;
      if (event.payload.path.replace(/\\/g, "/") !== path.replace(/\\/g, "/")) return;
      reloadRef.current();
    },
  );
  return () => { void unlistenPromise.then((un) => un()); };
}, [path]);
```

- `reload()` returns `false` while dirty (never clobber unsaved edits; the conflict surfaces on the next explicit save, same policy as the code editor today). When clean, re-invoke `fs_read_file`; if `buf.replaceFromDisk(raw)` returns true, bump `revision` and set `doc` to the new ready state.
- Loading, binary, toolarge and error states mirror `useDocument` lines 77-110.

- [ ] **Step 4: Add the dirty field to the Tab union**

In `src/modules/workspaces/lib/types.ts` line 26 change:

```ts
  | (TabCommon & { kind: "markdown"; path: string })
```

to:

```ts
  | (TabCommon & { kind: "markdown"; path: string; dirty?: boolean })
```

- [ ] **Step 5: Verify**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green (the optional field breaks nothing).

- [ ] **Step 6: Commit**

```bash
git add src/modules/markdown/lib/documentBuffer.ts src/modules/markdown/lib/documentBuffer.test.ts \
  src/modules/markdown/lib/useMarkdownDocument.ts src/modules/workspaces/lib/types.ts
git commit -m "feat(markdown): document buffer with frontmatter preservation and useMarkdownDocument hook"
```

### Task 6: Extension utilities and keyboard extensions

**Files:**
- Create: `src/modules/markdown/rich/lib/menuStore.ts`
- Create: `src/modules/markdown/rich/extensions/lazyDecorationPlugin.ts`
- Create: `src/modules/markdown/rich/extensions/pageBreak.ts`
- Create: `src/modules/markdown/rich/extensions/headingShortcuts.ts`
- Create: `src/modules/markdown/rich/extensions/ctrlEndScrollPastEnd.ts`
- Create: `src/modules/markdown/rich/extensions/tabIndent.ts`
- Create: `src/modules/markdown/rich/extensions/moveLineShortcuts.ts`
- Create: `src/modules/markdown/rich/extensions/wrapSelectedText.ts`
- Create: `src/modules/markdown/rich/extensions/image.ts`
- Create: `src/modules/markdown/rich/extensions/table.ts`
- Test: `src/modules/markdown/rich/lib/menuStore.test.ts`

**Interfaces:**
- Consumes: `@tiptap/core`, `@tiptap/pm/state`, `@tiptap/pm/view`.
- Produces:
  - `menuStore.ts`: `type MenuStore<T> = { get(): T; set(next: T): void; subscribe(listener: () => void): () => void }`, `function createMenuStore<T>(initial: T): MenuStore<T>`, `function useMenuStore<T>(store: MenuStore<T>): T` (a `useSyncExternalStore` wrapper; complies with the project rule on external mutable state).
  - `lazyDecorationPlugin.ts`: `function lazyDecorationPlugin(key: PluginKey, build: (doc: PMNode) => DecorationSet): Plugin` (port of Editor.svelte:1133-1162 verbatim: remap while typing, full rebuild 300ms after settle).
  - `pageBreak.ts`: `const PageBreak: Node` (1111-1130 verbatim).
  - `headingShortcuts.ts`: `const HeadingShortcuts: Extension` (993-1008 verbatim; Mod-1..6 toggle heading, Mod-0 paragraph. These are widget-intrinsic editing keys, allowed outside the SHORTCUTS registry).
  - `ctrlEndScrollPastEnd.ts`: `const CtrlEndScrollPastEnd: Extension` (1087-1109; adaptation: `scrollEditorBodyToBottom` looks up `closest(".rich-md-body")` instead of Helix's `.editor-body`, and lives in this file).
  - `tabIndent.ts`: `const TabIndent: Extension` (1700-1722 verbatim, priority 50).
  - `moveLineShortcuts.ts`: `const MoveLineShortcuts: Extension` (1601-1698 verbatim: Alt+Arrow moves top-level block, Alt+Shift+Arrow moves list/task items).
  - `wrapSelectedText.ts`: `const WrapSelectedText: Extension` plus inlined `getSelectionPair` (HelixNotes `src/lib/editor/extensions/wrapSelectedText.ts` + `src/lib/editor/selectionPairs.ts`, both whole-file, merged into one module).
  - `image.ts`: `const RichImage: Node` = `Image.extend` with the `size` attribute (552-565 verbatim, renamed from CustomImage).
  - `table.ts`: `const RichTableCell: Node`, `const RichTableHeader: Node` = TableCell/TableHeader extended with `cellColorAttributes()` (567-597 verbatim).

- [ ] **Step 1: Write the failing menuStore test**

```ts
// src/modules/markdown/rich/lib/menuStore.test.ts
import { describe, expect, it, vi } from "vitest";
import { createMenuStore } from "@/modules/markdown/rich/lib/menuStore";

describe("createMenuStore", () => {
  it("reads, writes and notifies subscribers", () => {
    const store = createMenuStore<number>(0);
    const cb = vi.fn();
    const unsub = store.subscribe(cb);
    store.set(1);
    expect(store.get()).toBe(1);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    store.set(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not notify when setting the identical value", () => {
    const store = createMenuStore<string | null>(null);
    const cb = vi.fn();
    store.subscribe(cb);
    store.set(null);
    expect(cb).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm exec vitest run src/modules/markdown/rich/lib/menuStore.test.ts` - Expected: FAIL.

- [ ] **Step 2: Implement `menuStore.ts`**

```ts
// src/modules/markdown/rich/lib/menuStore.ts
import { useSyncExternalStore } from "react";

export type MenuStore<T> = {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
};

export function createMenuStore<T>(initial: T): MenuStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useMenuStore<T>(store: MenuStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
```

Run the test again - Expected: PASS.

- [ ] **Step 3: Port the seven extension files**

Transcribe each from the cited Helix lines (see Interfaces above for file-by-file line ranges and adaptations). Global adaptations for every ported extension in this plan:
- `import { Extension, Node, Mark, mergeAttributes } from "@tiptap/core"` and `@tiptap/pm/state` / `@tiptap/pm/view` imports replace Helix's aliased `TiptapNode`/`TiptapMark`.
- No Svelte constructs: `$state`/`$derived`/`tick()` never appear; state that the React shell must see goes through a `MenuStore` parameter; DOM-imperative NodeView code stays DOM-imperative.
- No `isMobile`/`isAndroid` branches: desktop-only, drop the mobile arms.
- Project style: `@/...` imports, no comments unless load-bearing.

- [ ] **Step 4: Verify**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/rich
git commit -m "feat(markdown): port keyboard/utility tiptap extensions and menu store"
```

### Task 7: Code block stack (lowlight, language select, copy button)

**Files:**
- Create: `src/modules/markdown/rich/extensions/codeBlock.ts`
- Create: `src/modules/markdown/rich/CodeLangDropdown.tsx`

**Interfaces:**
- Consumes: `lazyDecorationPlugin` (Task 6), `MenuStore`/`createMenuStore`/`useMenuStore` (Task 6).
- Produces:

```ts
// codeBlock.ts
export function getLowlight(): ReturnType<typeof createLowlight>;   // singleton: createLowlight(common), no extra registrations
export function getCodeLanguages(): string[];                        // [...lowlight.listLanguages(), "mermaid"].sort()
export type CodeLangDropdownState = { pos: number; x: number; y: number; current: string } | null;
export function createCodeBlockLanguageSelect(store: MenuStore<CodeLangDropdownState>): Extension;
export const CopyButtonExtension: Extension;

// CodeLangDropdown.tsx
export function CodeLangDropdown(props: {
  store: MenuStore<CodeLangDropdownState>;
  onSelect: (lang: string) => void;   // caller runs editor.chain().updateAttributes("codeBlock", { language: lang || null })
}): JSX.Element | null;
```

- [ ] **Step 1: Implement `codeBlock.ts`**

- `getLowlight`/`getCodeLanguages`: port Editor.svelte:529-531 minus the powershell registration (`common` covers the mainstream set; extra grammars would grow the chunk for no Kex-specific need).
- `CopyButtonExtension`: port 1427-1461 verbatim (COPY_ICON/CHECK_ICON constants included) on top of `lazyDecorationPlugin`.
- `createCodeBlockLanguageSelect(store)`: port 1724-1785. The `addGlobalAttributes` block (language -> `data-language`) is verbatim; in the click plugin, replace `openCodeLangDropdown(cbPos + 1, lang, triggerEl)` (1777) with `store.set({ pos: cbPos + 1, x: rect.right - 100, y: rect.top + 30, current: cbNode.attrs.language || "" })`; the virtual-trigger DOMRect trick (1769-1776) becomes unnecessary because the store carries coordinates.

- [ ] **Step 2: Implement `CodeLangDropdown.tsx`**

React port of the Svelte dropdown (state at 1463-1494): reads `useMenuStore(store)`; when non-null renders a fixed-position panel at `(x, y)` with a search input (autofocused) filtering `getCodeLanguages()` (case-insensitive `includes`), Enter/click selects (`onSelect(lang)` then `store.set(null)`), Escape or outside mousedown closes. Styling: `bg-popover border border-border rounded-md shadow-md text-[12px]`, list `max-h-64 overflow-auto thin-scrollbar`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich
git commit -m "feat(markdown): code block lowlight stack with language selector and copy button"
```

### Task 8: Callouts and collapsible details extensions

**Files:**
- Create: `src/modules/markdown/rich/extensions/callout.ts`
- Create: `src/modules/markdown/rich/extensions/details.ts`

**Interfaces:**
- Consumes: `calloutGroup`, `calloutIcon`, `calloutLabel`, `CALLOUT_MENU` from `@/modules/markdown/lib/callouts` (Task 3).
- Produces:

```ts
// callout.ts
export const Callout: Node;
export const CalloutTyping: Extension;
export function insertCallout(editor: Editor, type?: string): void;
export function openCalloutTypeMenu(anchor: HTMLElement, onPick: (type: string) => void): void;

// details.ts
export const CollapsibleKeymap: Extension;
export const DetailsOpenAttrSync: Extension;
export function insertDetails(editor: Editor): void;
```

- [ ] **Step 1: Implement `callout.ts`**

- `Callout` node: port Editor.svelte:856-991 verbatim (attributes, parseHTML, renderHTML, full NodeView with header/icon/title-input/fold-button, `updateAttr`, `ignoreMutation`, `stopEvent`). The NodeView calls `openCalloutTypeMenu(iconBtn, (t) => updateAttr({ type: t }))` exactly as Helix does; no injection needed since the menu is DOM-imperative.
- `openCalloutTypeMenu`: port 4785-4843 verbatim (imperative floating menu with `CALLOUT_MENU` entries + the "Custom..." free-type input). Adaptation: the icon color inline style `rgb(var(--callout-${type}))` requires the `--callout-*` CSS variables defined in Task 14's stylesheet; keep the same variable names.
- `CalloutTyping`: port 1010-1085 verbatim (Enter on a `> [!type]...` paragraph converts it; paste handler builds the callout from pasted callout markdown).
- `insertCallout`: port 4780-4783 as `insertCallout(editor, type = "note")`.

- [ ] **Step 2: Implement `details.ts`**

- `CollapsibleKeymap`: port 4107-4154 verbatim (Tab/Enter inside a detailsSummary opens the section and moves the cursor into the content in one transaction).
- `DetailsOpenAttrSync`: port 4156-4190 verbatim (click on the details toggle button syncs `attrs.open`, fixing the pos-0 upstream bug).
- `insertDetails`: port 4845-4858. It calls `openDetailsEl(el)`; find that helper via `grep -n "function openDetailsEl" Editor.svelte`, port it into this file (it adds the `is-open` class and sets the button's aria state).

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich/extensions/callout.ts src/modules/markdown/rich/extensions/details.ts
git commit -m "feat(markdown): callout node with typing conversion and collapsible details keymaps"
```

### Task 9: Math nodes with lazy KaTeX

**Files:**
- Create: `src/modules/markdown/rich/extensions/math.ts`
- Create: `src/modules/markdown/rich/MathModal.tsx`

**Interfaces:**
- Consumes: `MenuStore` (Task 6).
- Produces:

```ts
// math.ts
export type MathEditRequest = { pos: number; kind: "block" | "inline"; tex: string } | null;
export function createMathBlock(onEdit: MenuStore<MathEditRequest>): Node;
export function createMathInline(onEdit: MenuStore<MathEditRequest>): Node;
export function renderKatexInto(el: HTMLElement, tex: string, displayMode: boolean): void;

// MathModal.tsx
export function MathModal(props: {
  request: MenuStore<MathEditRequest>;      // null = closed; editPos < 0 means insert-new
  onCommit: (req: { pos: number; kind: "block" | "inline"; tex: string }) => void;
}): JSX.Element | null;
```

- [ ] **Step 1: Implement the lazy KaTeX loader and `renderKatexInto`**

Adaptation of Editor.svelte:416-431 (`renderKatex`) made async so katex never enters the rich chunk:

```ts
let katexPromise: Promise<typeof import("katex") | null> | null = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([
      import("katex"),
      import("katex/dist/katex.min.css"),
    ]).then(([m]) => m.default ?? m).catch((e) => {
      console.error("[katex] load failed", e);
      return null;
    });
  }
  return katexPromise;
}

export function renderKatexInto(el: HTMLElement, tex: string, displayMode: boolean): void {
  el.textContent = tex;                 // visible immediately, replaced when katex lands
  void loadKatex().then((katex) => {
    if (!katex || !el.isConnected) return;
    try {
      el.innerHTML = katex.renderToString(tex, { displayMode, throwOnError: true });
    } catch (e) {
      // Spec error policy: degrade to a code-styled block with an inline note, never crash.
      el.innerHTML = "";
      const code = document.createElement("code");
      code.className = "math-error";
      code.textContent = tex;
      const note = document.createElement("span");
      note.className = "math-error-note";
      note.textContent = ` KaTeX error: ${e instanceof Error ? e.message : String(e)}`;
      el.append(code, note);
    }
  });
}
```

- [ ] **Step 2: Implement `createMathBlock` / `createMathInline`**

Port Editor.svelte:781-816 and 818-854. Adaptations:
- `renderHTML` returns only the data-attributed shell (`['div', { 'data-math-block': encodeURIComponent(tex), class: 'math-block' }]`, no innerHTML trick): rendering happens exclusively in the NodeView via `renderKatexInto(dom, node.attrs.tex, true)`. This keeps `editor.getHTML()` output clean for `htmlToMarkdown` (which reads only the data attribute).
- Drop the `isLargeDoc`/`observeMath` IntersectionObserver split (806, 844): `renderKatexInto` is already deferred behind the dynamic import; keep NodeView `destroy` empty.
- The `dblclick` handler sets `onEdit.set({ pos, kind, tex: node.attrs.tex })` instead of calling `openMathEdit`.

- [ ] **Step 3: Implement `MathModal.tsx`**

React port of the math modal state (Editor.svelte:316-358): a small centered dialog with a textarea for TeX, a live preview div (call `renderKatexInto(previewEl, tex, kind === "block")` debounced 200ms), Enter/Cmd+Enter commits, Escape cancels. `onCommit` receives the request; the caller (RichMarkdownEditor, Task 14) performs the insert (`editor.chain().focus().insertContent({ type: kind === "block" ? "mathBlock" : "mathInline", attrs: { tex } })`) or the in-place update (`editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { tex }))`, port of `commitMathModal` 327-358).

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich/extensions/math.ts src/modules/markdown/rich/MathModal.tsx
git commit -m "feat(markdown): math block and inline nodes with lazy katex and error fallback"
```

### Task 10: Mermaid renderer with lazy import and Kex theming

**Files:**
- Create: `src/modules/markdown/rich/extensions/mermaid.ts`

**Interfaces:**
- Consumes: `lazyDecorationPlugin` (Task 6).
- Produces: `function createMermaidRenderer(isDark: () => boolean): Extension`.

- [ ] **Step 1: Implement `mermaid.ts`**

Port Editor.svelte:1164-1425 with these adaptations:
- `loadMermaid` (1173-1190): `import("mermaid")` stays dynamic; theme comes from the injected `isDark()` (wired in Task 14 to the Kex theme engine) instead of `document.documentElement.classList.contains("dark")`; `fontFamily: "inherit"`, `securityLevel: "strict"`, `startOnLoad: false` unchanged.
- Keep verbatim: `showError` + `addRetryButton` (1192-1213), `svgToPngBlob` (1215-1246, background fill color from `isDark()`), `flashToast` (1248-1256), `renderInto` with the `svgCache` (1340-1375), `makeIdleButton` opt-in render button (1377-1402), `buildDecorations` keyed on `codeBlock` nodes with `language === "mermaid"` (1404-1420), and the `lazyDecorationPlugin` wiring (1422-1423).
- `copyDiagram` (1258-1270): replace `copyPngToClipboard(buf)` with `await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`.
- `saveDiagram` and the Save button (1272-1300, 1316-1321): drop entirely (plan decision 4). `addToolbar` keeps Copy and Re-render only.
- Remove the `console.info` banner (1167) and the `isAndroid` guard.

Render-on-idle per spec: cached diagrams render immediately (1383-1389); uncached ones show the "Render diagram" button, and additionally schedule `requestIdleCallback(() => renderInto(container, source), { timeout: 3000 })` inside `makeIdleButton` so diagrams appear without a click on idle, falling back to the manual button if the user interacts first (guard: skip if the container was already rendered or disconnected).

- [ ] **Step 2: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich/extensions/mermaid.ts
git commit -m "feat(markdown): mermaid renderer with lazy import, idle rendering and theme injection"
```

### Task 11: Slash commands

**Files:**
- Create: `src/modules/markdown/rich/extensions/slashCommands.ts`
- Create: `src/modules/markdown/rich/SlashMenu.tsx`

**Interfaces:**
- Consumes: `MenuStore`/`createMenuStore`/`useMenuStore` (Task 6), `insertCallout` (Task 8), `insertDetails` (Task 8).
- Produces:

```ts
// slashCommands.ts
export type SlashMenuState = { x: number; y: number; query: string; from: number; to: number } | null;
export type SlashCommand = { label: string; aliases: string[]; icon: string; action: (editor: Editor) => void };
export function insertTimestamp(editor: Editor, kind: "date" | "time" | "datetime"): void;  // port of Editor.svelte:238-246
export type SlashHandlers = {
  openMathInsert: (kind: "block" | "inline") => void;
  insertCallout: (type: string) => void;
  insertDetails: () => void;
};
export type SlashMenuController = {
  extension: Extension;
  menu: MenuStore<SlashMenuState>;
  selected: MenuStore<number>;
  tablePicker: MenuStore<{ rows: number; cols: number } | null>;
  colorPicker: MenuStore<boolean>;
  filtered(query: string): SlashCommand[];
  execute(editor: Editor, index: number): void;
  insertTable(editor: Editor, rows: number, cols: number): void;
  insertColor(editor: Editor, color: string): void;
  close(): void;
  onTransaction(editor: Editor): void;   // call from RichMarkdownEditor onTransaction
};
export function createSlashMenu(handlers: SlashHandlers): SlashMenuController;
```

- [ ] **Step 1: Implement `slashCommands.ts`**

Port from Editor.svelte with Svelte state replaced by the controller's stores:
- Command list `getSlashCommands` (248-271): port every entry verbatim (label, aliases, inline SVG icon string, action) EXCEPT `Secret` (257, excluded). Actions that referenced Helix helpers map to: `openMathInsert` handler (264-265), `insertCallout("note")` (260), `insertDetails()` (259), table -> `tablePicker` store (261), color -> `colorPicker` store (269), timestamps -> port `insertTimestamp` (238-246) into this file.
- `executeSlashCommand` (1787-1814) becomes `execute(editor, index)`: same table/color sub-picker branching, deleteRange of the trigger text, then run the action (replace `tick().then` with `queueMicrotask`).
- `slashInsertTable` (1816-1820), `insertColor` (1822-1828, keep the `CSS.supports("color", c)` validation), `closeSlashMenu` (1833-1839).
- `updateSlashMenu` (1857-1908): port verbatim minus the mobile visualViewport branch; write the result into `menu`/`selected` stores; keep the `slashTypedByUser` flag logic (module-local `let` inside the controller closure).
- The `SlashCommands` extension (1910-2004): port `handleTextInput` (sets typed-by-user on "/") and the full `handleKeyDown` state machine (menu navigation, table-picker arrow grid navigation, Enter/Tab execute, Escape close) reading/writing the controller stores instead of `$state`.
- Filtering (`slashFiltered`, 273-282) becomes the pure `filtered(query)` method.

- [ ] **Step 2: Implement `SlashMenu.tsx`**

React render of the menu (fixed-position at `menu.x/menu.y`): list of `filtered(query)` items with icon (`dangerouslySetInnerHTML` for the ported SVG strings), label, selected highlight following the `selected` store, click executes. Sub-states: the 8x10 table size picker grid (hover sets `tablePicker` store, click inserts) and the color picker (preset swatches from the `colorPresets` array at Editor.svelte:229 ported verbatim + a free hex input). Styling with Kex tokens: `bg-popover border-border rounded-md shadow-md text-[12px]`, selected `bg-accent`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich/extensions/slashCommands.ts src/modules/markdown/rich/SlashMenu.tsx
git commit -m "feat(markdown): slash command menu with table and color sub-pickers"
```

### Task 12: Find-in-note and color swatches

**Files:**
- Create: `src/modules/markdown/rich/extensions/noteSearch.ts`
- Create: `src/modules/markdown/rich/extensions/colorSwatch.ts`
- Create: `src/modules/markdown/rich/FindBar.tsx`
- Test: `src/modules/markdown/rich/extensions/noteSearch.test.ts`

**Interfaces:**
- Consumes: `lazyDecorationPlugin` (Task 6).
- Produces:

```ts
// noteSearch.ts
export const noteSearchPluginKey: PluginKey;
export const NoteSearchExtension: Extension;                       // port of Editor.svelte:1497-1519
export type SearchMatch = { from: number; to: number };
export function findMatches(doc: PMNode, query: string): SearchMatch[];   // port of 3383-3399, pure
export function applySearchDecorations(editor: Editor, matches: SearchMatch[], currentIndex: number): void; // port of 3543-3553

// colorSwatch.ts
export const ColorSwatch: Extension;                               // port of 1521-1559 verbatim

// FindBar.tsx
export function FindBar(props: {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
}): JSX.Element | null;
```

- [ ] **Step 1: Write the failing findMatches test**

`findMatches` is pure over a ProseMirror doc; test it with a minimal hand-built doc using `@tiptap/pm/model` schema-free helpers is heavy, so test through TipTap headless instead:

```ts
// src/modules/markdown/rich/extensions/noteSearch.test.ts
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { findMatches } from "@/modules/markdown/rich/extensions/noteSearch";

function docFor(html: string) {
  const editor = new Editor({ extensions: [StarterKit], content: html });
  const doc = editor.state.doc;
  editor.destroy();
  return doc;
}

describe("findMatches", () => {
  it("finds case-insensitive matches with positions", () => {
    const doc = docFor("<p>Foo bar foo</p>");
    const matches = findMatches(doc, "foo");
    expect(matches).toHaveLength(2);
    expect(matches[0].to - matches[0].from).toBe(3);
  });
  it("returns empty for empty query", () => {
    expect(findMatches(docFor("<p>abc</p>"), "")).toEqual([]);
  });
});
```

Run: `pnpm exec vitest run src/modules/markdown/rich/extensions/noteSearch.test.ts` - Expected: FAIL.

- [ ] **Step 2: Implement `noteSearch.ts` and `colorSwatch.ts`**

- `NoteSearchExtension` (1497-1519): verbatim; the plugin holds a DecorationSet swapped via `tr.setMeta(noteSearchPluginKey, decorations)`.
- `findMatches`: port the descend-and-indexOf loop from `updateNoteSearchWysiwyg` (3387-3395) returning the array (guard `if (!query) return []`).
- `applySearchDecorations` (3543-3553): build inline decorations (`class: "note-search-match"`, current one `note-search-match current`) and dispatch the meta transaction.
- `ColorSwatch` (1521-1559): verbatim, including `COLOR_LITERAL_RE`, the `CSS.supports("color", ...)` validation and `makeColorSwatch`.

Run the test - Expected: PASS.

- [ ] **Step 3: Implement `FindBar.tsx`**

Compact floating bar (top-right inside the editor area): query input, match counter `n/total`, prev/next buttons, close. Debounce 150ms; on query change call `findMatches` + `applySearchDecorations` and scroll the current match into view (port `scrollToCurrentMatch` 3554-3563: `editor.view.domAtPos(match.from)` then `scrollIntoView({ block: "center" })`). Enter = next, Shift+Enter = prev, Escape = `onClose` (also clears decorations by applying an empty set). Keyboard handling is widget-intrinsic (input-local), so no registry entries here; opening the bar is wired to `search.focus` in Task 16.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich
git commit -m "feat(markdown): in-note find bar with decorations and color literal swatches"
```

### Task 13: Wiki-links (preference-gated)

**Files:**
- Create: `src/modules/markdown/rich/extensions/wikiLink.ts`
- Create: `src/modules/markdown/rich/WikiLinkMenu.tsx`

**Interfaces:**
- Consumes: `resolveWikiRef`, `buildWikiLinkIndex`, `WikiLinkEntry`, `WikiLinkContext` (Task 3), `MenuStore` (Task 6).
- Produces:

```ts
// wikiLink.ts
export function createWikiLink(onNavigate: (path: string, title: string) => void): Mark;
export type WikiLinkMenuState = { x: number; y: number; query: string; from: number } | null;
export type WikiLinkController = {
  extension: Extension;
  menu: MenuStore<WikiLinkMenuState>;
  selected: MenuStore<number>;
  entries: MenuStore<WikiLinkEntry[]>;      // refreshed lazily via buildWikiLinkIndex
  filtered(query: string): WikiLinkEntry[];
  insert(editor: Editor, entry: WikiLinkEntry, originalRef?: string): void;
  onTransaction(editor: Editor): void;
  close(): void;
};
export function createWikiLinkAutocomplete(ctx: { getContext: () => WikiLinkContext }): WikiLinkController;
```

- [ ] **Step 1: Implement `createWikiLink`**

Port the `WikiLink` mark (Editor.svelte:2300-2383) verbatim: `inclusive: true`, `excludes: "link"`, title/path/aliased attributes, both `span[data-wiki-link]` and `a[data-wiki-link]` parse rules, renderHTML to `span[data-wiki-link]`. The click plugin calls `onNavigate(path, title)` instead of `navigateToWikiLink` (navigation policy lives in the shell: Task 16 opens the target file as a markdown tab; unresolved paths re-resolve via `resolveWikiRef` there).

- [ ] **Step 2: Implement `createWikiLinkAutocomplete`**

Port `WikiLinkAutocomplete` (2385-2487) and `updateWikiLinkMenu` (2489-2533) with the same store-instead-of-$state translation used for slash commands. Keep verbatim: the `[[` typed-by-user detection, the `]]`-closing auto-resolution with pipe alias and anchor stripping (2428-2480, using `resolveWikiRef` against `ctx.getContext()`), the single-transaction unresolved-link insertion (2452-2474), and `insertWikiLink` (port from 2258-2288, grep `function insertWikiLink`). Drop the multi-match disambiguation submenu state (2444-2450); on ambiguity keep the menu open filtered to the exact-title matches (same lines, minus the extra `wikiLinkDisambig*` variables: reuse the normal menu list). The entries cache refreshes on menu open via `buildWikiLinkIndex` (throttled: at most once per 30s per controller).

- [ ] **Step 3: Implement `WikiLinkMenu.tsx`**

Same floating-list pattern as `SlashMenu.tsx`: filtered entries (title match, `slice(0, 8)`), folder path as secondary text, arrow/Enter/Escape handled by the extension, click inserts.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich
git commit -m "feat(markdown): wiki-link mark and autocomplete gated behind preference"
```

### Task 14: RichMarkdownEditor shell and stylesheet

**Files:**
- Create: `src/modules/markdown/rich/RichMarkdownEditor.tsx`
- Create: `src/modules/markdown/rich/richMarkdown.css`

**Interfaces:**
- Consumes: everything from Tasks 3-13.
- Produces:

```ts
export type RichMarkdownEditorHandle = {
  serialize(): string;         // flush pending debounce, return htmlToMarkdown(editor.getHTML())
  focus(): void;
  openMathInsert(kind: "block" | "inline"): void;   // sets the internal mathEdit store (Toolbar insert)
};
export type RichMarkdownEditorProps = {
  body: string;                // markdown body (frontmatter already stripped)
  revision: number;            // bump = external reload: setContent without marking dirty
  filePath: string;            // absolute path of the file (image resolution base)
  workspaceRoot: string | null;
  wikiLinksEnabled: boolean;
  tick: MenuStore<number>;     // created by MarkdownTab; bumped here on transactions, consumed by Toolbar/OutlinePanel
  onEditorChange: (editor: Editor | null) => void;  // publishes the live TipTap instance up to MarkdownTab
  onChangeMarkdown: (md: string) => void;   // debounced serializer output
  onNavigateFile: (path: string) => void;   // wiki-link click
  findOpen: boolean;
  onCloseFind: () => void;
};
export const RichMarkdownEditor: ForwardRefExoticComponent<RichMarkdownEditorProps & RefAttributes<RichMarkdownEditorHandle>>;
```

- [ ] **Step 1: Implement the editor shell**

Structure (port of `createEditor`, Editor.svelte:4053-4349, translated to `useEditor` from `@tiptap/react`):

```tsx
export const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor(props, ref) {
    // Per-instance controllers/stores (useMemo, deps: [] except wiki ctx getter)
    const codeLangStore = useMemo(() => createMenuStore<CodeLangDropdownState>(null), []);
    const mathEdit = useMemo(() => createMenuStore<MathEditRequest>(null), []);
    const slash = useMemo(() => createSlashMenu({ ... }), []);
    const wiki = useMemo(() => props.wikiLinksEnabled ? createWikiLinkAutocomplete({ getContext }) : null, ...);

    const html = useMemo(
      () => markdownToHtml(props.body, { wikiLinks: wikiCtx, resolveImageSrc }),
      [props.revision],            // parse only on load/external reload, never per keystroke
    );

    const editor = useEditor({ extensions, content: html, editorProps, onUpdate, onTransaction }, [props.revision]);
    ...
  },
);
```

Details, each mapped to its Helix source:
- **Extension list** (4068-4205): `StarterKit.configure({ codeBlock: false })`, `Placeholder.configure({ includeChildren: true, placeholder })` with the detailsSummary/detailsContent placeholders (4070-4077), `TaskList`, `TaskItem.configure({ nested: true })`, `Table.configure({ resizable: true })`, `TableRow`, `RichTableCell`, `RichTableHeader` (Task 6), `Link.configure(...)` verbatim (4084), `RichImage.configure({ inline: true, HTMLAttributes: { class: "editor-image" } })`, `Highlight.configure({ multicolor: true })`, `Typography`, `Underline`, `Subscript`, `Superscript`, `TextStyle`, `Color`, `CodeBlockLowlight.configure({ lowlight: getLowlight(), enableTabIndentation: true, defaultLanguage: "text" })`, `createCodeBlockLanguageSelect(codeLangStore)`, `CopyButtonExtension`, `createMermaidRenderer(isDark)`, `createMathBlock(mathEdit)`, `createMathInline(mathEdit)`, `PageBreak`, `Callout`, `CalloutTyping`, `Details.configure({ persist: true, HTMLAttributes: { class: "editor-details" } })`, `DetailsSummary`, `DetailsContent`, `CollapsibleKeymap`, `DetailsOpenAttrSync`, `TextAlign.configure({ types: ["heading", "paragraph"] }).extend({ addKeyboardShortcuts: () => ({}) })` (4191-4193, keeps Ctrl+Shift+L free), `CtrlEndScrollPastEnd`, `HeadingShortcuts`, `WrapSelectedText`, `slash.extension`, `MoveLineShortcuts`, `TabIndent`, `NoteSearchExtension`, `ColorSwatch`, and when `wikiLinksEnabled`: `createWikiLink(onNavigate)`, `wiki.extension`. Excluded vs Helix: PdfEmbed, SecretBlock, TaskMetaMenu, TaskMetaDim.
- **`isDark`**: `() => document.documentElement.classList.contains("dark")` unless the theme engine (`src/modules/theme`) exposes a cleaner flag; check `applyTheme` for the class it sets and use that.
- **`resolveImageSrc`**: relative paths resolve against `filePath`'s directory (`.split(/[\\/]/)` per convention), absolute local paths through `convertFileSrc` from `@tauri-apps/api/core`; `http(s):` and `data:` pass through.
- **editorProps** (4207-4316): attributes `{ class: "editor-content", spellcheck: "false" }`; the `mousedown` scroll-lock handler for details buttons and task checkboxes (4215-4233, `.editor-body` selector becomes `.rich-md-body`); the `dragstart` native-drag prevention (4277-4282); `transformPastedHTML` style-stripper verbatim (4293-4315). Skip the read-only click handler (4240-4274, Kex has no View Mode). **handlePaste**: if `event.clipboardData.files.length > 0` show `toast("Image paste is not supported yet")` and return true (spec exclusion); otherwise return false.
- **onTransaction** (4317-4337): rAF-batched bump of the injected `props.tick` store (consumed by the Toolbar for isActive states), then `slash.onTransaction(editor)` and `wiki?.onTransaction(editor)`.
- **Editor publication**: `useEffect(() => { props.onEditorChange(editor); return () => props.onEditorChange(null); }, [editor])` so MarkdownTab can hand the instance to Toolbar and OutlinePanel.
- **onUpdate** (4339-4348): debounce 300ms, then `props.onChangeMarkdown(htmlToMarkdown(editor.getHTML()))`. Maintain an `ignoreNextUpdate` ref set around programmatic `setContent` on revision change.
- **Handle**: `serialize()` cancels the debounce timer and returns `htmlToMarkdown(editor.getHTML())` synchronously; `focus()` = `editor?.commands.focus()`.
- **Render**: `<div className="rich-md-body thin-scrollbar"> <EditorContent editor={editor} /> </div>` plus the floating companions: `<SlashMenu ... />`, `<WikiLinkMenu ... />` (when enabled), `<CodeLangDropdown store={codeLangStore} onSelect={...} />`, `<MathModal request={mathEdit} onCommit={...} />`, `<FindBar editor={editor} open={props.findOpen} onClose={props.onCloseFind} />`.
- **Unmount flush**: on unmount, if a debounce is pending, run the serializer synchronously and call `onChangeMarkdown` one last time (parity with useDocument's flush).

- [ ] **Step 2: Write `richMarkdown.css`**

Port the needed style blocks from Editor.svelte's `<style>` (7579-9500) re-expressed with Kex theme variables (`--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--accent`, `--primary`, `--popover`); import it from `RichMarkdownEditor.tsx` so it ships inside the lazy chunk. Required blocks:
- `.rich-md-body` scroll container and `.editor-content` prose typography (headings scale, paragraph rhythm, inline code chip matching `MarkdownPreviewPane`'s `bg-muted` look).
- Task list styles (`li[data-type="taskItem"]` checkbox layout, checked dim).
- Table styles (borders via `--border`, header `bg-muted/50`, the column-resize handle from `@tiptap/extension-table`, cell `data-bg-color` respected).
- Code block chrome: `pre` background, `.code-copy-btn` (hidden until block hover), language tag rendered from `pre code[data-language]::after` in the top-right hit area used by `CodeBlockLanguageSelect`.
- Callout styles: `.callout`, `.callout-header`, `.callout-icon`, `.callout-title`, `.callout-fold`, `.is-folded .callout-content { display: none }`, and the `--callout-<group>: R G B` color triplets for note/abstract/info/todo/tip/success/question/warning/failure/danger/bug/example/quote/custom (map Helix's palette onto sensible fixed RGB values; they are content colors, not theme tokens).
- Details styles (`.editor-details`, toggle button, `is-open`).
- Math (`.math-block` centered, `.math-inline` baseline, `.math-error` code chip + `.math-error-note` in `--destructive`).
- Mermaid (`.mermaid-render`, `-idle`, `-loading`, `-error`, `-toolbar`, `-btn`, `-action`, `-toast`).
- Search highlight (`.note-search-match` uses `--primary` at low alpha; `.current` full).
- `.color-swatch` inline square, `.wiki-link` underline-dotted `--primary`, `.page-break` dashed separator, ProseMirror placeholder rule, `.callout-type-menu` / `.callout-type-option` floating menu.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich
git commit -m "feat(markdown): rich markdown editor shell wiring tiptap extensions and themed styles"
```

### Task 15: Toolbar and outline panel

**Files:**
- Create: `src/modules/markdown/rich/Toolbar.tsx`
- Create: `src/modules/markdown/rich/OutlinePanel.tsx`

**Interfaces:**
- Consumes: the live `Editor` instance and the `tick` MenuStore as plain props (MarkdownTab creates the store and captures the instance via `onEditorChange`, Task 16), `insertCallout`/`insertDetails` (Task 8), `insertTimestamp` (Task 11).
- Produces:

```ts
export function Toolbar(props: {
  editor: Editor | null;
  tick: MenuStore<number>;                  // re-render trigger for isActive states
  onOpenMathInsert: (kind: "block" | "inline") => void;
}): JSX.Element;

export type OutlineHeading = { level: number; text: string; pos: number };
export function OutlinePanel(props: {
  editor: Editor | null;
  tick: MenuStore<number>;
  onClose: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Implement `Toolbar.tsx`**

Full desktop inventory ported from Editor.svelte:6370-6700 (buttons) + 5646-5672 (find action moves to MarkdownTab header, skip here) + constants 2621-2641. One horizontal strip above the editor body, buttons as small inline action buttons per AGENTS convention (`size-[22px]`, `title` tooltips, hugeicons where an equivalent exists, else the ported inline SVGs). `useMenuStore(tick)` drives `editor.isActive(...)` refresh. Inventory, in order, with the exact command each runs:

1. Insert (+) dropdown: Image (inline path/URL prompt -> `editor.chain().focus().setImage({ src }).run()`), Horizontal Rule (`setHorizontalRule`), Page Break (`insertContent({ type: "pageBreak" })`), Math Block / Math Inline (`onOpenMathInsert`), Date / Time / Date and Time (`insertTimestamp` from Task 11's module, export it there), Collapsible Section (`insertDetails(editor)`), Callout (`insertCallout(editor, "note")`). Excluded: File, Secret.
2. Heading dropdown: Heading 1/2/3, Paragraph (6243-6252, `toggleHeading({ level })` / `setParagraph`), active state per level.
3. Bold, Italic, Underline, Strikethrough (`toggleBold/toggleItalic/toggleUnderline/toggleStrike`).
4. Text Color dropdown: `textColors` swatches (2621-2630) -> port `setTextColor` (4450-4459): empty value = `unsetColor`, else `setColor(value)`.
5. Inline Code (`toggleCode`), Code Block (`toggleCodeBlock`).
6. Link: port `addLinkFromToolbar` + `linkModalConfirm` (4374-4441) as a small popover with URL input; empty input = `extendMarkRange("link").unsetLink()`, else `setLink({ href: encoded })`.
7. Bullet List, Ordered List, Task List (`toggleBulletList/toggleOrderedList/toggleTaskList`).
8. Indent / Outdent: port the sink/lift fallback chains from 6291-6335 verbatim.
9. Quote (`toggleBlockquote`), Collapsible Section (`insertDetails`), Callout (`insertCallout`).
10. Table picker dropdown: 8 rows x 10 cols hover grid -> `insertTable({ rows, cols, withHeaderRow: true })` (4443-4448).
11. Horizontal Rule.
12. Highlight dropdown: `highlightColors` (2632-2641) -> `setHighlightColor` port (4460-4468): `toggleHighlight({ color })`, remove = `unsetHighlight`; the main button toggles the first color.
13. Subscript, Superscript (`toggleSubscript/toggleSuperscript`).
14. Align dropdown: left/center/right/justify (`setTextAlign(...)`).
15. Undo, Redo (`undo/redo`).

Dropdown behavior: one open at a time, close on outside click and Escape (single `openDropdown: string | null` state).

- [ ] **Step 2: Implement `OutlinePanel.tsx`**

Port outline logic (Editor.svelte:168-195) and panel markup (6065-6100): `updateOutline` walks `editor.state.doc.descendants` collecting `{ level, text, pos }` for heading nodes, debounced 250ms off the `tick` store; `scrollToHeading(pos)` = `setTextSelection(pos + 1)` + `scrollIntoView()` + focus. Render: right-docked column (width state local, default 224px, drag-resizable 160-500 via a pointer-drag handle like the WorkspaceBar resizer pattern), header "Outline" + close button, empty state "No headings in this note.", items indented `(level - 1) * 12px`, `text-[12px] text-muted-foreground hover:text-foreground`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich/Toolbar.tsx src/modules/markdown/rich/OutlinePanel.tsx
git commit -m "feat(markdown): formatting toolbar and outline panel"
```

### Task 16: MarkdownTab with Rich|Source toggle

**Files:**
- Create: `src/modules/markdown/rich/MarkdownTab.tsx`
- Modify: `src/modules/editor/EditorPathBar.tsx` (add optional `trailing?: React.ReactNode` slot rendered at the right end of the bar)

**Interfaces:**
- Consumes: `useMarkdownDocument` (Task 5), `RichMarkdownEditor` + handle (Task 14), `Toolbar`/`OutlinePanel` (Task 15), existing `EditorPane`/`EditorPaneHandle` (`src/modules/editor/EditorPane.tsx:54-86`), `EditorPathBar`, `useEditorChrome`, `matchesShortcut` + `usePreferencesStore((s) => s.shortcuts)`, `TabCallbacks` (`src/modules/workspaces/TabContent.tsx:67-103`).
- Produces:

```ts
export function MarkdownTab(props: {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;    // uses onEditorDirtyChange, onFocusOnExplorer, onRenameFile, onSetAsRoot, onNewWorkspaceFromFolder, onRevealInTerminal, onAddToGitignore, onUpdateTab
}): JSX.Element;
```

- [ ] **Step 1: Implement mode state and buffer wiring**

```tsx
const [mode, setMode] = useState<"rich" | "source">("rich");   // per-tab, transient
const [findOpen, setFindOpen] = useState(false);
const [outlineOpen, setOutlineOpen] = useState(false);
const [editor, setEditor] = useState<Editor | null>(null);     // published by RichMarkdownEditor
const tick = useMemo(() => createMenuStore(0), []);
const richRef = useRef<RichMarkdownEditorHandle>(null);
const editorRef = useRef<EditorPaneHandle>(null);
const { doc, dirty, onChange, save, reload } = useMarkdownDocument({
  path: props.path,
  onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
});
```

- Rich mode (only when `doc.status === "ready"`; other statuses render the Step 4 fallbacks):

```tsx
<Toolbar editor={editor} tick={tick} onOpenMathInsert={(k) => richRef.current?.openMathInsert(k)} />
<div className="flex min-h-0 flex-1">
  <RichMarkdownEditor
    ref={richRef}
    body={doc.body}
    revision={doc.revision}
    filePath={props.path}
    workspaceRoot={workspaceRoot}
    wikiLinksEnabled={markdownWikiLinks}
    tick={tick}
    onEditorChange={setEditor}
    onChangeMarkdown={onChange}
    onNavigateFile={handleNavigateFile}
    findOpen={findOpen}
    onCloseFind={() => setFindOpen(false)}
  />
  {outlineOpen && <OutlinePanel editor={editor} tick={tick} onClose={() => setOutlineOpen(false)} />}
</div>
```

(`workspaceRoot` comes from `useEditorChrome()`. The `markdownWikiLinks` preference does not exist until Task 17: pass the literal `wikiLinksEnabled={false}` here; Task 17 Step 2 replaces that literal with `usePreferencesStore((s) => s.markdownWikiLinks)`.)
- Source mode: mount the existing `<EditorPane path={path} onDirtyChange={...} />` full-size. Its own `useDocument` owns the buffer while in source mode; `useMarkdownDocument`'s reload picks disk changes back up on return (both sync through disk, plan decision 7).
- Mode switch handler:

```ts
const toggleMode = async () => {
  if (mode === "rich") {
    const md = richRef.current?.serialize();
    if (md != null) onChange(md);
    await save();                          // flush; skip-if-equal makes this free when clean
    setMode("source");
  } else {
    await editorRef.current?.save();       // EditorPaneHandle.save, no-op when clean
    reload();                              // adopt disk into the markdown buffer
    setMode("rich");
  }
};
```

If `save()` rejects, show `toast.error("Could not switch mode", { description })` and stay in the current mode.

- [ ] **Step 2: Header bar**

`EditorPathBar` with the same props the current markdown case passes (TabContent.tsx:366-387) minus the `view` prop, plus the new `trailing` slot containing: Find button (toggles `findOpen`), Outline button (toggles `outlineOpen`, rich mode only), and a two-segment `Rich | Source` control (active segment `bg-accent text-foreground`, inactive `text-muted-foreground`; `outline-none focus-visible:outline-none` per convention). The `EditorPathBar` modification is only: add `trailing?: React.ReactNode` to its Props type and render `{trailing}` after the existing right-side actions.

- [ ] **Step 3: Local shortcut handling**

One `onKeyDown` (capture) on the tab root, using the registry only:

```ts
const userShortcuts = usePreferencesStore((s) => s.shortcuts);
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (matchesShortcut(e.nativeEvent, "editor.save", userShortcuts)) {
    e.preventDefault();
    if (mode === "rich") { const md = richRef.current?.serialize(); if (md != null) onChange(md); void save(); }
    else void editorRef.current?.save();
  } else if (matchesShortcut(e.nativeEvent, "markdown.toggleSource", userShortcuts)) {
    e.preventDefault(); void toggleMode();
  } else if (matchesShortcut(e.nativeEvent, "markdown.toggleOutline", userShortcuts)) {
    e.preventDefault(); setOutlineOpen((v) => !v);
  } else if (mode === "rich" && matchesShortcut(e.nativeEvent, "search.focus", userShortcuts)) {
    e.preventDefault(); setFindOpen(true);
  }
};
```

The two new ids are registered in this same task so the file compiles:
- Modify `src/modules/shortcuts/shortcuts.ts`: extend the `ShortcutId` union with `"markdown.toggleSource" | "markdown.toggleOutline"` and append to `SHORTCUTS`:

```ts
{
  id: "markdown.toggleSource",
  label: "Markdown: Toggle Rich/Source",
  group: "Editor",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "m" }],
},
{
  id: "markdown.toggleOutline",
  label: "Markdown: Toggle Outline",
  group: "Editor",
  defaultBindings: [{ [MOD_PROP]: true, alt: true, key: "o" }],
},
```

(Collision check against shortcuts.ts:94-481: Mod+Shift+M and Mod+Alt+O are unassigned.)

- [ ] **Step 4: Error states**

Port the non-text branches exactly as `EditorPane` renders them (read its `binary`/`toolarge`/`error` JSX and reuse the same copy and `formatBytes` formatting): `doc.status === "binary"` -> "Binary file (N) is not editable here"; `toolarge` -> size + limit message; `error` -> message. `loading` renders nothing (parity with Suspense fallback).

- [ ] **Step 5: Wiki-link navigation**

`onNavigateFile(path)`: call `props.callbacks.onUpdateTab` is not right for opening files; instead reuse the pending-action pattern the app already has for opening a file from a tab. Check how `GitDiffPane`/explorer open files (`onFocusOnExplorer` reveals only). If no generic "open file in new tab" callback exists on `TabCallbacks`, route navigation through `onFocusOnExplorer(path)` (reveal) for v1 and note it in the manual checklist; do not invent new App plumbing in this task.

- [ ] **Step 6: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`

```bash
git add src/modules/markdown/rich/MarkdownTab.tsx src/modules/editor/EditorPathBar.tsx src/modules/shortcuts/shortcuts.ts
git commit -m "feat(markdown): markdown tab shell with rich/source toggle and registry shortcuts"
```

### Task 17: Preferences and TabContent integration

**Files:**
- Modify: `src/modules/settings/store.ts` (Preferences type ~line 153-213, defaults ~377-437, editor store keys ~261-278, loadPreferences, EDITOR_PREF_KEY_MAP ~1180-1198)
- Modify: `src/modules/workspaces/TabContent.tsx` (lazy import block 26-45, case "markdown" 362-405)
- Modify: `src/modules/markdown/rich/MarkdownTab.tsx` (replace the `wikiLinksEnabled={false}` literal from Task 16 with the preference read)
- Modify: `src/app/App.tsx:1944-1951` (onEditorDirtyChange)
- Modify: `src/modules/workspaces/PaneTabBar.tsx:276` (dirty dot)

**Interfaces:**
- Consumes: `MarkdownTab` (Task 16).
- Produces: `Preferences.markdownEditor: "rich" | "legacy"` (default `"rich"`), `Preferences.markdownWikiLinks: boolean` (default `false`), both JSON-only, live-updating via the existing prefs-changed event.

- [ ] **Step 1: Add the preferences**

In `store.ts`:

```ts
export type MarkdownEditorMode = "rich" | "legacy";
export function parseMarkdownEditor(value: unknown): MarkdownEditorMode {
  return value === "legacy" ? "legacy" : "rich";
}
```

- `Preferences` type: `markdownEditor: MarkdownEditorMode; // JSON-only: no settings UI, edit settings-editor.json` and `markdownWikiLinks: boolean; // JSON-only: no settings UI, edit settings-editor.json`.
- Keys: `const KEY_MARKDOWN_EDITOR = "markdownEditor";` and `const KEY_MARKDOWN_WIKI_LINKS = "markdownWikiLinks";` in the editor-store key block.
- Defaults: `markdownEditor: "rich"`, `markdownWikiLinks: false`.
- `loadPreferences`: `markdownEditor: parseMarkdownEditor(get(KEY_MARKDOWN_EDITOR))`, `markdownWikiLinks: get<boolean>(KEY_MARKDOWN_WIKI_LINKS) ?? false`.
- Discoverability: extend the JSON-only default-persist block (pattern at store.ts:729-736) with an editor-store equivalent that writes both keys when absent (`editorStore.set` + `editorStore.save`).
- `EDITOR_PREF_KEY_MAP`: add both entries so cross-window updates propagate.

- [ ] **Step 2: Bifurcate TabContent**

```tsx
const MarkdownTab = lazy(() =>
  import("@/modules/markdown/rich/MarkdownTab").then((m) => ({ default: m.MarkdownTab as ComponentType<any> })),
);
```

At the top of `TabContent` (unconditional hook position, next to the other `usePreferencesStore` reads at 121-129): `const markdownEditor = usePreferencesStore((s) => s.markdownEditor);`. In `MarkdownTab.tsx`, replace the `wikiLinksEnabled={false}` literal with `usePreferencesStore((s) => s.markdownWikiLinks)`. In `case "markdown"`:

```tsx
case "markdown":
  if (markdownEditor === "rich") {
    return (
      <Suspense fallback={null}>
        <MarkdownTab tabId={tab.id} path={tab.path} visible={visible} focused={focused} callbacks={callbacks} />
      </Suspense>
    );
  }
  return (
    /* existing JSX from lines 363-405, unchanged byte for byte */
  );
```

- [ ] **Step 3: Dirty dot plumbing**

- `App.tsx:1944-1951`, extend the updater:

```ts
onEditorDirtyChange: (tabId, dirty) => {
  const found = findTabGlobal(tabId);
  if (found)
    updateTabData(found.workspace.id, tabId, (p) =>
      p.kind === "editor"
        ? { ...p, dirty, ...(dirty ? { preview: false } : {}) }
        : p.kind === "markdown"
          ? { ...p, dirty }
          : p,
    );
},
```

- `PaneTabBar.tsx:276`:

```tsx
{(tab.kind === "editor" || tab.kind === "markdown") && tab.dirty && !editorAutoSave && (
  <span className="shrink-0 text-[8px] text-primary">●</span>
)}
```

- [ ] **Step 4: Verify both paths manually compile and behave**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Then `pnpm tauri dev`: open a `.md` file (rich editor appears); set `"markdownEditor": "legacy"` in `settings-editor.json`, reopen the tab (Streamdown preview appears, unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/store.ts src/modules/workspaces/TabContent.tsx src/app/App.tsx src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(markdown): rich editor as default markdown tab behind JSON-only preference"
```

### Task 18: Bundle measurement, living docs, manual verification

**Files:**
- Modify: `docs/BUILD.md`, `docs/ARCHITECTURE.md`, `docs/FORK.md`, `AGENTS.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: documented bundle deltas and updated living docs.

- [ ] **Step 1: Measure the bundle**

Baseline from a worktree pinned to the commit before Task 1 (never touch the main worktree's branch):

```bash
BASE=$(git log --format=%H --reverse HEAD | head -1)   # replace with the commit hash before Task 1's commit
git worktree add .claude/worktrees/bundle-baseline "$BASE"
(cd .claude/worktrees/bundle-baseline && pnpm install && pnpm build 2>&1 | tail -40) > /tmp/bundle-before.txt
pnpm build 2>&1 | tail -60 > /tmp/bundle-after.txt
git worktree remove --force .claude/worktrees/bundle-baseline
```

Compare: initial (eager) chunk sizes must be unchanged within noise; new lazy chunks appear for the rich editor (tiptap + markdown-it + lowlight), katex, mermaid. Record gzip sizes of each new chunk.

- [ ] **Step 2: Update `docs/BUILD.md`**

Add a "Markdown editor chunks" subsection under the bundle strategy: table of chunk / trigger / size (rich editor chunk loads on first rich markdown tab; katex on first math node; mermaid on first mermaid render; none load at startup), with the measured numbers.

- [ ] **Step 3: Update `docs/ARCHITECTURE.md`**

- Frontend module map: `markdown/` now = legacy preview (`MarkdownPreviewPane`, Streamdown) + `lib/` pure conversion core (frontmatter, markdownToHtml, htmlToMarkdown, documentBuffer, wikiLinks) + `rich/` TipTap editor (extensions one file each, Toolbar, OutlinePanel, MarkdownTab shell).
- JSON-only preferences list: add `markdownEditor` and `markdownWikiLinks` (settings-editor.json).
- Technical decisions: markdown tabs are editable by default; buffer ownership (`useMarkdownDocument`, disk as mode-switch sync point); round-trip policy (skip-if-equal, dirty-only saves, frontmatter opaque).

- [ ] **Step 4: Update `docs/FORK.md`**

Divergence entry: "Rich markdown editor (WYSIWYG) ported from HelixNotes (TipTap 3): tasks, tables, callouts, details, math (KaTeX), mermaid, slash commands, outline, find-in-note, optional wiki-links; Streamdown preview retained behind `markdownEditor: legacy`. Excluded from the port: AI menu, secret blocks, PDF embeds, task metadata."

- [ ] **Step 5: Update `AGENTS.md` module layout**

Extend the `markdown/` bullet in "Module layout": markdown preview renderer plus the rich TipTap editor (`rich/`, lazy chunk) and the pure markdown conversion core (`lib/`).

- [ ] **Step 6: Update `CLAUDE.md` glossary**

Add a row:

| **RichMarkdownEditor** | Editor WYSIWYG de markdown (TipTap 3) que monta el tab `markdown` por defecto; toggle Rich/Source, toolbar, outline, slash commands. Preferencia JSON-only `markdownEditor` selecciona rich o legacy (Streamdown) | `src/modules/markdown/rich/` (shell `MarkdownTab.tsx`, editor `RichMarkdownEditor.tsx`); core puro en `src/modules/markdown/lib/` | "editor rico", "editor de markdown", "el WYSIWYG", "editor de notas" |

- [ ] **Step 7: Run the manual verification checklist**

With `pnpm tauri dev`, verify each item; fix regressions before committing:

1. Open a `.md` file: rich editor renders, toolbar visible, no console errors, terminal startup unaffected.
2. Toolbar, every control: insert dropdown (image prompt, hr, page break, math block/inline, date/time/datetime, collapsible, callout), heading dropdown, bold/italic/underline/strike, text color, inline code, code block, link popover (set + clear), the three lists, indent/outdent, quote, table picker grid, highlight dropdown + remove, sub/sup, align, undo/redo.
3. Slash commands: `/` opens the menu, filter by alias (`h2`, `todo`), arrows + Enter, table sub-picker with keyboard grid nav, color sub-picker, Escape closes.
4. Task list: click checkbox toggles without scroll jump; nested tasks indent/outdent with Tab/Shift+Tab; `- [x]` survives save.
5. Tables: resize a column, add/delete row/column via commands, cell background color survives save as raw HTML, plain table saves as pipe markdown.
6. Callouts: type `> [!warning] Title` + Enter converts; icon menu changes type; custom type; fold button; folded state round-trips (`[!warning]-`).
7. Details: insert collapsible, Tab from summary jumps into content, open state persists in the saved markdown.
8. Math: `/math` inserts, KaTeX renders (network tab: katex chunk loads only now), dblclick edits, invalid TeX shows code fallback with error note.
9. Mermaid: fence renders on idle or via the button (mermaid chunk loads only now), invalid syntax shows the error + Retry, Copy puts a PNG on the clipboard, theme matches dark/light.
10. Find in note: Cmd+F (search.focus) opens the bar, matches highlighted, Enter/Shift+Enter cycles, Escape clears.
11. Outline: toggle via button and via Mod+Alt+O, headings listed, click scrolls, panel resizes.
12. Source toggle: Mod+Shift+M switches to CodeMirror with the serialized markdown; edit there; toggle back; no content lost either direction; dirty dot correct throughout.
13. Save: Cmd+S saves (file on disk updated, frontmatter untouched byte-for-byte); opening and closing without edits never rewrites the file (check mtime).
14. Autosave: enable `editorAutoSave`, edit, wait the delay, file saved, dot cleared.
15. External reload: edit the file in another program while the tab is clean: content refreshes. While dirty: buffer kept.
16. Wiki-links: with `markdownWikiLinks: false`, `[[...]]` stays plain text. Set true: `[[` opens autocomplete, `]]` resolves, pipe alias works, click navigates/reveals.
17. Legacy preference: `"markdownEditor": "legacy"` restores the exact previous preview behavior.
18. Two markdown tabs side by side (split): independent editors, menus do not cross-talk.

- [ ] **Step 8: Final verification and commit**

```bash
pnpm exec biome lint ./src && pnpm check-types && pnpm test
cd src-tauri && cargo clippy && cargo test --locked && cd ..
git add docs/BUILD.md docs/ARCHITECTURE.md docs/FORK.md AGENTS.md CLAUDE.md
git commit -m "docs: document rich markdown editor architecture, fork divergence and bundle impact"
```

