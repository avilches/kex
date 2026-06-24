# HTML Preview + Editor Save Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live HTML/Markdown preview overlay for `.html` and `.md` editor panels (buffer-based, no save required), and move the save shortcut out of the hardcoded CodeMirror keymap into the global registry.

**Architecture:** The editor panel stays mounted in all states — preview is a CSS overlay (absolute inset-0 z-5) that appears on top of the hidden editor. Content flows from `EditorPane.onContentChange` (debounced 300ms) into a `liveContent` state in `PanelContent`, which feeds `MarkdownPreviewPane` or `HtmlPreviewPane`. The `EditorOverlayBar` lives at the `PanelContent` level and toggles between "raw" and "rendered" modes. Preview panes are pure content renderers with no overlay bar of their own. `editor.save` moves to the global shortcut registry with a handler in App.tsx that calls the active editor handle regardless of focus.

**Tech Stack:** React 19, TypeScript, CodeMirror 6 (`@uiw/react-codemirror`), Tauri 2 (`convertFileSrc`, `@tauri-apps/api/core`), Streamdown (Markdown renderer), Vitest, Tailwind v4.

## Global Constraints

- No hardcoded key comparisons — all shortcuts via registry entry + `matchesShortcut` or global handler
- No em-dash, no emojis anywhere
- Imports always `@/...` not relative across modules
- Commit messages in English, no "Co-authored-by"
- Run `pnpm exec biome lint ./src` (not `pnpm lint`) after each task
- Run `pnpm check-types` and `pnpm test --run` before each commit
- Worktree: `.claude/worktrees/html-preview`, branch `worktree-html-preview`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/utils.ts` | Modify | Add `isHtmlPath` |
| `src/modules/shortcuts/shortcuts.ts` | Modify | Add `"editor.save"` and `"editor.html.toggleView"` to `ShortcutId` union and `SHORTCUTS` array |
| `src/modules/workspaces/lib/types.ts` | Modify | Add `previewMode?: boolean` to editor panel variant |
| `docs/TODO.md` | Modify | Add split-view future note |
| `src/modules/editor/EditorPane.tsx` | Modify | Add `onContentChange?` prop, remove hardcoded `Mod-s` keymap |
| `src/modules/markdown/MarkdownPreviewPane.tsx` | Modify | Replace `path`/`visible`/disk-read with `content: string` prop |
| `src/modules/html-preview/HtmlPreviewPane.tsx` | Create | New component: srcdoc iframe with base tag injection |
| `src/modules/html-preview/index.ts` | Create | Barrel export |
| `src/modules/workspaces/PanelContent.tsx` | Modify | Overlay layout, `liveContent` state, debounced `onContentChange`, `onTogglePreview` callback, `kind:"markdown"` backward compat |
| `src/modules/editor/EditorOverlayBar.tsx` | Modify | Add `isHtml?: boolean` to `view` prop for shortcut label selection |
| `src/modules/workspaces/lib/useWorkspaces.ts` | Modify | Add `togglePreviewMode` |
| `src/app/App.tsx` | Modify | Add `onTogglePreview` callback, `editor.save`/`editor.html.toggleView` shortcut handlers, update `editor.markdown.toggleView` handler |

---

## Task 1: Foundations

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Modify: `src/modules/workspaces/lib/types.ts`
- Modify: `docs/TODO.md`
- Test: `src/lib/utils.test.ts` (create if absent, add `isHtmlPath` tests)

**Interfaces:**
- Produces: `isHtmlPath(path: string): boolean` exported from `@/lib/utils`
- Produces: `"editor.save"` and `"editor.html.toggleView"` added to `ShortcutId` union type
- Produces: `previewMode?: boolean` on the editor panel variant in `Panel` union

- [ ] **Step 1: Add `isHtmlPath` test**

Create `src/lib/utils.test.ts` (or append if it exists):

```typescript
import { describe, expect, it } from "vitest";
import { isHtmlPath, isMarkdownPath } from "./utils";

describe("isHtmlPath", () => {
  it("matches .html", () => expect(isHtmlPath("foo/bar.html")).toBe(true));
  it("matches .htm", () => expect(isHtmlPath("foo/bar.htm")).toBe(true));
  it("is case-insensitive", () => expect(isHtmlPath("FOO.HTML")).toBe(true));
  it("does not match .md", () => expect(isHtmlPath("foo.md")).toBe(false));
  it("does not match .tsx", () => expect(isHtmlPath("foo.tsx")).toBe(false));
});

describe("isMarkdownPath", () => {
  it("matches .md", () => expect(isMarkdownPath("foo.md")).toBe(true));
  it("does not match .html", () => expect(isMarkdownPath("foo.html")).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/lib/utils.test.ts
```

Expected: FAIL — `isHtmlPath` not found.

- [ ] **Step 3: Add `isHtmlPath` to `src/lib/utils.ts`**

```typescript
export function isHtmlPath(path: string): boolean {
  return /\.(html|htm)$/i.test(path)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/utils.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Add shortcut entries to `src/modules/shortcuts/shortcuts.ts`**

In the `ShortcutId` union type, add after `"editor.markdown.toggleView"`:

```typescript
| "editor.save"
| "editor.html.toggleView"
```

In the `SHORTCUTS` array, add after the `editor.markdown.toggleView` entry:

```typescript
{
  id: "editor.save",
  label: "Save file",
  group: "Editor",
  defaultBindings: [{ [MOD_PROP]: true, key: "s" }],
},
{
  id: "editor.html.toggleView",
  label: "Toggle HTML preview",
  group: "Editor",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "v" }],
},
```

- [ ] **Step 6: Add `previewMode` to editor panel type in `src/modules/workspaces/lib/types.ts`**

Replace the editor variant:

```typescript
| { id: string; kind: "editor"; path: string; title?: string; dirty: boolean; preview: boolean; previewMode?: boolean; locked?: boolean; autofocus?: boolean }
```

- [ ] **Step 7: Add split-view note to `docs/TODO.md`**

Append (or create the file):

```markdown
## Editor preview

- Split view (editor + preview side by side): the overlay architecture keeps the editor mounted,
  so this is a layout-only change — replace the hidden/shown divs with a flex-row split.
```

- [ ] **Step 8: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils.ts src/lib/utils.test.ts src/modules/shortcuts/shortcuts.ts src/modules/workspaces/lib/types.ts docs/TODO.md
git commit -m "feat: add isHtmlPath, editor.save and editor.html.toggleView shortcuts, previewMode panel field"
```

---

## Task 2: EditorPane — onContentChange prop and save shortcut

**Files:**
- Modify: `src/modules/editor/EditorPane.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (independent change)
- Produces: `onContentChange?: (content: string) => void` added to `Props` type; the hardcoded `Mod-s` keymap removed

- [ ] **Step 1: Add `onContentChange` to Props and wire into `onChange`**

In `EditorPane.tsx`, change the `Props` type (currently at line 81):

```typescript
type Props = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onContentChange?: (content: string) => void;
};
```

Update the function signature:

```typescript
export const EditorPane = forwardRef<EditorPaneHandle, Props>(
  function EditorPane({ path, onDirtyChange, onSaved, onContentChange }, ref) {
```

Store `onContentChange` in a ref so it can be called from the stable `onChange` without changing extensions identity:

```typescript
const onContentChangeRef = useRef(onContentChange);
onContentChangeRef.current = onContentChange;
```

In the `onChange` callback passed to `<CodeMirror>`, wire the call. The `onChange` prop of `CodeMirror` currently comes from `useDocument`. Find where `onChange` is used and add the call:

```typescript
// Wrap the document's onChange to also fire onContentChange
const handleChange = useCallback((value: string) => {
  onChange(value);
  onContentChangeRef.current?.(value);
}, [onChange]);
```

Then pass `handleChange` instead of `onChange` to `<CodeMirror onChange={handleChange} ...>`.

- [ ] **Step 2: Remove the hardcoded `Mod-s` keymap entry**

Find and remove the keymap block (around line 167):

```typescript
keymap.of([
  {
    key: "Mod-s",
    preventDefault: true,
    run: () => {
      void (async () => {
        await saveRef.current();
        onSavedRef.current?.();
      })();
      return true;
    },
  },
]),
```

Remove the entire `keymap.of([...])` entry from the `extensions` array. The save will now be handled globally by App.tsx.

- [ ] **Step 3: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/editor/EditorPane.tsx
git commit -m "feat(editor): add onContentChange prop, remove hardcoded Mod-s keymap"
```

---

## Task 3: MarkdownPreviewPane — buffer-based content

**Files:**
- Modify: `src/modules/markdown/MarkdownPreviewPane.tsx`

**Interfaces:**
- Consumes: nothing from previous tasks at runtime
- Produces: `MarkdownPreviewPane({ content: string, onSetView: (mode: "rendered" | "raw") => void })` — no `path`, no `visible`, no disk read

Note: `EditorOverlayBar` is removed from `MarkdownPreviewPane`. It will be rendered at the `PanelContent` level in Task 5.

- [ ] **Step 1: Rewrite `MarkdownPreviewPane.tsx`**

Replace the entire file:

```typescript
import type React from "react";
import { Streamdown } from "streamdown";

type Props = {
  content: string;
};

function MarkdownCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  );
}

function MarkdownParagraph({ children }: { children?: React.ReactNode }) {
  return <div className="my-[0.5714286em]">{children}</div>;
}

const components = { code: MarkdownCode, p: MarkdownParagraph };

export function MarkdownPreviewPane({ content }: Props) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background">
      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto px-6 py-4">
        <Streamdown
          className="select-text prose-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={components}
          linkSafety={{ enabled: false }}
        >
          {content}
        </Streamdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: TypeScript will report errors in `PanelContent.tsx` where `MarkdownPreviewPane` is called with the old props — these will be fixed in Task 5.

- [ ] **Step 3: Run tests**

```bash
pnpm test --run
```

Expected: all tests pass (no unit tests for MarkdownPreviewPane currently).

- [ ] **Step 4: Commit**

```bash
git add src/modules/markdown/MarkdownPreviewPane.tsx
git commit -m "refactor(markdown): accept content prop instead of reading from disk"
```

---

## Task 4: HtmlPreviewPane — new component

**Files:**
- Create: `src/modules/html-preview/HtmlPreviewPane.tsx`
- Create: `src/modules/html-preview/index.ts`
- Test: `src/modules/html-preview/HtmlPreviewPane.test.ts` (unit test for `injectBase`)

**Interfaces:**
- Consumes: `pathDirname` from `@/lib/pathUtils`, `convertFileSrc` from `@tauri-apps/api/core`
- Produces: `HtmlPreviewPane({ content: string, path: string })`, `injectBase(html: string, baseUrl: string): string`

- [ ] **Step 1: Write the `injectBase` test**

Create `src/modules/html-preview/HtmlPreviewPane.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { injectBase } from "./HtmlPreviewPane";

describe("injectBase", () => {
  it("inserts base tag after <head>", () => {
    const input = "<html><head><title>T</title></head><body></body></html>";
    const result = injectBase(input, "https://asset.localhost/foo/");
    expect(result).toBe(
      '<html><head><base href="https://asset.localhost/foo/"><title>T</title></head><body></body></html>'
    );
  });

  it("inserts base tag after <head> with attributes", () => {
    const input = '<html><head lang="en"><title>T</title></head></html>';
    const result = injectBase(input, "https://asset.localhost/foo/");
    expect(result).toContain('<head lang="en"><base href="https://asset.localhost/foo/">');
  });

  it("prepends base tag when no <head>", () => {
    const input = "<p>Hello</p>";
    const result = injectBase(input, "https://asset.localhost/foo/");
    expect(result).toBe('<base href="https://asset.localhost/foo/"><p>Hello</p>');
  });

  it("handles empty string", () => {
    const result = injectBase("", "https://asset.localhost/foo/");
    expect(result).toBe('<base href="https://asset.localhost/foo/">');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/modules/html-preview/HtmlPreviewPane.test.ts
```

Expected: FAIL — `injectBase` not found.

- [ ] **Step 3: Create `src/modules/html-preview/HtmlPreviewPane.tsx`**

```typescript
import { convertFileSrc } from "@tauri-apps/api/core";
import { pathDirname } from "@/lib/pathUtils";

type Props = {
  content: string;
  path: string;
};

export function injectBase(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl}">`;
  const match = html.match(/<head[^>]*>/i);
  if (match?.index !== undefined) {
    const insertAt = match.index + match[0].length;
    return html.slice(0, insertAt) + baseTag + html.slice(insertAt);
  }
  return baseTag + html;
}

export function HtmlPreviewPane({ content, path }: Props) {
  const dirPath = pathDirname(path);
  const baseUrl = convertFileSrc(dirPath) + "/";
  const contentWithBase = injectBase(content, baseUrl);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background">
      <iframe
        srcdoc={contentWithBase}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        title="HTML preview"
        className="h-full w-full border-0"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/modules/html-preview/index.ts`**

```typescript
export { HtmlPreviewPane } from "./HtmlPreviewPane";
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm exec vitest run src/modules/html-preview/HtmlPreviewPane.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors (HtmlPreviewPane is not yet imported anywhere).

- [ ] **Step 7: Commit**

```bash
git add src/modules/html-preview/HtmlPreviewPane.tsx src/modules/html-preview/index.ts src/modules/html-preview/HtmlPreviewPane.test.ts
git commit -m "feat: add HtmlPreviewPane with injectBase for relative path resolution"
```

---

## Task 5: EditorOverlayBar — isHtml flag

**Files:**
- Modify: `src/modules/editor/EditorOverlayBar.tsx`

**Interfaces:**
- Consumes: `"editor.html.toggleView"` shortcut ID (from Task 1)
- Produces: `view.isHtml?: boolean` prop; when true, uses `"editor.html.toggleView"` for the label instead of `"editor.markdown.toggleView"`

- [ ] **Step 1: Add `isHtml` to the view prop type and update `getShortcutLabel` call**

In `EditorOverlayBar.tsx`, update the `Props` type:

```typescript
type Props = {
  view?: {
    mode: MarkdownViewMode;
    onChange: (mode: MarkdownViewMode) => void;
    renderedDisabled?: boolean;
    renderedHint?: string;
    isHtml?: boolean;
  };
  viewToggles?: {
    ext: string;
    value: EditorViewSettings;
    onChange: (next: EditorViewSettings) => void;
  };
  globalToggles?: {
    value: EditorGlobalToggles;
    onToggle: (key: EditorGlobalToggleKey, value: boolean) => void;
  };
};
```

Update the `toggleLabel` line (currently line 61):

```typescript
const shortcutId = view?.isHtml ? "editor.html.toggleView" : "editor.markdown.toggleView";
const toggleLabel = view ? getShortcutLabel(shortcutId, userShortcuts) : null;
```

- [ ] **Step 2: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
pnpm test --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/modules/editor/EditorOverlayBar.tsx
git commit -m "feat(editor): add isHtml flag to EditorOverlayBar for HTML-specific shortcut label"
```

---

## Task 6: PanelContent — overlay layout, liveContent, kind:markdown compat

**Files:**
- Modify: `src/modules/workspaces/PanelContent.tsx`

**Interfaces:**
- Consumes:
  - `isHtmlPath(path)` from `@/lib/utils` (Task 1)
  - `previewMode?: boolean` on editor panel (Task 1)
  - `onContentChange?: (content: string) => void` on `EditorPane` (Task 2)
  - `MarkdownPreviewPane({ content: string })` (Task 3)
  - `HtmlPreviewPane({ content: string, path: string })` (Task 4)
  - `view.isHtml?: boolean` on `EditorOverlayBar` (Task 5)
- Produces:
  - `onTogglePreview?: (panelId: string) => void` added to `PanelCallbacks`
  - `kind: "markdown"` backward compat: renders EditorPane (hidden) + MarkdownPreviewPane

- [ ] **Step 1: Add imports and `onTogglePreview` to `PanelCallbacks`**

Add `isHtmlPath` to the import from `@/lib/utils`:

```typescript
import { isMarkdownPath, isHtmlPath } from "@/lib/utils";
```

Add lazy import for `HtmlPreviewPane`:

```typescript
const HtmlPreviewPane = lazy(() =>
  import("@/modules/html-preview/HtmlPreviewPane").then((m) => ({ default: m.HtmlPreviewPane as ComponentType<any> })),
);
```

In `PanelCallbacks`, add:

```typescript
onTogglePreview?: (panelId: string) => void;
```

- [ ] **Step 2: Add `liveContent` state and debounced `onContentChange` at the top of `PanelContent`**

At the top of the `PanelContent` function body, before the switch, add:

```typescript
const [liveContent, setLiveContent] = useState("");
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const prevPreviewModeRef = useRef(false);

const handleContentChange = useCallback((content: string) => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => setLiveContent(content), 300);
}, []);

// Cleanup debounce timer on unmount
useEffect(() => {
  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };
}, []);

// Derive previewMode: true for editor panels with previewMode flag, always true for kind:"markdown"
const previewMode =
  panel.kind === "editor"
    ? (panel.previewMode ?? false)
    : panel.kind === "markdown";

// Seed liveContent from editor buffer when preview mode first activates
useEffect(() => {
  if (previewMode && !prevPreviewModeRef.current) {
    const content = editorRef.current?.getContent();
    if (content != null) setLiveContent(content);
  }
  prevPreviewModeRef.current = previewMode;
}, [previewMode]);
```

These hooks must be called unconditionally (React rules). Place them BEFORE the `switch` statement.

- [ ] **Step 3: Rewrite `case "editor"` in the switch**

Replace the existing `case "editor"` block:

```typescript
case "editor": {
  const ismd = isMarkdownPath(panel.path);
  const ishtml = isHtmlPath(panel.path);
  const showPreviewToggle = ismd || ishtml;

  const viewToggles = {
    ext: extOf(panel.path),
    value: resolveEditorView(panel.path, editorViewByExt),
    onChange: (next: EditorViewSettings) =>
      void setEditorViewForExt(extOf(panel.path), next),
  };

  return (
    <Suspense fallback={null}>
      <div className="relative h-full w-full">
        <EditorOverlayBar
          view={
            showPreviewToggle
              ? {
                  mode: previewMode ? "rendered" : "raw",
                  onChange: () => callbacks.onTogglePreview?.(panel.id),
                  isHtml: ishtml,
                }
              : undefined
          }
          viewToggles={!previewMode ? viewToggles : undefined}
          globalToggles={!previewMode ? globalToggles : undefined}
        />
        <div
          className={
            previewMode
              ? "absolute inset-0 invisible pointer-events-none"
              : "h-full w-full"
          }
        >
          <EditorPane
            ref={(h: EditorPaneHandle | null) => {
              (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
              callbacks.registerEditorHandle?.(panel.id, h);
            }}
            path={panel.path}
            onDirtyChange={(dirty: boolean) =>
              callbacks.onEditorDirtyChange?.(panel.id, dirty)
            }
            onClose={() => callbacks.onEditorClose?.(panel.id)}
            onContentChange={handleContentChange}
          />
        </div>
        {previewMode && ismd && (
          <div className="absolute inset-0" style={{ zIndex: 5 }}>
            <MarkdownPreviewPane content={liveContent} />
          </div>
        )}
        {previewMode && ishtml && (
          <div className="absolute inset-0" style={{ zIndex: 5 }}>
            <HtmlPreviewPane content={liveContent} path={panel.path} />
          </div>
        )}
      </div>
    </Suspense>
  );
}
```

Note: `EditorOverlayBar` is positioned `absolute right-3 top-3 z-10` internally, so it will float above both the editor and the preview pane at z-5.

- [ ] **Step 4: Rewrite `case "markdown"` for backward compatibility**

Replace the existing `case "markdown"` block:

```typescript
case "markdown":
  return (
    <Suspense fallback={null}>
      <div className="relative h-full w-full">
        <EditorOverlayBar
          view={{
            mode: "rendered",
            onChange: (mode: "rendered" | "raw") =>
              callbacks.onSetMarkdownView?.(panel.id, mode),
          }}
        />
        <div className="absolute inset-0 invisible pointer-events-none">
          <EditorPane
            ref={(h: EditorPaneHandle | null) => {
              (editorRef as React.MutableRefObject<EditorPaneHandle | null>).current = h;
            }}
            path={panel.path}
            onContentChange={handleContentChange}
          />
        </div>
        <div className="absolute inset-0" style={{ zIndex: 5 }}>
          <MarkdownPreviewPane content={liveContent} />
        </div>
      </div>
    </Suspense>
  );
```

Note: The `kind: "markdown"` EditorPane is NOT registered in `callbacks.registerEditorHandle` since the user cannot save or search it. The toggle back to "editor" still works via `onSetMarkdownView` → App.tsx → `setPanelView("raw")`, which replaces the panel with a `kind: "editor"` panel.

- [ ] **Step 5: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: possible errors in App.tsx where `MarkdownPreviewPane` is still used with old props — those are fixed in Task 7.

- [ ] **Step 6: Run tests**

```bash
pnpm test --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/workspaces/PanelContent.tsx
git commit -m "feat(panel): overlay preview layout with liveContent, backward compat for kind:markdown"
```

---

## Task 7: useWorkspaces — togglePreviewMode

**Files:**
- Modify: `src/modules/workspaces/lib/useWorkspaces.ts`

**Interfaces:**
- Consumes: `updatePanelData` (already in useWorkspaces)
- Produces: `togglePreviewMode(workspaceId: string, panelId: string): void` — exported from `useWorkspaces` return value and `UseWorkspacesReturn` type

- [ ] **Step 1: Add `togglePreviewMode` implementation**

After `setPanelView` (around line 480), add:

```typescript
const togglePreviewMode = useCallback((workspaceId: string, panelId: string) => {
  updatePanelData(workspaceId, panelId, (p) => {
    if (p.kind !== "editor") return p;
    return { ...p, previewMode: !(p.previewMode ?? false) };
  });
}, [updatePanelData]);
```

- [ ] **Step 2: Export from the return object**

Add `togglePreviewMode` to the return object (after `setPanelView`):

```typescript
togglePreviewMode,
```

- [ ] **Step 3: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
pnpm test --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/lib/useWorkspaces.ts
git commit -m "feat(workspaces): add togglePreviewMode for editor panels"
```

---

## Task 8: App.tsx — wiring all the pieces

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes:
  - `togglePreviewMode(workspaceId, panelId)` from `useWorkspaces` (Task 7)
  - `isHtmlPath` from `@/lib/utils` (Task 1)
  - `onTogglePreview?` in `PanelCallbacks` (Task 6)
  - `"editor.save"` and `"editor.html.toggleView"` in `ShortcutId` (Task 1)

- [ ] **Step 1: Destructure `togglePreviewMode` and import `isHtmlPath`**

Add `isHtmlPath` to the import from `@/lib/utils`:

```typescript
import { isMarkdownPath, isHtmlPath } from "@/lib/utils";
```

Add `togglePreviewMode` to the destructuring from `useWorkspaces` (near line 177 where `setPanelView` is destructured):

```typescript
togglePreviewMode,
```

- [ ] **Step 2: Add `onTogglePreview` to the `callbacks` object**

In the `useMemo` that builds `callbacks` (around line 1155), add after `onSetMarkdownView`:

```typescript
onTogglePreview: (panelId) => {
  const found = findPanelGlobal(panelId);
  if (found) togglePreviewMode(found.workspace.id, panelId);
},
```

Add `togglePreviewMode` to the `useMemo` deps array (at the end of the deps list near line 1221).

- [ ] **Step 3: Update `editor.markdown.toggleView` shortcut handler**

Replace the existing `"editor.markdown.toggleView"` handler in `shortcutHandlers` (around line 1709):

```typescript
"editor.markdown.toggleView": () => {
  if (!activePanel || !activePanelId || !activeWorkspaceId) return;
  if (activePanel.kind === "editor" && isMarkdownPath(activePanel.path)) {
    togglePreviewMode(activeWorkspaceId, activePanelId);
  } else if (activePanel.kind === "markdown") {
    // backward compat: kind:"markdown" panels switch back via setPanelView
    setPanelView(activeWorkspaceId, activePanelId, "raw");
  }
},
```

- [ ] **Step 4: Add `editor.html.toggleView` and `editor.save` shortcut handlers**

After the `"editor.markdown.toggleView"` handler, add:

```typescript
"editor.html.toggleView": () => {
  if (!activePanel || !activePanelId || !activeWorkspaceId) return;
  if (activePanel.kind === "editor" && isHtmlPath(activePanel.path)) {
    togglePreviewMode(activeWorkspaceId, activePanelId);
  }
},
"editor.save": () => {
  if (!activePanelId) return;
  const handle = editorHandles.current.get(activePanelId);
  if (handle) void handle.save();
},
```

- [ ] **Step 5: Update `shortcutsDisabled` for the new/changed shortcut IDs**

In the `shortcutsDisabled` callback (around line 1874), update the `editor.markdown.toggleView` case and add new cases:

```typescript
if (id === "editor.markdown.toggleView") {
  return !(
    activePanel?.kind === "markdown" ||
    (activePanel?.kind === "editor" && isMarkdownPath((activePanel as { path: string }).path))
  );
}
if (id === "editor.html.toggleView") {
  return !(
    activePanel?.kind === "editor" &&
    isHtmlPath((activePanel as { path: string }).path)
  );
}
if (id === "editor.save") {
  return activePanel?.kind !== "editor";
}
```

- [ ] **Step 6: Check types and lint**

```bash
pnpm check-types && pnpm exec biome lint ./src
```

Expected: no errors.

- [ ] **Step 7: Run full test suite**

```bash
pnpm test --run
```

Expected: all 496+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(app): wire onTogglePreview, editor.save global handler, editor.html.toggleView shortcut"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Floating toggle button for `.html` and `.md` | Task 5 (EditorOverlayBar in PanelContent), Task 6 (EditorOverlayBar.isHtml) |
| Preview shows buffer content, no save required | Task 2 (onContentChange), Task 6 (liveContent seeded from editorRef) |
| ~300ms debounce | Task 6 (handleContentChange with setTimeout 300) |
| Disk changes propagate to preview via editor reload | Inherited from useEditorFileSync — no change needed |
| `kind:"markdown"` backward compat | Task 6 (case "markdown" rewritten) |
| HTML: srcdoc + base tag injection | Task 4 (HtmlPreviewPane, injectBase) |
| `previewMode` persists across tab switches | Task 1 (added to panel type), Task 7 (togglePreviewMode updates store) |
| `editor.save` in registry | Task 1 (shortcuts.ts), Task 2 (keymap removed), Task 8 (global handler) |
| `editor.save` fires even when CodeMirror lacks focus | Task 8 (global handler via useGlobalShortcuts) |
| Split-view noted for future | Task 1 (docs/TODO.md) |

### Placeholder scan

No TBDs, TODOs, or vague steps found.

### Type consistency

- `isHtmlPath` defined in Task 1, consumed in Tasks 6 and 8 — consistent
- `previewMode?: boolean` on editor panel defined in Task 1, written in Task 7, read in Task 6 — consistent
- `onContentChange?: (content: string) => void` defined in Task 2, passed in Task 6 — consistent
- `MarkdownPreviewPane({ content: string })` defined in Task 3, consumed in Task 6 — consistent
- `HtmlPreviewPane({ content: string, path: string })` defined in Task 4, consumed in Task 6 — consistent
- `view.isHtml?: boolean` defined in Task 5, passed from Task 6 — consistent
- `onTogglePreview?: (panelId: string) => void` in `PanelCallbacks` added in Task 6, implemented in Task 8 — consistent
- `togglePreviewMode(workspaceId: string, panelId: string)` defined in Task 7, destructured and called in Task 8 — consistent
- `"editor.save"` and `"editor.html.toggleView"` in `ShortcutId` from Task 1, referenced in Tasks 5, 6, 8 — consistent

### Gaps identified and addressed

- `editorRef` in PanelContent is used for both `kind: "editor"` and `kind: "markdown"` cases — handled in Task 6 (same ref, each case assigns to it)
- `kind: "markdown"` EditorPane registration: explicitly NOT registered in `callbacks.registerEditorHandle` to avoid the handle being used for global operations on a panel the user can't directly save
- The `OnEditorClose` callback is not passed to the `kind: "markdown"` EditorPane — intentional, since close is handled by the panel-level tab bar, not the EditorPane itself
