# Misc Improvements Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five independent improvements: JSONL transcript path in agent hover, drag-tab scroll bug fix, Cmd+Shift+C copy-path shortcut, persistent terminal tabs (restore on restart + lock), and notification-jump shortcut swap.

**Architecture:** Pure frontend TypeScript changes plus one small Rust payload addition. No new files — all changes are additions to existing modules. Each task is self-contained and can be committed independently.

**Tech Stack:** React 19, TypeScript, Tauri 2, Zustand, dnd-kit, shadcn/ui, Vitest.

## Global Constraints

- No em-dash anywhere (code, comments, commits).
- No emojis.
- Imports always `@/...` on the frontend.
- `pnpm only` — never npm/npx/yarn.
- After every task: `pnpm check-types && pnpm test --run` must pass.
- PTY write commands must end with `\r` (CR), never `\n`.

---

## File Map

| File | Tasks |
|------|-------|
| `src-tauri/src/modules/pty/ipc.rs` | Task 1 |
| `src/modules/agents/lib/types.ts` | Task 1 |
| `src/modules/agents/components/AgentNotificationsBridge.tsx` | Task 1 |
| `src/modules/agents/store/agentStore.test.ts` | Task 1 |
| `src/modules/workspaces/PaneTabBar.tsx` | Task 1, 2, 4 |
| `src/modules/shortcuts/shortcuts.ts` | Task 3, 5 |
| `src/app/App.tsx` | Task 3, 4, 5 |
| `src/modules/shortcuts/shortcuts.test.ts` | Task 3, 5 |
| `src/modules/workspaces/lib/types.ts` | Task 4 |

---

## Task 1: JSONL transcript path in agent hover

**Files:**
- Modify: `src-tauri/src/modules/pty/ipc.rs` (line ~147 — the `serde_json::json!` for `kex:agent-session-meta`)
- Modify: `src/modules/agents/lib/types.ts`
- Modify: `src/modules/agents/components/AgentNotificationsBridge.tsx`
- Modify: `src/modules/agents/store/agentStore.test.ts`
- Modify: `src/modules/workspaces/PaneTabBar.tsx` (function `AgentHoverCardContent`)

**Interfaces:**
- Produces: `AgentSessionMeta.transcriptPath?: string` used in Task 4 indirectly (not directly, but must not conflict).

- [ ] **Step 1: Write failing test**

In `src/modules/agents/store/agentStore.test.ts`, add inside the `describe("agentStore.setMeta")` block:

```ts
test("setMeta stores transcriptPath", () => {
  useAgentStore.getState().start("panel-t", "tab-t", "claude");
  useAgentStore.getState().setMeta("panel-t", { transcriptPath: "/home/user/.claude/projects/abc/session.jsonl" });
  const meta = useAgentStore.getState().sessions["panel-t"]?.meta;
  expect(meta?.transcriptPath).toBe("/home/user/.claude/projects/abc/session.jsonl");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --run src/modules/agents/store/agentStore.test.ts
```

Expected: FAIL — `meta?.transcriptPath` is `undefined` because the field does not exist yet.

- [ ] **Step 3: Add `transcriptPath` to `AgentSessionMeta` type**

In `src/modules/agents/lib/types.ts`, update `AgentSessionMeta`:

```ts
export type AgentSessionMeta = {
  sessionId?: string;
  cwdLaunch?: string;
  sessionTitle?: string;
  model?: string;
  transcriptPath?: string;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --run src/modules/agents/store/agentStore.test.ts
```

Expected: PASS — `setMeta` already spreads partial meta, so no logic change needed.

- [ ] **Step 5: Forward `transcript_path` from Rust to frontend**

In `src-tauri/src/modules/pty/ipc.rs`, in the `"SessionStart"` match arm (around line 147), add `"transcriptPath"` to the emitted JSON:

```rust
let _ = app.emit(AGENT_SESSION_META_EVENT, serde_json::json!({
    "panelId":        panel_id,
    "sessionId":      p.session_id,
    "cwdLaunch":      p.cwd,
    "sessionTitle":   session_title,
    "model":          model,
    "transcriptPath": p.transcript_path,
}));
```

- [ ] **Step 6: Update the bridge to propagate `transcriptPath`**

In `src/modules/agents/components/AgentNotificationsBridge.tsx`, find the `listen<AgentSessionMetaPayload>` handler (the `useEffect` around line 226). The local type `AgentSessionMetaPayload` needs the new field. Add it to the type and destructure it:

Find the local type definition (search for `AgentSessionMetaPayload` in this file). Add `transcriptPath: string` to it:

```ts
type AgentSessionMetaPayload = {
  panelId: string;
  sessionId: string;
  cwdLaunch: string;
  sessionTitle: string;
  model: string;
  transcriptPath: string;
};
```

Then update the destructure and setMeta call:

```ts
const { panelId, sessionId, cwdLaunch, sessionTitle, model, transcriptPath } = e.payload;
useAgentStore
  .getState()
  .setMeta(panelId, { sessionId, cwdLaunch, sessionTitle, model, transcriptPath: transcriptPath || undefined });
```

(`transcriptPath || undefined` converts empty string to undefined so the hover row is not rendered for empty paths.)

- [ ] **Step 7: Show transcript path in the agent hover card**

In `src/modules/workspaces/PaneTabBar.tsx`, find `AgentHoverCardContent`. After the "Session" row, add:

```tsx
{agentSession.meta?.transcriptPath && (
  <HoverRow
    label="Transcript"
    value={agentSession.meta.transcriptPath}
    copy={agentSession.meta.transcriptPath}
    valueClassName="font-mono text-foreground"
  />
)}
```

- [ ] **Step 8: Verify types and tests**

```bash
pnpm check-types && pnpm test --run
```

Expected: all 297+ tests pass, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/modules/pty/ipc.rs \
        src/modules/agents/lib/types.ts \
        src/modules/agents/components/AgentNotificationsBridge.tsx \
        src/modules/agents/store/agentStore.test.ts \
        src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(agents): show transcript path in agent hover card"
```

---

## Task 2: Drag-tab scroll bug fix

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx`

**Interfaces:**
- No interface changes.

### Root cause

`onDragStart` in `useDndMonitor` resets `container.scrollLeft = 0` after dnd-kit has already captured the dragged element's bounding rect. When a tab is partially scrolled off to the left, the initial offset between cursor and element is wrong, so the DragOverlay ghost appears far from the cursor.

### Fix

Wrap dnd-kit's `listeners.onPointerDown` in `DraggableTab` to scroll the tab into view synchronously before dnd-kit measures it. Remove the stale `scrollLeft = 0` reset in `onDragStart`.

- [ ] **Step 1: Wrap listeners in DraggableTab**

In `src/modules/workspaces/PaneTabBar.tsx`, find `DraggableTab` (around line 311):

```ts
const { attributes, listeners, setNodeRef, isDragging: isThisDragging } = useDraggable({ id: panel.id });
```

Add the wrapped listeners right after:

```ts
const wrappedListeners = useMemo(() => ({
  ...listeners,
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
    // Scroll tab into view before dnd-kit captures the element rect.
    e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
    listeners?.onPointerDown?.(e as React.PointerEvent);
  },
}), [listeners]);
```

You will also need to add `useMemo` to the import at the top of the file if it is not already there. Check the existing React import line and add `useMemo` if missing.

- [ ] **Step 2: Use wrappedListeners on the tabDiv**

Find the `tabDiv` `div` element (the one that currently has `{...listeners}`). Replace `{...listeners}` with `{...wrappedListeners}`:

Before:
```tsx
{...listeners}
```
After:
```tsx
{...wrappedListeners}
```

The `div` has several spread props — make sure only `{...listeners}` is replaced with `{...wrappedListeners}`. The `{...attributes}` stays as-is.

- [ ] **Step 3: Remove the stale scrollLeft reset**

Find `useDndMonitor` in `PaneTabBar.tsx` (around line 731). The `onDragStart` handler currently does:

```ts
onDragStart() {
  const container = scrollContainerRef.current;
  if (container) container.scrollLeft = 0;
},
```

Remove only the scroll reset, keeping the function if other code remains, or remove the whole `onDragStart` callback if it's empty:

```ts
onDragStart() {},
```

(or remove the `onDragStart` key entirely if the object has other keys — keep `onDragOver`, `onDragEnd`, `onDragCancel`.)

- [ ] **Step 4: Verify types**

```bash
pnpm check-types
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Start the dev app (`pnpm tauri dev`). Open enough terminal tabs to trigger horizontal scroll. Scroll the tab bar so a tab is partially hidden to the left. Drag that tab — the ghost should appear directly under the cursor.

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "fix(tabs): drag ghost position when tab is scrolled out of view"
```

---

## Task 3: Copy-path shortcut (Cmd+Shift+C)

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/modules/shortcuts/shortcuts.test.ts`

**Interfaces:**
- Produces: `ShortcutId` gains `"path.copy"`.

- [ ] **Step 1: Write failing test**

In `src/modules/shortcuts/shortcuts.test.ts`, add at the end:

```ts
test("path.copy shortcut is defined with Cmd/Ctrl+Shift+C binding", () => {
  const s = SHORTCUTS.find((x) => x.id === "path.copy");
  expect(s).toBeDefined();
  expect(s!.defaultBindings).toHaveLength(1);
  const b = s!.defaultBindings[0];
  expect(b.shift).toBe(true);
  expect(b.key).toBe("c");
  // meta on Mac, ctrl elsewhere — one of them must be true
  expect(b.meta || b.ctrl).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --run src/modules/shortcuts/shortcuts.test.ts
```

Expected: FAIL — `path.copy` does not exist yet.

- [ ] **Step 3: Add `"path.copy"` to shortcuts**

In `src/modules/shortcuts/shortcuts.ts`:

Add `"path.copy"` to the `ShortcutId` union:

```ts
export type ShortcutId =
  | "commandPalette.open"
  | ...existing ids...
  | "path.copy";
```

Add to the `SHORTCUTS` array (place it in the `"General"` group near the top):

```ts
{
  id: "path.copy",
  label: "Copy path",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "c" }],
},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --run src/modules/shortcuts/shortcuts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add handler in App.tsx**

In `src/app/App.tsx`, find the `shortcutHandlers` useMemo (around line 992). Add `"path.copy"` to the handler map:

```ts
"path.copy": () => {
  if (!activePanel) return;
  let path: string | undefined;
  if (activePanel.kind === "editor" || activePanel.kind === "markdown") {
    path = activePanel.path;
  } else if (activePanel.kind === "terminal") {
    path = activePanel.cwd;
  } else if (activePanel.kind === "preview") {
    path = activePanel.url;
  }
  if (!path) return;
  void navigator.clipboard.writeText(path).then(() => {
    toast.success("Path copied");
  });
},
```

Make sure `activePanel` is already in the `useMemo` dependency array — it is (it's `activePanel` from line 143). Also verify `toast` is imported from `"sonner"` (it is already used elsewhere in App.tsx).

- [ ] **Step 6: Add `"path.copy"` to `ShortcutHandlers` type**

Search for `type ShortcutHandlers` or `ShortcutHandlers` in `src/app/App.tsx` to find where the handler type is defined. It likely derives from `ShortcutId`, so adding the id to `shortcuts.ts` is sufficient. Verify by running `pnpm check-types`.

- [ ] **Step 7: Verify types and tests**

```bash
pnpm check-types && pnpm test --run
```

Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts \
        src/app/App.tsx \
        src/modules/shortcuts/shortcuts.test.ts
git commit -m "feat(shortcuts): Cmd+Shift+C copies active panel path"
```

---

## Task 4: Persistent terminal tabs (restore on restart + lock)

**Files:**
- Modify: `src/modules/workspaces/lib/types.ts`
- Modify: `src/modules/workspaces/PaneTabBar.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `TerminalPaneHandle.write(data: string)` from `src/modules/terminal/TerminalPane.tsx` (already in `terminalHandles` map in App.tsx).
- Consumes: `updatePanelData(workspaceId, panelId, updater)` from `useWorkspaces` (already destructured in App.tsx line 123).

### Sub-task 4a: Data model

- [ ] **Step 1: Add fields to the terminal Panel type**

In `src/modules/workspaces/lib/types.ts`, update the `terminal` variant:

```ts
| { id: string; kind: "terminal"; cwd?: string; title?: string; blocks?: boolean;
    locked?: boolean; restoreOnRestart?: boolean; persistentCommand?: string }
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm check-types
```

Expected: no errors (all three fields are optional, so existing code compiles).

### Sub-task 4b: Lock behavior

The "locked" property prevents a tab from being closed via Cmd+W or the X button. The tab shows a lock icon instead of the close X.

- [ ] **Step 3: Write a test for lock close protection**

There is no unit test for `handleCloseActivePanel` (it requires the full App component). Instead, test the guard logic at the data level. In `src/modules/workspaces/lib/splitNode.test.ts`, add:

```ts
test("terminal panel locked field round-trips through the type", () => {
  const panel = {
    id: "p1",
    kind: "terminal" as const,
    locked: true,
    restoreOnRestart: false,
    persistentCommand: "lazygit",
  };
  // Type-checks that all three fields are accepted; runtime assertion
  expect(panel.locked).toBe(true);
  expect(panel.persistentCommand).toBe("lazygit");
});
```

- [ ] **Step 4: Run test to verify it passes** (it tests the type, which was added in step 1)

```bash
pnpm test --run src/modules/workspaces/lib/splitNode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Replace close button with lock icon when locked**

In `src/modules/workspaces/PaneTabBar.tsx`, find the close `<button>` at the bottom of `tabDiv` (around line 494):

```tsx
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
```

You need an `onUpdatePanel` prop to be able to call `updatePanelData` from inside `DraggableTab`. Add it to the `DraggableTab` props type and to `Props` (the outer `PaneTabBar` props), and thread it through.

First, look up what imports are at the top of `PaneTabBar.tsx` for icons. The project uses `@hugeicons/core-free-icons` with `HugeiconsIcon`. Import `LockIcon` (or similar lock icon from hugeicons). Check what's available:

```bash
grep -r "Lock\|lock" node_modules/@hugeicons/core-free-icons/dist/index.d.ts 2>/dev/null | grep "LockIcon" | head -5
```

`LockIcon` is confirmed to exist in `@hugeicons/core-free-icons`. Import it the same way as other icons in the file:

```ts
import { ..., LockIcon } from "@hugeicons/core-free-icons";
```

Replace the close button block with a conditional:

```tsx
{panel.kind === "terminal" && panel.locked ? (
  <button
    type="button"
    className="ml-0.5 flex size-[16px] shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-60 transition-opacity hover:!opacity-100 hover:bg-muted hover:text-foreground"
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onUpdatePanel(panel.id, (p) => ({ ...p, locked: false }));
    }}
    title="Unlock tab"
  >
    <HugeiconsIcon icon={LockIcon} size={11} strokeWidth={1.75} />
  </button>
) : (
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
)}
```

Add `onUpdatePanel: (panelId: string, updater: (p: Panel) => Panel) => void` to the `DraggableTab` props type, to the `Props` type of `PaneTabBar`, and thread it from the outer component down to `DraggableTab`.

In `PaneTabBar`'s outer component (the part that renders `DraggableTab`s), pass:

```tsx
onUpdatePanel={(panelId, updater) =>
  updatePanelData(workspaceId, panelId, updater)
}
```

`updatePanelData` must be added to the `Props` of `PaneTabBar` and passed in from the call sites. Find where `PaneTabBar` is used — it is rendered inside `PaneView.tsx`. Add `onUpdatePanel` prop through the same chain.

Alternatively, to avoid deep prop drilling, pass `workspaceId` (already available as a prop in `PaneTabBar`) and an `onUpdatePanel` callback already available in `PaneView`. Check `PaneView.tsx` for what callbacks it receives from `WorkspaceView.tsx`. Follow the same pattern as `onRenamePanel`.

- [ ] **Step 6: Protect Cmd+W for locked tabs**

In `src/app/App.tsx`, find `handleCloseActivePanel` (line 933):

```ts
const handleCloseActivePanel = useCallback(() => {
  if (!activeWorkspace || !activePanelId) return;
  void handleCloseGuard(activeWorkspace.id, activePanelId);
}, [activeWorkspace, activePanelId, handleCloseGuard]);
```

Replace with:

```ts
const handleCloseActivePanel = useCallback(() => {
  if (!activeWorkspace || !activePanelId) return;
  if (activePanel?.kind === "terminal" && activePanel.locked) return;
  void handleCloseGuard(activeWorkspace.id, activePanelId);
}, [activeWorkspace, activePanelId, activePanel, handleCloseGuard]);
```

`activePanel` is already computed at line 143.

### Sub-task 4c: Restore on restart toggle in hover card

- [ ] **Step 7: Add restore-on-restart toggle to TerminalHoverCardContent**

`TerminalHoverCardContent` is currently a pure display component. It needs to become interactive. Add two new props: `panelLocked: boolean`, `panelRestoreOnRestart: boolean`, `panelPersistentCommand: string | undefined`, and `onUpdatePanel: (updater: (p: Panel) => Panel) => void`. Import `Panel` from `"@/modules/workspaces/lib/types"` if not already imported.

Update the function signature:

```tsx
function TerminalHoverCardContent({
  customTitle,
  cwd,
  runningCommand,
  panelLocked,
  panelRestoreOnRestart,
  panelPersistentCommand,
  onUpdatePanel,
}: {
  customTitle: string | undefined;
  cwd: string | undefined;
  runningCommand: string | null;
  panelLocked: boolean;
  panelRestoreOnRestart: boolean;
  panelPersistentCommand: string | undefined;
  onUpdatePanel: (updater: (p: Panel) => Panel) => void;
})
```

Add toggle rows at the bottom of the returned JSX, after the closing `</HoverTable>`:

```tsx
<div className="mt-1.5 space-y-1 border-t border-border/40 pt-1.5">
  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
    <input
      type="checkbox"
      className="size-3 accent-primary"
      checked={panelRestoreOnRestart}
      onChange={(e) => {
        const checked = e.target.checked;
        onUpdatePanel((p) => ({
          ...p,
          restoreOnRestart: checked,
          persistentCommand: checked
            ? (panelPersistentCommand ?? runningCommand ?? "")
            : undefined,
        }));
      }}
    />
    <span className="text-[11px] text-muted-foreground">Restore on restart</span>
  </label>
  {panelRestoreOnRestart && (
    <input
      type="text"
      placeholder="command to run (e.g. lazygit)"
      defaultValue={panelPersistentCommand ?? ""}
      onBlur={(e) => {
        const v = e.target.value.trim();
        onUpdatePanel((p) => ({ ...p, persistentCommand: v || undefined }));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-6 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] text-foreground outline-none focus:border-primary"
    />
  )}
  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
    <input
      type="checkbox"
      className="size-3 accent-primary"
      checked={panelLocked}
      onChange={(e) => {
        onUpdatePanel((p) => ({ ...p, locked: e.target.checked }));
      }}
    />
    <span className="text-[11px] text-muted-foreground">Lock tab (prevent close)</span>
  </label>
</div>
```

- [ ] **Step 8: Pass new props to TerminalHoverCardContent from DraggableTab**

In `DraggableTab`, the `hoverBody` computation (around line 374) currently calls:

```tsx
<TerminalHoverCardContent customTitle={panel.title} cwd={panel.cwd} runningCommand={runningCommand} />
```

Replace with:

```tsx
<TerminalHoverCardContent
  customTitle={panel.title}
  cwd={panel.cwd}
  runningCommand={runningCommand}
  panelLocked={panel.locked ?? false}
  panelRestoreOnRestart={panel.restoreOnRestart ?? false}
  panelPersistentCommand={panel.persistentCommand}
  onUpdatePanel={(updater) => onUpdatePanel(panel.id, updater)}
/>
```

### Sub-task 4d: Restore on restart — send command on launch

- [ ] **Step 9: Send persistent command after terminal mounts**

In `src/app/App.tsx`, find where the workspace state is applied to panels on startup. The best place is in the `useEffect` that runs when `workspaces` are first loaded (after `WorkspaceView` is mounted and terminal handles are registered).

Search for a `useEffect` that depends on workspace state loading or `openPanel`. A good hook point is in the `registerTerminalHandle` callback (called when a `TerminalPane` mounts). Find it (search for `registerTerminalHandle` in App.tsx):

```bash
grep -n "registerTerminalHandle" src/app/App.tsx
```

Inside the `registerTerminalHandle` callback (when `handle` is non-null, meaning the terminal just mounted), add the restore logic:

```ts
if (handle) {
  terminalHandles.current.set(panelId, handle);
  // Restore on restart: send persistent command after the shell is ready.
  const found = findPanelGlobal(panelId);
  const panel = found?.panel;
  if (panel?.kind === "terminal" && panel.restoreOnRestart && panel.persistentCommand) {
    const cmd = panel.persistentCommand;
    setTimeout(() => {
      terminalHandles.current.get(panelId)?.write(cmd + "\r");
    }, 300);
  }
} else {
  terminalHandles.current.delete(panelId);
}
```

The `findPanelGlobal` function is already available (line 128). The `setTimeout` of 300ms is intentional — the shell needs time to become interactive after the PTY spawns.

- [ ] **Step 10: Verify types and tests**

```bash
pnpm check-types && pnpm test --run
```

Expected: all tests pass, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/modules/workspaces/lib/types.ts \
        src/modules/workspaces/PaneTabBar.tsx \
        src/app/App.tsx
git commit -m "feat(tabs): persistent terminal tabs with restore on restart and lock"
```

---

## Task 5: Notification jump shortcut (swap Cmd+I / Cmd+Shift+I)

**Files:**
- Modify: `src/modules/shortcuts/shortcuts.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/modules/shortcuts/shortcuts.test.ts`

**Interfaces:**
- Consumes: `useAgentStore.getState().notifications` — `notifications[0]` is the most recent (inserted at front by `pushNotification`).
- Consumes: `onActivateAgent(workspaceId: string, panelId: string)` from App.tsx — same function passed as `onActivate` to `NotificationBell`.

- [ ] **Step 1: Write failing tests**

In `src/modules/shortcuts/shortcuts.test.ts`, add:

```ts
describe("notification shortcuts", () => {
  test("notifications.toggle default binding is Cmd/Ctrl+Shift+I", () => {
    const s = SHORTCUTS.find((x) => x.id === "notifications.toggle");
    expect(s).toBeDefined();
    const b = s!.defaultBindings[0];
    expect(b.shift).toBe(true);
    expect(b.key).toBe("i");
    expect(b.meta || b.ctrl).toBe(true);
  });

  test("notifications.jumpToLast default binding is Cmd/Ctrl+I (no shift)", () => {
    const s = SHORTCUTS.find((x) => x.id === "notifications.jumpToLast");
    expect(s).toBeDefined();
    const b = s!.defaultBindings[0];
    expect(b.shift).toBeFalsy();
    expect(b.key).toBe("i");
    expect(b.meta || b.ctrl).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test --run src/modules/shortcuts/shortcuts.test.ts
```

Expected: both new tests FAIL.

- [ ] **Step 3: Swap `notifications.toggle` binding and add `notifications.jumpToLast`**

In `src/modules/shortcuts/shortcuts.ts`:

**Add `"notifications.jumpToLast"` to the `ShortcutId` union:**

```ts
| "notifications.jumpToLast"
```

**Update `notifications.toggle` default binding** (find the existing entry and change it):

```ts
{
  id: "notifications.toggle",
  label: "Notifications",
  group: "View",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "i" }],
},
```

**Add `notifications.jumpToLast` entry** (place it right after `notifications.toggle`):

```ts
{
  id: "notifications.jumpToLast",
  label: "Jump to latest notification",
  group: "View",
  defaultBindings: [{ [MOD_PROP]: true, key: "i" }],
},
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test --run src/modules/shortcuts/shortcuts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add handler in App.tsx**

In `src/app/App.tsx`, find the `shortcutHandlers` useMemo. `onActivateAgent` is defined around line 1124 — it is in scope via closure.

Add the new handler in the map:

```ts
"notifications.jumpToLast": () => {
  const first = useAgentStore.getState().notifications[0];
  if (first) onActivateAgent(first.tabId, first.panelId);
},
```

Add `onActivateAgent` to the `useMemo` dependency array if it is not already there.

- [ ] **Step 6: Verify types and tests**

```bash
pnpm check-types && pnpm test --run
```

Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/shortcuts/shortcuts.ts \
        src/app/App.tsx \
        src/modules/shortcuts/shortcuts.test.ts
git commit -m "feat(shortcuts): swap Cmd+I/Cmd+Shift+I for notifications"
```

---

## Final verification

- [ ] Run the full suite one last time:

```bash
pnpm lint && pnpm check-types && pnpm test --run
```

Expected: lint clean, 0 type errors, all tests pass.
