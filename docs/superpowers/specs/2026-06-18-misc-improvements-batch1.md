# Spec: Misc Improvements Batch 1

Items: JSONL path in agent hover, drag-tab scroll bug fix, copy-path shortcut,
persistent terminal tabs (restore + lock), notification jump shortcut.

---

## 1. JSONL path in agent hover

### Problem

`transcript_path` arrives in the `SessionStart` hook payload and is stored in
the Rust backend (`SessionStartPayload`), but it is never forwarded to the
frontend. The agent hover card only shows `sessionId`, `cwdLaunch`,
`sessionTitle`, and `model`.

### Design

**Rust (`src-tauri/src/modules/pty/ipc.rs`):**
The `AgentSessionMetaPayload` struct (the struct emitted as
`kex:agent-session-meta`) gains a `transcript_path: String` field. The
`SessionStart` handler populates it from `p.transcript_path`.

**TS types (`src/modules/agents/lib/types.ts`):**
`AgentSessionMeta` gains:
```ts
transcriptPath?: string;
```

**Bridge (`src/modules/agents/components/AgentNotificationsBridge.tsx`):**
Destructure `transcriptPath` from the event payload and pass it to `setMeta`.

**Hover card (`src/modules/workspaces/PaneTabBar.tsx`):**
In `AgentHoverCardContent`, after the "Session" row, add:
```tsx
{transcriptPath && (
  <HoverRow label="Transcript" value={transcriptPath} copy={transcriptPath}
    valueClassName="font-mono text-foreground" />
)}
```
Value is the full path. Shown only when non-empty.

---

## 2. Drag-tab scroll bug fix

### Problem

When a tab is partially hidden (scrolled off to the left), dragging it causes
the DragOverlay ghost to appear far from the cursor. Root cause: dnd-kit
captures the drag element's bounding rect on `pointerdown`, but the current
fix (`container.scrollLeft = 0` inside `onDragStart` of `useDndMonitor`) fires
too late - after dnd-kit has already measured the offset. The ghost position is
based on a stale measurement.

### Design

In `DraggableTab` (`PaneTabBar.tsx`), add an `onPointerDown` handler that
scrolls the tab element into view synchronously before dnd-kit processes the
event:

```tsx
onPointerDown={(e) => {
  // Scroll tab into view before dnd-kit captures position
  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
}}
```

Because `scrollIntoView` is synchronous and `onPointerDown` fires before
dnd-kit's sensor activates, the element will be fully visible when dnd-kit
measures it. The ghost will appear directly under the cursor.

Remove the `scrollLeft = 0` reset in the `onDragStart` handler of
`useDndMonitor` - it is no longer needed and causes its own visual jank.

---

## 3. Copy-path shortcut (Cmd+Shift+C)

### Design

**Shortcut (`src/modules/shortcuts/shortcuts.ts`):**
New entry:
```ts
{
  id: "path.copy",
  label: "Copy path",
  group: "General",
  defaultBindings: [{ [MOD_PROP]: true, shift: true, key: "c" }],
}
```
`ShortcutId` union gets `"path.copy"`.

**Handler (`App.tsx`):**
Reads the active panel of the focused pane:
- `kind === "editor"` or `kind === "markdown"`: copy `panel.path`
- `kind === "terminal"`: copy `panel.cwd` (skip if undefined)
- `kind === "preview"`: copy `panel.url`
- other kinds: no-op

On success: `navigator.clipboard.writeText(path)` then `toast.success("Path copied")`.
On no path available: silent no-op.

---

## 4. Persistent terminal tabs

### Problem

Terminal tabs running persistent tools (e.g., `lazygit`, `top`) are lost on
app restart. Users also want protection against accidental Cmd+W closure.

### Two independent properties

Both are optional fields on the `terminal` Panel type.

#### 4a. Restore on restart (`restoreOnRestart` + `persistentCommand`)

**Types (`src/modules/workspaces/lib/types.ts`):**
```ts
{ id: string; kind: "terminal"; cwd?: string; title?: string; blocks?: boolean;
  locked?: boolean;
  restoreOnRestart?: boolean;
  persistentCommand?: string; }
```

**UI - hover popup (`PaneTabBar.tsx`, `AgentHoverCardContent` / `TerminalHoverCardContent`):**
In `TerminalHoverCardContent`, after the existing rows, add a toggle row:
```
[ ] Restore on restart
    [lazygit          ]   <- text input, shown only when toggle is on
```
- When the toggle turns on, `persistentCommand` is pre-filled with the current
  `runningCommand` (already tracked via OSC 133). The user can edit it.
- When the toggle turns off, `persistentCommand` is cleared.
- Changes call `updatePanelData(workspaceId, panelId, updater)`.
  `PaneTabBar` already receives `workspaceId` as a prop, so it can be threaded
  down to the hover card content via a new `onUpdatePanel` callback prop, or
  `workspaceId` can be passed directly.

**Restore logic (`App.tsx` / workspace restore):**
On app start, after workspace state is loaded and panels are mounted, for each
`terminal` panel with `restoreOnRestart: true` and a non-empty
`persistentCommand`, send the command to the PTY via `pty_write` once the PTY
is ready. A short `setTimeout` (300ms) is sufficient since the shell is already
interactive by then. The command string must end with `\r` (CR), not `\n`, per
the cross-platform PTY convention.

#### 4b. Locked tab (`locked`)

**UI - tab chip (`PaneTabBar.tsx`):**
- When `locked: true`: the tab renders a small lock icon (14px) in place of
  the close X. The icon is always visible (not just on hover).
- Click on the lock icon: toggles `locked` to `false` (unlocks).
- When `locked: false`: normal X behavior.

**Close protection:**
- `tab.close` shortcut handler: if the active panel is a `terminal` with
  `locked: true`, do nothing (silent no-op).
- The X button is replaced by the lock icon so there is no button to click.

**Toggle from hover popup:**
In `TerminalHoverCardContent`, a second toggle row:
```
[ ] Lock tab (prevent accidental close)
```
Calls `updatePanel(panelId, { locked })`.

---

## 5. Notification jump shortcut

### Design

**Swap bindings in `shortcuts.ts`:**
- `notifications.toggle`: `defaultBindings` changes to `[{ [MOD_PROP]: true, shift: true, key: "i" }]`
- New shortcut `notifications.jumpToLast`: `defaultBindings: [{ [MOD_PROP]: true, key: "i" }]`

**Handler (`App.tsx`):**
```ts
case "notifications.jumpToLast": {
  const notifications = useAgentStore.getState().notifications;
  const first = notifications[0]; // [0] = most recent (pushNotification inserts at front)
  if (first) onActivateAgent(first.tabId, first.panelId);
  break;
}
```
`onActivateAgent` is the same callback passed to `NotificationBell`.
If there are no notifications, the shortcut is a silent no-op.

---

## Edge cases

- **JSONL path empty string**: the backend may emit `transcript_path: ""`
  (e.g., in print mode). Frontend checks `transcriptPath` is truthy before
  rendering the row.
- **Terminal cwd undefined for Cmd+Shift+C**: silent no-op, no toast.
- **Restore command on a locked tab**: the two properties are independent.
  A locked tab can have `restoreOnRestart: false`.
- **Restore command with a non-existent cwd**: the PTY spawn already uses the
  panel's `cwd`; if it no longer exists, the shell opens in the home dir. The
  command is still sent. No special handling needed.
- **`persistentCommand` with interactive TUI**: commands like `lazygit` that
  take over the terminal work fine since `pty_write` just sends the string
  followed by `\r`.
