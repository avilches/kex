# Scratchpad — binary focus model

This document is the single reference for the scratchpad's state model and every focus/close path
that touches it. If you change anything about the scratchpad, read this first, and update it in the
same commit as your change (see `AGENTS.md`, Living documentation).

For the high-level user-facing overview, see [ARCHITECTURE.md](ARCHITECTURE.md) section 3.1. For the
full war-story history of how this model was arrived at (three separate redesigns), see
[WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md) Bug 7 and its addenda.

---

## 1. The binary model

The scratchpad is a per-terminal input bar (`ScratchpadBar.tsx`) mounted below the terminal grid
(`TerminalPane.tsx`). Its entire state is one boolean, `Session.scratchpadOpen`
(`src/modules/terminal/lib/useTerminalSession.ts`), kept in the module-scope `sessions` map alongside
the rest of a terminal leaf's live state (`visibleNow`, `focusedNow`, etc.).

**Existence and focus are the same thing.** There is no "open but unfocused" state:

```
open == focused
visibility = scratchpadOpen && tab is focused
```

`TerminalPane.tsx` renders `<ScratchpadBar>` only `{session.scratchpadOpen && focused && (...)}` — so
the moment a leaf stops being the focused tab, its scratchpad bar unmounts even if `scratchpadOpen`
is still true in the session (the flag survives; the component doesn't render until the tab is
focused again). This is why closing the scratchpad is not "hide it" — it is "set `scratchpadOpen =
false`", and everything that could plausibly leave the scratchpad (clicking the terminal, changing
tab/pane/workspace, Escape, the toggle shortcut) must flip that flag explicitly. There is no
DOM-blur-implies-closed shortcut that covers every case; see section 4.

**Persistence.** `Tab.scratchpadEnabled?: boolean` (`src/modules/workspaces/lib/types.ts`) mirrors
`Session.scratchpadOpen` for terminal tabs. It is written by `notifyScratchpadEnabled` inside
`closeScratchpadState`/`openScratchpadState` on every open/close transition, delivered through the
`onScratchpadEnabled` callback (`TabContent.tsx`'s `onScratchpadEnabled: (tabId, enabled) =>
updateTabData(...)`) and persisted to `workspace-state.json` like the rest of the tab. Because a
leaf's scratchpad can only be open while that leaf is focused, and only one leaf in the whole app can
be focused at a time (the active tab of the active pane of the active workspace), **at most the
single tab that held the scratchpad focus at quit** has `scratchpadEnabled: true` on disk.

On restore, `TabContent.tsx` seeds the initial value:

```ts
initialScratchpadEnabled={tab.scratchpadEnabled ?? scratchpadInNewTerminals}
```

The `scratchpadInNewTerminals` preference (Settings > Terminal, default on) only applies when the tab
has never written the field itself — i.e. genuinely new terminals, not restored ones. A restored tab
whose field is explicitly `false` stays closed even if the preference is on.

---

## 2. The resume mark (`scratchpadResume`)

`Session.scratchpadResume` is a **transient, in-memory-only** boolean, never persisted, never written
to `Tab`. It exists to answer one question: "if the user comes back to this leaf, should the
scratchpad reopen?" It only matters when the opt-in preference `scratchpadRememberFocus` (Settings >
Terminal, default **off**) is on.

### Leave vs. dismiss

`closeScratchpadState(s, leafId, reason)` takes a `ScratchpadCloseReason`:

| Reason | Meaning | Effect on `scratchpadResume` |
|---|---|---|
| `"leave"` | Abandon-close: tab/pane/workspace switch, transient chrome (dropdown/dialog/context menu) closing, blur to somewhere else | Set to `usePreferencesStore.getState().scratchpadRememberFocus` (only if this call is the one that actually closes it — never clobbers an existing mark on an already-closed leaf) |
| `"dismiss"` | Deliberate close: Escape, the `Cmd+U` toggle, clicking the terminal of the already-focused leaf | Always cleared, even if the scratchpad was already closed, so a dismiss can never leave a stale mark behind |

Call sites, by reason:

- `"leave"`: `leaveLeafScratchpad(leafId)` — called from the textarea `onBlur` guard, the
  workspace-switch effect, the sentinel effect, `leaveActivePaneScratchpad`, and
  `scratchpadLeafsToClose` (via `onActivateTabStable`).
- `"dismiss"`: `closeScratchpad(leafId)` (Escape handler, and the close branch of `toggleScratchpad`) and
  `setLeafTerminalFocused(leafId)` when it fires on an already-focused leaf (clicking the terminal of
  the tab you're already on).

A fresh open (`openScratchpadState`) always clears `scratchpadResume` too — a mark is only meaningful
while the scratchpad is closed.

### Consuming the mark

`requestLeafFocus` (section 3) is the only place that reads `scratchpadResume`:

```ts
if (s.scratchpadOpen) {
  requestScratchpadFocus(s);
} else if (s.scratchpadResume && usePreferencesStore.getState().scratchpadRememberFocus) {
  openScratchpadState(s, leafId);
} else {
  focusSlot(leafId);
}
```

Both the mark-setting side (`closeScratchpadState`) and the mark-consuming side (`requestLeafFocus`)
read `scratchpadRememberFocus` **live** from the preferences store, not a snapshot taken when the mark
was set. If the user turns the preference off after a mark was set, `requestLeafFocus` falls through
to focusing the terminal and the stale mark just sits inert until a later dismiss or open clears it.

---

## 3. THE INVARIANT: `requestLeafFocus` is the only way to focus a leaf

**Every code path that puts DOM focus on a leaf (scratchpad or terminal) must call
`requestLeafFocus(leafId)`** (`src/modules/terminal/lib/useTerminalSession.ts`). Never call
`focusSlot(leafId)` or a scratchpad-focus helper directly from outside `useTerminalSession.ts` itself.

Why this is load-bearing: `requestLeafFocus` is the one place that implements the three-way decision
(scratchpad open -> focus scratchpad; scratchpad closed with a live resume mark -> reopen and consume
it; otherwise -> focus the terminal). Any call site that bypasses it and does its own
"`scratchpadOpen ? focusScratchpad() : focusTerminal()`" inline silently forks the resume semantics for
whatever gesture routes through it — and this has happened **twice**, in two different subsystems,
each requiring its own investigation and fix:

- **The focused-transition effect** (`useTerminalSession.ts`, the effect on `visible`/`focused`
  props, around the `gained = visible && focused && !wasFocusedRef.current` guard) used to inline
  `s.scratchpadOpen ? requestScratchpadFocus(s) : focusSlot(leafId)` directly. This is the actual path
  that moves DOM focus on a **keyboard** pane switch (`focusPane` only updates React state; it never
  touches the DOM). Because it predated the resume mark, it never consulted `scratchpadResume`, so
  returning to a pane by keyboard silently ignored a pending resume mark while every other entry point
  (bell, RunButton, OpenInEditorButton, Radix `onCloseAutoFocus`) honored it correctly. Fixed in
  `731b110` (`fix(terminal): route focused-transition focus through requestLeafFocus`); documented as
  Addendum 6 in `WORKSPACES_GOTCHAS.md` Bug 7.
- **The script run/stop path** (`runWorkspaceConfig`/`stopWorkspaceConfig` in `App.tsx`) originally
  called `revealTab` unconditionally when the script's tab lived in the current workspace, on the
  assumption that revealing (making a tab active in its own pane without moving `activePaneId`) never
  steals focus. That assumption breaks when the script's target pane **is** the user's own current
  pane: a pane shows exactly one tab, so "reveal without stealing focus" is structurally impossible
  there — the user's own tab gets silently swapped out while focus intent still points at the old tab.
  Fixed in `54bad6f` (`fix(app): let focus follow the script when it runs in the user's own pane`),
  which special-cases `found.pane.id === userPaneId` to fall through to `activateTab` +
  `requestLeafFocus` instead of `revealTab`. See section 5.

### Every current call site

Some gestures move DOM focus by calling `requestLeafFocus` directly; others (keyboard tab switch,
keyboard/mouse-into-unfocused-terminal pane switch) only change React state (`activeTabId`/
`activePaneId`) and rely on the focused-transition effect in `useTerminalSession.ts` to notice the
`focused` prop actually became `true` and call `requestLeafFocus` from there. Both are the invariant
in practice — a gesture that changes React state without ever producing a `focused: false -> true`
transition on some leaf would need its own explicit call, which is exactly the bug class in the two
cautionary examples above.

| Gesture | File : function |
|---|---|
| Click a tab (same or different pane) | `src/modules/workspaces/PaneView.tsx` : `handleActivate` (calls `requestLeafFocus` explicitly, in addition to the effect, because a native `mousedown` can steal focus back between the pane-focus commit and this activation — see `WORKSPACES_GOTCHAS.md` Bug 7 Addendum 2) |
| Keyboard tab switch (`tab.next`/`tab.prev`/`tab.selectByIndex`), keyboard pane switch (`pane.focusUp/Down/Left/Right`), mouse click on an unfocused pane's terminal | No explicit call in `App.tsx` — these only flip `activeTabId`/`activePaneId` React state; DOM focus is actually moved by `src/modules/terminal/lib/useTerminalSession.ts`'s focused-transition effect (`gained = visible && focused && !wasFocusedRef.current`) reacting to the resulting prop change |
| Notification/agent jump | `src/app/App.tsx` : `notifications.jumpToLast` shortcut handler and `onActivateAgent` (used by the notification bell and agent list) both call `requestLeafFocus` explicitly after `onActivateTabStable`, wrapped in a `setTimeout(..., 50)` to run after the tab has mounted |
| Workspace switch | `src/app/App.tsx` — the `prevWorkspaceIdRef` effect (`requestAnimationFrame(() => requestLeafFocus(tabId))`) |
| OS window regains focus (Cmd+Tab back, modal window closing) | `src/app/App.tsx` — the `getCurrentWindow().onFocusChanged` effect |
| Chrome (dropdown/dialog/context menu) closes | `src/app/App.tsx` : `restoreLeafFocus`, wired as `onRestoreFocus` into `RunButton.tsx`, `OpenInEditorButton.tsx`, and `WorkspaceBar.tsx`'s workspace context menu (`onCloseAutoFocus`) |
| Tab-close confirmation queue finishes (dirty editor / running-process dialog, or no dialog at all) | `src/app/App.tsx` : `focusActiveTab`, passed as `focusActiveTab` into `useTabCloseGuards` (`src/app/hooks/useTabCloseGuards.ts`), called in the `finally` block of its close queue |
| Notification bell closes | `src/app/App.tsx` — the `bellOpen`/`bellWasOpen` effect |
| Click the already-active workspace in the WorkspaceBar | `src/app/components/WorkspaceBar.tsx` — `onClick={() => { if (active) onRestoreFocus(); ... }}` |
| Run/stop a script | `src/app/App.tsx` : `runWorkspaceConfig`, `stopWorkspaceConfig` (every branch that keeps or moves focus calls `requestLeafFocus`) |
| First terminal ready (new tab, or restore) | `useTerminalSession.ts` — the mount effect's `s.ready.then(...)` block (calls `requestScratchpadFocus`/`focusSlot` directly here, since there is no prior focus state to reconcile against; this is session bootstrap, not a focus transfer) |

If you add a new place that focuses a leaf, it goes through `requestLeafFocus` (or, if the gesture
already produces a `focused` prop transition, through the effect above — verify it does before relying
on it silently). If you think you have a legitimate reason to write a leaf-focus call from scratch,
you are about to reintroduce this bug a third time — check first.

---

## 4. Close paths map

Everything that can close the scratchpad (`scratchpadOpen -> false`), and why blur alone can't cover
all of it:

- **Textarea blur** — `ScratchpadBar.tsx`'s `onBlur` handler. Two guards:
  - `if (settingsOpen) return;` — losing focus to the scratchpad's own settings dropdown (Radix,
    portaled to `document.body`) is not a real "leave". `settingsOpen` (React state mirroring the
    `DropdownMenu`'s `open`) is the guard, **not** DOM containment — Radix content lives outside
    `containerRef`, so `e.relatedTarget` containment checks can't see it. `onCloseAutoFocus` on the
    dropdown content brings focus back to the textarea when it closes.
  - The container's `onMouseDown` calls `e.preventDefault()` when the click target is inside
    `containerRef` but is not the textarea itself (i.e. a click on the bar's own padding/hint area) —
    otherwise that click would blur the textarea to `body` and read as "leave".
  - Otherwise: `leaveLeafScratchpad(leafId)` — a `"leave"` close.
- **`setLeafTerminalFocused(leafId)`** — called when the terminal grid gains real DOM focus (a
  leaf-scoped `focusin`). Guard: `if (!s.focusedNow) return;` — **this is the crux of the
  focus-vs-pane-switch distinction.** A click on the terminal of the leaf that is already focused is a
  deliberate dismiss (user went back to the terminal on purpose): the scratchpad closes, mark cleared.
  A click on the terminal of a leaf that is **not yet focused** is a mouse pane/tab switch, not a
  dismiss, and must not clear the resume mark — the function returns early because `s.focusedNow` is
  still `false` at that point.

  This is reliable because of native event ordering: xterm's `focusin` fires **during the mousedown's
  default action**, which happens before React commits the `activePaneId`/`activeTabId` state change
  that would flip `focusedNow` to `true`. So at the moment `setLeafTerminalFocused` runs on a
  cross-leaf click, `s.focusedNow` still reflects the *old* focus state (false for the leaf being
  clicked into). The later focused-transition effect (section 3) runs after that commit, sees
  `focused` actually become `true`, and is the one that (via `requestLeafFocus`) can still honor a
  pending resume mark — exactly like a keyboard switch.
- **Escape** — `ScratchpadBar.tsx`'s `onKeyDown`: calls `closeScratchpad(leafId)`, a `"dismiss"`.
- **Toggle shortcut (`Cmd+U`, `terminal.scratchpad`)** — `App.tsx`'s shortcut handler calls
  `toggleScratchpad(leafId)`; its close branch is a `"dismiss"`.
- **`onActivateTabStable`** (`App.tsx`) — before calling `activateTab`, runs the pure
  `scratchpadLeafsToClose` (`src/modules/workspaces/lib/scratchpadLeave.ts`) and calls
  `leaveLeafScratchpad` on every leaf it returns: the tab being left in the target pane (same-pane tab
  switch), plus, on a cross-pane activation, the active tab of the pane being left. Keyboard and
  programmatic tab activations move no DOM focus first, so blur can never cover this — it has to be
  explicit.
- **`leaveActivePaneScratchpad(wsId, nextPaneId)`** (`App.tsx`, called from `onFocusPaneStable` and
  `focusPaneInDirection`) — closes the scratchpad of the active tab of the pane being left, on any
  pane switch (mouse click on another pane, or keyboard `pane.focusUp/Down/Left/Right`).
- **Workspace-switch close** — the `prevWorkspaceIdRef` effect in `App.tsx`: when the active workspace
  id changes, it looks up the previous workspace's active pane/tab and calls `leaveLeafScratchpad` on
  it before focusing the new workspace's tab.
- **The sentinel effect** (`App.tsx`, `prevActiveLeafRef`) — runs on every `workspaces`/
  `activeWorkspaceId` change, diffs the previously-active leaf against the currently-active one, and
  calls `leaveLeafScratchpad` on the previous leaf whenever it changed. It exists because some
  activation paths (`openTab`, `activateTab` called directly, not through the stable wrappers above)
  bypass all the explicit-close call sites; this is the backstop that makes the binary invariant hold
  regardless of which path changed the active leaf. Idempotent with the more specific closes above
  (`closeScratchpadState` no-ops if already closed).

---

## 5. Script execution focus rules

`runWorkspaceConfig` / `stopWorkspaceConfig` (`src/app/App.tsx`) follow one rule: **a pane shows
exactly one tab, so you cannot reveal a tab in the user's own pane without also stealing their
focus.** This drives three cases:

- **Script's tab is in the user's own current pane** -> full activation: `activateTab` (moves
  `activePaneId`/pane's `activeTabId`) + `requestLeafFocus(config.tabId)`. Focus follows the script,
  because there is no other option — the tab the user was looking at is the one being replaced.
- **Script's tab is in the current workspace but a different pane** -> `revealTab` (makes the tab
  active in its own pane, `activePaneId` left untouched) + `requestLeafFocus(userLeafId)` restores
  focus to whatever the user's own pane was showing. The script's output becomes visible without
  moving the user's cursor or closing their open scratchpad.
- **Script's tab is in a different workspace** -> full jump: `setActiveWorkspaceId` +
  `activateTab` + `requestLeafFocus(config.tabId)`.

`revealTab` vs `activateTab` (`src/modules/workspaces/lib/useWorkspaces.ts`): `activateTab` sets both
the workspace's `activePaneId` and the target pane's `activeTabId`. `revealTab` sets only the target
pane's `activeTabId`, leaving `activePaneId` wherever it was — it makes a tab "the one you'd see if you
looked at that pane" without moving the user's attention there.

---

## 6. Event-timing gotchas summary

Full war stories: `WORKSPACES_GOTCHAS.md` Bug 7 and addenda. Short version, so you recognize these
without re-deriving them:

- **Blur fires before focusin.** When focus moves between two elements in the same document, the
  outgoing element's `blur` fires before the incoming element's `focusin`. This is why
  `setLeafTerminalFocused`'s `focusedNow` check (section 4) works: at blur/focusin time for a
  cross-leaf click, the React state that would flip `focusedNow` hasn't committed yet.
- **Radix portals break DOM-containment guards.** Any `onBlur` guard that checks
  `containerRef.current?.contains(relatedTarget)` will not see Radix dropdown/menu content, because
  Radix portals it to `document.body`. Use the menu's own `open` state as the guard instead (see
  `settingsOpen` in `ScratchpadBar.tsx`).
- **Radix triggers `preventDefault` on `pointerdown`.** A `DropdownMenuTrigger`/`ContextMenuTrigger`
  never actually receives DOM focus on click, so you can't rely on `relatedTarget` pointing at the
  trigger either. Combined with the point above, `onCloseAutoFocus` on the menu content is the only
  reliable place to restore focus when such a menu closes.
- **xterm.js re-focuses itself asynchronously after a resize.** Mounting/unmounting the
  `ScratchpadBar` changes the terminal container's height, which fires xterm's internal
  `ResizeObserver`, which one or two frames later calls `.focus()` on xterm's own hidden helper
  textarea — silently stealing focus back from wherever it was just placed. `fireScratchpadFocus`
  (`useTerminalSession.ts`) is the antidote: defer with a double `requestAnimationFrame` (the same
  margin `scheduleUnhide` in `rendererPool.ts` uses) and revalidate (`s.scratchpadOpen &&
  s.scratchpadFocus === fn`) immediately before firing, so the app's focus call is always the last one
  to touch focus, whichever way the internal race with xterm resolves.
- **Vite HMR duplicates module state.** `sessions` is a module-scope `Map`; an HMR reload of
  `useTerminalSession.ts` creates a second instance that already-mounted components keep using. Kill
  the dev process and run `pnpm tauri dev` fresh before trusting any focus diagnosis — don't debug
  focus bugs against a hot-reloaded session map.

---

## 7. If you touch this, verify that

Live-test matrix (manual; there is no automated end-to-end focus test). Test with
`scratchpadRememberFocus` **both off (default) and on** — several of these only diverge with it on.
Always test against a freshly started `pnpm tauri dev` (see the HMR gotcha above), never a
hot-reloaded session.

- [ ] Tab switch by keyboard (`tab.next`/`tab.prev` or similar) focuses the right side (scratchpad if
      that tab has it open, terminal otherwise).
- [ ] Tab switch by mouse click, same pane, focuses the right side.
- [ ] Pane switch by keyboard focuses the right side.
- [ ] Pane switch by clicking the terminal grid of an unfocused pane focuses the right side (must not
      be treated as a dismiss — `setLeafTerminalFocused`'s `focusedNow` guard).
- [ ] Pane switch by clicking a tab in a different pane focuses the right side.
- [ ] Workspace switch (keyboard or clicking a different workspace in the WorkspaceBar) focuses the
      right side of the newly active workspace's active tab.
- [ ] Clicking the **already-active** workspace in the WorkspaceBar restores focus without changing
      anything else.
- [ ] Running a script whose tab is in the user's own pane: focus follows the script's tab.
- [ ] Running a script whose tab is in a different pane (same workspace): the script's tab becomes
      visible in its own pane, but focus/scratchpad state of the user's own pane is untouched.
- [ ] Running a script whose tab is in a different workspace: full jump, focus lands on the script's
      tab.
- [ ] Stopping a script exercises the same three cases as running one.
- [ ] Opening then closing a chrome interruption (RunButton dropdown, OpenInEditorButton dropdown,
      WorkspaceBar workspace context menu, notification bell) restores focus to the active tab.
- [ ] Cmd+Tab away and back (OS focus regain) restores focus to the active tab.
- [ ] Escape, the toggle shortcut, and clicking the terminal of the already-focused tab all dismiss
      the scratchpad (and, with `scratchpadRememberFocus` on, never leave a resume mark).
- [ ] With `scratchpadRememberFocus` on: leaving a tab whose scratchpad was open (any close path in
      section 4 marked `"leave"`) and returning to it (any path in section 3) reopens and focuses the
      scratchpad.
- [ ] With `scratchpadRememberFocus` off: the same sequence just focuses the terminal, and no mark
      ever lingers to reopen later if the preference is turned on afterward.

---

## 8. File map

| File | What it is |
|---|---|
| `src/modules/terminal/lib/useTerminalSession.ts` | Owns `Session.scratchpadOpen`/`scratchpadResume`, the open/close/leave/dismiss primitives, `requestLeafFocus`, and the focused-transition effect |
| `src/modules/terminal/ScratchpadBar.tsx` | The textarea component: mount/unmount focus registration, blur guards, Escape/Enter handling, drag-and-drop target, settings dropdown |
| `src/modules/terminal/TerminalPane.tsx` | Renders `<ScratchpadBar>` conditionally on `scratchpadOpen && focused`; wires `initialScratchpadEnabled`/`onScratchpadEnabled` |
| `src/modules/terminal/lib/pendingFocus.ts` | Pure helper (`shouldFireOnRegister`) for a focus request that arrives before `ScratchpadBar` has mounted and registered its focus callback |
| `src/modules/terminal/lib/scratchpadPath.ts` | `scratchpadRefForDrop`, `SCRATCHPAD_DROP_PREFIX` — formats an explorer path dropped on the bar as an `@`-prefixed reference |
| `src/modules/workspaces/lib/scratchpadLeave.ts` | Pure `scratchpadLeafsToClose(panes, activePaneId, targetTabId)` — which leaves must close on a tab activation |
| `src/modules/workspaces/PaneView.tsx` | `handleActivate` (tab click -> `requestLeafFocus`) |
| `src/modules/workspaces/lib/useWorkspaces.ts` | `activateTab` vs `revealTab` |
| `src/modules/workspaces/lib/types.ts` | `Tab.scratchpadEnabled?: boolean` (the `terminal` tab variant) |
| `src/app/App.tsx` | `restoreLeafFocus`, `leaveActivePaneScratchpad`, `focusActiveTab`, the workspace-switch effect (`prevWorkspaceIdRef`), the sentinel effect (`prevActiveLeafRef`), `onFocusChanged`, the bell-close effect, `onActivateTabStable`, `onActivateAgent`, `runWorkspaceConfig`/`stopWorkspaceConfig` |
| `src/app/hooks/useTabCloseGuards.ts` | Calls `focusActiveTab` after its close queue (dirty-editor/running-process confirmation) finishes |
| `src/app/components/WorkspaceBar.tsx` | Click-active-workspace restores focus; workspace context menu `onCloseAutoFocus` |
| `src/app/components/RunButton.tsx` | Dropdown `onCloseAutoFocus` -> `onRestoreFocus` |
| `src/modules/external-editors/OpenInEditorButton.tsx` | Dropdown `onCloseAutoFocus` -> `onRestoreFocus` |
| `src/settings/sections/TerminalSection.tsx` | Settings UI for `scratchpadInNewTerminals`, `scratchpadRememberFocus`, `scratchpadEnterSends` |
| `src/modules/settings/store.ts` | Preference keys/defaults: `scratchpadEnterSends` (default `true`), `scratchpadInNewTerminals` (default `true`), `scratchpadRememberFocus` (default `false`) |
| `src/modules/workspaces/WorkspaceDndProvider.tsx` | Drag-and-drop of explorer paths onto the scratchpad bar (`handleScratchpadDrop`, collision priority) — see `WORKSPACES.md`'s drag-and-drop section for the full mechanism |
| `docs/WORKSPACES_GOTCHAS.md` | Bug 7 and its six addenda: the full history of how this model was arrived at |
