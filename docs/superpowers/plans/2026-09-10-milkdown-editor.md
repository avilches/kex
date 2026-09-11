# Milkdown Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Milkdown 7 Crepe WYSIWYG editor as a third engine for the `markdown` tab, make the engine a per-tab property persisted in the workspace JSON with the default exposed in Settings, and render the editor tab's markdown preview with that engine instead of always with the legacy renderer.

**Architecture:** A pure module `src/modules/markdown/lib/markdownEngine.ts` owns the engine type, its parser and the resolver `resolveMarkdownEngine(tabEngine, preference)`. The `markdown` and `editor` tab kinds carry an optional `markdownEngine` field that is sealed at creation inside `openTab` (the single funnel every creation path goes through) and read at render time, so the preference only decides what new tabs are born with. `TabContent` switches the `markdown` tab on the resolved engine between the legacy preview, the existing TipTap `MarkdownTab` (moved to `markdown/tiptap/`) and the new lazy `MilkdownTab`. Read-only rendering (the editor tab's split and overlay preview, plus the legacy markdown tab) goes through one new component, `MarkdownRenderPane`, which takes a markdown string and an engine and owns no document layer and no save path at all. The mode-agnostic tab shell shared by both rich engines is extracted into `useMarkdownTabController` + `MarkdownDocFallback`.

**Tech Stack:** React 19, TypeScript, @milkdown/crepe + @milkdown/kit (latest 7.x), @milkdown/plugin-diagram, katex + mermaid (already dependencies, dynamic imports), CodeMirror 6 (existing, Source mode), TipTap 3 (existing), vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-09-10-milkdown-editor-design.md`. Read it before starting; its numbered decisions are binding. It revises `2026-07-07-milkdown-editor-design.md`, and this plan revises `2026-07-07-milkdown-editor.md` (never started).

## Global Constraints

- pnpm only, never npm/npx/yarn.
- No em-dash anywhere (code, comments, commits, docs). No emojis anywhere.
- Frontend imports always `@/...`, never relative across modules.
- Comments: default none; if genuinely needed, 1-2 lines on why, never what. No AI filler.
- Work in the worktree at `.claude/worktrees/milkdown-editor`; never switch the main worktree off `main`.
- Commit with `git commit -m "..." -- <paths>` (path-scoped) so no unrelated staged file is swept into a commit. Verify each commit with `git show --name-only --format="" HEAD`.
- Commit messages in English, atomic, no `Co-authored-by`, no Claude or AI mentions of any kind.
- No backward compatibility code, no migrations, no old-key fallbacks. A stale `markdownEditor` key in `settings-editor.json` is simply ignored.
- Strict lazy-loading: `MilkdownTab` and the Milkdown branch of `MarkdownRenderPane` are `React.lazy` chunks; Crepe and its CSS load only inside that chunk; `@milkdown/plugin-diagram` (and therefore mermaid) loads only when a document contains a mermaid fence; katex loads on demand through Crepe's Latex feature.
- Shortcuts only via the `SHORTCUTS` registry and `matchesShortcut`; never compare raw keys. This plan adds no new shortcut ids: it reuses `editor.save`, `markdown.toggleSource`, `markdown.toggleOutline`, `search.focus`.
- Settings form controls use the shadcn primitives (`RadioGroup`, `Switch`, `Checkbox`), never native inputs with ad-hoc styles.
- All entity ids come from `nid()` helpers in `src/lib/ids.ts` (`newTabId()`), never `crypto.randomUUID()` or `Math.random()`.
- Milkdown API ground truth is the installed package's type definitions (`node_modules/@milkdown/crepe/lib/*.d.ts`). If a signature differs from this plan, adapt to the installed API and say so in the commit body.
- Living docs (`docs/ARCHITECTURE.md`, `docs/IPC.md` if commands change, `docs/FORK.md`, `docs/BUILD.md`, `docs/MARKDOWN_GOTCHAS.md`, `AGENTS.md`, `CLAUDE.md` glossary) updated in the same commit as the code they describe.
- Verification before claiming any task done: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`. Rust is untouched by this plan.

---

### Task 1: Engine type, parser and resolver (pure core) plus the preference rename

**Files:**
- Create: `src/modules/markdown/lib/markdownEngine.ts`
- Create: `src/modules/markdown/lib/markdownEngine.test.ts`
- Modify: `src/modules/settings/store.ts` (replace `MarkdownEditorMode` / `parseMarkdownEditor` / `KEY_MARKDOWN_EDITOR` with the engine module's type and a `markdownEngine` key, add `setMarkdownEngine`)
- Modify: `src/modules/workspaces/TabContent.tsx` (read the renamed preference)
- Modify: `docs/ARCHITECTURE.md` (JSON-only list no longer contains the markdown editor preference)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by every later task):

```ts
export type MarkdownEngine = "tiptap" | "milkdown" | "legacy";
export const MARKDOWN_ENGINES: readonly MarkdownEngine[];
export function parseMarkdownEngine(value: unknown): MarkdownEngine;
export function resolveMarkdownEngine(
  tabEngine: MarkdownEngine | undefined,
  preference: MarkdownEngine,
): MarkdownEngine;
```

Plus, from `src/modules/settings/store.ts`: `setMarkdownEngine(value: MarkdownEngine): Promise<void>` and the preference field `markdownEngine: MarkdownEngine`.

The engine type lives in `markdown/lib/` and not in the settings store on purpose: `src/modules/workspaces/lib/types.ts` needs the type in Task 4, and importing the store there would pull `tauri-plugin-store` side effects into a pure type module.

- [ ] **Step 1: Write the failing test**

Create `src/modules/markdown/lib/markdownEngine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MARKDOWN_ENGINES,
  parseMarkdownEngine,
  resolveMarkdownEngine,
} from "@/modules/markdown/lib/markdownEngine";

describe("parseMarkdownEngine", () => {
  it("accepts the three engines", () => {
    expect(parseMarkdownEngine("tiptap")).toBe("tiptap");
    expect(parseMarkdownEngine("milkdown")).toBe("milkdown");
    expect(parseMarkdownEngine("legacy")).toBe("legacy");
  });

  it("falls back to tiptap for anything else", () => {
    expect(parseMarkdownEngine("rich")).toBe("tiptap");
    expect(parseMarkdownEngine(undefined)).toBe("tiptap");
    expect(parseMarkdownEngine(null)).toBe("tiptap");
    expect(parseMarkdownEngine(7)).toBe("tiptap");
    expect(parseMarkdownEngine("Milkdown")).toBe("tiptap");
  });

  it("lists every engine exactly once", () => {
    expect([...MARKDOWN_ENGINES]).toEqual(["tiptap", "milkdown", "legacy"]);
  });
});

describe("resolveMarkdownEngine", () => {
  it("prefers the tab's own engine", () => {
    expect(resolveMarkdownEngine("milkdown", "tiptap")).toBe("milkdown");
    expect(resolveMarkdownEngine("legacy", "milkdown")).toBe("legacy");
  });

  it("falls back to the preference when the tab has none", () => {
    expect(resolveMarkdownEngine(undefined, "milkdown")).toBe("milkdown");
  });

  it("falls back to the preference when the tab value is not an engine", () => {
    expect(resolveMarkdownEngine("rich" as never, "legacy")).toBe("legacy");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- markdownEngine`
Expected: FAIL, "Cannot find module ... markdownEngine".

- [ ] **Step 3: Implement the module**

Create `src/modules/markdown/lib/markdownEngine.ts`:

```ts
export type MarkdownEngine = "tiptap" | "milkdown" | "legacy";

export const MARKDOWN_ENGINES: readonly MarkdownEngine[] = [
  "tiptap",
  "milkdown",
  "legacy",
] as const;

export const DEFAULT_MARKDOWN_ENGINE: MarkdownEngine = "tiptap";

function isEngine(value: unknown): value is MarkdownEngine {
  return (
    value === "tiptap" || value === "milkdown" || value === "legacy"
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- markdownEngine`
Expected: PASS (6 tests).

- [ ] **Step 5: Rename the preference in the store**

In `src/modules/settings/store.ts`, make exactly these edits:

1. Delete `export type MarkdownEditorMode = "rich" | "legacy";` (near line 53) and `export function parseMarkdownEditor` (near line 487). Re-export the new type instead, next to the other type exports, so existing importers of the store keep one import site:

```ts
export type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";
```

and import what the store needs:

```ts
import {
  type MarkdownEngine,
  parseMarkdownEngine,
} from "@/modules/markdown/lib/markdownEngine";
```

2. Rename the key constant (near line 283): `const KEY_MARKDOWN_ENGINE = "markdownEngine";` replacing `KEY_MARKDOWN_EDITOR`.
3. In the `Preferences` type (near line 200) replace the field, dropping the JSON-only comment:

```ts
  markdownEngine: MarkdownEngine;
```

4. In `DEFAULT_PREFERENCES` (near line 428): `markdownEngine: "tiptap",`.
5. In the preference reader (near line 688): `markdownEngine: parseMarkdownEngine(get(KEY_MARKDOWN_ENGINE)),`.
6. In the editor-store defaults seeding (near line 756): use `KEY_MARKDOWN_ENGINE` and `DEFAULT_PREFERENCES.markdownEngine`.
7. In `EDITOR_PREF_KEY_MAP` (near line 1222): `[KEY_MARKDOWN_ENGINE]: "markdownEngine",`.
8. Add the setter next to `setDiffViewMode` (near line 1125), following the same shape:

```ts
export async function setMarkdownEngine(value: MarkdownEngine): Promise<void> {
  await writeEditorPref(KEY_MARKDOWN_ENGINE, value);
}
```

Then `git grep -n "markdownEditor\|MarkdownEditorMode\|parseMarkdownEditor" -- src` and fix every remaining hit. In `src/modules/workspaces/TabContent.tsx` (near line 130 and line 367) that means:

```ts
const markdownEngine = usePreferencesStore((s) => s.markdownEngine);
// ...
if (markdownEngine === "tiptap") {
```

Task 4 replaces that comparison with the per-tab resolver and Task 11 adds the third branch. Until then a workspace whose preference says `milkdown` renders the legacy preview; that is an intermediate state of this branch, not a shipped behavior.

- [ ] **Step 6: Update the JSON-only documentation**

In `docs/ARCHITECTURE.md`, find the list of JSON-only preferences and remove the markdown editor entry (the preference gets a Settings control in Task 2). Leave `markdownWikiLinks` in the list. Do not touch the `CLAUDE.md` JSON-only list yet if it does not mention this preference; `git grep -n "JSON-only" -- docs CLAUDE.md AGENTS.md` to check.

- [ ] **Step 7: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "refactor(markdown): introduce markdownEngine type, parser and resolver" -- src/modules/markdown/lib/markdownEngine.ts src/modules/markdown/lib/markdownEngine.test.ts src/modules/settings/store.ts src/modules/workspaces/TabContent.tsx docs/ARCHITECTURE.md
git show --name-only --format="" HEAD
```

---

### Task 2: Settings control for the default engine

**Files:**
- Modify: `src/settings/sections/EditorSection.tsx`

**Interfaces:**
- Consumes: `setMarkdownEngine` and the `markdownEngine` preference (Task 1); `RadioGroup` / `RadioGroupItem` from `@/components/ui/radio-group`; `SettingRow` from `../components/SettingRow`.
- Produces: no new exports. A user-visible control in Settings > Editor.

- [ ] **Step 1: Read the reference implementations**

Read the scratchpad `RadioGroup` in `src/settings/sections/TerminalSection.tsx` and the `Text Editors` one in `src/settings/sections/ExternalEditorsSection.tsx`. Copy their exact class names and label wiring. Read how `EditorSection.tsx` groups rows (`SettingRow` inside a `flex flex-col gap-2` block, with `FieldLabel` headers) and place the new row in the block that already holds `Auto save` and `Diff layout`.

- [ ] **Step 2: Add the control**

In `src/settings/sections/EditorSection.tsx`, add the imports:

```tsx
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type MarkdownEngine, setMarkdownEngine } from "@/modules/settings/store";
```

read the value near the other preference reads:

```tsx
const markdownEngine = usePreferencesStore((s) => s.markdownEngine);
```

and render the row after `Diff layout`:

```tsx
<SettingRow
  title="Markdown editor"
  description="Which engine opens markdown files. Tabs that are already open keep the engine they were opened with."
>
  <RadioGroup
    value={markdownEngine}
    onValueChange={(v) => void setMarkdownEngine(v as MarkdownEngine)}
    className="gap-1.5"
  >
    <div className="flex items-center gap-2">
      <RadioGroupItem value="tiptap" id="markdown-engine-tiptap" />
      <label htmlFor="markdown-engine-tiptap" className="cursor-pointer text-[12px]">
        TipTap
      </label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="milkdown" id="markdown-engine-milkdown" />
      <label htmlFor="markdown-engine-milkdown" className="cursor-pointer text-[12px]">
        Milkdown
      </label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="legacy" id="markdown-engine-legacy" />
      <label htmlFor="markdown-engine-legacy" className="cursor-pointer text-[12px]">
        Preview only
      </label>
    </div>
  </RadioGroup>
</SettingRow>
```

If `SettingRow`'s layout puts the control on a single row and three stacked radios break it, check how `TerminalSection` handles its multi-option row and follow that (it may need the vertical variant or a wrapping `div`); match the existing look rather than inventing spacing.

- [ ] **Step 3: Verify in the real window**

Run `pnpm tauri dev`, open Settings (the Editor section), and confirm: the three options render, the current one is selected, choosing another persists (close and reopen Settings), and `user-data/support/settings-editor.json` now holds `"markdownEngine": "<choice>"`.

- [ ] **Step 4: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(settings): choose the default markdown engine in Settings > Editor" -- src/settings/sections/EditorSection.tsx
git show --name-only --format="" HEAD
```

---

### Task 3: Rename the directory markdown/rich to markdown/tiptap

**Files:**
- Rename: `src/modules/markdown/rich/` to `src/modules/markdown/tiptap/` (every file inside, including `richMarkdown.css`, `extensions/`, `lib/`, tests)
- Modify: every importer of `@/modules/markdown/rich/...`
- Modify: `AGENTS.md`, `CLAUDE.md` (glossary rows naming `markdown/rich/`), `docs/ARCHITECTURE.md`, `docs/MARKDOWN_GOTCHAS.md` if they cite the path

**Interfaces:**
- Consumes: nothing.
- Produces: the same exports at new paths. `RichMarkdownEditor` and `MarkdownTab` keep their names: they are this engine's internals.

- [ ] **Step 1: Move the directory with git**

```bash
git mv src/modules/markdown/rich src/modules/markdown/tiptap
```

- [ ] **Step 2: Fix every import**

```bash
git grep -ln "modules/markdown/rich" -- src
```

Rewrite each hit to `@/modules/markdown/tiptap/...`. Watch for the lazy import in `src/modules/workspaces/TabContent.tsx` and any CSS import of `richMarkdown.css`. Do not rename the CSS file itself.

- [ ] **Step 3: Verify nothing points at the old path**

```bash
git grep -n "markdown/rich" -- src docs AGENTS.md CLAUDE.md
```

Expected: only prose in `docs/superpowers/` history files (specs and plans from July, which are historical records and must not be rewritten) and the superseded-plan citations. Update `AGENTS.md`, `CLAUDE.md` and `docs/ARCHITECTURE.md` prose to the new path.

- [ ] **Step 4: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green, same number of passing tests as before the rename.

```bash
git commit -m "refactor(markdown): rename the rich module directory to tiptap" -- src AGENTS.md CLAUDE.md docs/ARCHITECTURE.md docs/MARKDOWN_GOTCHAS.md
git show --name-only --format="" HEAD
```

---

### Task 4: Per-tab engine field, sealed at creation, read at render

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts` (add the field to the `editor` and `markdown` tab kinds)
- Create: `src/modules/markdown/lib/sealMarkdownEngine.ts`
- Create: `src/modules/markdown/lib/sealMarkdownEngine.test.ts`
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts` (seal inside the creation funnels, preserve on conversion)
- Modify: `src/modules/workspaces/TabContent.tsx` (resolve per tab, and preserve the field in the markdown-to-editor conversion near line 395)
- Test: `src/modules/workspaces/lib/workspaceState.test.ts` (restore keeps two same-path tabs with different engines)

**Interfaces:**
- Consumes: `MarkdownEngine`, `resolveMarkdownEngine` (Task 1); `Tab` from `src/modules/workspaces/lib/types.ts`; `isMarkdownPath` from `@/lib/utils`.
- Produces (used by Tasks 11 and 12):

```ts
// src/modules/markdown/lib/sealMarkdownEngine.ts
export function sealMarkdownEngine<T extends Tab>(tab: T, engine: MarkdownEngine): T;
```

and the tab shape:

```ts
| (TabCommon & { kind: "editor"; path: string; dirty: boolean; preview: boolean;
    previewMode?: "overlay" | "split"; overrideLanguage?: string | null;
    markdownEngine?: MarkdownEngine })
| (TabCommon & { kind: "markdown"; path: string; dirty?: boolean;
    markdownEngine?: MarkdownEngine })
```

- [ ] **Step 1: Write the failing sealing test**

Create `src/modules/markdown/lib/sealMarkdownEngine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sealMarkdownEngine } from "@/modules/markdown/lib/sealMarkdownEngine";
import type { Tab } from "@/modules/workspaces/lib/types";

const markdownTab: Tab = { id: "t1", kind: "markdown", path: "/notes/a.md" };
const editorTab: Tab = { id: "t2", kind: "editor", path: "/notes/a.md", dirty: false, preview: false };
const codeTab: Tab = { id: "t3", kind: "editor", path: "/src/main.ts", dirty: false, preview: false };
const terminalTab: Tab = { id: "t4", kind: "terminal" };

describe("sealMarkdownEngine", () => {
  it("stamps a markdown tab with the engine", () => {
    expect(sealMarkdownEngine(markdownTab, "milkdown")).toMatchObject({
      kind: "markdown",
      markdownEngine: "milkdown",
    });
  });

  it("stamps an editor tab whose path is markdown", () => {
    expect(sealMarkdownEngine(editorTab, "tiptap")).toMatchObject({
      markdownEngine: "tiptap",
    });
  });

  it("leaves a non-markdown editor tab untouched", () => {
    expect(sealMarkdownEngine(codeTab, "milkdown")).toBe(codeTab);
  });

  it("leaves other tab kinds untouched", () => {
    expect(sealMarkdownEngine(terminalTab, "milkdown")).toBe(terminalTab);
  });

  it("never overwrites an engine the tab already carries", () => {
    const explicit: Tab = { ...markdownTab, markdownEngine: "legacy" };
    expect(sealMarkdownEngine(explicit, "milkdown")).toBe(explicit);
  });
});
```

Run: `pnpm test -- sealMarkdownEngine`
Expected: FAIL (module missing).

- [ ] **Step 2: Add the field to the tab type**

In `src/modules/workspaces/lib/types.ts`, import the type and extend the two kinds exactly as shown in the Interfaces block above:

```ts
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";
```

The field is optional so that a hand-edited workspace JSON with the field deleted still loads and resolves to the preference. That is the defined meaning of a missing field, not compatibility code.

- [ ] **Step 3: Implement the sealing helper**

Create `src/modules/markdown/lib/sealMarkdownEngine.ts`:

```ts
import { isMarkdownPath } from "@/lib/utils";
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";
import type { Tab } from "@/modules/workspaces/lib/types";

// Every tab that can render markdown carries the engine it was opened with, so
// the workspace JSON is explicit and hand-editable, and so changing the default
// never reinterprets a tab that is already open.
export function sealMarkdownEngine<T extends Tab>(tab: T, engine: MarkdownEngine): T {
  if (tab.kind !== "markdown" && tab.kind !== "editor") return tab;
  if (tab.markdownEngine != null) return tab;
  if (tab.kind === "editor" && !isMarkdownPath(tab.path)) return tab;
  return { ...tab, markdownEngine: engine };
}
```

Run: `pnpm test -- sealMarkdownEngine`
Expected: PASS (5 tests).

- [ ] **Step 4: Seal inside the creation funnels**

Read `src/modules/workspaces/lib/useWorkspaces.ts` and find every function that puts a caller-provided `Tab` into the tree: `openTab` (near line 503), plus `splitPaneAndOpenTab` and `replaceTab` (grep for them; there may be more, `git grep -n "tabs: \[" -- src/modules/workspaces/lib/useWorkspaces.ts` helps). Seal at those funnels rather than at the dozens of call sites, so no future creation path can forget it:

```ts
import { sealMarkdownEngine } from "@/modules/markdown/lib/sealMarkdownEngine";
import { usePreferencesStore } from "@/modules/settings/preferences";
// inside each funnel, before the tab is inserted:
const sealed = sealMarkdownEngine(tab, usePreferencesStore.getState().markdownEngine);
```

Read the preference with `getState()` (not the hook) so sealing happens at the moment of creation and does not subscribe these callbacks to preference changes.

In `setTabView` (near line 647) both conversions rebuild the tab from scratch and drop unlisted fields; add `markdownEngine: p.markdownEngine` to both returned objects so switching between rendered and raw keeps the engine.

Do the same in `src/modules/workspaces/TabContent.tsx` near line 395, where the markdown tab's split action rebuilds the tab as an `editor`.

- [ ] **Step 5: Resolve the engine at render time**

In `src/modules/workspaces/TabContent.tsx`, replace the direct preference comparison from Task 1 Step 5 with the resolver, computed above the switch next to `effectivePreviewMode` (it is needed by both the `markdown` and the `editor` case):

```ts
const markdownEnginePref = usePreferencesStore((s) => s.markdownEngine);
const tabMarkdownEngine =
  tab.kind === "markdown" || tab.kind === "editor"
    ? resolveMarkdownEngine(tab.markdownEngine, markdownEnginePref)
    : markdownEnginePref;
```

and in `case "markdown"`: `if (tabMarkdownEngine === "tiptap") { ... }`.

- [ ] **Step 6: Write the restore test**

`src/modules/workspaces/lib/workspaceState.test.ts` already covers `sanitizeTab` / `sanitizeWorkspace`. Add cases proving the hand-edited JSON workflow works (this is the whole point of the feature, so it gets a test, not a manual check):

```ts
it("keeps two same-path markdown tabs with different engines", () => {
  const ws = {
    id: "ws-1",
    title: "W",
    activePaneId: "pane-1",
    paneTree: {
      kind: "pane" as const,
      id: "pane-1",
      activeTabId: "tab-1",
      tabs: [
        { id: "tab-1", kind: "markdown" as const, path: "/n/a.md", markdownEngine: "tiptap" as const },
        { id: "tab-2", kind: "markdown" as const, path: "/n/a.md", markdownEngine: "milkdown" as const },
      ],
    },
  } as unknown as Parameters<typeof sanitizeWorkspace>[0];

  const out = sanitizeWorkspace(ws);
  const tabs = (out.paneTree as { tabs: Array<{ id: string; markdownEngine?: string }> }).tabs;
  expect(tabs).toHaveLength(2);
  expect(tabs.map((t) => t.markdownEngine)).toEqual(["tiptap", "milkdown"]);
});
```

Match the surrounding test file's existing helpers and workspace fixture shape instead of the cast above if it already has one.

Run: `pnpm test -- workspaceState`
Expected: PASS.

- [ ] **Step 7: Manual check of the comparison workflow**

Run `pnpm tauri dev`, open a `.md`, quit the app. Edit `user-data/support/workspaces/<id>.json`: duplicate the markdown tab object inside a pane's `tabs` array, give the copy a new `id` (any unique string) and set the two `markdownEngine` values to `"tiptap"` and `"legacy"`. Reopen the app: both tabs exist, each renders with its own engine, and dragging one into a split shows them side by side. Milkdown enters this check in Task 11.

- [ ] **Step 8: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(markdown): persist the markdown engine per tab in the workspace state" -- src/modules/markdown/lib/sealMarkdownEngine.ts src/modules/markdown/lib/sealMarkdownEngine.test.ts src/modules/workspaces/lib/types.ts src/modules/workspaces/lib/useWorkspaces.ts src/modules/workspaces/lib/workspaceState.test.ts src/modules/workspaces/TabContent.tsx
git show --name-only --format="" HEAD
```

---

### Task 5: Shared tab shell (useMarkdownTabController + MarkdownDocFallback)

**Files:**
- Create: `src/modules/markdown/lib/markdownTabShell.ts` (the pure decisions the controller executes)
- Create: `src/modules/markdown/lib/markdownTabShell.test.ts`
- Create: `src/modules/markdown/lib/useMarkdownTabController.ts`
- Create: `src/modules/markdown/lib/MarkdownDocFallback.tsx`
- Modify: `src/modules/markdown/tiptap/MarkdownTab.tsx` (refactor onto the shared pieces, behavior-preserving)

**Testing note that shapes this task:** this project has no React component or hook test anywhere, no `@testing-library/react`, and no vitest setup file; DOM-needing tests declare `// @vitest-environment happy-dom` on their first line and exercise pure functions or ProseMirror directly. So the controller is NOT tested by rendering it. Its decisions are extracted into pure functions that get the tests, and the hook stays a thin shell that executes them, which is also what `AGENTS.md` asks for (functional core, thin imperative shell). Do not add a testing-library dependency for this.

**Interfaces:**
- Consumes: `useMarkdownDocument({ path, onDirtyChange }) -> { doc, onChange, setBaseline, save, reload }` from `src/modules/markdown/lib/useMarkdownDocument.ts`; `matchesShortcut` from `@/modules/shortcuts/shortcuts`; `usePreferencesStore` from `@/modules/settings/preferences`.
- Produces (used verbatim by Task 10):

```ts
export type MarkdownTabMode = "rich" | "source";

export function useMarkdownTabController(opts: {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  serializeRich: () => string | null;   // markdown from the rich surface, null if not mounted
  saveSource: () => Promise<void>;      // EditorPaneHandle.save passthrough
  onToggleOutline?: () => void;
}): {
  mode: MarkdownTabMode;
  doc: MarkdownDocState;
  onChange: (body: string) => void;
  setBaseline: (md: string) => void;
  save: () => Promise<void>;
  reload: () => void;
  toggleMode: () => Promise<void>;
  saveNow: () => Promise<void>;
  handleShortcut: (e: KeyboardEvent) => boolean;  // true if consumed
};

export function MarkdownDocFallback(props: { doc: MarkdownDocState }): JSX.Element | null;
```

`setBaseline` is part of the returned surface because the current `MarkdownTab` uses it for the fix that stops a no-edit session from rewriting the file (see `docs/MARKDOWN_GOTCHAS.md`); Milkdown needs the same guarantee, so it must not stay private to the tiptap tab.

- [ ] **Step 1: Read the current MarkdownTab end to end**

Read `src/modules/markdown/tiptap/MarkdownTab.tsx`. Identify precisely: the `mode` state; `toggleMode` (rich to source serializes, `onChange`, `await save()`, then swaps, and on a save rejection it toasts "Could not switch mode" and stays put; source to rich awaits `editorPaneRef.save()`, then `reload()`, then swaps); the `onKeyDownCapture` handler matching `editor.save`, `markdown.toggleSource`, `markdown.toggleOutline` and (rich only) `search.focus`; the baseline effect that calls `setBaseline` once per ready revision; and the `binary` / `toolarge` / `error` / `loading` fallback JSX inside `richContent()` including the local `formatBytes` helper. Those exact behaviors move; nothing may change functionally.

- [ ] **Step 2: Write the failing test for the pure shell decisions**

Create `src/modules/markdown/lib/markdownTabShell.test.ts` (no DOM, no React):

```ts
import { describe, expect, it } from "vitest";
import {
  type MarkdownTabAction,
  planModeSwitch,
  planSave,
} from "@/modules/markdown/lib/markdownTabShell";

describe("planModeSwitch", () => {
  it("leaving rich mode flushes the rich surface, saves, then swaps", () => {
    expect(planModeSwitch("rich")).toEqual({
      flushRich: true,
      saveDoc: true,
      saveSource: false,
      reload: false,
      nextMode: "source",
    });
  });

  it("leaving source mode saves the source pane, reloads, then swaps", () => {
    expect(planModeSwitch("source")).toEqual({
      flushRich: false,
      saveDoc: false,
      saveSource: true,
      reload: true,
      nextMode: "rich",
    });
  });
});

describe("planSave", () => {
  it("saves the document through the rich surface in rich mode", () => {
    expect(planSave("rich")).toEqual({ flushRich: true, saveDoc: true, saveSource: false });
  });

  it("saves through the source pane in source mode", () => {
    expect(planSave("source")).toEqual({ flushRich: false, saveDoc: false, saveSource: true });
  });
});
```

Add a second test file for the shortcut routing, which needs the real registry but no DOM, `src/modules/markdown/lib/markdownTabShortcut.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { routeMarkdownShortcut } from "@/modules/markdown/lib/markdownTabShell";
import { SHORTCUTS } from "@/modules/shortcuts/shortcuts";

// Build a synthetic event from the registry's own default binding, so the test
// keeps passing when a default changes and fails if an id disappears.
function eventFor(id: string): KeyboardEvent {
  const entry = SHORTCUTS.find((s) => s.id === id);
  if (!entry) throw new Error(`unknown shortcut id: ${id}`);
  const binding = entry.defaultBindings[0];
  // Adapt this to the real binding shape in shortcuts.ts (string like "Mod+S"
  // or an object); parse it into the KeyboardEventInit the matcher expects.
  return new KeyboardEvent("keydown", bindingToEventInit(binding));
}

describe("routeMarkdownShortcut", () => {
  it("routes the save shortcut", () => {
    expect(routeMarkdownShortcut(eventFor("editor.save"), {}, true)).toBe("save");
  });

  it("routes the source toggle", () => {
    expect(routeMarkdownShortcut(eventFor("markdown.toggleSource"), {}, true)).toBe("toggleSource");
  });

  it("routes the outline toggle only when the caller supports it", () => {
    const e = eventFor("markdown.toggleOutline");
    expect(routeMarkdownShortcut(e, {}, true)).toBe("toggleOutline");
    expect(routeMarkdownShortcut(e, {}, false)).toBe(null);
  });

  it("returns null for an unrelated key", () => {
    expect(routeMarkdownShortcut(new KeyboardEvent("keydown", { key: "q" }), {}, true)).toBe(null);
  });
});
```

Read `src/modules/shortcuts/shortcuts.ts` first to learn the real shape of `defaultBindings` and write the small `bindingToEventInit` helper inside the test file accordingly. If `matchesShortcut` needs a `KeyboardEvent` field happy-dom does not provide, add `// @vitest-environment happy-dom` as the first line of this file, following `src/modules/markdown/lib/roundTrip.test.ts`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- markdownTab`
Expected: FAIL, "Cannot find module ... markdownTabShell".

- [ ] **Step 4: Implement the pure shell, then the controller and the fallback**

Create `src/modules/markdown/lib/markdownTabShell.ts`:

```ts
import { matchesShortcut } from "@/modules/shortcuts/shortcuts";
import type { Preferences } from "@/modules/settings/store";

export type MarkdownTabMode = "rich" | "source";

export type MarkdownTabAction = "save" | "toggleSource" | "toggleOutline";

export type SavePlan = { flushRich: boolean; saveDoc: boolean; saveSource: boolean };

export type ModeSwitchPlan = SavePlan & { reload: boolean; nextMode: MarkdownTabMode };

export function planSave(mode: MarkdownTabMode): SavePlan {
  return mode === "rich"
    ? { flushRich: true, saveDoc: true, saveSource: false }
    : { flushRich: false, saveDoc: false, saveSource: true };
}

export function planModeSwitch(mode: MarkdownTabMode): ModeSwitchPlan {
  return mode === "rich"
    ? { ...planSave("rich"), reload: false, nextMode: "source" }
    : { ...planSave("source"), reload: true, nextMode: "rich" };
}

export function routeMarkdownShortcut(
  e: KeyboardEvent,
  userShortcuts: Preferences["shortcuts"],
  hasOutline: boolean,
): MarkdownTabAction | null {
  if (matchesShortcut(e, "editor.save", userShortcuts)) return "save";
  if (matchesShortcut(e, "markdown.toggleSource", userShortcuts)) return "toggleSource";
  if (hasOutline && matchesShortcut(e, "markdown.toggleOutline", userShortcuts)) {
    return "toggleOutline";
  }
  return null;
}
```

Use the real type of the user shortcut overrides from the store instead of `Preferences["shortcuts"]` if that indexed access does not resolve.

Run: `pnpm test -- markdownTab`
Expected: PASS.

Then create the controller, `src/modules/markdown/lib/useMarkdownTabController.ts`, as the thin shell that executes those plans. The order of operations inside each branch is a transcription of what Step 1 found, including the toast copy:

Create `src/modules/markdown/lib/useMarkdownTabController.ts`. The bodies of `toggleMode`, `saveNow` and `handleShortcut` are transcriptions of what Step 1 found; keep the semantics identical, including the toast copy:

```ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  type MarkdownTabMode,
  planModeSwitch,
  planSave,
  routeMarkdownShortcut,
  type SavePlan,
} from "@/modules/markdown/lib/markdownTabShell";
import { useMarkdownDocument } from "@/modules/markdown/lib/useMarkdownDocument";
import { usePreferencesStore } from "@/modules/settings/preferences";

function toDescription(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useMarkdownTabController(opts: {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  serializeRich: () => string | null;
  saveSource: () => Promise<void>;
  onToggleOutline?: () => void;
}) {
  const [mode, setMode] = useState<MarkdownTabMode>("rich");
  const { doc, onChange, setBaseline, save, reload } = useMarkdownDocument({
    path: opts.path,
    onDirtyChange: opts.onDirtyChange,
  });
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  const runSavePlan = useCallback(
    async (plan: SavePlan) => {
      if (plan.flushRich) {
        const md = opts.serializeRich();
        if (md != null) onChange(md);
      }
      if (plan.saveDoc) await save();
      if (plan.saveSource) await opts.saveSource();
    },
    [opts.serializeRich, opts.saveSource, onChange, save],
  );

  const toggleMode = useCallback(async () => {
    const plan = planModeSwitch(mode);
    try {
      await runSavePlan(plan);
    } catch (e) {
      toast.error("Could not switch mode", { description: toDescription(e) });
      return;
    }
    if (plan.reload) reload();
    setMode(plan.nextMode);
  }, [mode, runSavePlan, reload]);

  const saveNow = useCallback(
    () => runSavePlan(planSave(mode)),
    [mode, runSavePlan],
  );

  const handleShortcut = useCallback(
    (e: KeyboardEvent): boolean => {
      const action = routeMarkdownShortcut(e, userShortcuts, opts.onToggleOutline != null);
      if (action === "save") {
        saveNow().catch((err) =>
          toast.error("Save failed", { description: toDescription(err) }),
        );
        return true;
      }
      if (action === "toggleSource") {
        void toggleMode();
        return true;
      }
      if (action === "toggleOutline") {
        opts.onToggleOutline?.();
        return true;
      }
      return false;
    },
    [userShortcuts, saveNow, toggleMode, opts.onToggleOutline],
  );

  return { mode, doc, onChange, setBaseline, save, reload, toggleMode, saveNow, handleShortcut };
}
```

Two things to check against the real code rather than trusting this sketch. First, the current `MarkdownTab` swaps mode only after a successful save and toasts otherwise; `runSavePlan` must preserve that, which is why the mode is set after the await and not before. Second, verify the actual return shape and status names of `useMarkdownDocument` in its own file and match them; the names above come from the current `MarkdownTab` usage. If the real `MarkdownTab` wraps callbacks in refs to avoid stale closures, mirror that.

Create `src/modules/markdown/lib/MarkdownDocFallback.tsx` by moving the `error` / `binary` / `toolarge` JSX and the `formatBytes` helper out of `MarkdownTab.tsx` verbatim, returning `null` for `loading` and `ready`:

```tsx
import type { JSX } from "react";
import type { MarkdownDocState } from "@/modules/markdown/lib/useMarkdownDocument";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MarkdownDocFallback({ doc }: { doc: MarkdownDocState }): JSX.Element | null {
  if (doc.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        {doc.message}
      </div>
    );
  }
  if (doc.status === "binary" || doc.status === "toolarge") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-sm text-foreground">
          {doc.status === "binary" ? "Binary file" : "File too large"}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(doc.size)} · preview not supported
        </div>
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 5: Run the whole markdown suite**

Run: `pnpm test -- markdown`
Expected: PASS, including the new shell tests and every pre-existing markdown test.

- [ ] **Step 6: Refactor MarkdownTab onto the shared shell**

In `src/modules/markdown/tiptap/MarkdownTab.tsx`, replace the local mode state, `toggleMode`, the save and toggle branches of the keydown handler, and the fallback JSX with the controller and `MarkdownDocFallback`. The tiptap-only `search.focus` handling stays local, chained after the controller:

```tsx
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    if (ctrl.handleShortcut(e.nativeEvent)) {
      e.preventDefault();
      return;
    }
    if (ctrl.mode === "rich" && matchesShortcut(e.nativeEvent, "search.focus", userShortcuts)) {
      e.preventDefault();
      setFindOpen(true);
    }
  },
  [ctrl, userShortcuts],
);
```

Keep the baseline effect, now calling `ctrl.setBaseline`. No user-visible behavior may change. Review question for this step: does every path (toggle both directions, Ctrl+S in both modes, outline toggle, find, all four doc statuses, the baseline registration) still exist exactly once?

- [ ] **Step 7: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green, including every pre-existing tiptap and lib test.

```bash
git commit -m "refactor(markdown): extract shared markdown tab controller and doc fallback" -- src/modules/markdown/lib/markdownTabShell.ts src/modules/markdown/lib/markdownTabShell.test.ts src/modules/markdown/lib/markdownTabShortcut.test.ts src/modules/markdown/lib/useMarkdownTabController.ts src/modules/markdown/lib/MarkdownDocFallback.tsx src/modules/markdown/tiptap/MarkdownTab.tsx
git show --name-only --format="" HEAD
```

---

### Task 6: Milkdown dependencies and round-trip corpus

**Files:**
- Modify: `package.json` (and `pnpm-lock.yaml`)
- Create: `src/modules/markdown/milkdown/testCrepe.ts`
- Test: `src/modules/markdown/milkdown/roundTrip.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the dependencies `@milkdown/crepe`, `@milkdown/kit`, `@milkdown/plugin-diagram`, and the helper `createTestCrepe(markdown: string): Promise<{ getMarkdown: () => string; destroy: () => Promise<void> }>` reused by any later milkdown test.

- [ ] **Step 1: Install the dependencies**

```bash
pnpm add @milkdown/crepe @milkdown/kit @milkdown/plugin-diagram
```

Expected: latest 7.x versions in `package.json`. Run `pnpm why mermaid` and note whether `plugin-diagram` pulls a different mermaid major than the one the tiptap work already installed; record it in the commit body (Task 8 handles a conflict).

- [ ] **Step 2: Write the helper and the failing corpus test**

Create `src/modules/markdown/milkdown/testCrepe.ts`:

```ts
import { Crepe } from "@milkdown/crepe";

export async function createTestCrepe(markdown: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const crepe = new Crepe({ root, defaultValue: markdown });
  await crepe.create();
  return {
    getMarkdown: () => crepe.getMarkdown(),
    destroy: async () => {
      await crepe.destroy();
      root.remove();
    },
  };
}
```

Create `src/modules/markdown/milkdown/roundTrip.test.ts`. The environment directive on the first line is how this project gives a test file a DOM (see `src/modules/markdown/lib/roundTrip.test.ts`); there is no global setup file:

```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createTestCrepe } from "@/modules/markdown/milkdown/testCrepe";

const CASES: Array<[string, string]> = [
  ["headings", "# Title\n\n## Sub\n\nBody text.\n"],
  ["nested lists", "- a\n\n  - b\n\n- c\n"],
  ["task list", "- [ ] todo\n\n- [x] done\n"],
  ["table", "| a | b |\n| --- | --- |\n| 1 | 2 |\n"],
  ["fenced code with language", "```ts\nconst x = 1;\n```\n"],
  ["code block nested in a list", "- item\n\n  ```ts\n  const x = 1;\n  ```\n"],
  ["math block", "$$\nx^2 + y^2\n$$\n"],
  ["inline math", "before $x^2$ after\n"],
  ["mermaid fence", "```mermaid\ngraph TD;\nA-->B;\n```\n"],
  ["link with title", '[text](https://example.com "title")\n'],
  ["image", "![alt](./img.png)\n"],
  ["blockquote", "> quoted line\n"],
  ["strikethrough", "~~gone~~\n"],
  ["raw inline html preserved", "keep <u>underline</u> here\n"],
  ["html comment preserved", "text\n\n<!-- a note -->\n\nmore\n"],
];

async function normalize(md: string): Promise<string> {
  const e = await createTestCrepe(md);
  const out = e.getMarkdown();
  await e.destroy();
  return out;
}

describe("milkdown round-trip idempotence", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const [name, input] of CASES) {
    it(`is stable after the first pass: ${name}`, async () => {
      const once = await normalize(input);
      const twice = await normalize(once);
      expect(twice).toBe(once);
    });
  }
});
```

The contract matches the tiptap corpus: the first pass may normalize formatting, the second pass must be byte-identical to the first. The last four cases are the exact constructs that broke the tiptap engine (see `docs/MARKDOWN_GOTCHAS.md`), so they are the interesting ones to compare.

Additionally, record fidelity of the first pass for the report in Task 13: for each case, whether `once === input`. Do not assert on it (Milkdown is allowed to normalize), just note the outcomes in the commit body.

- [ ] **Step 3: Run the test and stabilize the DOM environment**

Run: `pnpm test -- milkdown/roundTrip`
Expected first run: likely FAIL on browser APIs missing under happy-dom (ProseMirror needs layout APIs). Add only the stubs the errors ask for, in the test file or in the shared setup file if `vite.config.ts` `test.setupFiles` defines one:

```ts
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
```

If Crepe still cannot instantiate after reasonable stubbing, switch this file to jsdom with a leading `// @vitest-environment jsdom` comment (adding `jsdom` as a dev dependency if missing) rather than fighting happy-dom. Record which environment won in the commit body. Note that `docs/MARKDOWN_GOTCHAS.md` documents happy-dom traps for the tiptap tests; read that section first, the same traps likely apply.

If an individual case is genuinely not idempotent in Milkdown, do NOT delete it: mark it `it.fails(...)` with a one-line reason and list it in Task 13's `docs/FORK.md` entry.

- [ ] **Step 4: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "build(markdown): add milkdown crepe with a round-trip idempotence corpus" -- package.json pnpm-lock.yaml src/modules/markdown/milkdown/testCrepe.ts src/modules/markdown/milkdown/roundTrip.test.ts
git show --name-only --format="" HEAD
```

---

### Task 7: MilkdownEditor component, theme and outline helper

**Files:**
- Create: `src/modules/markdown/milkdown/MilkdownEditor.tsx`
- Create: `src/modules/markdown/milkdown/milkdownTheme.css`
- Create: `src/modules/markdown/milkdown/outline.ts`
- Test: `src/modules/markdown/milkdown/outline.test.ts`

**Interfaces:**
- Consumes: `@milkdown/crepe` (Task 6).
- Produces (used by Tasks 8, 9, 10, 12):

```ts
export type OutlineHeading = { text: string; level: number; id: string };
export function headingsFromMarkdown(md: string): OutlineHeading[];

export type MilkdownEditorHandle = {
  serialize: () => string | null;          // null before ready
  scrollToHeading: (id: string) => void;
};

export const MilkdownEditor: ForwardRefExoticComponent<{
  body: string;
  revision: number;                        // recreate the editor when it changes
  editable?: boolean;                      // default true; false for read-only preview
  onChangeMarkdown?: (md: string) => void;
  onHeadingsChange?: (headings: OutlineHeading[]) => void;
  onInitError?: (message: string) => void;
} & RefAttributes<MilkdownEditorHandle>>;
```

- [ ] **Step 1: Write the failing outline helper test**

Create `src/modules/markdown/milkdown/outline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { headingsFromMarkdown } from "@/modules/markdown/milkdown/outline";

describe("headingsFromMarkdown", () => {
  it("extracts levels and slugs", () => {
    expect(headingsFromMarkdown("# One\n\n## Two words\n")).toEqual([
      { text: "One", level: 1, id: "one" },
      { text: "Two words", level: 2, id: "two-words" },
    ]);
  });

  it("dedupes repeated slugs", () => {
    expect(headingsFromMarkdown("# A\n# A\n").map((h) => h.id)).toEqual(["a", "a-1"]);
  });

  it("ignores headings inside fences", () => {
    expect(headingsFromMarkdown("```\n# not a heading\n```\n")).toEqual([]);
  });

  it("strips trailing closing hashes", () => {
    expect(headingsFromMarkdown("## Title ##\n")[0].text).toBe("Title");
  });
});
```

Run: `pnpm test -- milkdown/outline`
Expected: FAIL (module missing).

- [ ] **Step 2: Implement the outline helper**

Create `src/modules/markdown/milkdown/outline.ts`:

```ts
export type OutlineHeading = { text: string; level: number; id: string };

export function headingsFromMarkdown(md: string): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  const counts = new Map<string, number>();
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[2];
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    out.push({ text, level: m[1].length, id: n === 0 ? base : `${base}-${n}` });
  }
  return out;
}
```

Run: `pnpm test -- milkdown/outline`
Expected: PASS (4 tests).

If the installed Milkdown exposes a working `outline()` action util, `MilkdownEditor` may use it for live headings, but `headingsFromMarkdown` still ships: the panel falls back to it and the test locks the slug semantics. Whichever source is used, the ids must match the heading ids Milkdown renders into the DOM, otherwise `scrollToHeading` silently does nothing. Verify that in Step 5.

- [ ] **Step 3: Implement MilkdownEditor**

Create `src/modules/markdown/milkdown/MilkdownEditor.tsx`:

```tsx
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { hasMermaidFence } from "@/modules/markdown/milkdown/mermaidFence";
import {
  headingsFromMarkdown,
  type OutlineHeading,
} from "@/modules/markdown/milkdown/outline";
import "@/modules/markdown/milkdown/milkdownTheme.css";

export type MilkdownEditorHandle = {
  serialize: () => string | null;
  scrollToHeading: (id: string) => void;
};

type Props = {
  body: string;
  revision: number;
  editable?: boolean;
  onChangeMarkdown?: (md: string) => void;
  onHeadingsChange?: (headings: OutlineHeading[]) => void;
  onInitError?: (message: string) => void;
};

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, Props>(
  function MilkdownEditor(
    { body, revision, editable = true, onChangeMarkdown, onHeadingsChange, onInitError },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const bodyRef = useRef(body);
    bodyRef.current = body;
    const onChangeRef = useRef(onChangeMarkdown);
    onChangeRef.current = onChangeMarkdown;
    const onHeadingsRef = useRef(onHeadingsChange);
    onHeadingsRef.current = onHeadingsChange;
    const onInitErrorRef = useRef(onInitError);
    onInitErrorRef.current = onInitError;

    useImperativeHandle(ref, () => ({
      serialize: () => crepeRef.current?.getMarkdown() ?? null,
      scrollToHeading: (id: string) => {
        const el = rootRef.current?.querySelector(`[id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    }));

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      let disposed = false;
      let instance: Crepe | null = null;

      const boot = async () => {
        const crepe = new Crepe({ root: el, defaultValue: bodyRef.current });
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, md) => {
            if (disposed) return;
            onChangeRef.current?.(md);
            onHeadingsRef.current?.(headingsFromMarkdown(md));
          });
        });
        await crepe.create();
        if (disposed) {
          void crepe.destroy();
          return;
        }
        crepe.setReadonly(!editable);
        instance = crepe;
        crepeRef.current = crepe;
        onHeadingsRef.current?.(headingsFromMarkdown(bodyRef.current));
      };

      boot().catch((e) => {
        if (disposed) return;
        console.error("[milkdown] editor init failed", e);
        onInitErrorRef.current?.(e instanceof Error ? e.message : String(e));
      });

      return () => {
        disposed = true;
        crepeRef.current = null;
        if (instance) void instance.destroy();
        el.replaceChildren();
      };
      // body is read through bodyRef on purpose: revision is the reload signal.
    }, [revision, editable]);

    return (
      <div ref={rootRef} className="milkdown-editor h-full min-h-0 overflow-y-auto" />
    );
  },
);
```

Verify every API against the installed `.d.ts`: the `Crepe` constructor options, `crepe.on(...)` with `markdownUpdated`, `getMarkdown()`, `setReadonly()`, `destroy()`. If `setReadonly` does not exist in the installed version, set editability through the editor config (`editorViewOptionsCtx` with `editable: () => false`) and say so in the commit body. Note that `hasMermaidFence` is created in Task 8; if you implement this task first, either land Task 8's tiny module together with this one or leave the import out until Task 8 adds it. Do not leave a broken import between commits.

- [ ] **Step 4: Theme CSS**

Create `src/modules/markdown/milkdown/milkdownTheme.css`. Import no Crepe stock theme (`frame`, `nord`, and so on), only the structural `common/style.css` from the component plus this file. Open `node_modules/@milkdown/crepe/lib/theme/common/style.css` and one stock theme to get the real custom property names, then map them onto Kex tokens:

```css
.milkdown-editor .milkdown {
  --crepe-color-background: transparent;
  --crepe-color-on-background: var(--foreground);
  --crepe-color-surface: var(--background);
  --crepe-color-surface-low: var(--muted);
  --crepe-color-on-surface: var(--foreground);
  --crepe-color-on-surface-variant: var(--muted-foreground);
  --crepe-color-outline: var(--border);
  --crepe-color-primary: var(--primary);
  --crepe-color-secondary: var(--accent);
  --crepe-color-on-secondary: var(--accent-foreground);
  --crepe-color-inverse: var(--foreground);
  --crepe-color-on-inverse: var(--background);
  --crepe-color-inline-code: var(--primary);
  --crepe-color-error: var(--destructive);
  --crepe-color-hover: var(--accent);
  --crepe-color-selected: var(--accent);
  --crepe-color-inline-area: var(--muted);
  --crepe-font-title: inherit;
  --crepe-font-default: inherit;
  --crepe-font-code: var(--font-mono, ui-monospace, monospace);
  height: 100%;
}
```

Delete properties the installed version does not define and add the ones it does. Align heading scale, paragraph spacing and code block radius with `src/modules/markdown/tiptap/richMarkdown.css` where it is cheap, so switching engines does not feel like switching applications.

- [ ] **Step 5: Smoke test in dev**

Temporarily mount `MilkdownEditor` in the markdown case of `TabContent` behind a local edit, run `pnpm tauri dev` (kill any HMR session first, per the HMR gotcha in `CLAUDE.md`), and open a `.md` with headings, lists, a table, code and math. Verify: it renders, edits fire `onChangeMarkdown`, the theme follows the active Kex theme in both a light and a dark theme, and the heading DOM ids match `headingsFromMarkdown` output. Revert the temporary mount before committing.

- [ ] **Step 6: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(markdown): milkdown crepe editor component with a kex theme" -- src/modules/markdown/milkdown/MilkdownEditor.tsx src/modules/markdown/milkdown/milkdownTheme.css src/modules/markdown/milkdown/outline.ts src/modules/markdown/milkdown/outline.test.ts
git show --name-only --format="" HEAD
```

---

### Task 8: Mermaid diagrams, lazy, with a verified escape hatch

**Files:**
- Create: `src/modules/markdown/milkdown/mermaidFence.ts`
- Test: `src/modules/markdown/milkdown/mermaidFence.test.ts`
- Modify: `src/modules/markdown/milkdown/MilkdownEditor.tsx`

**Interfaces:**
- Consumes: `MilkdownEditor` internals (Task 7), `@milkdown/plugin-diagram` (Task 6).
- Produces: `hasMermaidFence(md: string): boolean`, and mermaid rendering inside the milkdown engine at zero cost for documents without a fence.

- [ ] **Step 1: Write the failing detector test**

Create `src/modules/markdown/milkdown/mermaidFence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasMermaidFence } from "@/modules/markdown/milkdown/mermaidFence";

describe("hasMermaidFence", () => {
  it("detects a mermaid fence", () => {
    expect(hasMermaidFence("text\n```mermaid\ngraph TD;\n```\n")).toBe(true);
  });

  it("ignores other fences and inline mentions", () => {
    expect(hasMermaidFence("```ts\nconst mermaid = 1;\n```\n")).toBe(false);
    expect(hasMermaidFence("the word mermaid\n")).toBe(false);
  });

  it("detects tilde fences and info-string padding", () => {
    expect(hasMermaidFence("~~~ mermaid\ngraph TD;\n~~~\n")).toBe(true);
  });
});
```

Run: `pnpm test -- mermaidFence`
Expected: FAIL. Then create `src/modules/markdown/milkdown/mermaidFence.ts`:

```ts
export function hasMermaidFence(md: string): boolean {
  return /^(?:```|~~~)\s*mermaid\b/m.test(md);
}
```

Run again. Expected: PASS (3 tests).

- [ ] **Step 2: Compatibility checkpoint**

Before wiring anything, verify `@milkdown/plugin-diagram` works with the installed Crepe:

- Read `node_modules/@milkdown/plugin-diagram/package.json` (peer dependencies) and its `lib/*.d.ts` exports (expected: a `diagram` plugin collection).
- In a scratch test modeled on `roundTrip.test.ts`, create a Crepe with `crepe.editor.use(diagram)` before `create()` and load the mermaid corpus case. If it creates without throwing and `getMarkdown()` returns the fence intact, the plugin is compatible.

If it is NOT compatible (it throws, double-registers the code block node, or peer-conflicts with Crepe's CodeMirror feature): take the spec's escape hatch (decision 8). Skip Steps 3 and 4, remove the dependency with `pnpm remove @milkdown/plugin-diagram`, leave mermaid fences rendering as plain code blocks, and record the gap and the exact failure both in the commit body and in Task 13's `docs/FORK.md` entry. The corpus case "mermaid fence" already locks the fallback behavior.

- [ ] **Step 3: Wire the lazy plugin**

In `MilkdownEditor.tsx`, extend `boot()` so the plugin loads only when the document needs it:

```tsx
if (hasMermaidFence(bodyRef.current)) {
  try {
    const { diagram } = await import("@milkdown/plugin-diagram");
    crepe.editor.use(diagram);
  } catch (e) {
    console.error("[milkdown] diagram plugin failed to load", e);
  }
}
```

A mermaid fence typed into a document that opened without one renders as a plain code block until the editor is recreated (the next open, or an external reload bumping `revision`). That is the accepted v1 trade-off: no editor recreation mid-session. Document it in Task 13's `docs/FORK.md` entry.

Verify the chunking: `pnpm build`, then confirm `dist/assets/` has a separate chunk containing mermaid. Mermaid must NOT be inside the main milkdown chunk.

- [ ] **Step 4: Manual smoke test**

With the temporary mount from Task 7 Step 5 (or folded into Task 10's smoke test if that is already done): open a `.md` containing a mermaid fence and confirm the diagram renders, and that a document without fences never requests the mermaid chunk (dev console network tab).

- [ ] **Step 5: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(markdown): lazy mermaid diagrams in the milkdown engine" -- src/modules/markdown/milkdown/mermaidFence.ts src/modules/markdown/milkdown/mermaidFence.test.ts src/modules/markdown/milkdown/MilkdownEditor.tsx
git show --name-only --format="" HEAD
```

Escape-hatch variant: `git commit -m "docs(markdown): record the milkdown diagram plugin incompatibility, mermaid stays code" -- <paths> package.json pnpm-lock.yaml`.

---

### Task 9: Milkdown outline panel

**Files:**
- Create: `src/modules/markdown/milkdown/OutlinePanel.tsx`

**Interfaces:**
- Consumes: `OutlineHeading` (Task 7); `src/modules/markdown/tiptap/OutlinePanel.tsx` as the visual reference.
- Produces:

```ts
export function OutlinePanel(props: {
  headings: OutlineHeading[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Implement the panel**

Read `src/modules/markdown/tiptap/OutlinePanel.tsx` first and copy its container classes, width, header row (title plus close button) and item styling exactly, so both engines look identical. The milkdown version is simpler because it is a pure list over props with no editor coupling:

```tsx
import { cn } from "@/lib/utils";
import type { OutlineHeading } from "@/modules/markdown/milkdown/outline";

export function OutlinePanel({
  headings,
  onNavigate,
  onClose,
}: {
  headings: OutlineHeading[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className={/* container classes copied from the tiptap OutlinePanel */ ""}>
      {/* header row markup copied from the tiptap OutlinePanel, wired to onClose */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {headings.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-muted-foreground">No headings</div>
        ) : (
          headings.map((h, i) => (
            <button
              key={`${h.id}-${i}`}
              type="button"
              onClick={() => onNavigate(h.id)}
              className={cn(/* item classes copied from the tiptap OutlinePanel */ "")}
              style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
            >
              {h.text}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

The two copied-classes placeholders are filled from the real tiptap file at implementation time. Matching it on classes is the requirement, which is why this plan does not freeze them.

- [ ] **Step 2: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green. The component is not mounted yet; Task 10 mounts it. If the linter flags the unused export, fold this commit into Task 10 rather than adding an ignore comment.

```bash
git commit -m "feat(markdown): outline panel for the milkdown engine" -- src/modules/markdown/milkdown/OutlinePanel.tsx
git show --name-only --format="" HEAD
```

---

### Task 10: MilkdownTab assembly

**Files:**
- Create: `src/modules/markdown/milkdown/MilkdownTab.tsx`

**Interfaces:**
- Consumes: `useMarkdownTabController` and `MarkdownDocFallback` (Task 5), `MilkdownEditor` / `MilkdownEditorHandle` / `OutlineHeading` (Task 7), `OutlinePanel` (Task 9), `EditorPane` / `EditorPaneHandle` (`src/modules/editor/EditorPane.tsx`), `EditorPathBar` (`@/modules/editor`), `useEditorChrome` (`@/modules/workspaces/EditorChromeContext`), `TabCallbacks` (`src/modules/workspaces/TabContent.tsx`).
- Produces (consumed by Task 11's lazy import):

```ts
export function MilkdownTab(props: {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
}): JSX.Element;
```

- [ ] **Step 1: Read the tiptap MarkdownTab wiring**

Read `src/modules/markdown/tiptap/MarkdownTab.tsx` after Task 5's refactor. Note the exact `EditorPathBar` props it passes (path, tabId, workspaceRoot, home, gitRootPath, the five context-menu callbacks, `trailing`), the `trailing` markup (the Rich|Source two-segment control and the outline button, with their exact class names), the `onKeyDownCapture` wiring on the root div with its biome-ignore comment, and the `EditorPane` props in source mode. MilkdownTab mirrors all of it minus the Find button and minus the fixed `Toolbar`.

- [ ] **Step 2: Implement MilkdownTab**

Create `src/modules/markdown/milkdown/MilkdownTab.tsx`:

```tsx
import { type JSX, useRef, useState } from "react";
import { EditorPathBar } from "@/modules/editor";
import { EditorPane, type EditorPaneHandle } from "@/modules/editor/EditorPane";
import { MarkdownDocFallback } from "@/modules/markdown/lib/MarkdownDocFallback";
import { useMarkdownTabController } from "@/modules/markdown/lib/useMarkdownTabController";
import {
  MilkdownEditor,
  type MilkdownEditorHandle,
} from "@/modules/markdown/milkdown/MilkdownEditor";
import { OutlinePanel } from "@/modules/markdown/milkdown/OutlinePanel";
import type { OutlineHeading } from "@/modules/markdown/milkdown/outline";
import { useEditorChrome } from "@/modules/workspaces/EditorChromeContext";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

type Props = {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
};

export function MilkdownTab(props: Props): JSX.Element {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const milkRef = useRef<MilkdownEditorHandle>(null);
  const editorPaneRef = useRef<EditorPaneHandle>(null);
  const { workspaceRoot, home, gitRootPath } = useEditorChrome();

  const ctrl = useMarkdownTabController({
    path: props.path,
    onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
    serializeRich: () => milkRef.current?.serialize() ?? null,
    saveSource: async () => {
      await editorPaneRef.current?.save();
    },
    onToggleOutline: () => setOutlineOpen((v) => !v),
  });

  // Same purpose as in the tiptap tab: record what the freshly loaded document
  // serializes to, so a session that changes nothing never rewrites the file.
  const readyRevision = ctrl.doc.status === "ready" ? ctrl.doc.revision : null;
  useEffect(() => {
    if (ctrl.mode !== "rich" || readyRevision === null) return;
    const md = milkRef.current?.serialize();
    if (md != null) ctrl.setBaseline(md);
  }, [readyRevision, ctrl.mode, ctrl.setBaseline]);

  /* trailing: outline button + Rich|Source segment control, markup copied from
     tiptap/MarkdownTab.tsx with the Find button omitted */

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: capture-phase key routing for editor shortcuts, not an interactive widget
    <div
      className="flex h-full w-full flex-col"
      onKeyDownCapture={(e) => {
        if (ctrl.handleShortcut(e.nativeEvent)) e.preventDefault();
      }}
    >
      <EditorPathBar
        /* exactly the props tiptap/MarkdownTab.tsx passes */
        trailing={trailing}
      />
      <div className="relative min-h-0 flex-1">
        {ctrl.mode === "source" ? (
          <EditorPane
            ref={editorPaneRef}
            path={props.path}
            onDirtyChange={(d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d)}
          />
        ) : initError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12.5px] text-muted-foreground">
            <span>Milkdown could not open this document: {initError}</span>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                setInitError(null);
                void ctrl.toggleMode();
              }}
            >
              Open in Source mode
            </button>
          </div>
        ) : ctrl.doc.status === "ready" ? (
          <div className="flex h-full min-h-0">
            <MilkdownEditor
              ref={milkRef}
              body={ctrl.doc.body}
              revision={ctrl.doc.revision}
              onChangeMarkdown={ctrl.onChange}
              onHeadingsChange={setHeadings}
              onInitError={setInitError}
            />
            {outlineOpen && (
              <OutlinePanel
                headings={headings}
                onNavigate={(id) => milkRef.current?.scrollToHeading(id)}
                onClose={() => setOutlineOpen(false)}
              />
            )}
          </div>
        ) : (
          <MarkdownDocFallback doc={ctrl.doc} />
        )}
      </div>
    </div>
  );
}
```

The commented blocks are copied from the real `tiptap/MarkdownTab.tsx` at implementation time: those props and class names were finalized by the merged tiptap work and must match it, not this plan. Remember to add `useEffect` to the React import.

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(markdown): milkdown tab with source toggle and outline" -- src/modules/markdown/milkdown/MilkdownTab.tsx
git show --name-only --format="" HEAD
```

---

### Task 11: Three-engine routing in TabContent

**Files:**
- Modify: `src/modules/workspaces/TabContent.tsx`

**Interfaces:**
- Consumes: `resolveMarkdownEngine` and the per-tab field (Tasks 1 and 4), `MilkdownTab` (Task 10), the existing lazy `MarkdownTab`.
- Produces: the `markdown` tab renders the engine its tab carries.

- [ ] **Step 1: Add the lazy import**

Next to the existing `MarkdownTab` lazy import (near line 45):

```tsx
const MilkdownTab = lazy(() =>
  import("@/modules/markdown/milkdown/MilkdownTab").then((m) => ({ default: m.MilkdownTab as ComponentType<any> })),
);
```

- [ ] **Step 2: Branch on the resolved engine**

Replace the `case "markdown"` head so all three engines are explicit, keeping the existing legacy JSX as the last branch:

```tsx
case "markdown":
  if (tabMarkdownEngine === "tiptap") {
    return (
      <Suspense fallback={null}>
        <MarkdownTab tabId={tab.id} path={tab.path} visible={visible} focused={focused} callbacks={callbacks} />
      </Suspense>
    );
  }
  if (tabMarkdownEngine === "milkdown") {
    return (
      <Suspense fallback={null}>
        <MilkdownTab tabId={tab.id} path={tab.path} visible={visible} focused={focused} callbacks={callbacks} />
      </Suspense>
    );
  }
  // legacy: unchanged JSX below
```

- [ ] **Step 3: Manual verification of all three engines**

Kill any running dev session and start a fresh `pnpm tauri dev` (module-level state plus HMR gives false readings, see `CLAUDE.md`). Then, for each of the three Settings values, open a `.md` in a new tab and confirm the engine that mounts. Then run the comparison workflow from Task 4 Step 7 with `"tiptap"` and `"milkdown"` on the same file in two panes: edit and save on one side, and confirm the other side reloads from disk when it has no unsaved changes of its own.

- [ ] **Step 4: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(markdown): route the markdown tab to its tab engine, milkdown included" -- src/modules/workspaces/TabContent.tsx
git show --name-only --format="" HEAD
```

---

### Task 12: MarkdownRenderPane, the engine-aware read-only preview

**Files:**
- Create: `src/modules/markdown/lib/renderEngine.ts` (the pure choice this component makes)
- Create: `src/modules/markdown/lib/renderEngine.test.ts`
- Create: `src/modules/markdown/MarkdownRenderPane.tsx`
- Modify: `src/modules/markdown/tiptap/RichMarkdownEditor.tsx` (add an `editable` prop)
- Modify: `src/modules/workspaces/TabContent.tsx` (both preview mount points and the legacy markdown branch)
- Modify: `src/modules/markdown/index.ts` (export the new component if the barrel is the module's public surface)

**Interfaces:**
- Consumes: `MarkdownEngine` (Task 1), `MarkdownPreviewPane`, `RichMarkdownEditor` (with the new `editable` prop), `MilkdownEditor` with `editable={false}` (Task 7).
- Produces:

```ts
export function MarkdownRenderPane(props: {
  content: string;
  engine: MarkdownEngine;
  filePath: string;
  workspaceRoot: string | null;
}): JSX.Element;
```

- [ ] **Step 1: Add the editable prop to RichMarkdownEditor**

In `src/modules/markdown/tiptap/RichMarkdownEditor.tsx`, add `editable?: boolean` to `RichMarkdownEditorProps` (default true) and pass it into the TipTap editor configuration (`editable` in `useEditor`, or `editor.setEditable(editable)` in an effect if the editor is created imperatively). When `editable` is false: do not mount the find bar, and make sure no code path can call a save. Read the file first and follow how it already configures `editorProps`.

If its prop surface makes a read-only mount awkward (it currently requires `tick`, `wikiEntries`, `onEditorChange`, `onChangeMarkdown`, `onNavigateFile`, `findOpen`, `onCloseFind`), prefer extracting a `RichMarkdownView` in the same directory that reuses the same extension list over passing meaningless stubs, and say which route you took in the commit body. The spec allows either.

- [ ] **Step 2: Write the failing test for the pure render choice**

Same testing constraint as Task 5: no React rendering in this project's test suite. What carries the risk here is which renderer is chosen and whether the text is debounced, so that becomes a pure function with a test, and the component stays a thin wrapper verified by hand in Step 5.

Create `src/modules/markdown/lib/renderEngine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  pickRenderer,
  RICH_DEBOUNCE_MS,
  shouldDebounce,
} from "@/modules/markdown/lib/renderEngine";

describe("pickRenderer", () => {
  it("maps each engine to its renderer", () => {
    expect(pickRenderer("legacy", false)).toBe("legacy");
    expect(pickRenderer("tiptap", false)).toBe("tiptap");
    expect(pickRenderer("milkdown", false)).toBe("milkdown");
  });

  it("falls back to the legacy renderer when a rich engine failed to start", () => {
    expect(pickRenderer("tiptap", true)).toBe("legacy");
    expect(pickRenderer("milkdown", true)).toBe("legacy");
  });
});

describe("shouldDebounce", () => {
  it("debounces only the rich engines, which reparse a whole document", () => {
    expect(shouldDebounce("legacy")).toBe(false);
    expect(shouldDebounce("tiptap")).toBe(true);
    expect(shouldDebounce("milkdown")).toBe(true);
  });

  it("uses a delay short enough to feel live", () => {
    expect(RICH_DEBOUNCE_MS).toBeLessThanOrEqual(300);
  });
});
```

Run: `pnpm test -- renderEngine`
Expected: FAIL (module missing). Then create `src/modules/markdown/lib/renderEngine.ts`:

```ts
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";

export const RICH_DEBOUNCE_MS = 200;

export type MarkdownRenderer = "legacy" | "tiptap" | "milkdown";

// A rich engine that cannot start falls back to the cheap renderer, so a broken
// engine never blanks the preview of a file the user is editing.
export function pickRenderer(engine: MarkdownEngine, failed: boolean): MarkdownRenderer {
  if (failed || engine === "legacy") return "legacy";
  return engine;
}

// A rich engine reparses the whole document per update; the legacy renderer is
// cheap and keeps the live text it always had.
export function shouldDebounce(engine: MarkdownEngine): boolean {
  return engine !== "legacy";
}
```

Run again. Expected: PASS (4 tests).

- [ ] **Step 3: Implement MarkdownRenderPane**

Create `src/modules/markdown/MarkdownRenderPane.tsx`. It owns no document state, no path loading and no save path of any kind; that is what makes it safe to mount next to a CodeMirror pane that owns the file:

```tsx
import { type JSX, useEffect, useRef, useState } from "react";
import type { MarkdownEngine } from "@/modules/markdown/lib/markdownEngine";
import {
  pickRenderer,
  RICH_DEBOUNCE_MS,
  shouldDebounce,
} from "@/modules/markdown/lib/renderEngine";
import { MarkdownPreviewPane } from "@/modules/markdown/MarkdownPreviewPane";
import { MilkdownEditor } from "@/modules/markdown/milkdown/MilkdownEditor";
import { RichMarkdownEditor } from "@/modules/markdown/tiptap/RichMarkdownEditor";

type Props = {
  content: string;
  engine: MarkdownEngine;
  filePath: string;
  workspaceRoot: string | null;
};

function useDebounced(value: string, active: boolean): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setSettled(value), RICH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, active]);
  return active ? settled : value;
}

// Both rich editors treat `revision` as their reload signal, so it counts how
// many settled bodies this pane has handed them.
function useRevision(body: string): number {
  const revision = useRef(0);
  const previous = useRef(body);
  if (previous.current !== body) {
    previous.current = body;
    revision.current += 1;
  }
  return revision.current;
}

export function MarkdownRenderPane({
  content,
  engine,
  filePath,
  workspaceRoot,
}: Props): JSX.Element {
  const [failed, setFailed] = useState(false);
  const renderer = pickRenderer(engine, failed);
  const body = useDebounced(content, shouldDebounce(engine));
  const revision = useRevision(body);

  if (renderer === "legacy") {
    return <MarkdownPreviewPane content={content} />;
  }
  if (renderer === "milkdown") {
    return (
      <MilkdownEditor
        body={body}
        revision={revision}
        editable={false}
        onInitError={() => setFailed(true)}
      />
    );
  }
  return (
    <RichMarkdownEditor
      body={body}
      revision={revision}
      editable={false}
      filePath={filePath}
      workspaceRoot={workspaceRoot}
      /* remaining props: whatever the editable work in Step 1 made optional,
         or the RichMarkdownView extracted there */
    />
  );
}
```

Note that the hooks run before the early returns, so switching engines at runtime keeps the hook order stable. If `RichMarkdownEditor` has no error callback to mirror `onInitError`, wrap it in an error boundary or leave the fallback milkdown-only and say so in the commit body; do not invent a callback the component does not have.

- [ ] **Step 4: Replace both preview mount points**

In `src/modules/workspaces/TabContent.tsx`:

1. In the `editor` case (near line 336), replace `{ismd && <MarkdownPreviewPane content={liveContent} />}` with:

```tsx
{ismd && (
  <MarkdownRenderPane
    content={liveContent}
    engine={tabMarkdownEngine}
    filePath={tab.path}
    workspaceRoot={workspaceRoot}
  />
)}
```

2. In the legacy `markdown` branch (near line 411), replace `<MarkdownPreviewPane content={liveContent} />` with the same component and props.
3. Remove the now-unused lazy `MarkdownPreviewPane` import if nothing else uses it, and lazily import `MarkdownRenderPane` in its place following the file's existing lazy-import style.

- [ ] **Step 5: Manual verification of the preview**

Fresh `pnpm tauri dev`. For each engine: open a `.md` as a code editor tab, turn on the split preview and then the overlay preview, type in the code pane, and confirm the preview follows with a short delay, that the file is only written by the code editor (the dirty dot behaves as before, and no save happens while you only type in one side), and that switching Kex themes restyles the preview. Confirm the engine used comes from the tab's own field by hand-editing the tab's `markdownEngine` in the workspace JSON and reloading.

- [ ] **Step 6: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "feat(markdown): render the editor tab preview with the tab engine, read-only" -- src/modules/markdown/MarkdownRenderPane.tsx src/modules/markdown/lib/renderEngine.ts src/modules/markdown/lib/renderEngine.test.ts src/modules/markdown/tiptap/RichMarkdownEditor.tsx src/modules/markdown/index.ts src/modules/workspaces/TabContent.tsx
git show --name-only --format="" HEAD
```

---

### Task 13: Bundle measurement, living docs and the manual checklist

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/BUILD.md`, `docs/FORK.md`, `docs/MARKDOWN_GOTCHAS.md`, `AGENTS.md`, `CLAUDE.md`
- Create: `docs/MILKDOWN_CHECKLIST.md` (the manual verification checklist and its results)

**Interfaces:**
- Consumes: everything.
- Produces: documentation that matches the shipped code, and a recorded evaluation result.

- [ ] **Step 1: Measure the bundle**

```bash
git stash list
pnpm build
```

Record the sizes of `dist/assets/*` before and after this feature (compare against a build of `main` in the main checkout, or against the sizes recorded in `docs/BUILD.md`). Note three numbers: the base chunk size (must not grow meaningfully), the milkdown chunk size, and the mermaid chunk size. Confirm with a fresh app run that opening a non-markdown tab never requests the milkdown chunk.

- [ ] **Step 2: Update the living docs**

- `docs/ARCHITECTURE.md`: the three-engine markdown tab, the per-tab `markdownEngine` field and where it is sealed, the renamed preference with its Settings control, `MarkdownRenderPane` as the single read-only render switch, and the new module directories. Remove the markdown editor preference from the JSON-only list if Task 1 did not already.
- `docs/BUILD.md`: the Crepe lazy-chunk impact with the numbers from Step 1.
- `docs/FORK.md`: a divergence entry for the Milkdown engine added for evaluation, listing the gaps versus the tiptap engine from the spec's parity matrix, plus any escape hatch taken in Task 8 and any `it.fails` case from Task 6.
- `docs/MARKDOWN_GOTCHAS.md`: what the round-trip corpus found, engine by engine, and whether Milkdown holds the constructs that broke TipTap (HTML comments, code blocks nested in lists, soft line breaks). This is the evaluation's actual result, so write it as findings, not as intentions.
- `AGENTS.md`: the module map entry for `markdown/tiptap/` and `markdown/milkdown/`.
- `CLAUDE.md`: glossary rows for `MilkdownTab`, `MilkdownEditor` and `MarkdownRenderPane`, and update any row that named `markdown/rich/` or the old preference.

- [ ] **Step 3: Run the manual checklist**

Create `docs/MILKDOWN_CHECKLIST.md` with these items and record the result of each one against a fresh `pnpm tauri dev` (not an HMR session). For the milkdown engine: headings, nested lists, task list toggling, table creation and cell editing, fenced code with the language picker, inline and block math, a mermaid fence, the slash menu, the floating selection toolbar, the drag handle, the placeholder on an empty document, image rendering from a relative path, the outline panel and navigation, the Rich to Source toggle in both directions, the dirty dot, Ctrl+S, autosave, reload after an external edit, and the inline error pane with its "Open in Source mode" action (force it with a document that breaks Crepe, or by temporarily throwing in `boot()`). For the whole feature: the three Settings values each producing a new tab with that engine, a tab keeping its engine when the preference changes, and the two-tabs-same-file comparison in a split.

- [ ] **Step 4: Final verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git commit -m "docs(markdown): document the milkdown engine, its bundle cost and the round-trip findings" -- docs AGENTS.md CLAUDE.md
git show --name-only --format="" HEAD
```

---

## Notes for the executor

- Tasks 1 to 5 are sequential (each builds on the previous). Tasks 6 to 9 only need Task 1 and can proceed while 4 and 5 are in review, with the caveat in Task 7 Step 3 about `hasMermaidFence`. Tasks 10, 11, 12 need everything before them. Task 13 is last.
- The engine names appear in four places that must agree exactly: the type union, the preference values in `settings-editor.json`, the per-tab field in the workspace JSON, and the Settings radio values. If any step tempts you to spell one of them differently, stop and re-read Task 1.
- Anything in this plan that contradicts the merged code loses: re-read the real file and adapt, then say so in the commit body.
