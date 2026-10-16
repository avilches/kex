# Workspaces - rendering, terminal pool, and lifecycle

This document covers the internal mechanics of the Workspace/Pane/Tab model: how the render tree
is structured, how terminal slots are managed, and what happens when tabs are shown or hidden.

For bugs and gotchas discovered in production, see [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md).
For the high-level user-facing overview, see [ARCHITECTURE.md](ARCHITECTURE.md) sections 3.1 and 4.1.

---

## Data model

Three levels of hierarchy, all owned by `useWorkspaces` in `src/modules/workspaces/lib/useWorkspaces.ts`:

```
Workspace           - a named environment (local or WSL distro)
  └── paneTree      - a binary split tree of SplitNode
        ├── SplitNode (kind: "split") - horizontal or vertical split with a dividerPosition
        │     ├── first: SplitNode
        │     └── second: SplitNode
        └── SplitNode (kind: "pane") - leaf; holds a tab strip
              ├── tabs: Tab[]    - the tabs
              └── activeTabId      - which tab is shown
```

**Workspace fields.** A `Workspace` carries additional configuration:
- `color?: string | null` - optional workspace accent color (hex string or null)
- `scripts?: Script[]` - list of saved scripts (command, name, `cwdMode` of `workspace` | `context` | `fixed`, `cwd` used only in `fixed` mode, optional tabId)
- `activeScript?: string` - id of the currently selected script in the Run button
- `explorerRootMode: "workspace" | "filesystem"` - which root the explorer displays. When `"workspace"`, the explorer shows the workspace root (set via folder context action); when `"filesystem"`, it shows a navigable filesystem root.

**Script running state.** `terminalEphemeralStore` (`src/modules/workspaces/lib/terminalEphemeralStore.ts`) has two independent sections:
- `runningCommands` (`Map<tabId, string>`) - foreground command name from OSC 133 C, for all terminal tabs. Set and cleared by every `onRunningCommand` callback regardless of whether a script is involved.
- `scriptRunning` (`Map<tabId, ScriptState>`) - tracks which terminal tabs are currently executing a script command. Set by `runWorkspaceConfig` in App.tsx the moment the command is written; cleared when `onRunningCommand` fires with `cmd === null` (OSC 133 D) and the tab id is present in this map. Manual commands typed by the user do NOT set this flag. Never persisted. `RunButton` reads it via `useSyncExternalStore` to show the stop icon while the command is running.

`runWorkspaceConfig`/`stopWorkspaceConfig` move focus to the script's tab (full activation) when it lives in a *different* workspace, or when its target pane is the user's own current pane (a pane shows exactly one tab, so revealing without stealing focus is impossible there). Otherwise, when the script's tab is in the current workspace but a different pane, they call `revealTab` (makes the tab active in its own pane, `activePaneId` untouched) and restore `requestLeafFocus` on the user's own leaf, so running or stopping a script never steals focus or closes the user's open scratchpad.

A `Tab` is a tagged union on `kind`: `terminal` | `editor` | `browser` | `markdown` |
`git-diff` | `git-history` | `git-commit-file`. All kinds share `id`, `title`; each kind carries
its own extra fields (e.g., `cwd`, `runningCommand`, `dirty`). A `terminal` panel also persists
`scratchpadEnabled` (boolean) for the scratchpad bar. See [SCRATCHPAD.md](SCRATCHPAD.md) for the
binary focus model, the full close/focus path map, and the `requestLeafFocus` invariant.

A pane may have an empty `tabs` array with `activeTabId: null`. This state is valid only for
the sole pane of a workspace (when the workspace has no split). When the last tab is closed in a
split pane, `applyCloseTab` (the pure entry point for tab close in `useWorkspaces.ts`) collapses
the empty half and promotes the sibling - only the root pane of a single-pane workspace is left
empty, where it renders a welcome screen. This invariant is locked by a unit test in
`workspaceState.test.ts`: `sanitizeWorkspace` must round-trip an empty pane without dropping it.

**Fold on empty.** A workspace that reaches zero tabs closes with its last tab, through a
reconciliation effect in `useWorkspaces` (`emptyWorkspaceToClose`), whatever emptied it: the
tab close button or `tab.close`, the shell exiting on its own, moving or dragging the last tab
to another workspace, and bulk closes such as Close All Tabs (the fold decides on committed
state, so batched closes inside one tick are covered too). Two exceptions keep the workspace
with its empty pane: the window's only workspace (folding it would close the window), and one
holding scripts with a command, whose deletion the close-workspace confirmation dialog still
owns (`scriptsToDelete`). `applyCloseTab` also resets `detailExpanded` to true when it empties
the sole pane, so an empty workspace shows no chevron in the WorkspaceBar while staying
expanded: a tab opened into it appears in the nested list without touching anything. The
nested list renders nothing with zero tabs, so the expanded state is invisible on the empty
workspace itself.

**Focus on close (per-pane MRU).** When the *active* tab of a pane with more than one tab closes,
focus returns to the most-recently-used surviving tab, not the positional neighbour. Each pane
keeps an MRU list of `tabId`s (most recent first) in `paneActivationHistoryRef`, an in-memory ref
in `useWorkspaces` that is never persisted (capped at `MRU_HISTORY_LIMIT = 50`, though the live list
is already bounded by the pane's open-tab count). `recordActivation` pushes onto it from the three
points that move the active tab to a real tab: `activateTab`, `openPanel`, `replaceTab`.
`closeTab` reads the closing pane's history and passes it to `applyCloseTab`, which picks the
first history id that still exists in the remaining tabs, falling back to the positional neighbour
(`remaining[idx] ?? remaining[idx - 1]`) when the history is empty. The `history` argument is
optional, so the pure function keeps its legacy neighbour behaviour when called without it.

A single reconciliation effect (`useEffect` on `workspaces`) prunes the map against live
panes/tabs: it drops dead panes and dead `tabId`s, so a stale id is never selected and the map
stays bounded. This covers every removal path (close, drag between panes, split collapse, workspace
close) without per-callback cleanup; cross-pane moves need no special handling because a moved tab's
id no longer appears in its old pane's remaining tabs. This is independent from reopen-closed (undo,
`closedPanelsRef`): that stores dead `Tab` snapshots to resurrect; this orders live tabs to choose
focus. The selection logic is locked by unit tests in `useWorkspaces.test.ts`.

`editor` and `markdown` tabs also carry an optional `explorerRoot`: the folder the explorer and
git context jump to while that tab is active. It is captured when the file is opened
(`resolveOpenRoot` in `lib/explorerRoot.ts`: the current explorer root if the file is inside it,
otherwise the file's parent dir) and consumed by `resolveActiveExplorerRoot`, which the App's
`explorerRoot` memo uses to override the terminal-derived ambient root. Optional for backward
compatibility: a panel without it falls back to the file's parent dir (or the ambient root for
non-file tabs).

State is persisted per-window via the `window_save_workspace_state` IPC command, debounced 800ms on
every mutation. Each window reads its own saved state on mount via `window_get_state`. The on-disk
layout is split: `workspaces.json` is a lean index (per-window geometry, active index, and the
ordered list of `workspaceIds`), and each workspace body lives in its own `workspaces/<id>.json`.
`save` writes only the workspace files whose serialized body changed plus the index, so editing one
workspace no longer rewrites every other one. On boot, `load` reconstructs each window's full
workspace array from the referenced body files and deletes any orphan `workspaces/*.json` no longer
in the index (recovers space after a crash mid-write); unreferenced bodies are also removed on every
`save`. Workspace ids are validated (`is_safe_id`) before being used as filenames, so a malformed id
can never escape the `workspaces/` directory. The Rust side still keeps `workspaces` in memory as an
untyped `serde_json::Value` (`window_state.rs`) and the IPC contract is unchanged, so any panel field
added on the frontend (such as `explorerRoot`) round-trips through save and restore without a
Rust-side schema change or migration. The split is an incompatible disk format (`INDEX_VERSION`), so
a pre-split monolithic `workspaces.json` fails to parse and the app starts fresh. Window size is restored
via `restore_window_geometry` IPC called from `main.tsx` before `show()`. Window position is not
restored (see [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md)). The workspace sidebar (52px, left
edge) lists workspaces; clicking switches `activeWorkspaceId`.

**Sidebar view state.** Each workspace keeps its own Sidebar state in `Workspace.sidebar`
(`sidebarSnapshot.ts`): the active view, the open explorer folders, the selected path and the
scroll offset with the root it was measured on. Only `open`, `side` and `width` stay per window.
There is one Sidebar instance; the explorer inside it is keyed by workspace id, so a switch, a wake
or reopening the Sidebar mounts a fresh explorer that applies the snapshot once. The restore rule is
the pure `restoreExplorerSnapshot(snapshot, root)`: it keeps what lies under the current root, opens
the folders in between, and restores the scroll only on the root it was recorded on, so a root that
moved up keeps everything, one that moved down keeps what is still under it and an unrelated one
keeps nothing. A root change inside a session carries the open
folders over through the same rule (`carryOverExpanded`, which also opens the previous root), with no
per-root memory: what a move down dropped does not come back on the way up. Saving goes through a
10 s coalescer, flushed before opening, closing or moving the Sidebar and, on a workspace switch, right after the switch has rendered (an effect cleanup, so it runs after the explorer remounted, not before). The details (selection and
scroll while folders load, reveal requests, flush points) are in the paragraph "Sidebar view state
per workspace" of [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Render tree

```
WorkspaceDndProvider    - DndContext wrapper; owns all drag state, handlers, and DragOverlay
  ├── Explorer panel    - TreeRow uses useDraggable for file and folder drag (files open editors, folders open terminals)
  └── WorkspaceView     - one per active+inactive workspace (absolute inset-0)
        └── SplitNodeView     - recursive: renders split groups as ResizablePanelGroup, leaves as PaneView
              └── PaneView    - one pane: tab bar + panel content area + drag drop zones
                    ├── PaneTabBar        - tab strip with DraggableTab per panel
                    └── TabContent      - switches on tab.kind; mounts terminal, editor, etc.
```

A `browser` panel with `floating: true` is a special case: `TabContent` renders a placeholder
(address bar plus "Dock here" / "Focus window" buttons) instead of the iframe, because the page
lives in a native `WebviewUrl::External` window. The float/dock/navigate callbacks are threaded
from `App.tsx` down through `WorkspaceView` → `SplitNodeView` → `PaneView` → `TabContent` to
`BrowserPane`; see `docs/FORK.md` (Floating browser windows).

**All workspaces are always mounted.** Inactive workspaces are hidden with `opacity-0 invisible`
CSS - they are never removed from the React tree. This is required to keep PTYs streaming and
editor state alive.

**All tabs within a pane are always mounted.** Inactive tabs within a pane are hidden with
`invisible pointer-events-none`. Same reason: the xterm instance and its PTY must survive tab
switches.

The `visible` prop passed to `TabContent` (and ultimately to `useTerminalSession`) is:

```tsx
visible={tab.id === pane.activeTabId && isWorkspaceActive}
```

Both conditions must be true. This drives whether the terminal session holds a renderer slot
(see below). `isWorkspaceActive` was added to prevent inactive workspace tabs from keeping
their WebGL contexts permanently - see [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md).

---

## Terminal session lifecycle

Every terminal panel has a long-lived session object in `sessions: Map<string, Session>` inside
`useTerminalSession.ts`. The session owns the PTY connection but not the renderer. The renderer
is a separate "slot" from the pool.

### Session state

Key fields of a `Session`:

| Field | Meaning |
|---|---|
| `pty` | Live PTY handle (`portable-pty` connection via Tauri channel) |
| `hasSlot` | Whether a renderer slot is currently bound |
| `snapshot` | ANSI snapshot of the last renderer state (captured on unbind) |
| `dormantRing` | Ring buffer for bytes received while no slot is bound |
| `altScreenAtRelease` | Whether the terminal was in alt-screen (TUI mode) when last unbound |
| `visibleNow` / `focusedNow` | Current visibility/focus state |

### Blocked start

A leaf whose start cannot happen (unusable restore directory, `openPty` failing) has no PTY and a non-null
`Session.restoreBlock`; `attachSession` skips it. The modal that holds it covers that tab's content only. Flow, Try again,
Open terminal without restoring and the pending restore (Retry restore / Discard restore plan in the Run on Start menu)
are described in `AGENT_SESSION_RESTORE.md`, "Blocked start".

### Visible vs. hibernated

When `visible` becomes **true**:
- If no slot is bound yet: `bindLeafToSlot` → `acquireSlot` (pool assigns a slot, replays snapshot
  + dormant ring)
- If slot already bound: `refreshLeafSlot` (re-attaches WebGL if needed, forces repaint)

When `visible` becomes **false**:
- **Alt-screen or blocks mode**: `parkLeafSlot` → schedules the WebGL addon's disposal (see
  "WebGL context management" below), slot stays bound; the xterm instance keeps receiving data
  (TUI apps emit incremental cursor-positioned updates that can't be replayed coherently from a
  snapshot - a SIGWINCH kick on re-show forces a full repaint)
- **Normal mode**: `parkOrReleaseLeaf` (`useTerminalSession.ts`) → always parks first, the same cheap
  way as alt-screen/blocks (`parkLeafSlot`, `hasSlot` stays true, only the WebGL context is scheduled
  for disposal), and joins a recency-ordered `parkedLeaves` LRU (`parkedLeafOrder.ts`). It then calls
  `scheduleParkedLeafSweep`, which defers the actual budget check to a microtask instead of deciding
  synchronously. This matters because one render can flip `visible` for several leaves at once (e.g.
  a workspace switch); deciding evictions immediately, from the hiding leaf's own effect, could evict
  a leaf that is becoming visible in that same commit before its own effect has run to protect itself
  (its `dropParkedLeaf` call). The microtask runs only after every effect in the commit has finished,
  and its guard flag also collapses the one-call-per-mounted-tab redundancy into a single sweep. The
  sweep itself (`enforceParkedLeafBudget`) computes the budget via `estimateParkedTerminalBudget`
  (`backgroundMemoryBudget.ts`) from `terminalBackgroundMemoryBudgetMB`, and releases leaves beyond
  it, oldest first, via `unbindLeafFromSlot` (full release + snapshot; re-showing such a leaf is then
  a full `bindLeafToSlot` text replay, not the cheap `refreshLeafSlot` path). A budget of 0 MB evicts
  every leaf, reproducing the pre-budget behavior. `detachSession` (a leaf moving to a different pane
  without being disposed) also calls `dropParkedLeaf`, so a parked leaf never leaves a stale LRU entry
  behind when it moves. Alt-screen/blocks leaves never enter this LRU and stay parked unconditionally
  for as long as they are hidden, regardless of the budget, same as before this setting existed.

### Hibernation (dormant ring)

While a session has no slot, incoming PTY bytes go into `DormantRing` (256 chunks / 256 KB cap).
On slot re-acquisition, `drainRing` replays them into xterm. If the cap is exceeded, old chunks
are dropped and the message `[kex: dropped output during hibernation]` is prepended on drain.

The PTY process itself is never paused - the OS shell keeps running and output keeps arriving;
only the rendering is deferred.

### Hibernated workspaces

Not to be confused with the dormant ring above: a hibernated workspace (`Workspace.hibernated`)
has no mounted tabs at all. Its tabs stay in the persisted `paneTree`, but `WorkspaceView` renders
`strippedTree(ws.paneTree)` (a memoized copy with every pane emptied) and passes `hibernated` down
through `SplitNodeView` to `PaneView`, which returns a bordered empty box right before its main
`return` (after the last hook). `HibernatedOverlay` (large sleeping icon, `WorkspaceMark` and name, "Hibernated for 3h 20m" from `Workspace.hibernatedAt` via `formatHibernatedFor`, and a primary Restore button with the undo icon; wired to
`wakeWorkspace` through the `onWake` prop) covers the workspace. Under the name it lists every tab with its icon, title and, in monospace, the command the restore will run (the agent resume command or the run-on-start command). The title is `tab.title` (the user's rename), else `Tab.agentTitle`, the last name an agent sent through OSC or its hooks: `startAgentTitleSync` (`agentTitleSync.ts`) copies it into the tab through one shared 10 s window (the first change saves at once, later ones from any tab wait for the rest of the window and go out together; hibernation and window close flush it), so it survives a restart. The live OSC title dies with the PTY too, and the resumed agent sends no new one until it boots, so after a wake (and during the app-restart restore) `resolveAgentTabTitle` (`useAgentTabTitle.ts`) falls back to that same `Tab.agentTitle` until a live OSC title arrives; the live title always wins. The agent and the resume command die with the PTY, so `createHibernateFlow` captures them as `Tab.hibernation` (`TabHibernation`) before ending the agent sessions, `applyHibernate` stores them and `applyWake` drops them. A workspace hibernated at startup has no snapshot: the overlay asks `previewResumeCmd` for the same plan the wake uses. The Sidebar (explorer, source control) and its resize handle are not mounted while the active workspace sleeps, so the overlay is centered in the full width. Waking remounts the Sidebar, which gets its `Workspace.sidebar` (view, open folders, selection, scroll) back; hibernating flushes the pending Sidebar snapshots first. A workspace switch or a wake does not itself trigger the autofocus reveal (`autofocusDecision`), so the explorer does not jump away from the restored state; a later change inside the woken workspace does, such as focusing another tab or a resumed agent in the focused tab reporting the worktree it entered.

- The live-tab sweep in `App.tsx` skips hibernated workspaces, so their terminals leave the live
  set and are disposed by the normal path (PTY closed). That sweep now also calls
  `useAgentStore.getState().finish(id)` for every terminal that leaves the set (close, move to
  another window, hibernate): the `exited` signal arrives after the session is disposed and
  `leafIdForPty` returns `null`, so without it a phantom spinner would stay.
- `wakeWorkspace` seeds the agent resume plans (`seedWakePlans`, same "Run on start" gate as the
  reopen flow), discards the carried unsaved editor buffers (`unflushedBuffers.ts`) and then clears
  `hibernated`; the terminals mount again and resume through the normal restore path. `runOnce` keeps a map of in-flight wakes by workspace id: a second wake (double click, or `moveTabToWorkspace`) awaits the first one's promise, so it never proceeds before the resume plans are seeded. In the WorkspaceBar a hibernated item keeps its nested tab list: hibernating or waking never touches `detailExpanded`, and the chevron expands or collapses it as in an awake workspace. Clicking one of those tabs (`onActivateAgent`) selects the workspace and the tab without waking it, so the hibernated overlay is what shows; the sleeping icon (which turns into the undo icon on hover) and a double click on the item still wake it.
- A workspace with no tabs is never hibernated: `createHibernateFlow` (`request`, `requestAuto` and `perform`) checks `hasTabs` and the WorkspaceBar hides the Hibernate menu item.
- Guards: `openTab`, `replaceTab` and `splitPaneAndOpenTab` ignore a hibernated workspace,
  `applyMoveTabToWorkspace` refuses it as a destination, so `moveTabToWorkspace` wakes it first (the menu lists it with a Zzz mark; drag and drop accepts its bar row and its overlay),
  `findReopenTarget` skips it so a reopened tab is never lost, `shortcutsDisabled`
  blocks the shortcuts that need tabs (`blockedWhileHibernated`), `runWorkspaceConfig` does nothing,
  `setTabLocations` only receives awake workspaces and the WorkspaceBar nested list is empty.

#### Hibernate and wake flow

The shortcut `workspace.hibernate` (Cmd+Alt+Z, never blocked while hibernated) and the
WorkspaceBar context menu entry "Hibernate" (any workspace, without switching the active one;
hibernated workspaces show "Restore" instead, wired to `wakeWorkspace`) call
`requestHibernate` from `useHibernateFlow` (`lib/useHibernateFlow.ts`; the framework-free
`createHibernateFlow` holds the logic so it is testable without React):

1. With autosave on, `flushDirtyEditors` runs and two animation frames pass so the dirty flags
   reach the workspace state.
2. `hibernateReview` (`lib/hibernateReview.ts`) lists what would be lost: busy tabs (agents still
   working and RunButton scripts in `running` or `waiting`), unsaved documents and commands without
   "Run on start". An agent only counts as coming back when it has a stored session (`hasResumed`);
   a busy agent that would not come back carries `runOnStart` so its row offers the button, and an idle one is listed as a command. If the review is empty the
   workspace hibernates immediately; otherwise `pendingWorkspaceId` opens `HibernateDialog`.
3. `performHibernate` clears the pending id and destroys the floating browsers. Then, with no await
   left, it rechecks (for the automatic and no-dialog paths: the review is still empty and the
   workspace is still not the active one), marks the terminal tabs with `markHibernating` (so the
   exit of their PTYs is not reported as an agent failure), calls `finish` on each agent session and
   calls `hibernateWorkspace`; if the recheck fails or hibernating throws, nothing stays marked. A set of
   in-flight workspace ids makes a double trigger hibernate once.

The dialog title names the workspace and starts with a `WorkspaceMark` (`modules/workspaces/WorkspaceMark.tsx`): the workspace icon painted in its color, or a color dot when it has no icon, plus a sleeping icon if it is hibernated. The Header title and the "Move to Workspace" menu use the same mark. A muted tag with the group label (`groupLabelOf`) follows the name when the workspace belongs to an existing group. The title keeps the last shown workspace and group so it does not flip during the exit animation. If the pending workspace disappears while the dialog is open, `isPendingStale` makes `App.tsx` cancel the request so the shortcut lock is released.
While the dialog is open `shortcutsDisabled` returns true for every shortcut (the global listener
runs in capture phase, before the Radix modal); Escape is not a registered shortcut and still closes it.
`HibernateDialog` is reactive: it recomputes the review from the agent store, the running
commands store and the script state map, so a row disappears when its agent finishes or when "Run on start" is enabled
(`enableRunOnStart`), and the dialog closes and hibernates on its own once all three lists are
empty. Busy rows are split in two sections: agents (spinner, "Waiting for these agents to finish", and a line saying it hibernates on its own, shown only when nothing else is pending) and running scripts (no spinner, no waiting line: a script cannot be told apart as finite like a build or endless like `top`, so the user decides). A busy row has "Kill" (agent: Ctrl+C plus status idle, the session survives) or "Stop"
(script: the same stop the RunButton sends, without moving focus; disabled as "Stopping" while
`waiting`). Closing a workspace (hibernated or awake) abandons its carried buffers (`abandonUnflushedBuffers`: an awake workspace's editors unmount after the close and would stash their dirty text again, so the tabs are marked and later stashes are refused) and clears its
hibernating marks. Closing a workspace does not go through `closeTab`, so its tabs are not recorded for `tab.reopenClosed`. Row buttons are plain `Button`s, not `AlertDialogAction`, so they do not close it. Waking
is described above (`wakeWorkspace`).

#### Auto-hibernate

The `autoHibernate` preference (Settings > Workspaces: Never, 30 minutes, 4 hours, 2 days; default 4 hours)
hibernates idle workspaces. `useAutoHibernate` checks every minute, and once right at startup. A workspace is idle
for the time since it was last the active one. That moment is kept in `activityStamps` (`workspaceState.ts`), a
module-level map outside React state so the minutely renewal does not re-render the tree. `touchActivity` renews the
awake active workspace each tick, and also every awake workspace with a "working" agent (the spinner in the
WorkspaceBar), so its countdown only runs while no agent is busy in it; it gives a workspace without a stamp "now". A hibernated workspace is stamped only
when it changes state (hibernated, or woken), tracked with a set of the previously hibernated ids, so its persisted body
does not change every minute while waking it still restarts its clock. The switch effect (`stampSwitch`) stamps the
workspace being left and the one entered. Every tick schedules the normal debounced `saveWorkspaceState`, whose
`buildArgs` merges the stamps into each body as `lastActiveAt` (`withActivity`). `initWorkspaceState` seeds the map from
the saved `lastActiveAt` (`seedActivity`, which drops non-finite values and clamps future ones to now), so the clocks
survive a restart: a non-active workspace that was idle past the delay becomes due on the first tick. The workspace
active at startup is renewed by that same tick and is never a candidate. `autoHibernateCandidates` never picks the
active or an already hibernated workspace. For each candidate `createHibernateFlow().requestAuto` saves every dirty editor and
markdown tab of that workspace even with autosave off (`saveWorkspaceDocs`; a failed save aborts), waits for the
dirty flags to settle and then runs the same `hibernateReview` as the manual flow: it hibernates only if the review
is empty, that is, no agent working, no script running, no unsaved document and no command without "Run on start".
An agent in `attention` (waiting for the user) also blocks it, and `requestAuto` re-checks that the workspace is still
not the active one after saving, so entering a queued workspace mid-check cancels it. Waking a hibernated workspace
restarts its clock, so it is not hibernated again at the next tick. Changing the
setting keeps the existing clocks. A document with a pending reload conflict (changed on disk while dirty)
blocks it: `useDocument.save` throws `CONFLICT_SAVE_ERROR` while the conflict overlay is up, so `saveWorkspaceDocs`
fails. The same guard applies to every save path (manual save reports it as a toast, the autosave timer and the
unmount flush skip the write and the unmount carries the buffer in memory instead). `requestAuto` never opens `HibernateDialog`; anything else leaves the workspace
awake until the next check.

#### Startup

There is no startup hibernation: `initWorkspaceState` restores the saved workspaces untouched. A workspace that
was hibernated stays so; every other one mounts, including its "Run on start" commands and agent sessions. Their
`lastActiveAt` is seeded into `activityStamps`, so auto-hibernate resumes the idle timer where it was.

---

## Renderer slot pool (`rendererPool.ts`)

xterm.js instances are expensive to create and each carries a WebGL context. The pool manages a
fixed set of reusable `Slot` objects so that switching tabs does not destroy and recreate
renderers.

### Slot lifecycle

```
createSlot()
    │  new Terminal + FitAddon + SearchAddon + SerializeAddon + WebLinksAddon
    │  host div appended to off-screen recycler
    ▼
acquireSlot(params)
    │  find free slot (currentLeafId === null) or createSlot()
    ▼
bindSlot(slot, params)
    │  move host div into the pane container
    │  clear + reset terminal, replay snapshot + dormant ring
    │  setupResizeObserver, fitAddon.fit()
    │  scheduleUnhide (2× rAF: render first, then show + attach WebGL)
    ▼
[slot in use: currentLeafId set, data flows directly to term.write()]
    ▼
detachSlotFromLeaf(slot)         ← called by releaseSlot (unbind path)
    │  serialize snapshot via SerializeAddon (up to SNAPSHOT_SCROLLBACK_CAP = 5000 lines)
    │  move host div back to recycler
    │  currentLeafId = null
    │  scheduleWebglReap(WEBGL_REAP_GRACE_MS = 30s)
    │  scheduleSlotReap(SLOT_REAP_GRACE_MS = 45s)
    ▼
[idle slot: available for reuse by pickSlotFor()]
    ▼
reapIdleSlot()        ← fires after SLOT_REAP_GRACE_MS if still idle
    │  if idle.length > IDLE_SLOTS_KEEP_WARM (1): disposeSlot
    ▼
disposeSlot()         ← term.dispose(), host.remove(), splice from slots[]
```

The grace periods exist so that quick panel switches (e.g., Ctrl+1 / Ctrl+2 / Ctrl+1 in rapid
succession) reuse the same warm slot without destroying and recreating it.

`IDLE_SLOTS_KEEP_WARM = 1`: at most one idle slot keeps its xterm instance alive after the reap
timer fires. Additional idle slots are disposed.

### WebGL context management

Each slot optionally has a `WebglAddon` (one WebGL context). WebGL is attached in `scheduleUnhide`
when the slot is stale (`> SLOT_STALE_MS = 10s` since last use) or newly created.

WebGL is never disposed synchronously on an ordinary hide. `disposeSlotWebgl` calls the addon's
own `dispose()`, and `@xterm/addon-webgl`'s `WebglAddon.dispose()` unconditionally rebuilds a full
`DomRenderer` as its fallback-on-dispose contract (one DOM row element per visible row, its own
width cache, a freshly injected stylesheet - confirmed unchanged through its latest beta as of
2026-09). That cost is fixed per hide (proportional to `term.rows`, not scrollback) and is thrown
away unused the instant the leaf is shown again and `attachWebgl` recreates a context. So both
`parkLeafSlot` (visibility change, alt-screen/blocks or normal tabs) and `detachSlotFromLeaf` (a
slot becoming fully idle) only *schedule* the dispose via `scheduleWebglReap`, at
`WEBGL_REAP_GRACE_MS = 30s`. `refreshLeafSlot` (a parked leaf shown again) and `bindSlot`/
`rewireSlot` (an idle slot reclaimed) call `cancelWebglReap` first, so a quick tab switch never
pays that cost at all - only a leaf left hidden for the full grace window does. See
[WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md) for the full investigation.

**Context limit.** WKWebView (Tauri/macOS) allows roughly 8-16 concurrent WebGL contexts. Exceeding
the limit causes the browser to silently destroy the oldest context (`onContextLoss`). The pool
enforces `WEBGL_MAX_CONTEXTS = 7` as a proactive guard: before calling `new WebglAddon()`, it
checks the live context count and reaps the oldest slot with a pending `webglReapTimer` if needed
- a fully idle slot and a parked-but-still-visible-later one are equally fair game, since both have
already signaled "nobody needs this context right now". If all contexts are in slots without a
pending reap (i.e. genuinely in front of the user), the attach is skipped (that slot falls back to
the DOM renderer, which is slower but functionally equivalent).

Context recovery: `onContextLoss` disposes the addon and schedules a retry at
`WEBGL_RECOVERY_DELAY_MS = 250ms`. This handles sleep/wake GPU resets.

### Context count in practice

With the `visible = … && isWorkspaceActive` fix, only the active workspace's active tabs hold
live WebGL contexts. Within a pane, only the active tab is visible. So:

```
active WebGL contexts ≈ number of panes in the active workspace
```

Switching workspaces releases the old workspace's slots (WebGL disposed after 30s) and acquires
new ones for the new workspace. The pool's warm slot (`IDLE_SLOTS_KEEP_WARM = 1`) means the first
re-shown terminal after a workspace switch may reuse the still-warm slot.

---

## Tab bar overflow scroll

When a pane has many tabs and is narrow, tabs overflow the `PaneTabBar`. Two scroll behaviors keep
the active tab visible:

- **Active tab auto-scroll**: whenever `activeTabId` changes, the container scrolls the minimum
  amount to bring the active tab into view (`scrollBy` with `behavior: 'auto'`). Skipped if the
  user is currently browsing with the wheel (see below).
- **Wheel scroll with snap-back**: the container registers a native (non-React) `wheel` listener
  with `{ passive: false }` so `preventDefault()` can suppress vertical page scroll and redirect
  the delta to `scrollLeft`. After 800 ms of wheel idle, a debounced callback scrolls the active
  tab back into view with `behavior: 'smooth'`. The listener is native (not a React `onWheel`) to
  guarantee `passive: false`; React synthetic wheel events are passive and cannot call
  `preventDefault()` reliably in WebKit/Tauri.

---

## Drag-and-drop (panel reordering, splitting, and file open)

Drag-and-drop uses `@dnd-kit/core` v6.3.1. The `DndContext` lives in `WorkspaceDndProvider`
(`WorkspaceDndProvider.tsx`), which wraps the `WorkspaceBar`, the explorer panel and the workspace
area so that file drags from the explorer can target pane drop zones and tab drags can switch
workspace by hovering the bar.

### Drag item type

```typescript
type DraggingItem =
  | { kind: 'tab'; tab: Tab; workspaceId: string }
  | { kind: 'file'; path: string };
```

`WorkspaceDndProvider` exposes `{ draggingItem, tabInsertPaneId }` via `useWorkspaceDnd()`.
`WorkspaceView` reads from this context instead of owning drag state directly.

### Components

- `DraggableTab` (`PaneTabBar.tsx`): `useDraggable({ id: panel.id })`, `PointerSensor` with
  `activationConstraint: { distance: 6 }`. Requires `touch-action: none` (`touch-none` class) to
  prevent WebKit from claiming the initial pointer movement as a scroll gesture and issuing
  `pointercancel` before the 6px threshold is reached.
  Each `DraggableTab` also registers two `useDroppable` zones on its left and right halves:
  `tab-insert:<tabId>:before` and `tab-insert:<tabId>:after`. Both are `disabled` when no
  drag is active (`disabled: !isDragging`) to avoid idle collision overhead.
- `InsertionGap` (`PaneTabBar.tsx`): a `w-0 -mx-[1px] shrink-0` flex item rendered between every
  pair of tabs (and before the first / after the last). When the drag pointer is over a
  `tab-insert:` zone belonging to this pane, `useDndMonitor` sets `insertionIndex` and the
  corresponding gap renders a 2px `bg-primary` vertical line indicating the insertion point.
- `DropZone` (`PaneView.tsx`): `useDroppable` per zone. Zones are rendered only during an active
  drag. The set of zones depends on the target pane's pixel dimensions, read from a `ResizeObserver`
  and compared against `paneSplitLimit` (configurable in `settings-general.json`, default
  `{ width: 250, height: 250 }`):
  - **width < limit AND height < limit**: only `center`, covering the full pane (`inset-0`).
  - **width < limit only**: `top`, `bottom`, `center` - horizontal splits disabled.
  - **height < limit only**: `left`, `right`, `center` - vertical splits disabled.
  - **both within limit**: full 5-zone layout (top, bottom, left, right, center).
  In all cases `center` expands its hit area to fill any gap left by absent directional zones.
  Each zone is two separate divs: an invisible hit area and a larger visual highlight
  (`pointer-events-none`) that covers the half of the pane in the split direction
  (top/bottom → top or bottom half; left/right → left or right half; center → full pane with
  `rounded-md`). The center zone also accepts a `forceOver` prop: when the drag pointer is over a
  `tab-insert:` zone in a different pane, `WorkspaceView` sets `tabInsertPaneId` which flows through
  `SplitNodeView` to `PaneView`, forcing the center zone highlight on the target pane to signal that
  the tab will move there.
  Drag-drop splits are also blocked when the workspace already has `workspacePaneLimit` panes
  (configurable in `settings-general.json`, default `8`).
- `DragOverlay` (`WorkspaceDndProvider.tsx`): lightweight floating chip showing panel icon + title
  for tab drags, or a file/folder icon + basename for file drags. `dropAnimation: null` to avoid
  fighting the layout reflow on drop.
- `TreeRow` (`explorer/TreeRow.tsx`): `useDraggable({ id: 'file:<path>' })` for files and
  `'dir:<path>'` for directories. The synthetic `FsRootRow` and `FsUpRow` (the File System root
  header and the ".." row) drag as `'dir-pane:<path>'` (root path / parent dir). Applies
  `opacity-50` during drag, same as `DraggableTab`.

### Drop resolution (`handleDragEnd` in `WorkspaceDndProvider.tsx`)

The handler first classifies the drag by the `active.id` prefix: `file:` (file), `dir:` (folder),
and `dir-pane:` (the synthetic root / ".." rows, treated as a folder) are explorer drags routed to
`handleFileDragEnd`; any other ID is a panel (tab) drag. The panel opened for an explorer drag comes
from `tabForDroppedPath(path, isDir)` (pure, in `dropPanel.ts`): a folder yields a `terminal`
panel rooted at that cwd (matching the explorer's "Open in Terminal"), a file yields an `editor`
panel. `dir-pane:` drags set `draggingItem.paneOnly`, which excludes them from the internal explorer
move targets (`explorer-dir:` / `explorer-file:`) so the root and ".." rows can only open a terminal
in a pane, never move files within the tree.

Before routing to `handleFileDragEnd`, an explorer drag dropped on a terminal's scratchpad bar is
intercepted by `handleScratchpadDrop`: the `ScratchpadBar` registers a `useDroppable` with id
`scratchpad:<leafId>`, and the handler resolves the path relative to that terminal's live cwd
(`leafCwd`), formats it as an `@`-prefixed reference (`scratchpadRefForDrop` in
`terminal/lib/scratchpadPath.ts`, quoted only when the shell would mis-split it), and inserts it at
the textarea cursor via `insertIntoLeafScratchpad`. Because the pane drop overlay (z-40, `inset-0`)
sits on top of the bar, the `DndContext` uses a custom `collisionDetection` that wraps
`pointerWithin` and promotes any `scratchpad:` collision to the front, so a path drop inserts a
reference instead of opening a pane.

**Tab drag**: a sidebar row drags under `side-tab:<tabId>`; every consumer of a drag event (the provider and `PaneView`'s own-only-tab check) must go through `draggedId` (`lib/tabDrop.ts`) to compare the real tab id. `tabDropRoute` fixes the preference order before anything else: sidebar row, then workspace in the bar, then the pane zone; `restoreOrigin` runs after each of them. `handleTabDragEnd` delegates to `resolveTabDrop` (`lib/tabDrop.ts`, pure). Given the
`over` id, the dragged tab, every workspace and the drag index built at drag start, it returns one of
four actions, or `null` when the drop does nothing:

- `reorder`, `move`, `split`: the target is in the tab's own workspace; they call `reorderTab`,
  `moveTab` and `splitPaneAndPlace`.
- `transfer`: the target is in another workspace; it calls `onMoveTabToWorkspace` (App's
  `handleMoveTabToWorkspace`) with a `pane` or `split` request.

Two over id formats:

`tab-insert:<tabId>:before|after` - tab border drop zones for positional insertion:
- `before`: insert at `indexOf(tabId)` in the target pane
- `after`: insert at `indexOf(tabId) + 1`
- Same pane: `reorder` (dropping before or after the dragged tab itself is a noop)
- Different pane of the same workspace: `move` at the given position; the source pane
  auto-collapses if it becomes empty
- Pane of another workspace: `transfer` into that pane at the given position

`zone:<paneId>:<direction>` - pane-level drop zones:
- `center`: `move` to the end of another pane (`null` on the tab's own pane), or `transfer` when the
  pane belongs to another workspace
- directional zones: `split` (or `transfer` with a split request) that splits the target pane and
  places the tab in the new half; `null` when the target workspace already has `workspacePaneLimit`
  panes

**File drag** - for a file, the handler checks whether an editor with that path is already open in
the active workspace. If it is, the existing panel is treated as a panel drag (move/reorder) so the
tab moves to the drop location. Folder drags always open a fresh terminal (no reuse). When no panel
is reused:

| Drop target | Action |
|---|---|
| `zone:<paneId>:center` | `openPanel(wsId, paneId, panel)` - opens permanent tab right after the active one |
| `tab-insert:<tabId>:before\|after` | `openPanel(wsId, paneId, panel, index)` - inserts at position |

`openPanel` without an explicit `index` (the common case: Cmd+T, opening an editor, reopening a closed
tab) inserts the new tab right after the pane's active tab, not at the end (`tabInsertionIndex`).
| `zone:<paneId>:top\|bottom\|left\|right` | `splitPaneAndOpenPanel(wsId, paneId, dir, panel)` - splits pane, opens panel in new sub-pane |

`panel` is the editor or terminal produced by `tabForDroppedPath`. Editor tabs have
`preview: false` (permanent tab) because the drag is an explicit intent. `splitPaneAndOpenPanel`
uses `splitPaneAndInsertTab` (pure function in `splitNode.ts`) to perform the split and new-panel
insertion atomically in a single state update.

Both zone types coexist. Tab-border zones take priority when the pointer is over a tab bar (they are
physically smaller and registered on top). Pane zones handle the content area and pane borders.

Cross-workspace drops are supported. While a tab is dragged, each workspace of the `WorkspaceBar` is a
hover target: keeping the pointer on it for 600 ms (`createHoverSwitch`, `lib/hoverSwitch.ts`) makes it
the active workspace, and only the active workspace renders drop zones, so the drop uses the usual zones.
The tab rows under a workspace in the `WorkspaceBar` (`WorkspaceDetailList`) are draggable too and can be dropped on a workspace of the bar or on any pane zone, like a pane tab. That works because the bar has no `DndContext` of its own: workspace and group sorting runs in `WorkspaceDndProvider`'s context, and the bar hands the provider its handlers (`useBarDndBinding().setHandlers`, picked by the dragged item's `data.type` of `workspace` or `group`), its collision detection and its drag overlay. Its `SortableContext`s are disabled while a tab or file is dragged.
Between two rows of that list a tab can be dropped too: each row is a droppable (`side-row:<tabId>`, data `SideRowDropData`, enabled only while a tab is dragged) and the half of the row under the pointer (`sideRowSide`) decides the slot. The tab lands in the pane of the tab above the slot, right after it (`resolveSideRowDrop` turns it into a `tab-insert:<above>:after` drop), and above the first row it lands at index 0 of the first pane (`pane-index:<paneId>:0`). It works from panes and from other workspaces, and a row drop wins over the hover-drop of the workspace that contains the list; `WorkspaceDetailList` draws the insertion line with `useDndMonitor`.
`WorkspaceDndProvider` wraps the `WorkspaceBar` (which keeps its own nested `DndContext` for reordering
workspaces) so the bar can read `draggingItem`. The provider's `DragOverlay` is `pointer-events-none`,
otherwise the chip under the cursor would swallow the `pointerenter` of the bar items. The provider
remembers the active workspace when a tab drag starts and goes back to it (`originToRestore`) when the
drag is cancelled with Esc or dropped where nothing happens. While the pointer is over a workspace of the bar, its item lights up at once as if active
(`useWorkspaceDropTarget`, a context apart from `useWorkspaceDnd` so only the bar items re-render).
Dropping the tab there, without waiting for the 600 ms switch, moves it with the `auto` placement
(`handleDragEnd` checks the hovered workspace before looking at `over`): the tab goes into the rightmost
pane, with no split (see below). While a drag is on, Escape is caught in the capture phase and replayed
on the document, because a focused terminal swallows it before dnd-kit's sensor sees it. The tab's own workspace is not a target (`canDropTabOnWorkspace`): it does not light up and dropping there does nothing. A hibernated workspace is a target: it is woken before the tab lands (`moveTabToWorkspace`, async, so `handleDragEnd` restores the origin workspace only once it settles). Once the 600 ms switch shows a hibernated workspace, its `HibernatedOverlay` is itself a droppable (`hibernated:<id>`, enabled only for a tab dragged from another workspace, ringed while hovered) because it has no panes to drop on; `resolveTabDrop` turns it into the same `auto` transfer. Known limitation: workspaces inside a
collapsed group are not on screen, so they cannot be hover targets.

---

## Moving a tab to another workspace

`applyMoveTabToWorkspace` (`useWorkspaces.ts`, pure) removes the tab from the source workspace with
`applyCloseTab` and places it in the destination in a single `setWorkspaces`. The tab keeps its id, so a
terminal keeps its PTY and history; it is never cloned and never goes through `closedTabsRef`. If the
destination is invalid (missing workspace or pane, same workspace, pane limit reached on an explicit
split) the same array is returned and nothing moves. `lib/tabTransfer.ts` holds the placement logic
(`attachTab`, `workspaceForTab`).

The context menu of a tab has "Move to Workspace" (`TabContextMenuItems.tsx`, the menu body shared by the pane tab and the sidebar rows, fed by `WorkspaceMoveContext`):
"New", then every other workspace with a dot of its color, hibernated ones included (marked Zzz; choosing one wakes it before the tab lands), and its icon when it has one. Choosing a workspace uses the `auto`
placement: no pane is ever split, the tab goes into the rightmost pane (`rightmostPane`: right half of a
side-by-side split, top half of a stacked one). The user stays in the current workspace, unless the
moved tab was the current tab of its workspace (menu or drag): then the destination workspace is selected and the tab focused in it (`handleMoveTabFollowingFocus`, focus after 50 ms because the refs are only fresh after the commit). "New" creates a workspace right after the source (same group) whose
only tab is the moved one, titled and rooted after the tab's cwd when it is a terminal. A source
workspace that loses its last tab folds away like any empty workspace (see Fold on empty).
`App.tsx` also calls
`useAgentStore.reassignTabWorkspace` so the agent session and its notifications point at the new
workspace. Dragging uses the same operation, through `resolveTabDrop` (see Drag-and-drop).

## Resize handles (`resizable.tsx`)

`react-resizable-panels` registers a `document` capture-phase `pointerdown` listener that calls
`e.preventDefault()` when the pointer is within the resize handle hit region. The minimum hit
region is 10px. With a 1px separator, the library expands the hit region by ~4.5px into adjacent
panes.

The horizontal separator is explicitly set to `h-[10px]` with a transparent background and a 1px
visual line via `::after`. At exactly 10px, no expansion occurs and the hit region ends at the
pane boundary. This prevents WebKit from suppressing `click` events on the tab bar of the pane
below - the original root cause of intermittent tab clicks failing on bottom panes.

See [WORKSPACES_GOTCHAS.md](WORKSPACES_GOTCHAS.md) for the full investigation.
