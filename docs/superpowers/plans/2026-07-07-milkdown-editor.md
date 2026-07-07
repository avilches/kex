# Milkdown Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Milkdown 7 Crepe WYSIWYG editor as a third engine for the `markdown` tab, selected by the JSON-only preference `markdownEditor: "tiptap" | "milkdown" | "legacy"` (renaming the previous `"rich"` value to `"tiptap"`), reusing the TipTap engine's document lifecycle, Rich|Source toggle and shortcuts through a shared tab shell.

**Architecture:** The `markdown` tab switch in `TabContent` gains a third branch. The mode-agnostic tab logic currently inside the TipTap `MarkdownTab` (mode state, disk-synced Rich|Source toggle, registry keydown, error fallbacks) is extracted into `src/modules/markdown/lib/` (`useMarkdownTabController`, `MarkdownDocFallback`) and consumed by both `MarkdownTab` (tiptap) and the new `MilkdownTab`. Milkdown is markdown-native: `MilkdownTab` feeds `doc.body` straight into Crepe and reads markdown back, with no HTML round-trip. Everything Milkdown loads inside one `React.lazy` chunk; mermaid stays a dynamic import triggered only by documents containing a mermaid fence.

**Tech Stack:** React 19, TypeScript, @milkdown/crepe + @milkdown/kit (latest 7.x), @milkdown/plugin-diagram, katex + mermaid (already dependencies, dynamic imports), CodeMirror 6 (existing, Source mode), vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-07-milkdown-editor-design.md`. Read it before starting; its numbered decisions are binding.

## Prerequisite (hard gate)

The `rich-markdown-editor` branch (plan `docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`) must be fully merged into `main`. Task 1 Step 1 verifies this and aborts the plan if it fails. The merged code is ground truth: where this plan cites line numbers or signatures from that work, re-read the real file first; the merged code wins over this plan's citations.

## Global Constraints

- pnpm only, never npm/npx/yarn.
- No em-dash anywhere (code, comments, commits, docs). No emojis anywhere.
- Frontend imports always `@/...`, never relative across modules.
- Comments: default none; if needed, 1-2 lines on why. No AI filler.
- Work in a worktree at `.claude/worktrees/milkdown-editor`; never switch the main worktree off `main`.
- Strict lazy-loading: `MilkdownTab` is a `React.lazy` chunk mounted from `TabContent`; Crepe and its CSS load only inside that chunk; `@milkdown/plugin-diagram` (and therefore mermaid) loads only when a document contains a mermaid fence; katex loads via Crepe's Latex feature on demand.
- Shortcuts only via the `SHORTCUTS` registry and `matchesShortcut`; never compare raw keys. This plan adds no new shortcut ids: it reuses `editor.save`, `markdown.toggleSource`, `markdown.toggleOutline`.
- No backward compatibility code, no migrations, no old-key fallbacks. The `"rich"` preference value disappears; `parseMarkdownEditor` maps unknown values to the default `"tiptap"`.
- Do not modify the legacy preview path (`MarkdownPreviewPane.tsx` and the legacy branch of `TabContent`) or the TipTap engine's behavior; the only allowed TipTap-side changes are the directory rename (Task 2) and the shared-shell refactor (Task 3), both behavior-preserving.
- Milkdown API ground truth is the installed package's type definitions (`node_modules/@milkdown/crepe/lib/*.d.ts`). If a signature differs from the code in this plan, adapt to the installed API and say so in the commit body.
- Living docs (`docs/ARCHITECTURE.md`, `docs/FORK.md`, `docs/BUILD.md`, `AGENTS.md`, `CLAUDE.md` glossary) updated in the same commit as the code they describe.
- Commit messages in English, atomic, no Co-authored-by, no Claude mentions.
- Verification before claiming any task done: `pnpm exec biome lint ./src && pnpm check-types && pnpm test` (run the linter directly, not through `pnpm lint`, per the RTK proxy note in the user CLAUDE.md). Rust is untouched by this plan.

---

### Task 1: Rename preference value "rich" to "tiptap"

**Files:**
- Modify: `src/modules/settings/store.ts` (type `MarkdownEditorMode`, `parseMarkdownEditor`, defaults)
- Modify: `src/modules/workspaces/TabContent.tsx` (the `markdownEditor === "rich"` comparison)
- Test: `src/modules/settings/parseMarkdownEditor.test.ts` (create)
- Modify: `docs/ARCHITECTURE.md` (JSON-only preference doc: value list)

**Interfaces:**
- Consumes: merged rich-markdown-editor code: `MarkdownEditorMode`/`parseMarkdownEditor` in `src/modules/settings/store.ts`, the `case "markdown"` bifurcation in `src/modules/workspaces/TabContent.tsx`.
- Produces: `type MarkdownEditorMode = "tiptap" | "legacy"` and `parseMarkdownEditor(value: unknown): MarkdownEditorMode` (default `"tiptap"`). Task 9 extends the union with `"milkdown"`.

- [ ] **Step 1: Verify the prerequisite merge**

Run from the repo root:

```bash
git -C . log --oneline -5
ls src/modules/markdown/rich/MarkdownTab.tsx
grep -n "parseMarkdownEditor" src/modules/settings/store.ts
grep -n "markdown.toggleSource" src/modules/shortcuts/shortcuts.ts
```

Expected: all four succeed (`MarkdownTab.tsx` exists, both greps match). If any fails, STOP: the rich-markdown-editor branch has not merged; this plan cannot run yet.

- [ ] **Step 2: Create the worktree**

Use the `superpowers:using-git-worktrees` skill to create `.claude/worktrees/milkdown-editor` from `main` (ensure `.claude/worktrees/` is ignored via `.git/info/exclude` if not already). All subsequent work happens inside the worktree.

- [ ] **Step 3: Write the failing test**

Create `src/modules/settings/parseMarkdownEditor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdownEditor } from "@/modules/settings/store";

describe("parseMarkdownEditor", () => {
  it("accepts tiptap", () => {
    expect(parseMarkdownEditor("tiptap")).toBe("tiptap");
  });
  it("accepts legacy", () => {
    expect(parseMarkdownEditor("legacy")).toBe("legacy");
  });
  it("maps the removed rich value to the default", () => {
    expect(parseMarkdownEditor("rich")).toBe("tiptap");
  });
  it("maps unknown values to the default", () => {
    expect(parseMarkdownEditor(undefined)).toBe("tiptap");
    expect(parseMarkdownEditor(42)).toBe("tiptap");
  });
});
```

Note: if importing the full `store.ts` drags Tauri APIs into the test environment and fails, move `MarkdownEditorMode` + `parseMarkdownEditor` into a new pure file `src/modules/settings/markdownEditorMode.ts`, re-export them from `store.ts`, and import the pure file from the test. Prefer the direct import if it works.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test -- parseMarkdownEditor`
Expected: FAIL (the `"rich"` case returns `"rich"` today, and `"tiptap"` maps to the default only by accident of the fallback; assertions on `"tiptap"` acceptance fail).

- [ ] **Step 5: Rename the value**

In `src/modules/settings/store.ts`:

```ts
export type MarkdownEditorMode = "tiptap" | "legacy";
export function parseMarkdownEditor(value: unknown): MarkdownEditorMode {
  return value === "legacy" ? "legacy" : "tiptap";
}
```

- Change the default in the defaults block from `markdownEditor: "rich"` to `markdownEditor: "tiptap"`.
- Grep for any other `"rich"` literal tied to this preference (`grep -rn '"rich"' src/`) and update comparisons; expected sites: the defaults block, `TabContent.tsx` (`markdownEditor === "rich"` becomes `=== "tiptap"`), possibly the JSON-only default-persist block.
- Do NOT touch the `mode: "rich" | "source"` state inside `MarkdownTab.tsx`; that is the Rich|Source toggle, unrelated to the preference value.
- Update the `markdownEditor` entry in `docs/ARCHITECTURE.md`'s JSON-only preference list to read `"tiptap" | "legacy"` (Task 9 extends it again).

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test -- parseMarkdownEditor`
Expected: PASS (4 tests).

- [ ] **Step 7: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add src/modules/settings/store.ts src/modules/settings/parseMarkdownEditor.test.ts src/modules/workspaces/TabContent.tsx docs/ARCHITECTURE.md
git commit -m "refactor(markdown): rename markdownEditor preference value rich to tiptap"
```

---

### Task 2: Rename directory markdown/rich to markdown/tiptap

**Files:**
- Rename: `src/modules/markdown/rich/` -> `src/modules/markdown/tiptap/` (whole directory, `git mv`)
- Modify: every importer of `@/modules/markdown/rich/...` (found by grep; at least `src/modules/workspaces/TabContent.tsx`)
- Modify: `docs/ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md` (any `markdown/rich` path references)

**Interfaces:**
- Consumes: the merged TipTap module at `src/modules/markdown/rich/`.
- Produces: identical module at `src/modules/markdown/tiptap/`; all later tasks reference the `tiptap/` path. Component names inside (`MarkdownTab`, `RichMarkdownEditor`, etc.) do not change.

- [ ] **Step 1: Rename and fix imports**

```bash
git mv src/modules/markdown/rich src/modules/markdown/tiptap
grep -rln "modules/markdown/rich" src/ docs/ AGENTS.md CLAUDE.md
```

Replace every `@/modules/markdown/rich/` with `@/modules/markdown/tiptap/` (imports are absolute per convention, so this is a mechanical replace across the files the grep lists). Update the same path in `docs/ARCHITECTURE.md`, `AGENTS.md` (module layout) and any `CLAUDE.md` glossary row citing `markdown/rich/`.

- [ ] **Step 2: Verify**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green. `grep -rn "markdown/rich" src/ docs/ AGENTS.md CLAUDE.md` returns nothing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(markdown): rename rich module directory to tiptap"
```

---

### Task 3: Shared tab shell (useMarkdownTabController + MarkdownDocFallback)

**Files:**
- Create: `src/modules/markdown/lib/useMarkdownTabController.ts`
- Create: `src/modules/markdown/lib/MarkdownDocFallback.tsx`
- Test: `src/modules/markdown/lib/useMarkdownTabController.test.tsx`
- Modify: `src/modules/markdown/tiptap/MarkdownTab.tsx` (refactor onto the shared pieces, behavior-preserving)

**Interfaces:**
- Consumes: `useMarkdownDocument({ path, onDirtyChange }) -> { doc, dirty, onChange, save, reload }` and `MarkdownDocState` from `src/modules/markdown/lib/useMarkdownDocument.ts`; `matchesShortcut` from `@/modules/shortcuts`; `usePreferencesStore` from `@/modules/settings/preferences`.
- Produces (used verbatim by Task 8):

```ts
export type MarkdownTabMode = "rich" | "source";

export function useMarkdownTabController(opts: {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  serializeRich: () => string | null;      // current markdown from the rich surface, null if not mounted
  saveSource: () => Promise<void>;         // EditorPaneHandle.save passthrough
  onToggleOutline?: () => void;
}): {
  mode: MarkdownTabMode;
  doc: MarkdownDocState;
  dirty: boolean;
  onChange: (body: string) => void;
  save: () => Promise<void>;
  reload: () => boolean;
  toggleMode: () => Promise<void>;
  saveNow: () => Promise<void>;            // mode-aware explicit save (Ctrl+S body)
  handleShortcut: (e: KeyboardEvent) => boolean;  // true if consumed (caller preventDefaults)
};

export function MarkdownDocFallback(props: { doc: MarkdownDocState }): React.ReactNode;
```

- [ ] **Step 1: Read the current MarkdownTab**

Read `src/modules/markdown/tiptap/MarkdownTab.tsx` end to end. Identify: the `mode` state, `toggleMode` (serialize -> onChange -> await save -> swap; reverse path saves source then `reload()`), the keydown handler matching `editor.save`, `markdown.toggleSource`, `markdown.toggleOutline`, `search.focus`, and the `binary`/`toolarge`/`error`/`loading` fallback JSX. Those exact behaviors move; nothing may change functionally.

- [ ] **Step 2: Write the failing controller test**

Create `src/modules/markdown/lib/useMarkdownTabController.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ listen: vi.fn().mockResolvedValue(() => {}) }),
}));
vi.mock("@/modules/workspace", () => ({ currentWorkspaceEnv: () => null }));

import { useMarkdownTabController } from "@/modules/markdown/lib/useMarkdownTabController";

describe("useMarkdownTabController", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "fs_read_file") return { kind: "text", content: "# hi\n", size: 5 };
      return undefined;
    });
  });

  function make(overrides: Partial<Parameters<typeof useMarkdownTabController>[0]> = {}) {
    return renderHook(() =>
      useMarkdownTabController({
        path: "/tmp/a.md",
        serializeRich: () => "# edited\n",
        saveSource: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      }),
    );
  }

  it("starts in rich mode with the loaded body", async () => {
    const { result } = make();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    expect(result.current.mode).toBe("rich");
  });

  it("toggleMode rich->source serializes and flushes before swapping", async () => {
    const { result } = make();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    await act(() => result.current.toggleMode());
    expect(result.current.mode).toBe("source");
    const writes = invokeMock.mock.calls.filter(([c]) => c === "fs_write_file");
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toMatchObject({ content: "# edited\n" });
  });

  it("toggleMode source->rich saves the source pane then reloads", async () => {
    const saveSource = vi.fn().mockResolvedValue(undefined);
    const { result } = make({ saveSource });
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    await act(() => result.current.toggleMode());
    await act(() => result.current.toggleMode());
    expect(saveSource).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe("rich");
  });

  it("stays in the current mode when the flush save rejects", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "fs_read_file") return { kind: "text", content: "# hi\n", size: 5 };
      if (cmd === "fs_write_file") throw new Error("disk full");
      return undefined;
    });
    const { result } = make();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    await act(() => result.current.toggleMode());
    expect(result.current.mode).toBe("rich");
  });
});
```

Adjust the toast import mock if `sonner` errors in the test env (`vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))`). Likewise, if importing `@/modules/settings/preferences` pulls tauri-plugin-store at module load, mock it with a minimal zustand-like stub returning `{ shortcuts: {}, editorAutoSave: false, editorAutoSaveDelay: 1000 }` from the selector.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test -- useMarkdownTabController`
Expected: FAIL ("Cannot find module ... useMarkdownTabController").

- [ ] **Step 4: Implement the controller**

Create `src/modules/markdown/lib/useMarkdownTabController.ts`. The bodies of `toggleMode`, `saveNow` and `handleShortcut` are transcriptions of the logic currently in `MarkdownTab.tsx`; keep their semantics identical to what Step 1 found. Skeleton:

```ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useMarkdownDocument } from "@/modules/markdown/lib/useMarkdownDocument";
import { matchesShortcut } from "@/modules/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";

export type MarkdownTabMode = "rich" | "source";

export function useMarkdownTabController(opts: {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  serializeRich: () => string | null;
  saveSource: () => Promise<void>;
  onToggleOutline?: () => void;
}) {
  const [mode, setMode] = useState<MarkdownTabMode>("rich");
  const { doc, dirty, onChange, save, reload } = useMarkdownDocument({
    path: opts.path,
    onDirtyChange: opts.onDirtyChange,
  });
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  const flushRich = useCallback(() => {
    const md = opts.serializeRich();
    if (md != null) onChange(md);
  }, [opts.serializeRich, onChange]);

  const toggleMode = useCallback(async () => {
    try {
      if (mode === "rich") {
        flushRich();
        await save();
        setMode("source");
      } else {
        await opts.saveSource();
        reload();
        setMode("rich");
      }
    } catch (e) {
      toast.error("Could not switch mode", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [mode, flushRich, save, reload, opts.saveSource]);

  const saveNow = useCallback(async () => {
    if (mode === "rich") {
      flushRich();
      await save();
    } else {
      await opts.saveSource();
    }
  }, [mode, flushRich, save, opts.saveSource]);

  const handleShortcut = useCallback(
    (e: KeyboardEvent): boolean => {
      if (matchesShortcut(e, "editor.save", userShortcuts)) {
        void saveNow();
        return true;
      }
      if (matchesShortcut(e, "markdown.toggleSource", userShortcuts)) {
        void toggleMode();
        return true;
      }
      if (opts.onToggleOutline && matchesShortcut(e, "markdown.toggleOutline", userShortcuts)) {
        opts.onToggleOutline();
        return true;
      }
      return false;
    },
    [userShortcuts, saveNow, toggleMode, opts.onToggleOutline],
  );

  return { mode, doc, dirty, onChange, save, reload, toggleMode, saveNow, handleShortcut };
}
```

If the merged `MarkdownTab` wraps `opts.serializeRich`/callbacks in refs to avoid stale closures, mirror that. Check the real import path of `matchesShortcut` (barrel `@/modules/shortcuts` vs direct file) and use whatever `MarkdownTab.tsx` uses today.

Create `src/modules/markdown/lib/MarkdownDocFallback.tsx` by moving the `binary`/`toolarge`/`error`/`loading` JSX out of `MarkdownTab.tsx` verbatim (props: `{ doc: MarkdownDocState }`; render `null` for `loading` and `ready`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- useMarkdownTabController`
Expected: PASS (4 tests).

- [ ] **Step 6: Refactor MarkdownTab onto the shared shell**

In `src/modules/markdown/tiptap/MarkdownTab.tsx`: replace its local mode state, toggle logic, save shortcut handling and fallback JSX with `useMarkdownTabController` + `MarkdownDocFallback`. The tiptap-only `search.focus` handling stays local, chained after the controller:

```ts
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (ctrl.handleShortcut(e.nativeEvent)) {
    e.preventDefault();
    return;
  }
  if (ctrl.mode === "rich" && matchesShortcut(e.nativeEvent, "search.focus", userShortcuts)) {
    e.preventDefault();
    setFindOpen(true);
  }
};
```

No user-visible behavior may change. Diff review question for this step: does every code path (toggle both directions, Ctrl+S in both modes, outline toggle, find, all four doc statuses) still exist exactly once?

- [ ] **Step 7: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green, including all pre-existing tiptap/lib tests.

```bash
git add src/modules/markdown/lib/useMarkdownTabController.ts src/modules/markdown/lib/useMarkdownTabController.test.tsx src/modules/markdown/lib/MarkdownDocFallback.tsx src/modules/markdown/tiptap/MarkdownTab.tsx
git commit -m "refactor(markdown): extract shared markdown tab controller and doc fallback"
```

---

### Task 4: Milkdown dependencies and round-trip corpus

**Files:**
- Modify: `package.json` (+ lockfile)
- Create: `src/modules/markdown/milkdown/testCrepe.ts` (test-only helper)
- Test: `src/modules/markdown/milkdown/roundTrip.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: dependencies `@milkdown/crepe`, `@milkdown/kit`, `@milkdown/plugin-diagram`; helper `createTestCrepe(markdown: string): Promise<{ getMarkdown: () => string; destroy: () => Promise<void> }>` reused by any future milkdown test.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @milkdown/crepe @milkdown/kit @milkdown/plugin-diagram
```

Expected: latest 7.x versions land in `package.json`. Verify `pnpm why mermaid` shows the pre-existing mermaid (from the tiptap work) and note whether plugin-diagram pins a different major (if it does, record it; Task 6 handles conflicts).

- [ ] **Step 2: Write the test helper and failing corpus test**

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

Create `src/modules/markdown/milkdown/roundTrip.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createTestCrepe } from "@/modules/markdown/milkdown/testCrepe";

const CASES: Array<[string, string]> = [
  ["headings", "# Title\n\n## Sub\n\nBody text.\n"],
  ["nested lists", "- a\n\n  - b\n\n- c\n"],
  ["task list", "- [ ] todo\n\n- [x] done\n"],
  ["table", "| a | b |\n| --- | --- |\n| 1 | 2 |\n"],
  ["fenced code with language", "```ts\nconst x = 1;\n```\n"],
  ["math block", "$$\nx^2 + y^2\n$$\n"],
  ["inline math", "before $x^2$ after\n"],
  ["mermaid fence stays code", "```mermaid\ngraph TD;\nA-->B;\n```\n"],
  ["link with title", '[text](https://example.com "title")\n'],
  ["image", "![alt](./img.png)\n"],
  ["blockquote", "> quoted line\n"],
  ["strikethrough", "~~gone~~\n"],
  ["raw inline html preserved", "keep <u>underline</u> here\n"],
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

The contract is the tiptap corpus contract: the first pass may normalize formatting; the second pass must be byte-identical to the first.

- [ ] **Step 3: Run the test, stabilize the DOM environment**

Run: `pnpm test -- milkdown/roundTrip`
Expected first run: likely FAIL on missing browser APIs in happy-dom (ProseMirror needs layout APIs). Fix by extending the test file (or the shared vitest setup file if one exists; check `vite.config.ts` `test.setupFiles`) with stubs, adding only what the errors ask for:

```ts
// test env stubs for ProseMirror/Crepe under happy-dom
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}
```

If after reasonable stubbing Crepe still cannot instantiate under happy-dom, switch this test file to jsdom via a leading `// @vitest-environment jsdom` comment (add `jsdom` as a dev dependency if missing) rather than fighting happy-dom. Record which environment won in the commit body.

Expected end state: all corpus cases pass. If an individual case is genuinely not idempotent in Milkdown (a serializer quirk), do NOT delete the case: mark it `it.fails(...)` with a one-line reason and list it in the Task 10 FORK.md gaps entry.

- [ ] **Step 4: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add package.json pnpm-lock.yaml src/modules/markdown/milkdown/testCrepe.ts src/modules/markdown/milkdown/roundTrip.test.ts
git commit -m "build(markdown): add milkdown crepe with round-trip idempotence corpus"
```

---

### Task 5: MilkdownEditor component and theme

**Files:**
- Create: `src/modules/markdown/milkdown/MilkdownEditor.tsx`
- Create: `src/modules/markdown/milkdown/milkdownTheme.css`
- Create: `src/modules/markdown/milkdown/outline.ts` (pure helpers + types)
- Test: `src/modules/markdown/milkdown/outline.test.ts`

**Interfaces:**
- Consumes: `@milkdown/crepe`; `outline` util from `@milkdown/kit/utils` (verify the export path in the installed package; fall back to `@milkdown/utils` if kit does not re-export it).
- Produces (used by Tasks 6, 7, 8):

```ts
export type OutlineHeading = { text: string; level: number; id: string };

export type MilkdownEditorHandle = {
  serialize: () => string | null;                 // null before ready
  scrollToHeading: (id: string) => void;
};

export const MilkdownEditor: ForwardRefExoticComponent<{
  body: string;
  revision: number;                               // recreate editor when it changes
  onChangeMarkdown: (md: string) => void;
  onHeadingsChange?: (headings: OutlineHeading[]) => void;
  onInitError?: (message: string) => void;        // Crepe failed to create; parent offers Source mode
} & RefAttributes<MilkdownEditorHandle>>;
```

- [ ] **Step 1: Write the failing outline helper test**

The heading extraction that feeds the outline panel must be pure and tested without an editor. Create `src/modules/markdown/milkdown/outline.ts`:

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
});
```

Run: `pnpm test -- milkdown/outline`
Expected: FAIL (module does not exist yet), then implement, then PASS.

Note: if the installed Milkdown exposes a working `outline()` action util, `MilkdownEditor` may use it instead of `headingsFromMarkdown` for live headings, but `headingsFromMarkdown` still ships (Task 7's panel falls back to it and the test locks slug semantics). Whichever source is used, ids must match the heading ids Milkdown renders into the DOM; verify with a manual check in Step 4 and prefer the util if they differ.

- [ ] **Step 2: Implement MilkdownEditor**

Create `src/modules/markdown/milkdown/MilkdownEditor.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@/modules/markdown/milkdown/milkdownTheme.css";
import { headingsFromMarkdown, type OutlineHeading } from "@/modules/markdown/milkdown/outline";

export type MilkdownEditorHandle = {
  serialize: () => string | null;
  scrollToHeading: (id: string) => void;
};

type Props = {
  body: string;
  revision: number;
  onChangeMarkdown: (md: string) => void;
  onHeadingsChange?: (headings: OutlineHeading[]) => void;
  onInitError?: (message: string) => void;
};

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, Props>(function MilkdownEditor(
  { body, revision, onChangeMarkdown, onHeadingsChange, onInitError },
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
          onChangeRef.current(md);
          onHeadingsRef.current?.(headingsFromMarkdown(md));
        });
      });
      await crepe.create();
      if (disposed) {
        void crepe.destroy();
        return;
      }
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
    // body is intentionally read through bodyRef: revision is the reload signal
  }, [revision]);

  return <div ref={rootRef} className="milkdown-editor h-full min-h-0 overflow-y-auto" />;
});
```

Verify against the installed `.d.ts`: `Crepe` constructor options, `crepe.on(...)` listener API (`markdownUpdated`), `getMarkdown()`, `destroy()`. Adapt if the installed version differs (global constraint).

- [ ] **Step 3: Theme CSS**

Create `src/modules/markdown/milkdown/milkdownTheme.css`. Do not import any Crepe stock theme (`frame`, `nord`, etc.); only the structural `common/style.css` plus this file. Map Crepe's theme custom properties onto Kex tokens. Open `node_modules/@milkdown/crepe/lib/theme/common/style.css` and the stock themes to get the real variable names (they are `--crepe-*`), then:

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

Adjust the variable list to what the installed version actually defines (delete unknown ones, add missing ones). Align prose spacing/sizes with `tiptap/richMarkdown.css` where cheap (headings scale, code block radius) so switching engines does not feel like switching apps.

- [ ] **Step 4: Smoke test in dev**

Temporarily mount `MilkdownEditor` (e.g. hardcode it into the markdown case behind a local edit, or use a scratch route); run `pnpm tauri dev`, open a `.md` with headings, lists, a table, code and math. Verify: renders, edits fire `onChangeMarkdown`, theme follows the active Kex theme, heading DOM ids match `headingsFromMarkdown` output (adapt per Step 1's note if not). Revert the temporary mount.

- [ ] **Step 5: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add src/modules/markdown/milkdown/MilkdownEditor.tsx src/modules/markdown/milkdown/milkdownTheme.css src/modules/markdown/milkdown/outline.ts src/modules/markdown/milkdown/outline.test.ts
git commit -m "feat(markdown): milkdown crepe editor component with kex theme"
```

---

### Task 6: Mermaid diagrams (lazy, with verified escape hatch)

**Files:**
- Modify: `src/modules/markdown/milkdown/MilkdownEditor.tsx`
- Create: `src/modules/markdown/milkdown/mermaidFence.ts`
- Test: `src/modules/markdown/milkdown/mermaidFence.test.ts`

**Interfaces:**
- Consumes: `MilkdownEditor` internals (Task 5), `@milkdown/plugin-diagram`.
- Produces: `hasMermaidFence(md: string): boolean`; `MilkdownEditor` renders mermaid fences as diagrams when the document contains one, at zero cost otherwise.

- [ ] **Step 1: Write the failing fence detector test**

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

Run again. Expected: PASS.

- [ ] **Step 2: Compatibility checkpoint**

Before wiring anything, verify `@milkdown/plugin-diagram` works with the installed Crepe:

- Read `node_modules/@milkdown/plugin-diagram/package.json` (peer deps) and its `lib/*.d.ts` exports (expected: `diagram` plugin collection).
- In `roundTrip.test.ts`-style scratch (or a one-off test), create a Crepe with `crepe.editor.use(diagram)` before `create()` and load the mermaid corpus case. If it creates without throwing and `getMarkdown()` returns the fence intact, the plugin is compatible.

If it is NOT compatible (throws, double-registers the code block node, or peer-conflicts with Crepe's CodeMirror feature): take the spec's escape hatch (decision 6): skip Steps 3-4, remove the `@milkdown/plugin-diagram` dependency (`pnpm remove @milkdown/plugin-diagram`), leave mermaid fences rendering as plain code blocks, and record the gap + the exact failure in the commit body and in Task 10's FORK.md entry. The corpus case "mermaid fence stays code" already locks the fallback behavior.

- [ ] **Step 3: Wire the lazy plugin into MilkdownEditor**

In `MilkdownEditor.tsx`, extend the boot path (from Task 5) so the plugin loads only when needed:

```tsx
import { hasMermaidFence } from "@/modules/markdown/milkdown/mermaidFence";

// inside boot(), before crepe.create():
if (hasMermaidFence(bodyRef.current)) {
  try {
    const { diagram } = await import("@milkdown/plugin-diagram");
    crepe.editor.use(diagram);
  } catch (e) {
    console.error("[milkdown] diagram plugin failed to load", e);
  }
}
```

A mermaid fence typed into a document that opened without one renders as a plain code block until the editor is recreated (next open or external reload bumps `revision`). That is the accepted v1 trade-off: no editor recreation mid-session. Document it in Task 10's FORK.md entry.

Verify the chunking: `pnpm build`, then check `dist/assets/` for a separate chunk containing mermaid (search the manifest or chunk file names). Mermaid must NOT be inside the main milkdown chunk.

- [ ] **Step 4: Manual smoke test**

`pnpm tauri dev` with the temporary mount trick from Task 5 Step 4 (or wait for Task 8 if preferred and fold this check into Task 8's smoke test): open a `.md` containing a mermaid fence; the diagram renders; a doc without fences never requests the mermaid chunk (check the dev network/console).

- [ ] **Step 5: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add src/modules/markdown/milkdown/mermaidFence.ts src/modules/markdown/milkdown/mermaidFence.test.ts src/modules/markdown/milkdown/MilkdownEditor.tsx
git commit -m "feat(markdown): lazy mermaid diagrams in milkdown via plugin-diagram"
```

(Escape-hatch variant commit: `git commit -m "docs(markdown): record milkdown diagram plugin incompatibility, mermaid stays code"` with the dependency removal.)

---

### Task 7: Milkdown outline panel

**Files:**
- Create: `src/modules/markdown/milkdown/OutlinePanel.tsx`

**Interfaces:**
- Consumes: `OutlineHeading` (Task 5); the tiptap outline panel `src/modules/markdown/tiptap/OutlinePanel.tsx` as the visual reference.
- Produces:

```ts
export function OutlinePanel(props: {
  headings: OutlineHeading[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Implement the panel**

Read `src/modules/markdown/tiptap/OutlinePanel.tsx` first and copy its container classes, width, header row (title + close button) and item styling exactly, so both engines look identical. The milkdown version is simpler: it is a pure list over props (no editor coupling):

```tsx
import { cn } from "@/lib/utils";
import type { OutlineHeading } from "@/modules/markdown/milkdown/outline";

export function OutlinePanel({ headings, onNavigate, onClose }: {
  headings: OutlineHeading[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className={/* copy container classes from tiptap OutlinePanel */ ""}>
      {/* copy header row markup from tiptap OutlinePanel, wire onClose */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {headings.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-muted-foreground">No headings</div>
        ) : (
          headings.map((h, i) => (
            <button
              key={`${h.id}-${i}`}
              type="button"
              onClick={() => onNavigate(h.id)}
              className={cn(
                /* copy item classes from tiptap OutlinePanel */ "",
              )}
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

The two `/* copy ... */` placeholders are filled from the real tiptap file at implementation time; matching it byte-for-byte on classes is the requirement, which is why this plan does not freeze them here.

- [ ] **Step 2: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green (component is not yet mounted anywhere; that is fine, Task 8 mounts it. If knip/lint flags the unused export, suppress by folding this task's commit into Task 8 instead of adding an ignore).

```bash
git add src/modules/markdown/milkdown/OutlinePanel.tsx
git commit -m "feat(markdown): outline panel for the milkdown engine"
```

---

### Task 8: MilkdownTab assembly

**Files:**
- Create: `src/modules/markdown/milkdown/MilkdownTab.tsx`

**Interfaces:**
- Consumes: `useMarkdownTabController` + `MarkdownDocFallback` (Task 3), `MilkdownEditor` + `MilkdownEditorHandle` + `OutlineHeading` (Task 5), `OutlinePanel` (Task 7), existing `EditorPane`/`EditorPaneHandle` (`src/modules/editor/EditorPane.tsx`), `EditorPathBar` (with the `trailing` slot added by the tiptap plan), `TabCallbacks` (`src/modules/workspaces/TabContent.tsx`).
- Produces (consumed by Task 9's lazy import):

```ts
export function MilkdownTab(props: {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
}): JSX.Element;
```

- [ ] **Step 1: Read the tiptap MarkdownTab header wiring**

Read `src/modules/markdown/tiptap/MarkdownTab.tsx` (post Task 3 refactor): note the exact `EditorPathBar` props it passes, the `trailing` control markup (Rich|Source two-segment control, outline button), and the root-level `onKeyDown` wiring. MilkdownTab mirrors all of it minus the Find button and minus the fixed Toolbar.

- [ ] **Step 2: Implement MilkdownTab**

Create `src/modules/markdown/milkdown/MilkdownTab.tsx`:

```tsx
import { useRef, useState } from "react";
import { EditorPane, type EditorPaneHandle } from "@/modules/editor/EditorPane";
import { MarkdownDocFallback } from "@/modules/markdown/lib/MarkdownDocFallback";
import { useMarkdownTabController } from "@/modules/markdown/lib/useMarkdownTabController";
import { MilkdownEditor, type MilkdownEditorHandle } from "@/modules/markdown/milkdown/MilkdownEditor";
import type { OutlineHeading } from "@/modules/markdown/milkdown/outline";
import { OutlinePanel } from "@/modules/markdown/milkdown/OutlinePanel";
import type { TabCallbacks } from "@/modules/workspaces/TabContent";

export function MilkdownTab(props: {
  tabId: string;
  path: string;
  visible: boolean;
  focused: boolean;
  callbacks: TabCallbacks;
}) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const milkRef = useRef<MilkdownEditorHandle>(null);
  const editorRef = useRef<EditorPaneHandle>(null);

  const ctrl = useMarkdownTabController({
    path: props.path,
    onDirtyChange: (d) => props.callbacks.onEditorDirtyChange?.(props.tabId, d),
    serializeRich: () => milkRef.current?.serialize() ?? null,
    saveSource: async () => {
      await editorRef.current?.save();
    },
    onToggleOutline: () => setOutlineOpen((v) => !v),
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (ctrl.handleShortcut(e.nativeEvent)) e.preventDefault();
  };

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={handleKeyDown}>
      {/* EditorPathBar with the same props MarkdownTab passes, trailing = outline button
          + Rich|Source segment control calling ctrl.toggleMode(); copy markup from
          tiptap/MarkdownTab.tsx, omit the Find button */}
      {ctrl.mode === "source" ? (
        <EditorPane
          ref={editorRef}
          path={props.path}
          /* remaining props exactly as tiptap MarkdownTab passes them in source mode */
        />
      ) : initError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
          <span>Milkdown could not open this document: {initError}</span>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-foreground hover:bg-accent"
            onClick={() => {
              setInitError(null);
              void ctrl.toggleMode();
            }}
          >
            Open in Source mode
          </button>
        </div>
      ) : ctrl.doc.status === "ready" ? (
        <div className="flex min-h-0 flex-1">
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
  );
}
```

The two `/* ... */` blocks are copied from the real `tiptap/MarkdownTab.tsx` at implementation time (same reason as Task 7: those props were finalized by the merged tiptap work and must match it, not this plan).

- [ ] **Step 3: Verify and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add src/modules/markdown/milkdown/MilkdownTab.tsx
git commit -m "feat(markdown): milkdown tab with source toggle and outline"
```

---

### Task 9: Preference third value and TabContent integration

**Files:**
- Modify: `src/modules/settings/store.ts` (extend `MarkdownEditorMode` + `parseMarkdownEditor`)
- Modify: `src/modules/settings/parseMarkdownEditor.test.ts`
- Modify: `src/modules/workspaces/TabContent.tsx` (lazy import + three-way switch)
- Modify: `docs/ARCHITECTURE.md` (JSON-only preference value list)

**Interfaces:**
- Consumes: `MilkdownTab` (Task 8), `parseMarkdownEditor` (Task 1).
- Produces: `Preferences.markdownEditor: "tiptap" | "milkdown" | "legacy"` (default `"tiptap"`, JSON-only, key unchanged so `EDITOR_PREF_KEY_MAP` and the default-persist block need no edits beyond what already exists).

- [ ] **Step 1: Extend the failing test**

In `src/modules/settings/parseMarkdownEditor.test.ts` add:

```ts
  it("accepts milkdown", () => {
    expect(parseMarkdownEditor("milkdown")).toBe("milkdown");
  });
```

Run: `pnpm test -- parseMarkdownEditor`
Expected: FAIL (returns `"tiptap"`).

- [ ] **Step 2: Extend the type and parser**

```ts
export type MarkdownEditorMode = "tiptap" | "milkdown" | "legacy";
export function parseMarkdownEditor(value: unknown): MarkdownEditorMode {
  return value === "legacy" || value === "milkdown" ? value : "tiptap";
}
```

Run: `pnpm test -- parseMarkdownEditor`
Expected: PASS (5 tests).

- [ ] **Step 3: Three-way TabContent switch**

In `src/modules/workspaces/TabContent.tsx`, next to the existing lazy `MarkdownTab` import:

```tsx
const MilkdownTab = lazy(() =>
  import("@/modules/markdown/milkdown/MilkdownTab").then((m) => ({ default: m.MilkdownTab })),
);
```

In `case "markdown"` (the `markdownEditor` preference is already read at the top of the component):

```tsx
case "markdown":
  if (markdownEditor === "tiptap") {
    return (
      <Suspense fallback={null}>
        <MarkdownTab tabId={tab.id} path={tab.path} visible={visible} focused={focused} callbacks={callbacks} />
      </Suspense>
    );
  }
  if (markdownEditor === "milkdown") {
    return (
      <Suspense fallback={null}>
        <MilkdownTab tabId={tab.id} path={tab.path} visible={visible} focused={focused} callbacks={callbacks} />
      </Suspense>
    );
  }
  return (
    /* existing legacy JSX, untouched */
  );
```

Dirty-dot plumbing needs no change: `onEditorDirtyChange` already handles `kind === "markdown"` (added by the tiptap plan) and MilkdownTab reports through the same callback.

- [ ] **Step 4: Update ARCHITECTURE.md**

The `markdownEditor` JSON-only entry now reads: `"tiptap" | "milkdown" | "legacy"` (default `"tiptap"`), one line on what each engine is.

- [ ] **Step 5: Manual verification of the three paths**

`pnpm tauri dev`; open a `.md` (tiptap engine appears). Quit; edit the settings JSON that holds editor preferences (the file `useMarkdownDocument`'s store uses; check `docs/ARCHITECTURE.md`, it is the editor settings JSON, `settings-editor.json` unless the merged code says otherwise) to `"markdownEditor": "milkdown"`; relaunch; the milkdown engine appears, editing marks the tab dirty, Ctrl+S saves, the Rich|Source toggle works both ways, outline opens and navigates. Set `"legacy"`; relaunch; the Streamdown preview appears unchanged.

- [ ] **Step 6: Full verification and commit**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add src/modules/settings/store.ts src/modules/settings/parseMarkdownEditor.test.ts src/modules/workspaces/TabContent.tsx docs/ARCHITECTURE.md
git commit -m "feat(markdown): milkdown engine selectable via markdownEditor preference"
```

---

### Task 10: Bundle measurement, living docs, manual checklist

**Files:**
- Modify: `docs/BUILD.md`, `docs/ARCHITECTURE.md`, `docs/FORK.md`, `AGENTS.md`, `CLAUDE.md`

- [ ] **Step 1: Measure the bundle**

```bash
git stash list   # ensure clean tree
pnpm build
```

Record from the build output: total dist size, the milkdown chunk size (gzip), whether mermaid/katex remain separate chunks, and the main-bundle delta vs the pre-task-4 baseline (`git checkout <task-3-commit> -- /dev/null` is not needed: run `pnpm build` on the merge-base commit in a second worktree if a baseline number is not already recorded in `docs/BUILD.md` by the tiptap plan; if it is, reuse it).

- [ ] **Step 2: Update the living docs**

- `docs/BUILD.md`: milkdown chunk numbers next to the tiptap ones.
- `docs/ARCHITECTURE.md`: markdown module three-engine map (`lib/` shared core, `tiptap/`, `milkdown/`, legacy preview), the shared tab shell, the lazy-chunk strategy.
- `docs/FORK.md`: divergence entry: Milkdown engine added for evaluation; explicit gap list vs the tiptap engine (callouts, details, highlight/underline/sub/sup/color, wiki-links, in-note find, fixed toolbar, move-line shortcuts, mermaid-typed-mid-session rendering, plus anything Task 4/6 recorded).
- `AGENTS.md`: module layout line for `markdown/` mentioning the three engines.
- `CLAUDE.md` glossary: add a row for the Milkdown engine (canonical term **MilkdownTab**, what it is, where it lives: `src/modules/markdown/milkdown/`; aliases: "milkdown", "el editor milkdown", "el tercer editor").

- [ ] **Step 3: Manual checklist (run every item)**

In `pnpm tauri dev`, with `"markdownEditor": "milkdown"`:

- [ ] Headings, bold/italic/strike via markdown syntax and via the floating toolbar
- [ ] Slash menu: insert heading, list, task list, table, code block, quote, image, math
- [ ] Task list checkbox click toggles and marks dirty
- [ ] Table: add/remove row and column from the table UI
- [ ] Code block: language picker works, content edits fine
- [ ] Math inline and block render (katex chunk loads on demand)
- [ ] Mermaid fence renders as diagram (or as code if the Task 6 escape hatch fired)
- [ ] Outline: toggle via button and via the `markdown.toggleOutline` shortcut, click navigates
- [ ] Rich -> Source: unsaved rich edits appear in source; Source -> Rich: source edits appear in rich
- [ ] `markdown.toggleSource` shortcut works; both shortcuts reassignable in Settings > Shortcuts
- [ ] Ctrl+S saves; autosave (enable `editorAutoSave`) saves after the delay; dirty dot appears/clears
- [ ] External edit (modify the file from a terminal) reloads when clean; does not clobber when dirty
- [ ] Frontmatter file: open, edit body, save; frontmatter preserved byte-exact at the top
- [ ] Open a no-edit session on a complex doc, close: file on disk untouched (mtime unchanged)
- [ ] Binary file renamed to `.md` shows the fallback message
- [ ] `"tiptap"` and `"legacy"` values still work (one smoke doc each)
- [ ] Theme switch (light/dark preset) restyles the milkdown surface without reload

- [ ] **Step 4: Final whole-branch review, commit, verify**

Run: `pnpm exec biome lint ./src && pnpm check-types && pnpm test`
Expected: all green.

```bash
git add docs/BUILD.md docs/ARCHITECTURE.md docs/FORK.md AGENTS.md CLAUDE.md
git commit -m "docs: milkdown engine architecture, fork divergence and bundle numbers"
```

Then use the `superpowers:finishing-a-development-branch` skill to integrate (PR or merge per the user's choice at that time). Before removing the worktree, harvest the ledger per the CLAUDE.md pending-work rules (any deferred minors go to `docs/PENDING.md` in the closing commit).
