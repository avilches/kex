# Tab Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the user to rename any panel tab with Cmd+R or via context menu; the name persists in `panel.title`; clearing the name restores the default per panel type.

**Architecture:** A tiny Zustand store (`tabRenameStore`) holds `renamingPanelId`. App.tsx wires the `tab.rename` shortcut to call `startRename(activePanelId)`. Each `DraggableTab` subscribes to the store; when its panel id matches, it opens a Radix `Popover` anchored to itself, rendering a small input box below the tab. `onRenamePanel` flows through `PanelCallbacks` -> `PaneView` -> `PaneTabBar` -> `updatePanelData` in App.tsx.

**Tech Stack:** Zustand, Radix UI Popover (already in project at `src/components/ui/popover.tsx`), Vitest.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/modules/shortcuts/shortcuts.ts` | Add `"tab.rename"` id + entry |
| Create | `src/modules/workspaces/lib/tabRenameStore.ts` | Ephemeral rename state |
| Create | `src/modules/workspaces/lib/tabRenameStore.test.ts` | Store unit tests |
| Modify | `src/modules/workspaces/PanelContent.tsx` | Add `onRenamePanel` to `PanelCallbacks` |
| Modify | `src/modules/workspaces/PaneView.tsx` | Thread `onRenamePanel` to `PaneTabBar` |
| Modify | `src/modules/workspaces/PaneTabBar.tsx` | Popover, context menu item, shortcut label |
| Modify | `src/app/App.tsx` | `tab.rename` handler + `onRenamePanel` callback |

---

### Task 1: Register the `tab.rename` shortcut

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Modify: `src/modules/shortcuts/shortcuts.test.ts`

- [ ] **Step 1: Add `"tab.rename"` to the `ShortcutId` union**

In `shortcuts.ts`, find the `ShortcutId` type (line 7). Add the new id after `"tab.close"`:

```ts
export type ShortcutId =
  | "commandPalette.open"
  | "commandPalette.content"
  | "tab.new"
  | "tab.newBlock"
  | "tab.newPreview"
  | "tab.newEditor"
  | "tab.close"
  | "tab.rename"   // <-- add this line
  | "tab.next"
  // ... rest unchanged
```

- [ ] **Step 2: Add the shortcut entry to the `SHORTCUTS` array**

In `shortcuts.ts`, find the `tab.close` entry (around line 113). Add immediately after it:

```ts
  {
    id: "tab.rename",
    label: "Rename tab",
    group: "Tabs",
    defaultBindings: [{ [MOD_PROP]: true, key: "r" }],
  },
```

- [ ] **Step 3: Write the test**

Open `src/modules/shortcuts/shortcuts.test.ts`. Add a new test at the end of the file:

```ts
test("tab.rename has a label containing R", () => {
  const label = getShortcutLabel("tab.rename", {});
  expect(label).not.toBeNull();
  expect(label).toMatch(/R/i);
});
```

- [ ] **Step 4: Run the test**

```bash
pnpm test -- --reporter=verbose src/modules/shortcuts/shortcuts.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Verify types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts src/modules/shortcuts/shortcuts.test.ts
git commit -m "feat(shortcuts): add tab.rename shortcut (Cmd+R)"
```

---

### Task 2: Create the `tabRenameStore`

**Files:**
- Create: `src/modules/workspaces/lib/tabRenameStore.ts`
- Create: `src/modules/workspaces/lib/tabRenameStore.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/modules/workspaces/lib/tabRenameStore.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "vitest";
import { useTabRenameStore } from "./tabRenameStore";

describe("tabRenameStore", () => {
  beforeEach(() => {
    useTabRenameStore.setState({ renamingPanelId: null });
  });

  test("initial state has no panel being renamed", () => {
    expect(useTabRenameStore.getState().renamingPanelId).toBeNull();
  });

  test("startRename sets the renaming panel id", () => {
    useTabRenameStore.getState().startRename("panel-abc");
    expect(useTabRenameStore.getState().renamingPanelId).toBe("panel-abc");
  });

  test("startRename replaces a previous rename in progress", () => {
    useTabRenameStore.getState().startRename("panel-abc");
    useTabRenameStore.getState().startRename("panel-xyz");
    expect(useTabRenameStore.getState().renamingPanelId).toBe("panel-xyz");
  });

  test("clearRename resets to null", () => {
    useTabRenameStore.getState().startRename("panel-abc");
    useTabRenameStore.getState().clearRename();
    expect(useTabRenameStore.getState().renamingPanelId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

```bash
pnpm test -- --reporter=verbose src/modules/workspaces/lib/tabRenameStore.test.ts
```

Expected: FAIL with "Cannot find module './tabRenameStore'".

- [ ] **Step 3: Create the store**

Create `src/modules/workspaces/lib/tabRenameStore.ts`:

```ts
import { create } from "zustand";

type TabRenameStore = {
  renamingPanelId: string | null;
  startRename: (panelId: string) => void;
  clearRename: () => void;
};

export const useTabRenameStore = create<TabRenameStore>((set) => ({
  renamingPanelId: null,
  startRename: (panelId) => set({ renamingPanelId: panelId }),
  clearRename: () => set({ renamingPanelId: null }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --reporter=verbose src/modules/workspaces/lib/tabRenameStore.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/lib/tabRenameStore.ts src/modules/workspaces/lib/tabRenameStore.test.ts
git commit -m "feat(workspaces): add tabRenameStore for ephemeral rename state"
```

---

### Task 3: Add `onRenamePanel` to `PanelCallbacks` and thread through `PaneView`

**Files:**
- Modify: `src/modules/workspaces/PanelContent.tsx:38-57`
- Modify: `src/modules/workspaces/PaneView.tsx:152-174`

- [ ] **Step 1: Add `onRenamePanel` to `PanelCallbacks`**

In `src/modules/workspaces/PanelContent.tsx`, find the `PanelCallbacks` type (around line 38) and add the new callback at the end, before the closing `}`:

```ts
export type PanelCallbacks = {
  // Terminal callbacks
  onSearchReady?: (panelId: string, addon: SearchAddon) => void;
  onExit?: (panelId: string, code: number) => void;
  onCwd?: (panelId: string, cwd: string) => void;
  onRunningCommand?: (panelId: string, cmd: string | null) => void;
  registerTerminalHandle?: (panelId: string, handle: TerminalPaneHandle | null) => void;
  // Editor callbacks
  onEditorDirtyChange?: (panelId: string, dirty: boolean) => void;
  onEditorClose?: (panelId: string) => void;
  registerEditorHandle?: (panelId: string, handle: EditorPaneHandle | null) => void;
  // Markdown callbacks
  onSetMarkdownView?: (panelId: string, mode: "rendered" | "raw") => void;
  // Preview callbacks
  onPreviewUrlChange?: (panelId: string, url: string) => void;
  registerPreviewHandle?: (panelId: string, handle: PreviewPaneHandle | null) => void;
  // Git history callbacks
  onOpenCommitFile?: (input: CommitFileDiffOpenInput) => void;
  onGitHistorySearchHandle?: (panelId: string, handle: GitHistorySearchHandle | null) => void;
  // Tab rename
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
};
```

- [ ] **Step 2: Pass `onRenamePanel` from `callbacks` to `PaneTabBar`**

In `src/modules/workspaces/PaneView.tsx`, find the `<PaneTabBar` render (around line 152). Add the prop just before the closing `/>`:

```tsx
<PaneTabBar
  panels={pane.panels}
  activePanelId={pane.activePanelId}
  paneFocused={focused}
  workspaceId={workspaceId}
  isWorkspaceActive={isWorkspaceActive}
  onActivate={(panelId) => onActivatePanel(workspaceId, panelId)}
  onClose={(panelId) => onClosePanel(workspaceId, panelId)}
  onNewTerminal={() => onNewTerminal(workspaceId, pane.id)}
  onCloseOtherPanels={(panelId) => {
    pane.panels
      .filter((p) => p.id !== panelId)
      .forEach((p) => onClosePanel(workspaceId, p.id));
  }}
  onCloseAllPanels={() => {
    [...pane.panels].forEach((p) => onClosePanel(workspaceId, p.id));
  }}
  onSplitTerminalRight={() => onSplitTerminalRight(workspaceId, pane.id)}
  onSplitTerminalDown={() => onSplitTerminalDown(workspaceId, pane.id)}
  onNewBrowser={() => onNewBrowser(workspaceId, pane.id)}
  onSplitBrowserRight={() => onSplitBrowserRight(workspaceId, pane.id)}
  onSplitBrowserDown={() => onSplitBrowserDown(workspaceId, pane.id)}
  onRenamePanel={callbacks.onRenamePanel}
/>
```

- [ ] **Step 3: Verify types**

```bash
pnpm check-types
```

Expected: no errors. `PaneTabBar` does not yet have the `onRenamePanel` prop so TypeScript will error until Task 4 adds it — that is fine, run check-types again after Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/PanelContent.tsx src/modules/workspaces/PaneView.tsx
git commit -m "feat(workspaces): thread onRenamePanel through PanelCallbacks and PaneView"
```

---

### Task 4: Implement the rename UI in `PaneTabBar`

This is the main change. It adds:
- `onRenamePanel` prop to both the outer `PaneTabBar` and the inner `DraggableTab`
- `"tab.rename"` in `shortcutLabels`
- "Rename Tab" / "Reset Tab Name" items in the context menu
- A `Popover` anchored to each `DraggableTab` that opens when `renamingPanelId` matches

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`

- [ ] **Step 1: Add imports at the top of `PaneTabBar.tsx`**

After the existing imports, add:

```ts
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useTabRenameStore } from "./lib/tabRenameStore";
```

- [ ] **Step 2: Add `onRenamePanel` to the outer `Props` type**

Find the `type Props` block (line 17) and add the optional prop:

```ts
type Props = {
  panels: Panel[];
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  onActivate: (panelId: string) => void;
  onClose: (panelId: string) => void;
  onNewTerminal: () => void;
  onCloseOtherPanels: (panelId: string) => void;
  onCloseAllPanels: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
};
```

- [ ] **Step 3: Add `onRenamePanel` to `DraggableTab`'s prop list and type**

Find the `function DraggableTab({` declaration. Add `onRenamePanel` to the destructured props and to the type annotation. The relevant portion of the type block (add after `onSplitBrowserDown`):

```ts
  onSplitBrowserDown: () => void;
  shortcutLabels: Record<string, string | null>;
  onRenamePanel?: (panelId: string, title: string | undefined) => void;
```

And in the destructured params:

```ts
function DraggableTab({
  panel,
  activePanelId,
  paneFocused,
  workspaceId,
  isWorkspaceActive,
  insertionBefore,
  insertionAfter,
  panelsCount,
  onActivate,
  onClose,
  onCloseOtherPanels,
  onCloseAllPanels,
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  shortcutLabels,
  onRenamePanel,
}: { ... })
```

- [ ] **Step 4: Add rename state and handlers inside `DraggableTab`**

After the existing hook calls at the top of `DraggableTab` (after `const connected = ...`), add:

```ts
const isRenaming = useTabRenameStore((s) => s.renamingPanelId === panel.id);
const clearRename = useTabRenameStore((s) => s.clearRename);
const startRename = useTabRenameStore((s) => s.startRename);
const inputRef = useRef<HTMLInputElement>(null);
const handledRef = useRef(false);

useEffect(() => {
  if (isRenaming) handledRef.current = false;
}, [isRenaming]);

function handleSave() {
  if (handledRef.current) return;
  handledRef.current = true;
  const value = inputRef.current?.value.trim() ?? "";
  onRenamePanel?.(panel.id, value || undefined);
  clearRename();
}

function handleCancel() {
  if (handledRef.current) return;
  handledRef.current = true;
  clearRename();
}
```

- [ ] **Step 5: Wrap the tab div in a `Popover` with `PopoverAnchor` and add the `PopoverContent`**

The current JSX return is a `<ContextMenu>`. Wrap it in a `<Popover>` and add `<PopoverAnchor asChild>` around the `<ContextMenuTrigger asChild>` div. Add `<PopoverContent>` after `</ContextMenu>`.

Replace the `return (` block (everything from `return (` to the final `);`) with:

```tsx
return (
  <Popover
    open={isRenaming}
    onOpenChange={(open) => { if (!open) handleSave(); }}
  >
    <PopoverAnchor asChild>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            {...attributes}
            data-panel-id={panel.id}
            onClick={() => onActivate(panel.id)}
            onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
            onAuxClick={(e) => { if (e.button === 1) { e.stopPropagation(); onClose(panel.id); } }}
            {...listeners}
            className={cn(
              "group relative flex min-w-[100px] max-w-[200px] shrink-0 select-none touch-none items-center gap-1 px-1.5 text-[11px] transition-colors",
              isThisDragging ? "cursor-grabbing" : "cursor-default",
              connected
                ? [
                    "self-stretch border-r border-border/30",
                    active
                      ? "bg-background text-foreground"
                      : "border-b border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  ]
                : [
                    "h-5 rounded",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  ],
              isThisDragging && "opacity-40",
            )}
          >
            {/* Droppable half-zones - coordinates-based, no pointer events needed */}
            <div ref={setBeforeRef} className="pointer-events-none absolute inset-y-0 left-0 w-1/2" />
            <div ref={setAfterRef} className="pointer-events-none absolute inset-y-0 right-0 w-1/2" />

            {insertionBefore && (
              <div className="pointer-events-none absolute inset-y-1 left-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
            )}
            {insertionAfter && (
              <div className="pointer-events-none absolute inset-y-1 right-0 z-20 w-0.5 rounded-full bg-tab-focus-indicator" />
            )}

            {active && paneFocused && (
              <div
                className={cn("absolute inset-x-0 top-0 bg-tab-focus-indicator", connected ? "h-[1.5px]" : "h-0.5 rounded-t")}
              />
            )}
            <span className="shrink-0 opacity-70">{panelIcon(panel, workspaceId)}</span>
            <span
              className={cn(
                "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
                panel.kind === "terminal" && panel.runningCommand && "text-center",
              )}
              style={{ direction: panel.kind === "terminal" && !panel.runningCommand ? "rtl" : "ltr" }}
              title={
                panel.kind === "terminal"
                  ? panel.runningCommand
                    ? `${title} · ${panel.cwd?.replace(/\/$/, "") ?? ""}`
                    : (panel.cwd?.replace(/\/$/, "") ?? "shell")
                  : title
              }
            >
              {title}
            </span>
            {panel.kind === "editor" && panel.dirty && (
              <span className="shrink-0 text-[8px] text-primary">●</span>
            )}
            <button
              type="button"
              className="ml-0.5 flex size-[16px] shrink-0 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-muted"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose(panel.id);
              }}
              title="Close panel"
            >
              <span className="text-[13px] leading-none">×</span>
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onRenamePanel && (
            <>
              <ContextMenuItem onSelect={() => startRename(panel.id)}>
                Rename Tab
                {shortcutLabels["tab.rename"] && (
                  <ContextMenuShortcut>{shortcutLabels["tab.rename"]}</ContextMenuShortcut>
                )}
              </ContextMenuItem>
              {panel.title && (
                <ContextMenuItem onSelect={() => onRenamePanel(panel.id, undefined)}>
                  Reset Tab Name
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={() => onClose(panel.id)}>
            Close Tab
            {shortcutLabels["tab.close"] && (
              <ContextMenuShortcut>{shortcutLabels["tab.close"]}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={panelsCount <= 1}
            onSelect={() => onCloseOtherPanels(panel.id)}
          >
            Close Other Tabs
          </ContextMenuItem>
          <ContextMenuItem onSelect={onCloseAllPanels}>
            Close All Tabs
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onNewTerminal}>
            New Terminal Tab
            {shortcutLabels["tab.new"] && (
              <ContextMenuShortcut>{shortcutLabels["tab.new"]}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onSplitTerminalRight}>
            New Terminal Split Right
            {shortcutLabels["pane.splitRight"] && (
              <ContextMenuShortcut>{shortcutLabels["pane.splitRight"]}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onSplitTerminalDown}>
            New Terminal Split Down
            {shortcutLabels["pane.splitDown"] && (
              <ContextMenuShortcut>{shortcutLabels["pane.splitDown"]}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onNewBrowser}>
            New Browser Tab
            {shortcutLabels["tab.newPreview"] && (
              <ContextMenuShortcut>{shortcutLabels["tab.newPreview"]}</ContextMenuShortcut>
            )}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onSplitBrowserRight}>
            New Browser Split Right
          </ContextMenuItem>
          <ContextMenuItem onSelect={onSplitBrowserDown}>
            New Browser Split Down
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </PopoverAnchor>

    <PopoverContent
      side="bottom"
      align="start"
      sideOffset={4}
      className="w-52 gap-0 rounded-lg p-1.5"
      onEscapeKeyDown={(e) => { e.preventDefault(); handleCancel(); }}
    >
      <input
        ref={inputRef}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        defaultValue={panel.title ?? ""}
        placeholder={title}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); handleSave(); }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </PopoverContent>
  </Popover>
);
```

Note: `title` here is already computed at the top of `DraggableTab` via `panelTitle(panel)`, so the `placeholder` shows the default name.

- [ ] **Step 6: Add `"tab.rename"` to `shortcutLabels` in `PaneTabBar`**

Find the `shortcutLabels` object in the outer `PaneTabBar` function (around line 220):

```ts
const shortcutLabels: Record<string, string | null> = {
  "tab.close":       getShortcutLabel("tab.close",       userShortcuts),
  "tab.new":         getShortcutLabel("tab.new",         userShortcuts),
  "pane.splitRight": getShortcutLabel("pane.splitRight", userShortcuts),
  "pane.splitDown":  getShortcutLabel("pane.splitDown",  userShortcuts),
  "tab.newPreview":  getShortcutLabel("tab.newPreview",  userShortcuts),
  "tab.rename":      getShortcutLabel("tab.rename",      userShortcuts),
};
```

- [ ] **Step 7: Pass `onRenamePanel` down to `DraggableTab` in `PaneTabBar`'s render**

Find the `export function PaneTabBar(...)` signature. Add `onRenamePanel` to the destructured props:

```ts
export function PaneTabBar({ panels, activePanelId, paneFocused, workspaceId, isWorkspaceActive, onActivate, onClose, onNewTerminal, onCloseOtherPanels, onCloseAllPanels, onSplitTerminalRight, onSplitTerminalDown, onNewBrowser, onSplitBrowserRight, onSplitBrowserDown, onRenamePanel }: Props) {
```

Then in the `panels.map` that renders `<DraggableTab>`, add the prop:

```tsx
<DraggableTab
  key={p.id}
  panel={p}
  {/* ... all existing props ... */}
  shortcutLabels={shortcutLabels}
  onRenamePanel={onRenamePanel}
/>
```

- [ ] **Step 8: Verify types and lint**

```bash
pnpm check-types
pnpm lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(tabs): add rename popover UI with Cmd+R shortcut and context menu"
```

---

### Task 5: Wire `tab.rename` handler and `onRenamePanel` in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Import `useTabRenameStore` in App.tsx**

Find the import block at the top of `src/app/App.tsx`. Add:

```ts
import { useTabRenameStore } from "@/modules/workspaces/lib/tabRenameStore";
```

- [ ] **Step 2: Add `"tab.rename"` handler to `shortcutHandlers`**

In the `shortcutHandlers` useMemo (around line 758), add the handler alongside the other tab shortcuts:

```ts
"tab.rename": () => {
  if (activePanelId) useTabRenameStore.getState().startRename(activePanelId);
},
```

Add `activePanelId` to the dependency array of the `useMemo` if it is not already there (it is, at line 836).

- [ ] **Step 3: Add `onRenamePanel` to `panelCallbacks`**

Find the `panelCallbacks` useMemo (around line 405). Add after `onGitHistorySearchHandle`:

```ts
onRenamePanel: (panelId, title) => {
  const found = findPanelGlobal(panelId);
  if (found) updatePanelData(found.workspace.id, panelId, (p) => ({ ...p, title }));
},
```

- [ ] **Step 4: Verify types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(app): wire tab.rename shortcut and onRenamePanel to workspace store"
```

---

## Manual verification checklist

After completing all tasks, verify these scenarios by running the app (`pnpm tauri dev`):

- [ ] Press Cmd+R on any terminal tab → a small input box appears below that tab
- [ ] The input box shows the current custom name pre-selected (if one was set), or empty with the default name as placeholder
- [ ] Type a name and press Enter → the tab shows the new name; it survives workspace state reload (kill + restart app)
- [ ] Press Escape → the rename box closes, the name does not change
- [ ] Clear the input and press Enter → the tab reverts to its default name (cwd for terminal, filename for editor, etc.)
- [ ] Click outside the rename box → same as Enter (saves current text)
- [ ] Right-click any tab → "Rename Tab" appears at the top of the context menu with `⌘R`
- [ ] "Reset Tab Name" appears in the context menu only when the tab has a custom name, and clicking it removes the custom name
- [ ] Rename works for editor, preview, markdown, git-history, and git-commit-file panel types
- [ ] Cmd+R applies to the active panel in the active pane (not the right-clicked panel — the context menu item handles that case)
