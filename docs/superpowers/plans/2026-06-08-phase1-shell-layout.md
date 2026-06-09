# Phase 1 — Shell Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Terax to a 3-column layout — workspace sidebar left, content center, tools panel right — without changing the content model, plus UUID tab IDs, dnd-kit installation, and multi-window support.

**Architecture:** `WorkspaceSidebar` (52px left) replaces the horizontal tab bar. `RightPanel` (240px right, resizable/collapsible) replaces the left sidebar panels. Content center is pixel-identical to current. `Tab.id` migrates from `number` to `string` UUID as the cross-window identity foundation. A new `open_main_window` Rust command enables multiple app windows.

**Tech Stack:** React 19, TypeScript, Tauri 2, `react-resizable-panels` (already installed), `@dnd-kit/core` (new), `tauri-plugin-store` (already wired), Zustand.

---

## File map

| File | Action |
|---|---|
| `src/modules/tabs/lib/useTabs.ts` | Modify — `Tab.id` `number→string`, split `nextIdRef` into `nextPaneIdRef` |
| `src/modules/tabs/index.ts` | Modify — re-export updated types |
| `src/app/components/WorkspaceSidebar.tsx` | **Create** |
| `src/app/components/RightPanel.tsx` | **Create** |
| `src/app/App.tsx` | Modify — 3-column layout, wire new components |
| `src/modules/header/Header.tsx` | Modify — remove `TabBar` and its props |
| `src/modules/sidebar/SidebarRail.tsx` | **Delete** |
| `src/modules/sidebar/useSidebarPanel.ts` | **Delete** |
| `src/modules/sidebar/index.ts` | Modify — remove deleted exports |
| `src/modules/settings/store.ts` | Modify — add 3 right-panel preference keys |
| `src/modules/shortcuts/shortcuts.ts` | Modify — replace `sidebar.*`, add `rightPanel.*`, `window.new`, `workspace.*` |
| `src-tauri/src/lib.rs` | Modify — add `open_main_window` command |
| `src/lib/native.ts` | Modify — add `openMainWindow()` wrapper |

---

## Task 1: Migrate Tab.id from number to string UUID

`useTabs.ts` uses a shared `nextIdRef` counter for both tab IDs and pane/leaf IDs. This task splits them: tab IDs become UUIDs, pane IDs keep a numeric counter (`nextPaneIdRef`).

**Files:**
- Modify: `src/modules/tabs/lib/useTabs.ts`

- [ ] **Step 1: Change all Tab type `id` fields from `number` to `string`**

In `src/modules/tabs/lib/useTabs.ts`, replace every `id: number;` inside the Tab type definitions with `id: string;`:

```typescript
export type TerminalTab = {
  id: string;   // was: number
  kind: "terminal";
  // ...rest unchanged
};

export type EditorTab = {
  id: string;   // was: number
  kind: "editor";
  // ...rest unchanged
};

export type PreviewTab = {
  id: string;   // was: number
  kind: "preview";
  // ...rest unchanged
};

export type MarkdownTab = {
  id: string;   // was: number
  kind: "markdown";
  // ...rest unchanged
};

export type AiDiffTab = {
  id: string;   // was: number
  kind: "ai-diff";
  // ...rest unchanged
};

export type GitDiffTab = {
  id: string;   // was: number
  kind: "git-diff";
  // ...rest unchanged
};

export type GitHistoryTab = {
  id: string;   // was: number
  kind: "git-history";
  // ...rest unchanged
};

export type GitCommitFileDiffTab = {
  id: string;   // was: number
  kind: "git-commit-file";
  // ...rest unchanged
};
```

- [ ] **Step 2: Split the shared counter — rename `nextIdRef` to `nextPaneIdRef`**

The current `nextIdRef` is used for BOTH tab IDs and pane/leaf IDs inside pane trees. After this step, it only handles pane IDs. Tab IDs use `crypto.randomUUID()`.

Replace the `useTabs` function body start:

```typescript
// Before (around line 155-156):
const [activeId, setActiveId] = useState(1);
const nextIdRef = useRef(3);

// After:
// Initial tab gets a stable UUID generated once via lazy initializer
const [activeId, setActiveId] = useState<string>(() => crypto.randomUUID());
const nextPaneIdRef = useRef(3);  // only for PaneNode IDs (leaves, splits)
```

Replace the initial state in `useState<Tab[]>`:

```typescript
// Before (around line 141-154):
const [tabs, setTabs] = useState<Tab[]>(() => {
  const tabId = 1;
  const leafId = 2;
  return [
    {
      id: tabId,
      ...
    },
  ];
});
const [activeId, setActiveId] = useState(1);
const nextIdRef = useRef(3);

// After:
const initialTabId = crypto.randomUUID();
const [tabs, setTabs] = useState<Tab[]>(() => {
  const leafId = 2;
  return [
    {
      id: initialTabId,
      kind: "terminal",
      title: initial?.title ?? "shell",
      cwd: initial?.cwd,
      paneTree: { kind: "leaf", id: leafId, cwd: initial?.cwd },
      activeLeafId: leafId,
    },
  ];
});
const [activeId, setActiveId] = useState<string>(initialTabId);
const nextPaneIdRef = useRef(3);
```

- [ ] **Step 3: Update every `nextIdRef.current++` that produces a TAB id**

Search for all occurrences of `nextIdRef.current++` in `useTabs.ts`. Each one that assigns to `tabId` becomes `crypto.randomUUID()`. Each one that assigns to `leafId` or `splitId` becomes `nextPaneIdRef.current++`.

Pattern for all `newTab`, `newBlockTab`, `newAgentTab`, `newPrivateTab` and similar:

```typescript
// Before:
const tabId = nextIdRef.current++;
const leafId = nextIdRef.current++;

// After:
const tabId = crypto.randomUUID();
const leafId = nextPaneIdRef.current++;
```

For `openFileTab`, `newPreviewTab`, `newMarkdownTab`, `openGitDiffTab`, `openCommitHistoryTab`, `openCommitFileDiffTab` — each generates only a `tabId`:

```typescript
// Before:
const id = nextIdRef.current++;

// After:
const id = crypto.randomUUID();
```

For `splitActivePane` (line ~721) — generates `splitId` and `leafId`, both are pane IDs:

```typescript
// Before:
const splitId = nextIdRef.current++;
const leafId = nextIdRef.current++;

// After:
const splitId = nextPaneIdRef.current++;
const leafId = nextPaneIdRef.current++;
```

For `resetWorkspace` (line ~809) — generates `tabId` and `leafId`:

```typescript
// Before:
const tabId = nextIdRef.current++;
const leafId = nextIdRef.current++;

// After:
const tabId = crypto.randomUUID();
const leafId = nextPaneIdRef.current++;
```

- [ ] **Step 4: Update return types of tab-creating functions**

All functions that return the new tab's ID now return `string` instead of `number`:

```typescript
// newTab, newBlockTab, newAgentTab, newPrivateTab:
const newTab = useCallback((cwd?: string): string => { ... }, []);

// openFileTab, newPreviewTab, newMarkdownTab, etc:
const openFileTab = useCallback((...): string | null => { ... }, [...]);
```

Update `setActiveId` call sites — they already receive the UUID `tabId`, just ensure the state setter accepts `string` (it does now from Step 2).

- [ ] **Step 5: Fix TypeScript errors**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm check-types 2>&1 | head -40
```

For each error:
- `Argument of type 'string' is not assignable to parameter of type 'number'` → the caller stored the return value as `number`; change to `string`.
- `Type 'number' is not assignable to type 'string'` on `tab.id` comparisons with `activeId` → `activeId` is now `string`, comparisons still work.
- Any place that uses `tab.id` arithmetically (unlikely) → replace with UUID logic.

Common fix pattern in `App.tsx` for stored tab IDs:
```typescript
// Before: const id = openFileTab(path);  // id: number | null
// After:  const id = openFileTab(path);  // id: string | null — no change needed
```

- [ ] **Step 6: Write unit test for UUID generation**

Create `src/modules/tabs/lib/useTabs.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Tab ID format", () => {
  test("crypto.randomUUID produces valid v4 UUIDs", () => {
    const id = crypto.randomUUID();
    expect(UUID_RE.test(id)).toBe(true);
  });

  test("each call produces a unique ID", () => {
    const ids = Array.from({ length: 20 }, () => crypto.randomUUID());
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });
});
```

- [ ] **Step 7: Run tests**

```bash
pnpm test 2>&1 | tail -8
```

Expected: all pass including the new UUID test.

- [ ] **Step 8: Final type check**

```bash
pnpm check-types 2>&1 | head -5
```

Expected: no output (zero errors).

- [ ] **Step 9: Commit**

```bash
git add src/modules/tabs/lib/useTabs.ts src/modules/tabs/lib/useTabs.test.ts
git commit -m "refactor: migrate Tab.id from number to string UUID"
```

---

## Task 2: Install dnd-kit

**Files:** `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install packages**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify no regressions**

```bash
pnpm check-types 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add dnd-kit dependencies for Phase 4 drag support"
```

---

## Task 3: Add RightPanel preference keys

**Files:**
- Modify: `src/modules/settings/store.ts`

- [ ] **Step 1: Add type to `Preferences`**

In `src/modules/settings/store.ts`, add to the `Preferences` type (after `editorAutoSaveDelay`):

```typescript
export type Preferences = {
  // ...existing fields...
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  rightPanelActiveTab: "explorer" | "git" | "history";
};
```

- [ ] **Step 2: Add KEY_ constants**

After the existing KEY_ constants block:

```typescript
const KEY_RIGHT_PANEL_OPEN = "rightPanelOpen";
const KEY_RIGHT_PANEL_WIDTH = "rightPanelWidth";
const KEY_RIGHT_PANEL_ACTIVE_TAB = "rightPanelActiveTab";
```

- [ ] **Step 3: Add defaults**

In `DEFAULT_PREFERENCES`, add after `editorAutoSaveDelay`:

```typescript
rightPanelOpen: true,
rightPanelWidth: 240,
rightPanelActiveTab: "explorer",
```

- [ ] **Step 4: Add load logic**

In `loadPreferences()`, add after the `editorAutoSaveDelay` entry:

```typescript
rightPanelOpen:
  get<boolean>(KEY_RIGHT_PANEL_OPEN) ?? DEFAULT_PREFERENCES.rightPanelOpen,
rightPanelWidth: (() => {
  const w = get<number>(KEY_RIGHT_PANEL_WIDTH) ?? DEFAULT_PREFERENCES.rightPanelWidth;
  return Number.isFinite(w) ? Math.min(480, Math.max(160, w)) : DEFAULT_PREFERENCES.rightPanelWidth;
})(),
rightPanelActiveTab:
  get<"explorer" | "git" | "history">(KEY_RIGHT_PANEL_ACTIVE_TAB) ??
  DEFAULT_PREFERENCES.rightPanelActiveTab,
```

- [ ] **Step 5: Add setter functions**

At the end of the setters section, before `onPreferencesChange`:

```typescript
export async function setRightPanelOpen(value: boolean): Promise<void> {
  await writePref(KEY_RIGHT_PANEL_OPEN, value);
}

export async function setRightPanelWidth(value: number): Promise<void> {
  const clamped = Number.isFinite(value) ? Math.min(480, Math.max(160, Math.round(value))) : 240;
  await writePref(KEY_RIGHT_PANEL_WIDTH, clamped);
}

export async function setRightPanelActiveTab(
  value: "explorer" | "git" | "history",
): Promise<void> {
  await writePref(KEY_RIGHT_PANEL_ACTIVE_TAB, value);
}
```

- [ ] **Step 6: Add to `onPreferencesChange` map**

In the `map` object inside `onPreferencesChange`, add:

```typescript
[KEY_RIGHT_PANEL_OPEN]: "rightPanelOpen",
[KEY_RIGHT_PANEL_WIDTH]: "rightPanelWidth",
[KEY_RIGHT_PANEL_ACTIVE_TAB]: "rightPanelActiveTab",
```

- [ ] **Step 7: Type check**

```bash
pnpm check-types 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/modules/settings/store.ts
git commit -m "feat: add rightPanel preference keys to settings store"
```

---

## Task 4: Create WorkspaceSidebar

**Files:**
- Create: `src/app/components/WorkspaceSidebar.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/app/components/WorkspaceSidebar.tsx
import { cn } from "@/lib/utils";
import type { Tab } from "@/modules/tabs";

export type WorkspaceSidebarProps = {
  workspaces: Pick<Tab, "id" | "title" | "kind">[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

function abbrev(title: string, kind: string): string {
  const text = title.trim() || kind;
  const words = text.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

// Stable hue 0–359 derived from the workspace ID string.
function idHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

export function WorkspaceSidebar({
  workspaces,
  activeId,
  onSelect,
  onNew,
}: WorkspaceSidebarProps) {
  return (
    <nav
      aria-label="Workspaces"
      className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 border-r border-border/60 bg-card/60 py-2"
    >
      {workspaces.map((ws) => {
        const active = ws.id === activeId;
        const hue = idHue(ws.id);
        return (
          <button
            key={ws.id}
            type="button"
            title={ws.title || ws.kind}
            aria-pressed={active}
            onClick={() => onSelect(ws.id)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-semibold transition-all select-none",
              active
                ? "text-white ring-2 ring-offset-1 ring-offset-card"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            style={
              active
                ? {
                    backgroundColor: `hsl(${hue} 55% 42%)`,
                    ringColor: `hsl(${hue} 55% 55%)`,
                  }
                : undefined
            }
          >
            {abbrev(ws.title, ws.kind)}
          </button>
        );
      })}
      <div className="flex-1" />
      <button
        type="button"
        title="New workspace (⌘⇧N)"
        onClick={onNew}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/60 text-lg text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        +
      </button>
    </nav>
  );
}
```

- [ ] **Step 2: Write unit tests for pure logic**

Create `src/app/components/WorkspaceSidebar.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

// Copy the pure functions here to test them in isolation
function abbrev(title: string, kind: string): string {
  const text = title.trim() || kind;
  const words = text.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function idHue(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}

describe("WorkspaceSidebar helpers", () => {
  describe("abbrev", () => {
    test("two-word title gives initials", () => {
      expect(abbrev("my-repo", "terminal")).toBe("MR");
    });
    test("single word gives first 2 chars uppercased", () => {
      expect(abbrev("api", "terminal")).toBe("AP");
    });
    test("empty title falls back to kind", () => {
      expect(abbrev("", "terminal")).toBe("TE");
    });
    test("slash-separated path gives initials", () => {
      expect(abbrev("projects/foo", "terminal")).toBe("PF");
    });
  });

  describe("idHue", () => {
    test("returns a number in 0-359", () => {
      const hue = idHue(crypto.randomUUID());
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });
    test("same ID always gives same hue", () => {
      const id = "abc-123-fixed";
      expect(idHue(id)).toBe(idHue(id));
    });
    test("different IDs typically give different hues", () => {
      const hues = new Set(
        Array.from({ length: 20 }, () => idHue(crypto.randomUUID()))
      );
      expect(hues.size).toBeGreaterThan(10);
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test 2>&1 | tail -8
```

Expected: all pass.

- [ ] **Step 4: Type check**

```bash
pnpm check-types 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/WorkspaceSidebar.tsx src/app/components/WorkspaceSidebar.test.ts
git commit -m "feat: add WorkspaceSidebar component"
```

---

## Task 5: Create RightPanel

**Files:**
- Create: `src/app/components/RightPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/app/components/RightPanel.tsx
import { cn } from "@/lib/utils";
import type { FileExplorerHandle } from "@/modules/explorer";
import { FileExplorer } from "@/modules/explorer";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import { GitHistoryPane } from "@/modules/git-history";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setRightPanelActiveTab,
  setRightPanelWidth,
} from "@/modules/settings/store";
import type { SourceControlSummary } from "@/modules/source-control";
import { SourceControlPanel } from "@/modules/source-control";
import type { WorkspaceEnv } from "@/modules/workspace";
import { forwardRef, useImperativeHandle, useRef } from "react";

export type RightPanelHandle = {
  focusExplorer: () => void;
};

export type RightPanelProps = {
  explorerRoot: string | null;
  explorerActiveFilePath: string | null;
  home: string | null;
  onOpenFile: (path: string, preview?: boolean) => void;
  onPathRenamed: (from: string, to: string) => void;
  onPathDeleted: (path: string) => void;
  onRevealInTerminal: (path: string) => void;
  onOpenMarkdownPreview: (path: string) => void;
  sourceControl: SourceControlSummary;
  onOpenDiff: (params: {
    path: string;
    repoRoot: string;
    mode: "-" | "+";
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenGitGraph: (repoRoot: string) => void;
  onOpenCommitFile: (params: {
    repoRoot: string;
    sha: string;
    shortSha: string;
    subject: string;
    path: string;
    originalPath: string | null;
  }) => void;
  onGitHistorySearchHandle: (h: GitHistorySearchHandle | null) => void;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
};

const TABS = [
  { id: "explorer" as const, label: "Explorer" },
  { id: "git" as const, label: "Git" },
  { id: "history" as const, label: "History" },
];

export const RightPanel = forwardRef<RightPanelHandle, RightPanelProps>(
  function RightPanel(
    {
      explorerRoot,
      explorerActiveFilePath,
      home,
      onOpenFile,
      onPathRenamed,
      onPathDeleted,
      onRevealInTerminal,
      onOpenMarkdownPreview,
      sourceControl,
      onOpenDiff,
      onOpenGitGraph,
      onOpenCommitFile,
      onGitHistorySearchHandle,
    },
    ref,
  ) {
    const activeTab = usePreferencesStore((s) => s.rightPanelActiveTab);
    const explorerRef = useRef<FileExplorerHandle>(null);

    useImperativeHandle(ref, () => ({
      focusExplorer: () => explorerRef.current?.focusSearch(),
    }));

    return (
      <div className="flex h-full flex-col bg-card/40">
        {/* Tab strip */}
        <div className="flex h-8 shrink-0 items-center border-b border-border/60 bg-card/60">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => void setRightPanelActiveTab(tab.id)}
              className={cn(
                "h-full px-3 text-[11px] font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content — all three are mounted, only active one is visible */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              activeTab !== "explorer" && "invisible pointer-events-none",
            )}
          >
            <FileExplorer
              ref={explorerRef}
              rootPath={explorerRoot}
              activeFilePath={explorerActiveFilePath}
              onOpenFile={onOpenFile}
              onPathRenamed={onPathRenamed}
              onPathDeleted={onPathDeleted}
              onRevealInTerminal={onRevealInTerminal}
              onOpenMarkdownPreview={onOpenMarkdownPreview}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              activeTab !== "git" && "invisible pointer-events-none",
            )}
          >
            <SourceControlPanel
              open={activeTab === "git"}
              sourceControl={sourceControl}
              onOpenDiff={onOpenDiff}
              onOpenGitGraph={onOpenGitGraph}
              onOpenFile={onOpenFile}
            />
          </div>
          <div
            className={cn(
              "absolute inset-0 overflow-auto",
              activeTab !== "history" && "invisible pointer-events-none",
            )}
          >
            <GitHistoryPane
              repoRoot={explorerRoot}
              home={home}
              onOpenCommitFile={onOpenCommitFile}
              onSearchHandle={onGitHistorySearchHandle}
            />
          </div>
        </div>
      </div>
    );
  },
);
```

- [ ] **Step 2: Type check**

```bash
pnpm check-types 2>&1 | head -20
```

Fix any prop mismatches by reading the actual prop types of `FileExplorer`, `SourceControlPanel`, `GitHistoryPane` from their respective `index.ts` files and adjusting the `RightPanelProps` accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/RightPanel.tsx
git commit -m "feat: add RightPanel component with Explorer/Git/History tabs"
```

---

## Task 6: Add open_main_window Rust command

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/native.ts`

- [ ] **Step 1: Add `open_main_window` to lib.rs**

In `src-tauri/src/lib.rs`, add the new command just after `open_settings_window`:

```rust
#[tauri::command]
async fn open_main_window(app: tauri::AppHandle) -> Result<(), String> {
    // Generate a unique label so multiple main windows can coexist.
    let label = format!("main-{}", uuid_v4_hex());
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Terax")
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 480.0)
        .resizable(true)
        .visible(false);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    { let _ = window.set_decorations(false); }

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Simple hex string from 8 random bytes — good enough for window labels.
fn uuid_v4_hex() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:08x}", nanos)
}
```

- [ ] **Step 2: Register the command in `tauri::generate_handler!`**

Find the `tauri::generate_handler![` block in `lib.rs` and add `open_main_window,` alongside `open_settings_window,`:

```rust
tauri::generate_handler![
    open_settings_window,
    open_main_window,   // add this
    get_launch_dir,
    // ... rest unchanged
]
```

- [ ] **Step 3: Compile and lint**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/src-tauri
cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
```

Expected: no warnings or errors.

- [ ] **Step 4: Add `openMainWindow` to native.ts**

In `src/lib/native.ts`, add to the `native` object after `workspaceAuthorize`:

```typescript
openMainWindow: () => invoke<void>("open_main_window"),
```

- [ ] **Step 5: Type check**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai
pnpm check-types 2>&1 | head -5
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/lib/native.ts
git commit -m "feat: add open_main_window Tauri command"
```

---

## Task 7: Update shortcuts

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`

- [ ] **Step 1: Update `ShortcutId` type**

In `src/modules/shortcuts/shortcuts.ts`, update the `ShortcutId` union type. Remove `"sidebar.toggle"` and add the new IDs:

```typescript
export type ShortcutId =
  | "commandPalette.open"
  | "commandPalette.content"
  | "tab.new"
  | "tab.newPrivate"
  | "tab.newPreview"
  | "tab.newEditor"
  | "tab.close"
  | "tab.next"
  | "tab.prev"
  | "tab.selectByIndex"
  | "pane.splitRight"
  | "pane.splitDown"
  | "pane.focusNext"
  | "pane.focusPrev"
  | "pane.source"
  | "terminal.clear"
  | "terminal.toggleInput"
  | "search.focus"
  | "explorer.search"
  | "explorer.focus"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.zoomReset"
  | "view.zenMode"
  | "settings.open"
  | "rightPanel.toggle"
  | "window.new"
  | "workspace.prev"
  | "workspace.next"
  | "editor.undo"
  | "editor.redo";
```

- [ ] **Step 2: Update `SHORTCUTS` array**

Replace the `sidebar.toggle` and `explorer.focus` entries and add the new ones. Find those entries and replace:

```typescript
// REMOVE this entry:
{
  id: "sidebar.toggle",
  label: "Toggle file explorer",
  group: "View",
  defaultBindings: [
    { [MOD_PROP]: true, key: "b" },
    { [MOD_PROP]: true, shift: true, key: "b" },
  ],
},

// REMOVE this entry:
{
  id: "explorer.focus",
  label: "Toggle file explorer focus",
  group: "View",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "e" }],
},
```

Add these new entries in their place:

```typescript
{
  id: "rightPanel.toggle",
  label: "Toggle right panel",
  group: "View",
  defaultBindings: [
    { [MOD_PROP]: true, key: "b" },
    { [MOD_PROP]: true, shift: true, key: "b" },
  ],
},
{
  id: "window.new",
  label: "New window",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "n" }],
},
{
  id: "workspace.prev",
  label: "Previous workspace",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "[" }],
},
{
  id: "workspace.next",
  label: "Next workspace",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "]" }],
},
```

Also update `explorer.search` if it referenced `explorer.focus` (check and adjust).

- [ ] **Step 3: Update ShortcutGroup type if needed**

Check if `"General"` group already exists in `ShortcutGroup`. If not, add it:

```typescript
export type ShortcutGroup =
  | "General"   // add if missing
  | "Tabs"
  | "Panes"
  | "Terminal"
  | "Search"
  | "View"
  | "Editor";
```

- [ ] **Step 4: Type check**

```bash
pnpm check-types 2>&1 | head -20
```

Fix any `ShortcutId` reference errors in `App.tsx` or elsewhere by removing references to the deleted `"sidebar.toggle"` and `"explorer.focus"` IDs.

- [ ] **Step 5: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts
git commit -m "feat: update shortcuts for rightPanel.toggle, window.new, workspace.prev/next"
```

---

## Task 8: Remove SidebarRail and useSidebarPanel

**Files:**
- Delete: `src/modules/sidebar/SidebarRail.tsx`
- Delete: `src/modules/sidebar/useSidebarPanel.ts`
- Modify: `src/modules/sidebar/index.ts`

- [ ] **Step 1: Delete the files**

```bash
rm /Users/avilches/Work/Proy/Repos/terax-ai/src/modules/sidebar/SidebarRail.tsx
rm /Users/avilches/Work/Proy/Repos/terax-ai/src/modules/sidebar/useSidebarPanel.ts
```

- [ ] **Step 2: Update sidebar/index.ts**

Read the current `src/modules/sidebar/index.ts` and remove all exports from deleted files:

```typescript
// Remove these exports entirely:
// export { SidebarRail, SIDEBAR_RAIL_HEIGHT } from "./SidebarRail";
// export type { SidebarViewId } from "./types";
// export { useSidebarPanel, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from "./useSidebarPanel";
```

If `index.ts` has no remaining exports, delete it too:
```bash
rm /Users/avilches/Work/Proy/Repos/terax-ai/src/modules/sidebar/index.ts
```

- [ ] **Step 3: Type check**

```bash
pnpm check-types 2>&1 | head -20
```

Expected errors: `App.tsx` importing `SidebarRail`, `useSidebarPanel`, `SIDEBAR_MIN_WIDTH`, `SIDEBAR_MAX_WIDTH`. These will be fixed in Task 9.

- [ ] **Step 4: Commit**

```bash
git add -A src/modules/sidebar/
git commit -m "refactor: remove SidebarRail and useSidebarPanel"
```

---

## Task 9: Header — remove TabBar

**Files:**
- Modify: `src/modules/header/Header.tsx`

- [ ] **Step 1: Read current Header.tsx props**

```bash
grep -n "Props\|TabBar\|tabs\|activeId\|onSelect\|onNew\|onClose\|onPin\|onRename\|compact" \
  /Users/avilches/Work/Proy/Repos/terax-ai/src/modules/header/Header.tsx | head -30
```

- [ ] **Step 2: Remove all tab-related props from Header's Props type**

Remove from the `Props` type: `tabs`, `activeId`, `onSelect`, `onNew`, `onClose`, `onPin`, `onRename`, `compact` (and any associated types like `TabBarProps`).

- [ ] **Step 3: Remove TabBar import and JSX**

Remove the `import { TabBar } from ...` line and the `<TabBar .../>` JSX block from the Header component body.

- [ ] **Step 4: Type check**

```bash
pnpm check-types 2>&1 | head -20
```

Expected errors: `App.tsx` still passes tab props to `<Header>`. These will be cleaned up in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/modules/header/Header.tsx
git commit -m "refactor: remove TabBar from Header"
```

---

## Task 10: Restructure App.tsx — 3-column layout

This is the central task that wires everything together. It's the largest single change.

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Update imports in App.tsx**

Remove imports for deleted/changed items:

```typescript
// REMOVE:
import {
  SidebarRail,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarPanel,
} from "@/modules/sidebar";

// ADD:
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import { RightPanel } from "./components/RightPanel";
import { native } from "@/lib/native";
```

Remove tab-related props from `<Header>` import site (they were removed from Header in Task 9).

- [ ] **Step 2: Remove useSidebarPanel usage**

Find and remove:
```typescript
// REMOVE these lines (~line 160-164):
const {
  sidebarRef,
  sidebarView,
  sidebarWidthRef,
  toggleSidebar,
  cycleSidebarView,
  persistSidebarWidth,
  toggleExplorerFocus,
} = useSidebarPanel(explorerRef);
```

Remove `explorerRef` if it was only used by `useSidebarPanel`. Check if it's still needed by `RightPanel` (it is — `RightPanel` uses it internally).

Actually `explorerRef` is passed to `useSidebarPanel` in the old code. In the new code, `RightPanel` handles the explorer ref internally via `forwardRef`. Remove `explorerRef` from `App.tsx` entirely.

- [ ] **Step 3: Wire shortcut handlers**

Replace `toggleSidebar` and `toggleExplorerFocus` in the shortcuts map:

```typescript
// Find the shortcut handlers object in App.tsx and update:
"rightPanel.toggle": () => {
  const current = usePreferencesStore.getState().rightPanelOpen;
  void setRightPanelOpen(!current);
},
"window.new": () => void native.openMainWindow(),
"workspace.prev": () => {
  const idx = tabs.findIndex((t) => t.id === activeId);
  if (idx > 0) setActiveId(tabs[idx - 1].id);
  else if (tabs.length > 0) setActiveId(tabs[tabs.length - 1].id);
},
"workspace.next": () => {
  const idx = tabs.findIndex((t) => t.id === activeId);
  if (idx < tabs.length - 1) setActiveId(tabs[idx + 1].id);
  else if (tabs.length > 0) setActiveId(tabs[0].id);
},
```

Also add these imports:
```typescript
import { setRightPanelOpen } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
```

- [ ] **Step 4: Replace the layout JSX**

Find the `<main className="zoom-content ...">` block with the `ResizablePanelGroup` that contains the sidebar. Replace the entire 3-panel section with the new 3-column layout. The structure to find and replace:

```tsx
// BEFORE — the current layout:
<main className="zoom-content flex min-h-0 flex-1 flex-col">
  <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
    <ResizablePanel id="sidebar" ...>
      <div className="flex h-full ...">
        {/* SidebarRail + explorer/git content */}
      </div>
    </ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
      {/* workspace content */}
    </ResizablePanel>
  </ResizablePanelGroup>
</main>

// AFTER — new 3-column layout (WorkspaceSidebar is OUTSIDE the resizable group):
```

The new layout wraps the entire `<Header>` + `<main>` + `<StatusBar>` area. Find where the outer shell `<div>` starts and restructure:

```tsx
<ThemeProvider>
  <TooltipProvider>
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <Header
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        {/* ... other header props, WITHOUT tab-related ones */}
      />
      <div className="flex min-h-0 flex-1">
        {/* LEFT: Workspace sidebar */}
        <WorkspaceSidebar
          workspaces={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={() => newTab(inheritedCwdForNewTab())}
        />

        {/* CENTER + RIGHT: resizable */}
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="center" order={1} minSize={30}>
            <div className="flex h-full min-h-0 flex-col">
              {/* existing workspace content unchanged */}
              <div className="relative min-h-0 flex-1">
                <WorkspaceSurface
                  tabs={tabs}
                  activeId={activeId}
                  {/* ...same props as before... */}
                />
              </div>
              <WorkspaceInputBar
                isBlockTab={isBlockTab}
                activeLeafId={activeLeafId}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="right-panel"
            order={2}
            defaultSize={20}
            minSize={12}
            maxSize={35}
            collapsible
            collapsedSize={0}
            onCollapse={() => void setRightPanelOpen(false)}
            onExpand={() => void setRightPanelOpen(true)}
          >
            <RightPanel
              explorerRoot={explorerRoot}
              explorerActiveFilePath={explorerActiveFilePath ?? null}
              home={home}
              onOpenFile={handleOpenFile}
              onPathRenamed={handlePathRenamed}
              onPathDeleted={handlePathDeleted}
              onRevealInTerminal={cdInNewTab}
              onOpenMarkdownPreview={openMarkdownPreview}
              sourceControl={sourceControl}
              onOpenDiff={openGitDiffTab}
              onOpenGitGraph={openGitGraphFromContext}
              onOpenCommitFile={openCommitFileDiffTab}
              onGitHistorySearchHandle={setGitHistoryHandle}
              onWorkspaceChange={switchWorkspace}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {!zenMode && (
        <StatusBar
          cwd={activeCwd}
          filePath={activeFilePath}
          home={home}
          onCd={sendCd}
          onWorkspaceChange={switchWorkspace}
          privateActive={activeTab?.kind === "terminal" && activeTab.private === true}
        />
      )}

      {/* ... rest: AgentNotificationsBridge, Toaster, modals ... */}
    </div>
  </TooltipProvider>
</ThemeProvider>
```

- [ ] **Step 5: Remove header tab props**

Find where `<Header>` is rendered and remove all tab-related props it no longer accepts (`tabs`, `activeId`, `onSelect`, `onNew`, `onClose`, `onPin`, `onRename`).

- [ ] **Step 6: Type check**

```bash
pnpm check-types 2>&1 | head -30
```

Fix every error. Common fixes:
- Remove tab props from Header call site
- Remove `sidebarView`, `cycleSidebarView` references
- Remove `isGitHistoryTab` special cases that referenced the sidebar — check if `gitHistoryHandle` is still needed (it is, for search in git-history tabs)

- [ ] **Step 7: Run all tests**

```bash
pnpm lint && pnpm check-types && pnpm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat: restructure App.tsx to 3-column layout with WorkspaceSidebar and RightPanel"
```

---

## Task 11: Final integration and Rust validation

**Files:** Validation only, no new code.

- [ ] **Step 1: Full frontend validation**

```bash
pnpm lint && pnpm check-types && pnpm test
```

Expected: all pass, 0 errors, 0 warnings.

- [ ] **Step 2: Rust validation**

```bash
cd /Users/avilches/Work/Proy/Repos/terax-ai/src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
```

Expected: 0 warnings, all tests pass.

- [ ] **Step 3: Manual validation checklist**

Start the app with `pnpm tauri dev` and verify:

- [ ] WorkspaceSidebar visible on left (52px), shows current tabs as workspace entries
- [ ] Clicking a workspace entry switches the active content in the center
- [ ] `+` button in WorkspaceSidebar creates a new terminal tab
- [ ] Right panel visible on right with Explorer/Git/History tabs
- [ ] Explorer tab shows file tree and follows active terminal cwd (OSC 7)
- [ ] Git tab shows source control panel
- [ ] History tab shows git history pane
- [ ] Right panel resizes by dragging the handle
- [ ] Right panel collapses with `Cmd+B` / `Ctrl+B`
- [ ] Right panel state (open, width, active tab) persists after restart
- [ ] `Cmd+Shift+N` opens a new main window with independent workspace list
- [ ] Terminal PTYs work in all panes, splits still work
- [ ] Window controls (macOS traffic lights, Linux/Windows custom) unchanged
- [ ] Header: no tab bar, search and notification bell still present
- [ ] Status bar at bottom unchanged

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: Phase 1 shell layout complete"
```
