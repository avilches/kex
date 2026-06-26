# Terminal Scratchpad Bar

**Date:** 2026-06-25
**Branch:** worktree-terminal-scratchpad

## Summary

A persistent textarea bar at the bottom of every terminal pane, toggled with a keyboard shortcut. Lets the user compose multi-line input, paste freely, and edit before sending to the PTY, without interfering with the normal terminal stdin. Works for both regular and blocks terminals.

## User-facing behavior

- **Cmd+U** (macOS) / no default elsewhere (user-assignable) opens and focuses the bar.
- If the bar is already open and the bar has focus: Cmd+U moves focus back to the terminal.
- If the bar is already open and the terminal has focus: Cmd+U moves focus to the bar.
- **Escape** (from the bar): closes the bar and returns focus to the terminal.
- The bar is **per-terminal pane** -- each pane remembers its own open/closed state and draft independently.
- The draft text is preserved when the bar is closed and reopened; it is cleared only after a successful send.
- Sending uses `submitToLeaf(leafId, text)`, which wraps multi-line content in bracketed paste (`\x1b[200~...\x1b[201~\r`) automatically.

## Enter key behavior

Configurable via a `scratchpadEnterSends` boolean preference (default `true`):

| Setting | Enter | Shift+Enter |
|---------|-------|-------------|
| `true` (default) | Send to terminal | Insert newline |
| `false` | Insert newline | Send to terminal |

A checkbox labeled **"Enter=Send"** appears inside the bar next to the Send button. Toggling it writes the preference immediately (same as changing it in Settings). The label text changes to **"Shift+Enter=Send"** when unchecked.

## Architecture

### 1. Shortcut

File: `src/modules/shortcuts/shortcuts.ts`

- New `ShortcutId`: `"terminal.scratchpad"`
- Group: `"Terminal"`
- Default binding: `{ meta: true, key: "u" }` on macOS only (same pattern as `terminal.clear`)
- No default on Linux/Windows to avoid conflicting with Ctrl+U (readline kill-line)

### 2. Session state

File: `src/modules/terminal/lib/useTerminalSession.ts`

New fields added to the `Session` type (following the existing `inputFocus` / `inputDraft` / `inputActive` pattern for blocks):

```
scratchpadOpen: boolean          // bar is visible
scratchpadFocused: boolean       // bar textarea currently has focus
scratchpadFocus: (() => void) | null  // callback to programmatically focus the textarea
scratchpadDraft: string          // persists between open/close cycles
scratchpadListeners: Set<() => void>  // notifies React subscribers on state changes
```

New exported module-level functions:

- `cycleScratchpad(leafId)`: implements the three-state Cmd+U logic
  1. closed → `scratchpadOpen = true`, call `scratchpadFocus?.()`
  2. open + bar focused → call `focusSlot(leafId)` (focus the xterm)
  3. open + bar not focused → call `scratchpadFocus?.()`
- `closeScratchpad(leafId)`: sets `scratchpadOpen = false`, calls `focusSlot(leafId)`, notifies listeners
- `setLeafScratchpadFocus(leafId, fn)`: registers the focus callback (called by ScratchpadBar on mount)
- `setLeafScratchpadFocused(leafId, focused)`: updates `scratchpadFocused` (called on textarea focus/blur)
- `getLeafScratchpadDraft(leafId)`: reads draft
- `setLeafScratchpadDraft(leafId, text)`: writes draft

`useTerminalSession` hook return value gains `scratchpadOpen: boolean` (synced via `scratchpadListeners`, same mechanism as `blockMode`).

### 3. ScratchpadBar component

New file: `src/modules/terminal/ScratchpadBar.tsx`

A thin React component:

- Native `<textarea>` (auto-growing up to ~6 lines, then scrolls). No CodeMirror.
- **Send button**: calls `submitToLeaf(leafId, text)` then clears the draft.
- **"Enter=Send" checkbox** (label switches to "Shift+Enter=Send" when unchecked): reads/writes the `scratchpadEnterSends` preference directly.
- `onKeyDown`:
  - If `enterSends && Enter && !Shift` → send
  - If `!enterSends && Enter && Shift` → send
  - `Escape` → `closeScratchpad(leafId)`
  - All other keys pass through normally (including Cmd+U, which the global handler catches first via capture phase)
- On mount: calls `setLeafScratchpadFocus(leafId, () => textareaRef.current?.focus())`
- On unmount: calls `setLeafScratchpadFocus(leafId, null)`
- `onFocus` / `onBlur`: calls `setLeafScratchpadFocused(leafId, true/false)`
- Draft is stored locally in component state and synced to the session via `setLeafScratchpadDraft` on every change. On mount, initializes from `getLeafScratchpadDraft(leafId)`.

Styling: same `border-t border-border/40 px-3 py-2` container as the blocks ShellInput. The textarea uses `font-mono text-sm` and a minimal appearance (no border decoration, background matches the pane). Checkbox and Send button are `ActionButton` style per the UI conventions.

### 4. TerminalPane

File: `src/modules/terminal/TerminalPane.tsx`

Both the blocks and the regular terminal branches render `<ScratchpadBar>` in a conditional wrapper below the xterm container, shown when `session.scratchpadOpen === true`. The bar is always rendered while open (not lazy) to preserve textarea focus.

The regular terminal branch becomes a `<div className="zoom-exempt flex h-full w-full flex-col">` wrapper identical to the blocks branch, with `ScratchpadBar` at the bottom.

### 5. Settings

File: `src/modules/settings/store.ts`

New preference field:
```
scratchpadEnterSends: boolean  // default: true
```

File: `src/modules/settings/ui/sections/TerminalSection.tsx` (or equivalent)

New toggle row in the Terminal section: "Scratchpad: Enter sends" (matches the checkbox label convention).

### 6. App.tsx

New shortcut handler added to `useGlobalShortcuts`:
```
"terminal.scratchpad": () => {
  if (activePanelKind === "terminal") cycleScratchpad(activePanelId);
}
```

`activePanelKind` and `activePanelId` are already tracked in App.tsx.

## What this does NOT include

- CodeMirror or syntax highlighting in the bar
- Shared/global scratchpad state across terminals
- History of previously sent commands
- Auto-close after send (the bar stays open; the user closes it with Escape or Cmd+U)

## Files changed

| File | Change |
|------|--------|
| `src/modules/shortcuts/shortcuts.ts` | Add `"terminal.scratchpad"` shortcut |
| `src/modules/terminal/lib/useTerminalSession.ts` | Extend `Session`, add module functions, expose in hook |
| `src/modules/terminal/ScratchpadBar.tsx` | New component |
| `src/modules/terminal/TerminalPane.tsx` | Render ScratchpadBar, wrap regular terminal in flex column |
| `src/modules/settings/store.ts` | Add `scratchpadEnterSends` preference |
| `src/modules/settings/ui/sections/TerminalSection.tsx` | Add toggle row |
| `src/app/App.tsx` | Add shortcut handler |
