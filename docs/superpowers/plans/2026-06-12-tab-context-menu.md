# Tab Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-click context menu on every tab with close, new terminal, and new browser actions.

**Architecture:** Thread 5 new composed callbacks (split-terminal-right/down, new-browser, split-browser-right/down) from App.tsx through WorkspaceView → SplitNodeView → PaneView → PaneTabBar. Close-others and close-all are computed locally in PaneView from the existing `onClosePanel` prop. The context menu itself lives in `DraggableTab` inside `PaneTabBar.tsx` using the existing Radix `ContextMenu` component.

**Tech Stack:** React 19, Radix UI ContextMenu (`src/components/ui/context-menu.tsx`), Vitest, TypeScript

---

## File Map

| File | Change |
|---|---|
| `src/modules/shortcuts/shortcuts.ts` | Add `getShortcutLabel` export |
| `src/modules/shortcuts/shortcuts.test.ts` | New — tests for `getShortcutLabel` |
| `src/modules/workspaces/WorkspaceView.tsx` | 5 new callback props in `Props` type |
| `src/modules/workspaces/SplitNodeView.tsx` | 5 new callback props in `Props` type + pass to PaneView |
| `src/modules/workspaces/PaneView.tsx` | 5 new callback props + close-others/close-all computed locally + pass all to PaneTabBar |
| `src/modules/workspaces/PaneTabBar.tsx` | 9 new action props on `PaneTabBar` + 8 new props on `DraggableTab` + ContextMenu wiring |
| `src/app/App.tsx` | Implement 5 new callbacks + pass to WorkspaceView |

---

### Task 1: Add `getShortcutLabel` to `shortcuts.ts` + test

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Create: `src/modules/shortcuts/shortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/shortcuts/shortcuts.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { getShortcutLabel } from "./shortcuts";

describe("getShortcutLabel", () => {
  test("returns platform-appropriate label for tab.close with no user override", () => {
    const label = getShortcutLabel("tab.close", {});
    // On macOS the MOD_PROP is 'meta', on other platforms it's 'ctrl'
    expect(typeof label).toBe("string");
    expect(label!.length).toBeGreaterThan(0);
    expect(label).toMatch(/W/i);
  });

  test("returns null for unknown shortcut id", () => {
    // @ts-expect-error intentional invalid id
    const label = getShortcutLabel("nonexistent.id", {});
    expect(label).toBeNull();
  });

  test("respects user override binding", () => {
    const label = getShortcutLabel("tab.close", {
      "tab.close": [{ ctrl: true, key: "q" }],
    });
    expect(label).toContain("Q");
  });

  test("returns null when user override is empty array", () => {
    const label = getShortcutLabel("tab.close", {
      "tab.close": [],
    });
    expect(label).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd /path/to/terax-ai && pnpm test src/modules/shortcuts/shortcuts.test.ts
```

Expected: FAIL — `getShortcutLabel` is not exported.

- [ ] **Step 3: Add `getShortcutLabel` to `shortcuts.ts`**

At the end of `src/modules/shortcuts/shortcuts.ts`, after `getBindingTokens`, add:

```ts
const SHORTCUTS_BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcutLabel(
  id: ShortcutId,
  userShortcuts: Partial<Record<ShortcutId, KeyBinding[]>>,
): string | null {
  const shortcut = SHORTCUTS_BY_ID.get(id);
  if (!shortcut) return null;
  const bindings = userShortcuts[id] ?? shortcut.defaultBindings;
  const tokens = getBindingTokens(bindings?.[0]);
  return tokens.length ? tokens.join(" ") : null;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pnpm test src/modules/shortcuts/shortcuts.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts src/modules/shortcuts/shortcuts.test.ts
git commit -m "feat(shortcuts): export getShortcutLabel helper"
```

---

### Task 2: Thread 5 new callback types through WorkspaceView and SplitNodeView

**Files:**
- Modify: `src/modules/workspaces/WorkspaceView.tsx` (Props type only)
- Modify: `src/modules/workspaces/SplitNodeView.tsx` (Props type + explicit pass-through to PaneView)

The goal is to get the types correct so the TypeScript compiler guides the next tasks.

- [ ] **Step 1: Extend `WorkspaceView.Props`**

In `src/modules/workspaces/WorkspaceView.tsx`, extend the `Props` type (lines 24-36) to add the five new callbacks:

```ts
type Props = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onDividerChange?: (workspaceId: string, splitId: string, position: number) => void;
  onMovePanel: UseWorkspacesReturn["movePanel"];
  onReorderPanel: UseWorkspacesReturn["reorderPanel"];
  onSplitPaneAndPlace: UseWorkspacesReturn["splitPaneAndPlace"];
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
};
```

The five new callbacks flow through `...rest` automatically — no other change needed in `WorkspaceView.tsx`.

- [ ] **Step 2: Extend `SplitNodeView.Props`**

In `src/modules/workspaces/SplitNodeView.tsx`, extend the `Props` type (lines 11-28) to add the same five callbacks:

```ts
type Props = {
  node: SplitNode;
  workspaceId: string;
  workspaceCwd?: string;
  activePaneId: string;
  isWorkspaceActive: boolean;
  tabInsertPaneId: string | null;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onDividerChange?: (workspaceId: string, splitId: string, position: number) => void;
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
};
```

- [ ] **Step 3: Pass the five callbacks from `SplitNodeView` to `PaneView`**

In `src/modules/workspaces/SplitNodeView.tsx`, in the `if (node.kind === "pane")` block (lines 45-61), add the five new props to the `<PaneView ...>` call:

```tsx
if (node.kind === "pane") {
  return (
    <PaneView
      pane={node}
      workspaceId={rest.workspaceId}
      workspaceCwd={rest.workspaceCwd}
      focused={node.id === activePaneId}
      isWorkspaceActive={rest.isWorkspaceActive}
      tabInsertPaneId={rest.tabInsertPaneId}
      onActivatePanel={rest.onActivatePanel}
      onClosePanel={rest.onClosePanel}
      onFocusPane={rest.onFocusPane}
      onNewTerminal={rest.onNewTerminal}
      onSplitTerminalRight={rest.onSplitTerminalRight}
      onSplitTerminalDown={rest.onSplitTerminalDown}
      onNewBrowser={rest.onNewBrowser}
      onSplitBrowserRight={rest.onSplitBrowserRight}
      onSplitBrowserDown={rest.onSplitBrowserDown}
      callbacks={rest.callbacks}
    />
  );
}
```

- [ ] **Step 4: Run type check (will fail on PaneView and App.tsx — expected)**

```bash
pnpm check-types 2>&1 | head -30
```

Expected: errors in `PaneView.tsx` (missing props) and `App.tsx` (missing props on `WorkspaceView`). This confirms the types are propagating correctly.

---

### Task 3: Extend `PaneView.Props` and implement close-others / close-all

**Files:**
- Modify: `src/modules/workspaces/PaneView.tsx`

- [ ] **Step 1: Extend `PaneView.Props`**

In `src/modules/workspaces/PaneView.tsx`, extend the `Props` type (lines 12-24) to add the five new callbacks:

```ts
type Props = {
  pane: PaneNode;
  workspaceId: string;
  workspaceCwd?: string;
  focused: boolean;
  isWorkspaceActive: boolean;
  tabInsertPaneId: string | null;
  onActivatePanel: (workspaceId: string, panelId: string) => void;
  onClosePanel: (workspaceId: string, panelId: string) => void;
  onFocusPane: (workspaceId: string, paneId: string) => void;
  onNewTerminal: (workspaceId: string, paneId: string) => void;
  onSplitTerminalRight: (workspaceId: string, paneId: string) => void;
  onSplitTerminalDown: (workspaceId: string, paneId: string) => void;
  onNewBrowser: (workspaceId: string, paneId: string) => void;
  onSplitBrowserRight: (workspaceId: string, paneId: string) => void;
  onSplitBrowserDown: (workspaceId: string, paneId: string) => void;
  callbacks: PanelCallbacks;
};
```

- [ ] **Step 2: Destructure the new props and wire them to `PaneTabBar`**

In `src/modules/workspaces/PaneView.tsx`, update the `PaneView` function signature to destructure the new props, then pass them all to `<PaneTabBar>`. Find the `<PaneTabBar ...>` block (around line 142) and replace it:

```tsx
export function PaneView({
  pane,
  workspaceId,
  workspaceCwd: _workspaceCwd,
  focused,
  isWorkspaceActive,
  tabInsertPaneId,
  onActivatePanel,
  onClosePanel,
  onFocusPane,
  onNewTerminal,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewBrowser,
  onSplitBrowserRight,
  onSplitBrowserDown,
  callbacks,
}: Props) {
  // ... existing body ...

  // Replace the existing <PaneTabBar> with:
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
  />
```

- [ ] **Step 3: Run type check (will fail on PaneTabBar and App.tsx — expected)**

```bash
pnpm check-types 2>&1 | head -30
```

Expected: errors only in `PaneTabBar.tsx` (missing new props) and `App.tsx` (missing props on `WorkspaceView`).

---

### Task 4: Implement 5 new callbacks in `App.tsx`

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Add the 5 new callbacks to the `<WorkspaceView>` call**

Find the `<WorkspaceView` block (around line 1024) in `src/app/App.tsx` and add the five new props. Add them after `onNewTerminal`:

```tsx
onSplitTerminalRight={(wsId, paneId) => {
  const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
  const ws = workspaces.find((w) => w.id === wsId);
  if (!ws) return;
  if (allPanes(ws.paneTree).length >= workspacePaneLimit) return;
  const el = document.querySelector<HTMLElement>(`[data-pane-id="${paneId}"]`);
  if (!el || el.getBoundingClientRect().width < paneSplitLimit.width) return;
  const newPaneId = splitPane(wsId, paneId, "horizontal");
  openPanel(wsId, newPaneId, { id: crypto.randomUUID(), kind: "terminal", cwd: ws.cwd });
}}
onSplitTerminalDown={(wsId, paneId) => {
  const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
  const ws = workspaces.find((w) => w.id === wsId);
  if (!ws) return;
  if (allPanes(ws.paneTree).length >= workspacePaneLimit) return;
  const el = document.querySelector<HTMLElement>(`[data-pane-id="${paneId}"]`);
  if (!el || el.getBoundingClientRect().height < paneSplitLimit.height) return;
  const newPaneId = splitPane(wsId, paneId, "vertical");
  openPanel(wsId, newPaneId, { id: crypto.randomUUID(), kind: "terminal", cwd: ws.cwd });
}}
onNewBrowser={(wsId, paneId) => {
  const panelId = crypto.randomUUID();
  openPanel(wsId, paneId, { id: panelId, kind: "preview", url: "" });
  setTimeout(() => previewHandles.current.get(panelId)?.focusAddressBar(), 0);
}}
onSplitBrowserRight={(wsId, paneId) => {
  const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
  const ws = workspaces.find((w) => w.id === wsId);
  if (!ws) return;
  if (allPanes(ws.paneTree).length >= workspacePaneLimit) return;
  const el = document.querySelector<HTMLElement>(`[data-pane-id="${paneId}"]`);
  if (!el || el.getBoundingClientRect().width < paneSplitLimit.width) return;
  const newPaneId = splitPane(wsId, paneId, "horizontal");
  const panelId = crypto.randomUUID();
  openPanel(wsId, newPaneId, { id: panelId, kind: "preview", url: "" });
  setTimeout(() => previewHandles.current.get(panelId)?.focusAddressBar(), 0);
}}
onSplitBrowserDown={(wsId, paneId) => {
  const { paneSplitLimit, workspacePaneLimit } = usePreferencesStore.getState();
  const ws = workspaces.find((w) => w.id === wsId);
  if (!ws) return;
  if (allPanes(ws.paneTree).length >= workspacePaneLimit) return;
  const el = document.querySelector<HTMLElement>(`[data-pane-id="${paneId}"]`);
  if (!el || el.getBoundingClientRect().height < paneSplitLimit.height) return;
  const newPaneId = splitPane(wsId, paneId, "vertical");
  const panelId = crypto.randomUUID();
  openPanel(wsId, newPaneId, { id: panelId, kind: "preview", url: "" });
  setTimeout(() => previewHandles.current.get(panelId)?.focusAddressBar(), 0);
}}
```

- [ ] **Step 2: Run type check (will fail only on PaneTabBar — expected)**

```bash
pnpm check-types 2>&1 | head -30
```

Expected: only errors in `PaneTabBar.tsx`.

---

### Task 5: Add ContextMenu to `DraggableTab` in `PaneTabBar.tsx`

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`

This is the main UI task. It adds the ContextMenu wrapper and all menu items, and extends both `DraggableTab` and `PaneTabBar` with new props.

- [ ] **Step 1: Add new imports to `PaneTabBar.tsx`**

At the top of `src/modules/workspaces/PaneTabBar.tsx`, add:

```ts
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import type { ShortcutId } from "@/modules/shortcuts/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
```

Note: `usePreferencesStore` is already imported — don't duplicate it.

- [ ] **Step 2: Add new props to `DraggableTab`**

Extend the `DraggableTab` function signature (lines 19-38) to include the new action props and `panelsCount`:

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
}: {
  panel: Panel;
  activePanelId: string | null;
  paneFocused: boolean;
  workspaceId: string;
  isWorkspaceActive: boolean;
  insertionBefore: boolean;
  insertionAfter: boolean;
  panelsCount: number;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCloseOtherPanels: (panelId: string) => void;
  onCloseAllPanels: () => void;
  onNewTerminal: () => void;
  onSplitTerminalRight: () => void;
  onSplitTerminalDown: () => void;
  onNewBrowser: () => void;
  onSplitBrowserRight: () => void;
  onSplitBrowserDown: () => void;
  shortcutLabels: Record<string, string | null>;
}) {
```

- [ ] **Step 3: Wrap the tab div in `ContextMenu` + `ContextMenuTrigger asChild`**

Replace the return statement in `DraggableTab` (currently starts with `return (` at line 48). Wrap the existing `<div ref={setNodeRef} ...>` in a ContextMenu and add `ContextMenuContent` after it:

```tsx
return (
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
        {/* all existing inner content unchanged — droppable half-zones, insertion indicators,
            focus indicator, icon, title span, dirty dot, close button */}
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
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
);
```

- [ ] **Step 4: Add new props to `PaneTabBar` and compute `shortcutLabels`**

Extend the `Props` type of `PaneTabBar` (lines 8-17) and update the function signature to include the new props. Also compute `shortcutLabels` inside `PaneTabBar` using `usePreferencesStore`:

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
};
```

Inside `PaneTabBar` function body, compute shortcut labels once (add after the existing `const tabBarStyle = ...` line):

```ts
const userShortcuts = usePreferencesStore((s) => s.shortcuts);
const shortcutLabels: Record<string, string | null> = {
  "tab.close":       getShortcutLabel("tab.close",       userShortcuts as Record<ShortcutId, import("@/modules/shortcuts/shortcuts").KeyBinding[]>),
  "tab.new":         getShortcutLabel("tab.new",         userShortcuts as Record<ShortcutId, import("@/modules/shortcuts/shortcuts").KeyBinding[]>),
  "pane.splitRight": getShortcutLabel("pane.splitRight", userShortcuts as Record<ShortcutId, import("@/modules/shortcuts/shortcuts").KeyBinding[]>),
  "pane.splitDown":  getShortcutLabel("pane.splitDown",  userShortcuts as Record<ShortcutId, import("@/modules/shortcuts/shortcuts").KeyBinding[]>),
  "tab.newPreview":  getShortcutLabel("tab.newPreview",  userShortcuts as Record<ShortcutId, import("@/modules/shortcuts/shortcuts").KeyBinding[]>),
};
```

Then in the `panels.map(...)` call, pass all new props to each `DraggableTab`:

```tsx
{panels.map((p, i) => (
  <DraggableTab
    key={p.id}
    panel={p}
    activePanelId={activePanelId}
    paneFocused={paneFocused}
    workspaceId={workspaceId}
    isWorkspaceActive={isWorkspaceActive}
    insertionBefore={insertionIndex === 0 && i === 0}
    insertionAfter={insertionIndex !== null && insertionIndex > 0 && i === insertionIndex - 1}
    panelsCount={panels.length}
    onActivate={onActivate}
    onClose={onClose}
    onCloseOtherPanels={onCloseOtherPanels}
    onCloseAllPanels={onCloseAllPanels}
    onNewTerminal={onNewTerminal}
    onSplitTerminalRight={onSplitTerminalRight}
    onSplitTerminalDown={onSplitTerminalDown}
    onNewBrowser={onNewBrowser}
    onSplitBrowserRight={onSplitBrowserRight}
    onSplitBrowserDown={onSplitBrowserDown}
    shortcutLabels={shortcutLabels}
  />
))}
```

- [ ] **Step 5: Run full type check and tests**

```bash
pnpm check-types && pnpm lint && pnpm test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx src/modules/workspaces/PaneView.tsx \
        src/modules/workspaces/SplitNodeView.tsx src/modules/workspaces/WorkspaceView.tsx \
        src/app/App.tsx
git commit -m "feat(tabs): add right-click context menu with close and new panel actions"
```

---

## Self-review checklist

- [x] **Spec coverage:** All 9 menu items (Close Tab + shortcut, Close Other Tabs, Close All Tabs, New Terminal Tab + shortcut, New Terminal Split Right + shortcut, New Terminal Split Down + shortcut, New Browser Tab + shortcut, New Browser Split Right, New Browser Split Down) are wired in Task 5 Step 3.
- [x] **Disabled state:** "Close Other Tabs" disabled when `panelsCount <= 1` — Task 5 Step 3.
- [x] **No activation on right-click:** ContextMenu uses `contextmenu` event; existing `onClick`/`onPointerUp` are unchanged and only fire on left-click.
- [x] **Browser opens with blank URL + address bar focus:** `url: ""` + `focusAddressBar()` in Task 4 Step 1.
- [x] **Split limit guards:** All 4 split callbacks check `paneSplitLimit` and `workspacePaneLimit` before splitting, matching the pattern in the existing `pane.splitRight` shortcut handler.
- [x] **Session disposal:** Close-others/close-all call `onClosePanel` which already calls `disposeSession` for terminal panels in App.tsx.
- [x] **Type names consistent:** `onSplitTerminalRight/Down`, `onNewBrowser`, `onSplitBrowserRight/Down` used identically in all 5 files.
- [x] **No placeholders or TBDs.**
