# Tab close confirmation: warning setting + unified close queue

## Goal

Give the user control over close confirmations and make them consistent across
every close path. Three user-visible outcomes:

1. A General setting `Warn when closing a tab with a running process` (default
   `true`). When `false`, terminals with a running foreground process close
   without asking.
2. The terminal warning dialog gains a `Don't ask me again` checkbox that, when
   checked and the user confirms Close, persists the setting to `false` forever.
3. Closing an editor with unsaved changes offers three actions: `Cancel`,
   `Don't save`, `Save`. `Save` writes the file then closes.

All of the above must work for bulk closes (`Close All Tabs`, `Close Other
Tabs`) as a sequential queue: each tab is closed one at a time, a tab that needs
confirmation pauses the queue until the user answers, and `Cancel` stops the
whole queue (the current tab is not closed and no later tab is closed).

After any close flow finishes (confirmed, cancelled, or completed), focus
returns to the active tab's terminal or editor.

## Background / current state

Two independent close paths exist today:

- Individual close (tab `x`, shortcut) goes through `useTabCloseGuards`
  (`src/app/hooks/useTabCloseGuards.ts`), which detects a running process
  (`leafHasForegroundProcess`) or a dirty editor (`panel.dirty`) and shows the
  matching `AlertDialog` in `src/app/components/CloseDialogs.tsx`.
- Bulk close (`Close All Tabs` / `Close Other Tabs`) is wired from
  `PaneTabBar.tsx` to `PaneView.tsx`
  (`handleCloseAllPanels` / `handleCloseOtherPanels`), which call
  `pane.panels.filter(isBulkClosable).forEach(onClosePanel)`. This path
  **bypasses the guards entirely**: no process check, no dirty check, no dialog.

The dialogs in `CloseDialogs.tsx` use imperative `onConfirm`/`onCancel`
callbacks and module state (`setPendingClosePanel`, etc.). The editor close
dialog currently has two buttons (`Cancel`, `Close Anyway`). There is no
programmatic editor save: `EditorPaneHandle` exposes no `save()`, only the
internal `Mod-s` / vim `:w` paths in `EditorPane.tsx` reach `useDocument.save`.
Focus management only targets terminals (`terminalHandles.current.get(id).focus()`),
deferred via `requestAnimationFrame` / `setTimeout`.

## Design

### 1. Setting

`src/modules/settings/store.ts`:

- Add `warnOnCloseTabWithRunningProcess: boolean` to `Preferences`.
- Add `warnOnCloseTabWithRunningProcess: true` to `DEFAULT_PREFERENCES`.
- Add key constant and `setWarnOnCloseTabWithRunningProcess(value)` setter
  following the `setVimMode` pattern, and register it in `PREF_KEY_MAP`.

`src/settings/sections/GeneralSection.tsx`:

- Read `usePreferencesStore((s) => s.warnOnCloseTabWithRunningProcess)`.
- Add a `SettingRow` + `Switch` in the Terminal area, title
  `Warn when closing a tab with a running process`, description e.g.
  `Confirm before closing a terminal that still has a process running.`

### 2. Promise-based dialog decisions

Refactor `useTabCloseGuards` so each dialog resolves a Promise with the user's
decision instead of firing loose callbacks.

Decision shapes:

```ts
type TerminalCloseDecision =
  | { type: "cancel" }
  | { type: "close"; dontAskAgain: boolean };

type EditorCloseDecision =
  | { type: "cancel" }
  | { type: "save" }
  | { type: "dont-save" };
```

Mechanism: a `resolverRef` holds the pending `resolve`. Requesting a dialog
sets `pending<X>Panel` and returns `new Promise((resolve) => { resolverRef.current = resolve })`.
The dialog buttons call the resolver with the decision and clear the pending
panel. `onOpenChange(false)` (escape / overlay click) resolves as `cancel`.

The hook exposes a single entry point:

```ts
closePanels(panelIds: string[]): Promise<void>
```

`requestClose(panelId)` becomes `closePanels([panelId])` for the individual case.

### 3. Unified sequential close queue

Implemented in App.tsx (or inside the hook with the needed deps injected):

```
suppressTerminalWarn = false
for panelId in panelIds:
  panel = findPanel(panelId)
  if not panel: continue
  if panel.kind == "terminal":
     if panel.locked: continue            // never bulk-close locked
     if warnSetting && !suppressTerminalWarn:
        name = await leafHasForegroundProcess(panelId)
        if name != null:
           d = await showTerminalDialog(panel, name)
           if d.type == "cancel": break    // stop the whole queue
           if d.dontAskAgain:
              await setWarnOnCloseTabWithRunningProcess(false)
              suppressTerminalWarn = true
  else if panel.kind == "editor" && panel.dirty:
     d = await showEditorDialog(panel)
     if d.type == "cancel": break
     if d.type == "save": await savePanel(panelId)
     // dont-save: fall through to close
  disposeIfTerminal(panelId)
  closePanel(workspaceId, panelId)
focusActivePanel()
```

Notes:

- `suppressTerminalWarn` is a local flag because the persisted setting update is
  async and would not propagate within the same loop; the flag guarantees the
  rest of the queue closes without re-asking after `Don't ask me again`.
- `break` on cancel leaves already-closed tabs closed and stops before closing
  the current one.
- Locked terminals are skipped (mirrors `isBulkClosable`).

Wiring: `PaneView` `handleCloseAllPanels` / `handleCloseOtherPanels` and the
`PaneTabBar` context-menu items must call the new queue with the filtered list
of panel ids (preserving tab order) instead of `forEach(onClosePanel)`.

### 4. Editor save handle

- Add `save(): Promise<void>` and `focus(): void` to `EditorPaneHandle` in
  `src/modules/editor/EditorPane.tsx`, delegating to the existing
  `saveRef.current` / CodeMirror focus.
- Add an `editorHandles` ref in App.tsx mirroring `terminalHandles`, populated
  where editor panes mount (EditorStack), so `savePanel(id)` and editor focus
  are reachable from the queue.
- `savePanel(id)` calls `editorHandles.current.get(id)?.save()` and awaits it.
  If `save()` throws (write failure), the error propagates: the queue stops and
  the tab is **not** closed, so the user does not silently lose data on a failed
  write. If no handle is registered for the id (the pane is mounted but the
  handle ref is not yet populated), `savePanel` resolves as a no-op and the tab
  closes; this is a guarded edge case since the dialog only appears for
  `panel.dirty` editors, which are mounted.

### 5. Editor dialog: three buttons

`CloseDialogs.tsx`, the `pendingClosePanel` dialog:

- Title: `Close ${name}?` (filename), fallback `Close file?`.
- Description: `You are about to close a file with unsaved changes`.
- Footer buttons, left to right: `Cancel` (resolve `cancel`), `Don't save`
  (resolve `dont-save`), `Save` (resolve `save`, autofocus). Use `AlertDialog`
  primitives; `Save` is the primary action.

### 6. Terminal dialog: "Don't ask me again" checkbox

`CloseDialogs.tsx`, the `pendingTerminalClosePanel` dialog:

- Local `useState` for the checkbox, reset to `false` whenever the dialog opens.
- Checkbox at the footer-left: `Don't ask me again`.
- `Close` resolves `{ type: "close", dontAskAgain: checked }`.
- `Cancel` (and escape / overlay) resolves `{ type: "cancel" }`, checkbox value
  discarded.

### 7. Focus after close

- Add `focusActivePanel()` helper in App.tsx: find the active workspace/pane,
  read `activePanelId` and its `kind`, then call
  `terminalHandles.current.get(id)?.focus()` or
  `editorHandles.current.get(id)?.focus()`, deferred via
  `requestAnimationFrame`.
- Call it at the end of `closePanels` (after the loop and on cancel `break`).
- Refactor the three existing terminal-only focus effects (workspace switch, OS
  window refocus, bell close) to use `focusActivePanel()` so editors also get
  focus there.

## Out of scope

- The `pendingDeletePanels` dialog (file deleted on disk while dirty) keeps its
  current two-button behavior. It only inherits `focusActivePanel()`. No
  `Don't ask again`.
- No new setting for editor unsaved-changes confirmation: protecting unsaved
  data must not be silenceable.

## Testing

Pure / unit:

- The queue decision logic should be extracted enough to test the sequencing
  invariants without React: given a list of panels and a sequence of decisions,
  assert which panels close and that `cancel` stops the queue. If full
  extraction is impractical, at minimum unit-test the new store setter
  (key mapping, default) like existing preference setters.

Manual (add to `docs/RESTORE_SESSION_TESTS.md` or a close-flow checklist):

- Setting default true; toggling persists across restart.
- Terminal with running process: Cancel keeps tab; Close closes; Close with
  `Don't ask me again` closes and flips the setting off (verify in Settings).
- Editor dirty: Save writes + closes; Don't save closes losing changes; Cancel
  keeps tab.
- Close All / Close Others with a mix of clean terminals, a busy terminal, and
  a dirty editor: queue pauses on each guard, Cancel mid-sequence stops the
  rest, `Don't ask me again` closes the remaining terminals silently.
- Focus lands on the active tab's terminal or editor after each flow.

## Files touched

- `src/modules/settings/store.ts`
- `src/settings/sections/GeneralSection.tsx`
- `src/app/hooks/useTabCloseGuards.ts`
- `src/app/components/CloseDialogs.tsx`
- `src/app/App.tsx`
- `src/modules/editor/EditorPane.tsx` (+ EditorStack wiring for `editorHandles`)
- `src/modules/workspaces/PaneView.tsx`, `src/modules/workspaces/PaneTabBar.tsx`
  (re-wire bulk close to the queue)
