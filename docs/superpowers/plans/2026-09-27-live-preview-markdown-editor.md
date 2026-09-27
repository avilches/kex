# Live Preview Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth `markdown` tab engine, `"codemirror"` (labeled "Live Preview" in Settings),
built on CodeMirror 6, that shows Obsidian-style live-preview decorations over the raw markdown
text and never transforms the saved bytes.

**Architecture:** A pure decoration planner (`lib/livePreview.ts`) walks the `@lezer/markdown`
syntax tree and produces plain data (mark/hide/checkbox specs); a thin `ViewPlugin` adapter
(`lib/livePreviewPlugin.ts`) turns that into real CodeMirror `Decoration`s, bounded to the visible
viewport. The tab shell reuses the existing plain-text document hook (`useDocument`) unchanged for
load/save/dirty/autosave/conflict handling, and `@uiw/react-codemirror` (already a project
dependency, used by the plain-text editor) as the React wrapper around the CodeMirror instance.

**Tech Stack:** CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`,
`@codemirror/lang-markdown`, `@codemirror/commands`), `@uiw/react-codemirror`, React 19,
TypeScript, Vitest with `happy-dom`.

**Spec:** `docs/superpowers/specs/2026-09-27-live-preview-markdown-editor-design.md`

## Global Constraints

- The saved file is always exactly `state.doc.toString()`. No node in this plan may transform,
  reformat, or reserialize the document; decorations are purely visual.
- No outline panel, no toolbar, no slash commands, no Rich/Source mode toggle, no integration with
  `MarkdownRenderPane` (the read-only preview switch) — explicit non-goals of the spec.
- Frontmatter (a `---`-delimited block at the very start of the file) is never decorated as
  markdown content.
- Embedded HTML (`HTMLBlock`/`HTMLTag` nodes) never triggers an error or a decoration.
- `pnpm lint`, `pnpm check-types`, and `pnpm test` must stay green after every task.
- No em-dash, no emojis, no `Co-authored-by`, in any code, comment, or commit message (project
  rule, `AGENTS.md`).
- Commit messages in English; one commit per task; no backward-compatibility shims.

## Review Focus

- **A file with no frontmatter and no special constructs** (a plain note: a few paragraphs, no
  headings/bold/lists) must open, show no decorations at all, and save byte-identical. Covered by
  Task 5's planner tests (empty-plan case) and Task 8's round-trip test.
- **A file whose frontmatter block is unterminated** (a leading `---` line with no closing `---`
  anywhere) must not have the rest of the document swallowed into "frontmatter" and hidden from
  normal decoration. Covered by Task 4's tests (reuses `splitFrontmatter`'s existing fallback: no
  match, no frontmatter).
- **Two cursors on two different lines** (multi-selection) must each reveal their own line's raw
  syntax; a line untouched by any selection range stays decorated. Covered by Task 5's
  `activeLines` tests with more than one range.
- **Clicking a task-list checkbox** must toggle only the single character inside `[ ]`/`[x]` and
  leave the rest of the line (and file) untouched, including when the checkbox is the last
  character before end-of-document (no out-of-bounds range). Covered by Task 6's checkbox tests.
- **An external change to the file while the tab is dirty** (edited locally, then the file changes
  on disk) must show the existing conflict overlay instead of silently overwriting either version.
  Covered by Task 9, which reuses `useDocument`'s existing `conflict`/`keepLocalChanges`/
  `reloadFromDisk`, already covered by that hook's own tests; Task 9 adds only the wiring, not new
  conflict logic.

---

### Task 1: Add the `codemirror` engine value

**Files:**
- Modify: `src/modules/markdown/lib/markdownEngine.ts`
- Modify: `src/modules/markdown/lib/markdownEngine.test.ts`

**Interfaces:**
- Produces: `MarkdownEngine = "tiptap" | "milkdown" | "legacy" | "codemirror"`, exported from
  `src/modules/markdown/lib/markdownEngine.ts`, consumed by every later task.

- [ ] **Step 1: Write the failing tests**

Replace the body of `markdownEngine.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import {
  MARKDOWN_ENGINES,
  parseMarkdownEngine,
  resolveMarkdownEngine,
} from "@/modules/markdown/lib/markdownEngine";

describe("parseMarkdownEngine", () => {
  it("accepts the four engines", () => {
    expect(parseMarkdownEngine("tiptap")).toBe("tiptap");
    expect(parseMarkdownEngine("milkdown")).toBe("milkdown");
    expect(parseMarkdownEngine("legacy")).toBe("legacy");
    expect(parseMarkdownEngine("codemirror")).toBe("codemirror");
  });

  it("falls back to tiptap for anything else", () => {
    expect(parseMarkdownEngine("rich")).toBe("tiptap");
    expect(parseMarkdownEngine(undefined)).toBe("tiptap");
    expect(parseMarkdownEngine(null)).toBe("tiptap");
    expect(parseMarkdownEngine(7)).toBe("tiptap");
    expect(parseMarkdownEngine("Milkdown")).toBe("tiptap");
  });

  it("lists every engine exactly once", () => {
    expect([...MARKDOWN_ENGINES]).toEqual(["tiptap", "milkdown", "legacy", "codemirror"]);
  });
});

describe("resolveMarkdownEngine", () => {
  it("prefers the tab's own engine", () => {
    expect(resolveMarkdownEngine("milkdown", "tiptap")).toBe("milkdown");
    expect(resolveMarkdownEngine("legacy", "milkdown")).toBe("legacy");
    expect(resolveMarkdownEngine("codemirror", "milkdown")).toBe("codemirror");
  });

  it("falls back to the preference when the tab has none", () => {
    expect(resolveMarkdownEngine(undefined, "milkdown")).toBe("milkdown");
  });

  it("falls back to the preference when the tab value is not an engine", () => {
    expect(resolveMarkdownEngine("rich" as never, "legacy")).toBe("legacy");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/modules/markdown/lib/markdownEngine.test.ts`
Expected: FAIL (`parseMarkdownEngine("codemirror")` returns `"tiptap"`, the list assertion has only
three entries).

- [ ] **Step 3: Implement**

In `markdownEngine.ts`, replace the whole file with:

```typescript
export type MarkdownEngine = "tiptap" | "milkdown" | "legacy" | "codemirror";

export const MARKDOWN_ENGINES: readonly MarkdownEngine[] = [
  "tiptap",
  "milkdown",
  "legacy",
  "codemirror",
] as const;

export const DEFAULT_MARKDOWN_ENGINE: MarkdownEngine = "tiptap";

function isEngine(value: unknown): value is MarkdownEngine {
  return (
    value === "tiptap" ||
    value === "milkdown" ||
    value === "legacy" ||
    value === "codemirror"
  );
}

export function parseMarkdownEngine(value: unknown): MarkdownEngine {
  return isEngine(value) ? value : DEFAULT_MARKDOWN_ENGINE;
}

// A tab without an engine, or with a value no longer known, renders with the
// current default instead of failing to render at all.
export function resolveMarkdownEngine(
  tabEngine: MarkdownEngine | undefined,
  preference: MarkdownEngine,
): MarkdownEngine {
  return isEngine(tabEngine) ? tabEngine : parseMarkdownEngine(preference);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/modules/markdown/lib/markdownEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/lib/markdownEngine.ts src/modules/markdown/lib/markdownEngine.test.ts
git commit -m "feat(markdown): add codemirror as a fourth MarkdownEngine value"
```

---

### Task 2: Degrade the `codemirror` engine to the legacy read-only preview

**Context:** `MarkdownRenderPane` (the read-only preview used by a plain-text `editor` tab's
preview overlay/split on a `.md` file) switches on `pickRenderer(engine, failed)`, whose return
type `MarkdownRenderer` has only three values (`"legacy" | "tiptap" | "milkdown"`). Adding a fourth
`MarkdownEngine` value makes `pickRenderer`'s `return engine;` a type error once `engine` can be
`"codemirror"`, and per the spec this engine has no read-only preview variant, so it must degrade
to the legacy renderer, exactly like a failed rich engine already does.

**Files:**
- Modify: `src/modules/markdown/lib/renderEngine.ts`
- Modify: `src/modules/markdown/lib/renderEngine.test.ts`

**Interfaces:**
- Consumes: `MarkdownEngine` from Task 1.
- Produces: `pickRenderer`/`shouldDebounce` unchanged signatures, now total over all four engine
  values.

- [ ] **Step 1: Write the failing tests**

Add to `renderEngine.test.ts`, inside the existing `describe("pickRenderer", ...)` block:

```typescript
  it("degrades the codemirror engine to the legacy renderer (no read-only variant)", () => {
    expect(pickRenderer("codemirror", false)).toBe("legacy");
    expect(pickRenderer("codemirror", true)).toBe("legacy");
  });
```

And inside `describe("shouldDebounce", ...)`:

```typescript
  it("does not debounce the codemirror engine, which renders through the legacy path", () => {
    expect(shouldDebounce("codemirror")).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/modules/markdown/lib/renderEngine.test.ts`
Expected: FAIL with a TypeScript error on `pickRenderer("codemirror", false)` (not assignable to
the old three-value return) once Task 1 is in place, or a runtime mismatch if types are loose.

- [ ] **Step 3: Implement**

```typescript
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";

export const RICH_DEBOUNCE_MS = 200;

export type MarkdownRenderer = "legacy" | "tiptap" | "milkdown";

// A rich engine that cannot start falls back to the cheap renderer, so a broken
// engine never blanks the preview of a file the user is editing. The codemirror
// engine has no read-only preview variant at all (see the Live Preview design
// spec), so it always degrades the same way a failed rich engine would.
export function pickRenderer(engine: MarkdownEngine, failed: boolean): MarkdownRenderer {
  if (failed || engine === "legacy" || engine === "codemirror") return "legacy";
  return engine;
}

// A rich engine reparses the whole document per update; the legacy renderer is
// cheap and keeps the live text it always had. codemirror always renders
// through the legacy path (see pickRenderer), so it never needs the debounce.
export function shouldDebounce(engine: MarkdownEngine): boolean {
  return engine !== "legacy" && engine !== "codemirror";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/modules/markdown/lib/renderEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/lib/renderEngine.ts src/modules/markdown/lib/renderEngine.test.ts
git commit -m "fix(markdown): degrade the codemirror engine to the legacy read-only preview"
```

---

### Task 3: Settings > Editor "Live Preview" option

**Files:**
- Modify: `src/settings/sections/EditorSection.tsx:221-226`

**Interfaces:**
- Consumes: `MarkdownEngine` (Task 1), existing `markdownEngine` preference value and
  `setMarkdownEngine` action (both already imported in this file).

- [ ] **Step 1: Add the radio option**

Insert a fourth `RadioGroupItem` right after the existing `legacy` block (after line 226, still
inside the `<RadioGroup>`):

```tsx
            <div className="flex items-center gap-2">
              <RadioGroupItem value="codemirror" id="markdown-engine-codemirror" />
              <label htmlFor="markdown-engine-codemirror" className="cursor-pointer text-[12px]">
                Live Preview
              </label>
            </div>
```

- [ ] **Step 2: Manual check**

Run `pnpm tauri dev`, open Settings > Editor, confirm "Live Preview" appears as a fourth option
under "Markdown editor" and that selecting it persists (reopen Settings, it's still selected).

- [ ] **Step 3: Commit**

```bash
git add src/settings/sections/EditorSection.tsx
git commit -m "feat(settings): add Live Preview to the markdown engine picker"
```

---

### Task 4: Frontmatter-end helper

**Files:**
- Create: `src/modules/markdown/codemirror/lib/frontmatterEnd.ts`
- Test: `src/modules/markdown/codemirror/lib/frontmatterEnd.test.ts`

**Interfaces:**
- Consumes: `splitFrontmatter` from `src/modules/markdown/lib/frontmatter.ts` (existing, unchanged).
- Produces: `frontmatterEnd(text: string): number`, consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";

describe("frontmatterEnd", () => {
  it("returns 0 when the document has no frontmatter", () => {
    expect(frontmatterEnd("# Title\n\nBody text.\n")).toBe(0);
  });

  it("returns the offset right after the closing --- line", () => {
    const text = "---\ntitle: Note\ntags: [a, b]\n---\n# Title\n";
    const fm = "---\ntitle: Note\ntags: [a, b]\n---\n";
    expect(frontmatterEnd(text)).toBe(fm.length);
  });

  it("returns 0 for an unterminated frontmatter block", () => {
    expect(frontmatterEnd("---\ntitle: Note\n# not a real close\n")).toBe(0);
  });

  it("only scans a bounded prefix, never the whole document", () => {
    const hugeBody = "x".repeat(1_000_000);
    expect(frontmatterEnd(`# Title\n\n${hugeBody}`)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/lib/frontmatterEnd.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
import { splitFrontmatter } from "@/modules/markdown/lib/frontmatter";

// Frontmatter, if present, always starts at offset 0, so only a bounded prefix
// needs scanning; a multi-megabyte note must never be fully re-stringified on
// every decoration recompute just to check for a leading YAML block.
const PREFIX_SCAN_LENGTH = 4096;

export function frontmatterEnd(text: string): number {
  const prefix = text.slice(0, PREFIX_SCAN_LENGTH);
  const { frontmatter } = splitFrontmatter(prefix);
  return frontmatter.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/lib/frontmatterEnd.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/codemirror/lib/frontmatterEnd.ts src/modules/markdown/codemirror/lib/frontmatterEnd.test.ts
git commit -m "feat(markdown): add frontmatter-end detection for the Live Preview engine"
```

---

### Task 5: Pure live-preview decoration planner

**Context:** This is the functional core: given a parsed syntax tree, the document text, a
viewport range, the set of "active" line numbers (touched by any selection range), and the
frontmatter end offset, decide which ranges to hide, which ranges to style, and which ranges are
task-list checkboxes. No CodeMirror view, no DOM. `@lezer/markdown`'s node names, confirmed against
the installed `@lezer/markdown@1.6.4` parser table: `ATXHeading1`..`ATXHeading6` (child
`HeaderMark`), `StrongEmphasis`/`Emphasis` (child `EmphasisMark`, first and last), `Strikethrough`
(child `StrikethroughMark`, first and last), `InlineCode` (child `CodeMark`, first and last),
`Link` (children `LinkMark` and `URL`), `BulletList`/`OrderedList` containing `ListItem` (child
`ListMark`), `Task` (child `TaskMarker`, the literal 3 characters `[ ]` or `[x]`).

**Decision on "active line":** only marker *visibility* depends on whether the cursor/selection
touches that line. The *styling* (bold/italic/heading-size/etc. CSS class) always applies to the
content span, active line or not — this matches Obsidian, which keeps a line's formatting visible
even while its raw syntax is revealed for editing.

**Decision on lists:** the bullet/ordered marker is never hidden (removing `-`/`1.` would make the
list unreadable); it always gets a styling class only (e.g. a muted color), regardless of the
active line. Only the four inline constructs and headings use the hide-on-inactive-line mechanic.

**Files:**
- Create: `src/modules/markdown/codemirror/lib/livePreview.ts`
- Test: `src/modules/markdown/codemirror/lib/livePreview.test.ts`

**Interfaces:**
- Consumes: `Tree`, `SyntaxNode` from `@lezer/common`; `Text` from `@codemirror/state`;
  `markdownLanguage` from `@codemirror/lang-markdown` (test-only, to produce a real `Tree`);
  `frontmatterEnd` from Task 4 (test-only, to compute the input's `frontmatterEnd` field).
- Produces:
  ```typescript
  export type MarkSpec = { from: number; to: number; className: string };
  export type HideSpec = { from: number; to: number };
  export type CheckboxSpec = { from: number; to: number; checked: boolean };
  export type LivePreviewPlan = { marks: MarkSpec[]; hides: HideSpec[]; checkboxes: CheckboxSpec[] };
  export type LivePreviewInput = {
    tree: Tree;
    doc: Text;
    from: number;
    to: number;
    activeLines: ReadonlySet<number>;
    frontmatterEnd: number;
  };
  export function planLivePreview(input: LivePreviewInput): LivePreviewPlan;
  ```
  Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

```typescript
import { markdownLanguage } from "@codemirror/lang-markdown";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { planLivePreview } from "@/modules/markdown/codemirror/lib/livePreview";

function plan(
  text: string,
  activeLines: number[] = [],
  frontmatterEnd = 0,
) {
  const doc = Text.of(text.split("\n"));
  const tree = markdownLanguage.parser.parse(text);
  return planLivePreview({
    tree,
    doc,
    from: 0,
    to: text.length,
    activeLines: new Set(activeLines),
    frontmatterEnd,
  });
}

describe("planLivePreview", () => {
  it("returns nothing for plain prose", () => {
    const result = plan("Just a sentence with no markup.\n");
    expect(result).toEqual({ marks: [], hides: [], checkboxes: [] });
  });

  it("styles a heading and hides its marker on an inactive line", () => {
    const text = "# Title\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 0, to: 7, className: "cm-lp-heading cm-lp-h1" });
    expect(result.hides).toContainEqual({ from: 0, to: 1 });
  });

  it("keeps the heading style but reveals the marker on the active line", () => {
    const text = "# Title\n";
    const result = plan(text, [1]);
    expect(result.marks).toContainEqual({ from: 0, to: 7, className: "cm-lp-heading cm-lp-h1" });
    expect(result.hides).toEqual([]);
  });

  it("hides both asterisks of bold text on an inactive line", () => {
    const text = "before **bold** after\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 7, to: 15, className: "cm-lp-bold" });
    expect(result.hides).toContainEqual({ from: 7, to: 9 });
    expect(result.hides).toContainEqual({ from: 13, to: 15 });
  });

  it("hides both underscores of italic text on an inactive line", () => {
    const text = "before _italic_ after\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 7, to: 15, className: "cm-lp-italic" });
    expect(result.hides.length).toBe(2);
  });

  it("hides strikethrough markers", () => {
    const text = "before ~~gone~~ after\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 7, to: 15, className: "cm-lp-strike" });
  });

  it("hides backticks around inline code", () => {
    const text = "run `ls -la` now\n";
    const result = plan(text);
    expect(result.marks).toContainEqual({ from: 4, to: 12, className: "cm-lp-code" });
    expect(result.hides).toContainEqual({ from: 4, to: 5 });
    expect(result.hides).toContainEqual({ from: 11, to: 12 });
  });

  it("hides link brackets and the URL, keeping the link text visible", () => {
    const text = "see [the docs](https://example.com) here\n";
    const result = plan(text);
    // "[" "]" "(" URL ")" are hidden; "the docs" (offsets 5-13) stays.
    expect(result.hides).toContainEqual({ from: 4, to: 5 });
    expect(result.hides.some((h) => text.slice(h.from, h.to) === "https://example.com")).toBe(true);
    expect(result.marks).toContainEqual({ from: 5, to: 13, className: "cm-lp-link-text" });
  });

  it("styles a bullet marker but never hides it, active or not", () => {
    const text = "- one\n- two\n";
    const result = plan(text);
    expect(result.hides).toEqual([]);
    expect(result.marks.some((m) => m.className === "cm-lp-bullet")).toBe(true);
  });

  it("emits a checkbox spec for a task item, checked and unchecked", () => {
    const text = "- [ ] todo\n- [x] done\n";
    const result = plan(text);
    expect(result.checkboxes).toContainEqual({ from: 2, to: 5, checked: false });
    expect(result.checkboxes).toContainEqual({ from: 12, to: 15, checked: true });
  });

  it("keeps checkbox decorations even on the active line", () => {
    const text = "- [ ] todo\n";
    const result = plan(text, [1]);
    expect(result.checkboxes).toContainEqual({ from: 2, to: 5, checked: false });
  });

  it("tolerates an embedded HTML block without error or decoration", () => {
    const text = '<div class="note">raw html, **not markdown** in here</div>\n\n# Real heading\n';
    expect(() => plan(text)).not.toThrow();
    const result = plan(text);
    // Nothing inside the HTML block (offsets 0-60) is decorated; only the
    // heading that follows it is.
    expect(result.marks.every((m) => m.from >= 60)).toBe(true);
    expect(result.hides.every((h) => h.from >= 60)).toBe(true);
  });

  it("never decorates content inside the frontmatter block", () => {
    const text = "---\ntitle: **not bold**\n---\n# Real Title\n";
    const fmEnd = "---\ntitle: **not bold**\n---\n".length;
    const result = plan(text, [], fmEnd);
    expect(result.marks.every((m) => m.from >= fmEnd)).toBe(true);
    expect(result.hides.every((h) => h.from >= fmEnd)).toBe(true);
    expect(result.marks).toContainEqual({
      from: fmEnd,
      to: fmEnd + "# Real Title".length,
      className: "cm-lp-heading cm-lp-h1",
    });
  });

  it("supports more than one active line (multi-cursor)", () => {
    const text = "**a**\n**b**\n**c**\n";
    const result = plan(text, [1, 3]);
    // Line 1 (offset 0-5) and line 3 (offset 12-17) are active: no hides there.
    // Line 2 (offset 6-11) is inactive: its marks are hidden.
    const line2Hides = result.hides.filter((h) => h.from >= 6 && h.to <= 11);
    expect(line2Hides.length).toBe(2);
    const line1Hides = result.hides.filter((h) => h.from >= 0 && h.to <= 5);
    const line3Hides = result.hides.filter((h) => h.from >= 12 && h.to <= 17);
    expect(line1Hides.length).toBe(0);
    expect(line3Hides.length).toBe(0);
  });

  it("bounds work to the given viewport, ignoring nodes outside it", () => {
    const text = "**a**\n".repeat(100);
    const midpoint = Math.floor(text.length / 2);
    const doc = Text.of(text.split("\n"));
    const tree = markdownLanguage.parser.parse(text);
    const result = planLivePreview({
      tree,
      doc,
      from: 0,
      to: midpoint,
      activeLines: new Set(),
      frontmatterEnd: 0,
    });
    expect(result.marks.every((m) => m.from < midpoint)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/lib/livePreview.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
import type { SyntaxNode, Tree } from "@lezer/common";
import type { Text } from "@codemirror/state";

export type MarkSpec = { from: number; to: number; className: string };
export type HideSpec = { from: number; to: number };
export type CheckboxSpec = { from: number; to: number; checked: boolean };
export type LivePreviewPlan = { marks: MarkSpec[]; hides: HideSpec[]; checkboxes: CheckboxSpec[] };

export type LivePreviewInput = {
  tree: Tree;
  doc: Text;
  from: number;
  to: number;
  activeLines: ReadonlySet<number>;
  frontmatterEnd: number;
};

const HEADING_NAMES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

function isActive(node: SyntaxNode, doc: Text, activeLines: ReadonlySet<number>): boolean {
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let line = startLine; line <= endLine; line++) {
    if (activeLines.has(line)) return true;
  }
  return false;
}

export function planLivePreview(input: LivePreviewInput): LivePreviewPlan {
  const { tree, doc, from, to, activeLines, frontmatterEnd } = input;
  const marks: MarkSpec[] = [];
  const hides: HideSpec[] = [];
  const checkboxes: CheckboxSpec[] = [];

  tree.iterate({
    from,
    to,
    enter(ref) {
      if (ref.from < frontmatterEnd) return;
      const node = ref.node;

      if (HEADING_NAMES.has(node.type.name)) {
        const level = node.type.name.slice(-1);
        marks.push({ from: node.from, to: node.to, className: `cm-lp-heading cm-lp-h${level}` });
        const mark = node.getChild("HeaderMark");
        if (mark && !isActive(node, doc, activeLines)) {
          hides.push({ from: mark.from, to: mark.to });
        }
        return;
      }

      if (node.type.name === "StrongEmphasis" || node.type.name === "Emphasis") {
        const className = node.type.name === "StrongEmphasis" ? "cm-lp-bold" : "cm-lp-italic";
        marks.push({ from: node.from, to: node.to, className });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, "EmphasisMark", hides);
        }
        return;
      }

      if (node.type.name === "Strikethrough") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-strike" });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, "StrikethroughMark", hides);
        }
        return;
      }

      if (node.type.name === "InlineCode") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-code" });
        if (!isActive(node, doc, activeLines)) {
          hideMatchingChildren(node, "CodeMark", hides);
        }
        return;
      }

      if (node.type.name === "Link") {
        planLink(node, doc, activeLines, marks, hides);
        return;
      }

      if (node.type.name === "ListMark") {
        marks.push({ from: node.from, to: node.to, className: "cm-lp-bullet" });
        return;
      }

      if (node.type.name === "Task") {
        const marker = node.getChild("TaskMarker");
        if (marker) {
          const text = doc.sliceString(marker.from, marker.to);
          checkboxes.push({ from: marker.from, to: marker.to, checked: text === "[x]" || text === "[X]" });
        }
      }
    },
  });

  return { marks, hides, checkboxes };
}

function hideMatchingChildren(node: SyntaxNode, childName: string, hides: HideSpec[]): void {
  let child = node.firstChild;
  while (child) {
    if (child.type.name === childName) hides.push({ from: child.from, to: child.to });
    child = child.nextSibling;
  }
}

// A plain, unformatted link's visible text ("the docs" in `[the docs](url)`) is
// never its own child node in the Lezer markdown tree: only the delimiters
// (LinkMark "[" "]" "(" ")" and URL) are nodes. The link text is therefore
// computed as the gap between the opening "[" and the next "]", not by
// looking for a "non-chrome" child, which would find nothing for plain text.
function planLink(
  node: SyntaxNode,
  doc: Text,
  activeLines: ReadonlySet<number>,
  marks: MarkSpec[],
  hides: HideSpec[],
): void {
  const active = isActive(node, doc, activeLines);
  const chrome: SyntaxNode[] = [];
  let child = node.firstChild;
  while (child) {
    if (child.type.name === "LinkMark" || child.type.name === "URL" || child.type.name === "LinkTitle") {
      chrome.push(child);
    }
    child = child.nextSibling;
  }
  if (!active) {
    for (const c of chrome) hides.push({ from: c.from, to: c.to });
  }
  const openBracket = chrome.find((c) => c.type.name === "LinkMark");
  if (!openBracket) return;
  const closeBracket = chrome.find(
    (c) => c.type.name === "LinkMark" && c.from > openBracket.to,
  );
  const textFrom = openBracket.to;
  const textTo = closeBracket ? closeBracket.from : node.to;
  if (textTo > textFrom) {
    marks.push({ from: textFrom, to: textTo, className: "cm-lp-link-text" });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/lib/livePreview.test.ts`
Expected: PASS. If a node-name assumption is wrong (e.g. `ListMark`'s parent chain differs from
expectation), add a one-off debug test that logs `tree.toString()` for the failing input, read the
printed node names, and correct the constant/lookup above — do not guess a second time.

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/codemirror/lib/livePreview.ts src/modules/markdown/codemirror/lib/livePreview.test.ts
git commit -m "feat(markdown): add the Live Preview decoration planner"
```

---

### Task 6: CodeMirror ViewPlugin adapter (decorations + checkbox widget)

**Files:**
- Create: `src/modules/markdown/codemirror/lib/livePreviewPlugin.ts`
- Test: `src/modules/markdown/codemirror/lib/livePreviewPlugin.test.ts`

**Interfaces:**
- Consumes: `planLivePreview` and its types from Task 5; `frontmatterEnd` from Task 4.
- Produces: `livePreviewPlugin: Extension` (a `ViewPlugin` instance), consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { livePreviewPlugin } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

function mount(doc: string, selection?: { anchor: number }) {
  const state = EditorState.create({
    doc,
    selection: selection ? { anchor: selection.anchor } : undefined,
    extensions: [markdown({ base: markdownLanguage }), livePreviewPlugin],
  });
  return new EditorView({ state, parent: document.body });
}

describe("livePreviewPlugin", () => {
  it("hides the heading marker when the cursor is elsewhere", () => {
    const view = mount("# Title\n\nOther line", { anchor: 20 });
    expect(view.dom.textContent).not.toContain("#");
    expect(view.dom.textContent).toContain("Title");
    view.destroy();
  });

  it("reveals the heading marker when the cursor is on that line", () => {
    const view = mount("# Title\n\nOther line", { anchor: 3 });
    expect(view.dom.textContent).toContain("# Title");
    view.destroy();
  });

  it("renders a real checkbox input for a task item", () => {
    const view = mount("- [ ] todo\n");
    const checkbox = view.dom.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    view.destroy();
  });

  it("toggles the underlying text when the checkbox is clicked", () => {
    const view = mount("- [ ] todo\n");
    const checkbox = view.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.state.doc.toString()).toBe("- [x] todo\n");
    view.destroy();
  });

  it("never decorates the frontmatter block", () => {
    const view = mount("---\ntitle: **not bold**\n---\n# Real\n", { anchor: 0 });
    // The frontmatter's own ** stays literal; only "Real" (after the closing ---) is a heading.
    const bodyText = view.dom.textContent ?? "";
    expect(bodyText).toContain("title: **not bold**");
    view.destroy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/lib/livePreviewPlugin.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { frontmatterEnd } from "@/modules/markdown/codemirror/lib/frontmatterEnd";
import { planLivePreview } from "@/modules/markdown/codemirror/lib/livePreview";

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  override toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-lp-checkbox";
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const insert = this.checked ? " " : "x";
      view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert } });
    });
    return input;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let line = startLine; line <= endLine; line++) activeLines.add(line);
  }

  const fmEnd = frontmatterEnd(state.doc.sliceString(0, Math.min(state.doc.length, 4096)));

  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const plan = planLivePreview({
      tree: syntaxTree(state),
      doc: state.doc,
      from,
      to,
      activeLines,
      frontmatterEnd: fmEnd,
    });
    for (const mark of plan.marks) {
      decorations.push({ from: mark.from, to: mark.to, deco: Decoration.mark({ class: mark.className }) });
    }
    for (const hide of plan.hides) {
      decorations.push({ from: hide.from, to: hide.to, deco: Decoration.replace({}) });
    }
    for (const box of plan.checkboxes) {
      decorations.push({
        from: box.from,
        to: box.to,
        deco: Decoration.replace({ widget: new CheckboxWidget(box.from, box.checked) }),
      });
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = decorations.map((d) => d.deco.range(d.from, d.to));
  return Decoration.set(builder, true);
}

export const livePreviewPlugin: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/lib/livePreviewPlugin.test.ts`
Expected: PASS. If `Decoration.set(..., true)` throws about overlapping/unsorted ranges, the
`decorations.sort` comparator or an overlap between a `mark` and a `replace` covering the same
range is the first thing to check (a heading's mark spans the whole node while its hide spans only
`HeaderMark`; both are allowed to overlap since one is `mark` and the other `replace`, but two
`replace` decorations must never overlap each other).

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/codemirror/lib/livePreviewPlugin.ts src/modules/markdown/codemirror/lib/livePreviewPlugin.test.ts
git commit -m "feat(markdown): wire the Live Preview planner into a CodeMirror ViewPlugin"
```

---

### Task 7: Assemble the extension set and theme

**Files:**
- Create: `src/modules/markdown/codemirror/lib/markdownExtensions.ts`

**Interfaces:**
- Consumes: `livePreviewPlugin` (Task 6); `useEditorThemeExt` from
  `src/modules/editor/lib/useEditorThemeExt.ts` (existing, unchanged, called by Task 9 and passed
  in here as a parameter, since it is a React hook and this file is not a component).
- Produces: `buildLivePreviewExtensions(themeExt: Extension): Extension[]`, consumed by Task 9.

- [ ] **Step 1: Implement**

```typescript
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { livePreviewPlugin } from "@/modules/markdown/codemirror/lib/livePreviewPlugin";

// GFM (tables, task lists, strikethrough) plus subscript/superscript/emoji: the
// `markdownLanguage` export already bundles these on top of CommonMark, so no
// manual @lezer/markdown extension list is needed.
export function buildLivePreviewExtensions(themeExt: Extension): Extension[] {
  return [
    markdown({ base: markdownLanguage }),
    livePreviewPlugin,
    themeExt,
    EditorView.lineWrapping,
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "transparent !important",
        outline: "none",
        padding: "8px 16px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-sans, inherit)",
        fontSize: "14px",
        lineHeight: "1.6",
      },
      ".cm-content": { caretColor: "var(--foreground)" },
      ".cm-lp-heading": { fontWeight: "700" },
      ".cm-lp-h1": { fontSize: "1.6em" },
      ".cm-lp-h2": { fontSize: "1.4em" },
      ".cm-lp-h3": { fontSize: "1.2em" },
      ".cm-lp-h4, .cm-lp-h5, .cm-lp-h6": { fontSize: "1.05em" },
      ".cm-lp-bold": { fontWeight: "700" },
      ".cm-lp-italic": { fontStyle: "italic" },
      ".cm-lp-strike": { textDecoration: "line-through" },
      ".cm-lp-code": {
        fontFamily: "var(--font-mono, monospace)",
        backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
        borderRadius: "3px",
        padding: "0 3px",
      },
      ".cm-lp-link-text": { color: "var(--primary, #3b82f6)", textDecoration: "underline" },
      ".cm-lp-bullet": { color: "var(--muted-foreground)" },
      ".cm-lp-checkbox": { marginRight: "4px", cursor: "pointer" },
    }),
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/markdown/codemirror/lib/markdownExtensions.ts
git commit -m "feat(markdown): assemble the Live Preview CodeMirror extension set"
```

---

### Task 8: `CodeMirrorEditor` React component and round-trip fidelity test

**Files:**
- Create: `src/modules/markdown/codemirror/CodeMirrorEditor.tsx`
- Test: `src/modules/markdown/codemirror/CodeMirrorEditor.test.tsx`

**Interfaces:**
- Consumes: `buildLivePreviewExtensions` (Task 7); `useEditorThemeExt` (existing).
- Produces:
  ```typescript
  export type CodeMirrorEditorHandle = { focus(): void };
  type Props = { value: string; onChange: (next: string) => void };
  export const CodeMirrorEditor: ForwardRefExoticComponent<Props & RefAttributes<CodeMirrorEditorHandle>>;
  ```
  Consumed by Task 9.

- [ ] **Step 1: Write the failing tests**

CodeMirror needs real `beforeinput`/composition events to simulate typing, which happy-dom does
not dispatch faithfully, so these tests exercise the same `onChange` wiring through a direct
dispatch on the underlying view instead of synthetic keyboard events. `EditorView.findFromDOM`
recovers the view instance from any of its own DOM nodes, which is how the test reaches it without
`CodeMirrorEditorHandle` needing to expose more than `focus()`.

```tsx
// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { CodeMirrorEditor } from "@/modules/markdown/codemirror/CodeMirrorEditor";

describe("CodeMirrorEditor", () => {
  it("does not report a change on mount, even with frontmatter and embedded HTML", () => {
    const source = "---\ntitle: Note\n---\n\n<div class=\"note\">raw html</div>\n\n# Heading\n";
    const onChange = vi.fn();
    render(<CodeMirrorEditor value={source} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports the exact text back through onChange after an edit, unchanged", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeMirrorEditor value="Hello" onChange={onChange} />);
    const dom = container.querySelector(".cm-content") as HTMLElement;
    const view = EditorView.findFromDOM(dom);
    expect(view).not.toBeNull();
    view?.dispatch({ changes: { from: 0, to: 5, insert: "Hi there" } });
    expect(onChange).toHaveBeenCalledWith("Hi there");
    expect(view?.state.doc.toString()).toBe("Hi there");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/CodeMirrorEditor.test.tsx`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```tsx
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useEditorThemeExt } from "@/modules/editor/lib/useEditorThemeExt";
import { buildLivePreviewExtensions } from "@/modules/markdown/codemirror/lib/markdownExtensions";

export type CodeMirrorEditorHandle = { focus(): void };

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorHandle, Props>(
  function CodeMirrorEditor({ value, onChange }, ref) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    const extensions = useMemo(() => buildLivePreviewExtensions(themeExt), [themeExt]);

    useImperativeHandle(ref, () => ({
      focus: () => cmRef.current?.view?.focus(),
    }));

    return (
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={onChange}
        height="100%"
        className="h-full w-full overflow-auto"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          bracketMatching: false,
          closeBrackets: false,
          autocompletion: false,
        }}
        extensions={extensions}
      />
    );
  },
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/modules/markdown/codemirror/CodeMirrorEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/markdown/codemirror/CodeMirrorEditor.tsx src/modules/markdown/codemirror/CodeMirrorEditor.test.tsx
git commit -m "feat(markdown): add the CodeMirrorEditor component for the Live Preview engine"
```

---

### Task 9: `MarkdownTab` shell (document lifecycle wiring)

**Files:**
- Create: `src/modules/markdown/codemirror/MarkdownTab.tsx`

**Interfaces:**
- Consumes: `useDocument` from `src/modules/editor/lib/useDocument.ts` (existing, unchanged);
  `CodeMirrorEditor`/`CodeMirrorEditorHandle` (Task 8); `MarkdownDocFallback` from
  `src/modules/markdown/lib/MarkdownDocFallback.tsx` (existing, reused after narrowing `doc`'s
  status, see Step 1); `EditorPathBar`, `ReloadConflictOverlay`, `useBackgroundConflictToast` from
  `src/modules/editor` (existing); `useEditorChrome` from
  `src/modules/workspaces/EditorChromeContext` (existing); `TabCallbacks` from
  `src/modules/workspaces/TabContent` (existing).
- Produces: `MarkdownTab(props: { tabId: string; path: string; visible: boolean; focused: boolean; callbacks: TabCallbacks }): JSX.Element`, consumed by Task 10.

- [ ] **Step 1: Implement**

```tsx
import { type JSX, useEffect, useRef } from "react";
import { EditorPathBar, ReloadConflictOverlay, useBackgroundConflictToast } from "@/modules/editor";
import { useDocument } from "@/modules/editor/lib/useDocument";
import {
  CodeMirrorEditor,
  type CodeMirrorEditorHandle,
} from "@/modules/markdown/codemirror/CodeMirrorEditor";
import { MarkdownDocFallback } from "@/modules/markdown/lib/MarkdownDocFallback";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

type Props = {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
};

export function MarkdownTab(props: Props): JSX.Element {
  const editorRef = useRef<CodeMirrorEditorHandle>(null);
  const { workspaceRoot, home, gitRootPath } = useEditorChrome();

  const { doc, conflict, keepLocalChanges, reloadFromDisk, onChange, save } = useDocument({
    path: props.path,
    tabId: props.tabId,
    onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
  });

  useBackgroundConflictToast(conflict, props.visible, props.path);

  const saveRef = useRef(save);
  saveRef.current = save;
  const registerMarkdownSaveHandlerRef = useRef(props.callbacks.registerMarkdownSaveHandler);
  registerMarkdownSaveHandlerRef.current = props.callbacks.registerMarkdownSaveHandler;
  useEffect(() => {
    registerMarkdownSaveHandlerRef.current?.(props.tabId, () => saveRef.current());
    return () => registerMarkdownSaveHandlerRef.current?.(props.tabId, null);
  }, [props.tabId]);

  useEffect(() => {
    if (props.focused) editorRef.current?.focus();
  }, [props.focused]);

  return (
    <div className="flex h-full w-full flex-col">
      <EditorPathBar
        path={props.path}
        tabId={props.tabId}
        workspaceRoot={workspaceRoot}
        home={home}
        gitRootPath={gitRootPath}
        onRevealPath={(p) => props.callbacks.onFocusOnExplorer?.(p)}
        onFocusOnExplorer={props.callbacks.onFocusOnExplorer}
        onRenameFile={props.callbacks.onRenameFile}
        onSetAsRoot={props.callbacks.onSetAsRoot}
        onNewWorkspaceFromFolder={props.callbacks.onNewWorkspaceFromFolder}
        onRevealInTerminal={props.callbacks.onRevealInTerminal}
        onAddToGitignore={props.callbacks.onAddToGitignore}
      />
      <div className="relative min-h-0 flex-1">
        {doc.status === "ready" ? (
          <CodeMirrorEditor ref={editorRef} value={doc.content} onChange={onChange} />
        ) : doc.status === "loading" || doc.status === "deleted" ? null : (
          <MarkdownDocFallback doc={doc} />
        )}
        {conflict && (
          <ReloadConflictOverlay
            path={props.path}
            onKeep={keepLocalChanges}
            onReload={reloadFromDisk}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual check (deferred to Task 12's checklist)**

This component has no isolated unit test of its own: it is a thin wire-up of already-tested pieces
(`useDocument`, `CodeMirrorEditor`, `EditorPathBar`, `ReloadConflictOverlay`). Its behavior is
verified once wired into the running app in Task 12's manual checklist, the same way `MilkdownTab`
and the TipTap `MarkdownTab` have no dedicated shell test.

- [ ] **Step 3: Commit**

```bash
git add src/modules/markdown/codemirror/MarkdownTab.tsx
git commit -m "feat(markdown): add the Live Preview tab shell"
```

---

### Task 10: Wire into `TabContent`

**Files:**
- Modify: `src/modules/workspaces/TabContent.tsx:52-57` (lazy imports), `:411-426` (engine switch)

**Interfaces:**
- Consumes: `MarkdownTab` from `src/modules/markdown/codemirror/MarkdownTab` (Task 9).

- [ ] **Step 1: Add the lazy import**

Next to the existing `MilkdownTab` lazy import:

```typescript
const CodeMirrorMarkdownTab = lazy(() =>
  import("@/modules/markdown/codemirror/MarkdownTab").then((m) => ({ default: m.MarkdownTab as ComponentType<any> })),
);
```

- [ ] **Step 2: Add the switch branch**

Immediately after the existing `if (tabMarkdownEngine === "milkdown") { ... }` block (around line
425), before the final `legacy` fallback:

```typescript
      if (tabMarkdownEngine === "codemirror") {
        return (
          <Suspense fallback={null}>
            <CodeMirrorMarkdownTab tabId={tab.id} path={tab.path} visible={visible} focused={focused} callbacks={callbacks} />
          </Suspense>
        );
      }
```

- [ ] **Step 3: Manual check**

Run `pnpm tauri dev`, set Settings > Editor > Markdown editor to "Live Preview", open a `.md` file
as a `markdown` tab, confirm it renders through the new engine (headings/bold/italic decorated,
task-list checkbox clickable, frontmatter shown plain).

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/TabContent.tsx
git commit -m "feat(markdown): mount the Live Preview engine from the markdown tab"
```

---

### Task 11: Documentation updates

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/FORK.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md` (glossary table)

- [ ] **Step 1: `docs/ARCHITECTURE.md`**

Find the section describing the `markdown` tab's engines (added when Milkdown landed) and add a
fourth bullet:

```markdown
- `codemirror` ("Live Preview" in Settings): a CodeMirror 6 editor that decorates raw markdown
  text in place (Obsidian-style hide/reveal of syntax markers on the active line) and never
  transforms the saved bytes. No outline, no toolbar, no read-only preview variant. See
  `docs/superpowers/specs/2026-09-27-live-preview-markdown-editor-design.md`.
```

- [ ] **Step 2: `docs/FORK.md`**

Add a divergence entry under the markdown-editor evaluation section (next to the Milkdown entry):

```markdown
- Added a fourth `markdown` tab engine, "Live Preview" (CodeMirror 6, evaluation stage): edits the
  raw markdown text directly with Obsidian-style live-preview decorations, never reparsing to an
  AST. Gaps vs TipTap/Milkdown: no outline panel, no toolbar, no read-only preview integration.
```

- [ ] **Step 3: `AGENTS.md`**

In the `markdown/` module-layout bullet (module layout list under "Frontend (`src/`)"), add:

```markdown
  `codemirror/` is a fourth evaluation-stage engine (lazy chunk `MarkdownTab`) built directly on
  CodeMirror 6: it never parses to an AST, only decorates the raw text (see `docs/FORK.md`).
```

- [ ] **Step 4: `CLAUDE.md` glossary**

Add a row to the glossary table, after the MilkdownTab / MilkdownEditor row:

```markdown
| **Live Preview engine** | Fourth markdown-tab engine (`markdownEngine: "codemirror"`), built directly on CodeMirror 6 with Obsidian-style decorations; never parses to an AST, no outline/toolbar/read-only preview | `src/modules/markdown/codemirror/` | "live preview", "el editor de codemirror", "el cuarto motor" |
```

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md docs/FORK.md AGENTS.md CLAUDE.md
git commit -m "docs: document the Live Preview markdown engine"
```

---

### Task 12: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 2: Type-check**

Run: `pnpm check-types`
Expected: no errors. Pay particular attention to `renderEngine.ts` (Task 2) and any place a
`MarkdownEngine` switch was previously exhaustive over three values.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: all green, including every test added in Tasks 1-8.

- [ ] **Step 4: Manual checklist**

With `pnpm tauri dev` running and Settings > Editor > Markdown editor set to "Live Preview":

- Open a note containing frontmatter, a heading, bold, italic, strikethrough, inline code, a link,
  a bullet list, a task list, and an embedded HTML block (e.g. a raw `<div>...</div>`). Confirm
  each markdown construct is decorated and its marker hides when the cursor is elsewhere, reveals
  when the cursor is on that line.
- Confirm the frontmatter block and the embedded HTML block both render in plain monospace, never
  decorated, and that neither causes a console error.
- Click a task-list checkbox; confirm the file's text toggles between `[ ]` and `[x]` and the tab
  shows dirty until autosave/Cmd+S.
- Save (Cmd+S), reopen the file in a plain-text `editor` tab, confirm the raw text is byte-identical
  to what was written (no reformatting).
- Edit the file externally (e.g. `echo >> ` from a terminal) while the tab is dirty; confirm the
  existing conflict overlay appears instead of a silent overwrite.
- Confirm Settings > Editor > Markdown editor still has exactly four options and switching back to
  TipTap/Milkdown/Preview only still works.

- [ ] **Step 5: Merge to main**

Per this project's convention (`CLAUDE.md`: "Al terminar una tarea en un worktree, se mezcla
directamente a main y se borra el worktree, sin abrir PR"), once all of the above is green:

```bash
git log --oneline main..HEAD
```

Review the commit list, then merge and clean up (run from the main checkout, not this worktree):

```bash
git merge --no-ff worktree-markdown-live-preview-editor
git worktree remove .claude/worktrees/markdown-live-preview-editor
git branch -d worktree-markdown-live-preview-editor
```
