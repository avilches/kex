# Global naming refactor: one concept, one name

Date: 2026-06-30
Status: design approved, pending spec review

## Motivation

Several core concepts in Kex have more than one name, and the word "tab" in
particular designates six unrelated things. This makes the code hard to read,
hides bugs (a field literally named `tabId` holds a workspace id), and forces
constant hand-translation between vocabularies. This refactor makes each concept
have exactly one canonical name across variables, methods, types, JSON keys, IPC
commands, and ID prefixes.

The project rule "no backward compatibility" applies: JSON keys, IPC command
names, and ID prefixes are renamed freely. Users reset to defaults; no migration
code is written.

## Canonical names (decisions)

| Concept | Canonical name | Was also called |
|---|---|---|
| Left fixed bar (workspace icons) | `WorkspaceBar` | `WorkspaceSidebar`, `sidebar` |
| Right collapsible bar (explorer/git/history) | `Sidebar` | `RightPanel`, `explorerSidebar`, `panelSide`, `SidebarViewId` |
| A split cell | `Pane` | (ok; only ID prefix `grp-` lied) |
| A tab inside a pane (terminal/editor/browser) | `Tab` | `Panel`, "tab" already (drift) |
| The whole workspace | `Workspace` | `tabId` (agent layer) |
| Sidebar view selector | `SidebarView` = `explorer\|git\|history` | `RightPanelTab`, `RightPanelTabId`, `SidebarViewId` |
| Settings/dialog section selector | `section` / `SettingsSection` | `SettingsTab`, `tab` |
| Run-a-command feature | `Script` | `RunConfig`, "Run Configurations" |
| Agent "needs you" state | `attention` | `waiting` (status) |
| Source control view value | `git` | `source-control` |
| Agent launch directory | `cwdLaunch` / `cwd_launch` | `cwd` (restore-plan path) |
| Claude agent id string | `claude` | `claude-code` |
| Workspace pinned explorer root | `workspaceRoot` | `pinnedRoot` |

Why `Tab` and not `Panel`: the user thinks of the entity as a tab (it is
rendered as a tab in `PaneTabBar`), and the ID prefix is already `tab-`. The cost
is that the other five "tab" meanings must be renamed away first (Phase 1) so
"tab" is unambiguous before the entity claims it (Phase 2).

Why `Sidebar` for the right bar and `WorkspaceBar` for the left: today the
unqualified word "sidebar" (shortcuts `sidebar.*`, native menu `toggle_sidebar`,
theme token `bg-sidebar`) already points at the right bar, so giving it the name
`Sidebar` makes the most existing code correct for free. `Panel` cannot name the
right bar because `Panel` is the entity. The left bar drops "sidebar" entirely to
end the ambiguity. Note `RightPanel` was actively misleading: its `side` defaults
to `"left"`.

## Sequencing (mandatory, not cosmetic)

The identifier `tabId` today means **workspace-id** in the agent layer. When
`Panel` becomes `Tab`, `panelId` will want to be `tabId`. If we renamed the
entity first, `tabId` would mean two things mid-refactor. So we free the word
first:

### Phase 1 — Free the word "tab"

After this phase, "tab" in the codebase refers only to the `Panel` entity (plus
the generic shadcn primitive and the keyboard key, which are intentionally left).

**1a. Agent layer `tabId` -> `workspaceId`** (the field holds a workspace id)
- `modules/agents/lib/types.ts:35,51` — `AgentSession.tabId`, `AgentNotification.tabId`
- `modules/agents/store/agentStore.ts` — all `tabId` params/fields, and the dev
  helper `__kexAgents` added earlier in this session
- `modules/agents/lib/route.ts`, `lib/notificationList.ts`
- `modules/agents/components/AgentNotificationsBridge.tsx` — the `tabId` params of
  `isPanelVisible`/`isPanelSeen` (the functions themselves are renamed in Phase 2),
  proven workspace ids via `ctx.activeWorkspaceId !== tabId`
- `modules/agents/components/NotificationBell.tsx`, `modules/header/Header.tsx`
  (`onActivateAgent`), `app/App.tsx` (`first.tabId -> setActiveWorkspaceId`)
- `modules/command-palette/commands.ts` — `onlyOneTab` -> `onlyOneWorkspace`,
  label "Last tab" -> "Last workspace"
- IPC already correct (`agent_queue_nav { workspaceId, panelId }`); only the JS
  agent layer mislabeled it.

**1b. Bars: `WorkspaceSidebar` -> `WorkspaceBar`, `RightPanel`/`explorerSidebar` -> `Sidebar`**

Left bar:
- `app/components/WorkspaceSidebar.tsx` -> `WorkspaceBar.tsx`; type
  `WorkspaceSidebarProps`; test file; `App.tsx` import + mount
- `modules/workspaces/lib/workspaceSidebarState.ts` -> `workspaceBarState.ts`:
  `DEFAULT_WORKSPACE_SIDEBAR_WIDTH`, width getters/setters, IPC
  `window_save_workspace_sidebar` -> `window_save_workspace_bar`
- JSON key `workspaceSidebarWidth` -> `workspaceBarWidth`
  (`workspaceState.ts`); Rust `window_state.rs` field `workspace_sidebar_width`
  -> `workspace_bar_width`, `update_workspace_sidebar_width`, `lib.rs` command
- internal prop `sidebarWidth` in the component -> `width`

Right bar:
- `app/components/RightPanel.tsx` -> `Sidebar.tsx`: `RightPanel` -> `Sidebar`,
  `RightPanelHandle` -> `SidebarHandle`, `RightPanelProps` -> `SidebarProps`,
  `RightPanelTab` -> `SidebarView`
- `modules/workspaces/lib/useRightPanelState.ts` -> `useSidebarState.ts`; return
  shape `{ open, activeTab -> view, side, ... }`
- `modules/workspaces/lib/windowUiState.ts`: `RightPanelTabId` -> `SidebarView`
  (single source of truth; delete the duplicate union in the component),
  `RightPanelSide` -> `SidebarSide`, `RightPanelUiState` -> `SidebarUiState`,
  `DEFAULT_RIGHT_PANEL_STATE`, `sanitizeRightPanelState` -> `sanitizeSidebarState`,
  saved-state getters/setters; IPC `window_save_right_panel` -> `window_save_sidebar`
- width consolidation: fold `explorerSidebarState.ts`
  (`DEFAULT_EXPLORER_SIDEBAR_WIDTH`, `explorerSidebarWidth`, IPC
  `window_save_explorer_sidebar`) into the sidebar state as a `width` field;
  prefer a single `SidebarUiState { open, view, side, width }` and a single
  `window_save_sidebar` (width drag keeps its debounce)
- JSON key `rightPanel` -> `sidebar`, `explorerSidebarWidth` -> `sidebar.width`
- App.tsx locals: `rightPanelOpen` -> `sidebarOpen`, `rightPanelActiveTab` ->
  `sidebarView`, `toggleRightPanel` -> `toggleSidebar`, `navigateRightPanelTo` ->
  `navigateSidebarTo`, `showRightPanelTab` -> `showSidebarView`,
  `rightPanelRepoRoot` -> `sidebarRepoRoot`
- `panelSide` / `RightPanelSide` -> `sidebarSide` / `SidebarSide`
  (`App.tsx`, `Header.tsx`); Rust menu `panel_side` -> `sidebar_side`, menu id
  `toggle_panel_side` -> `toggle_sidebar_side`
- Rust `window_state.rs`: `RightPanelState` -> `SidebarState { open, view, side, width }`
- delete the residual `modules/sidebar/` module and `SidebarViewId` (its orphan
  value `source-control` is dropped); its only consumer
  `useSourceControlContext.ts` (`cycleSidebarView`) uses `SidebarView`/the
  navigate fn
- `modules/command-palette/commands.ts`: align id `rightPanel.toggle` and prop
  `toggleSidebar` to `sidebar.*`
- left intentionally correct after this: shortcuts `sidebar.*`, native menu
  `toggle_sidebar`, theme token `bg-sidebar` (all already point at this bar)

**1c. Sections: `SettingsTab` / dialog `activeTab` -> `section`**
- `settings/SettingsApp.tsx`: `SettingsTab` -> `SettingsSection`, `parseTabParam`
  -> `parseSectionParam`, query param `tab` -> `section`, event
  `kex:settings-tab` -> `kex:settings-section`
- `modules/settings/openSettingsWindow.ts` + Rust `open_settings_window`: arg
  `tab` -> `section`
- `app/components/WorkspaceSettingsDialog.tsx`: `initialTab` -> `initialSection`,
  `activeTab` -> `activeSection` (values `properties` | `run-configurations`; the
  value becomes `scripts` in Phase 3)

### Phase 2 — Rename the entity `Panel` -> `Tab`

`tabId` is now free, so `panelId` -> `tabId` is unambiguous. The periphery that
already drifted to "tab" becomes correct automatically.

Core (`modules/workspaces/`):
- `lib/types.ts`: `PanelCommon` -> `TabCommon`, `Panel` union -> `Tab`,
  `isAutofocusPanel` -> `isAutofocusTab`; `PaneNode.panels` -> `tabs`,
  `PaneNode.activePanelId` -> `activeTabId`, `ClosedEntry.panel` -> `tab`
- `lib/splitNode.ts`: panel-specific ops -> tab (`findPanelPane` -> `findTabPane`,
  `movePanelBetweenPanes` -> `moveTabBetweenPanes`,
  `splitPaneAndInsertPanel` -> `splitPaneAndInsertTab`); pane ops keep `Pane`
- `lib/useWorkspaces.ts`: `activatePanel`->`activateTab`, `closePanel`->`closeTab`,
  `applyClosePanel`->`applyCloseTab`, `replacePanel`->`replaceTab`,
  `updatePanelData`->`updateTabData`, `movePanel`->`moveTab`,
  `reorderPanel`->`reorderTab`, `setPanelView`->`setTabView`,
  `findPanelGlobal`->`findTabGlobal`; locals `panelId`->`tabId`
- `PaneView.tsx`: `onActivatePanel`->`onActivateTab`, `onClosePanel`->`onCloseTab`,
  `onCloseManyPanels`->`onCloseManyTabs`
- `PanelContent.tsx` -> `TabContent.tsx`, `PanelCallbacks` -> `TabCallbacks`;
  `lib/panelTitle.tsx` -> `tabTitle`, `lib/panelPath.ts` -> `tabPath`,
  `panelClose.ts` -> `tabClose.ts`
- `lib/ids.ts`: `newPanelId` -> `newTabId` (prefix `tab-` unchanged);
  `newPaneId` prefix `grp-` -> `pane-`

IDs across IPC: `panelId` -> `tabId` in `agent_queue_nav`, `float_browser_*`,
`agent_detach_session` (both JS call sites and Rust command signatures).

Periphery already named "tab" — verify/finish the rename so fields match:
- `lib/tabRenameStore.ts` (`renamingPanelId` -> `renamingTabId`)
- `lib/tabFlashStore.ts` (`Snapshot.panelId` -> `tabId`)
- `app/hooks/useTabCloseGuards.ts` (`pendingClosePanel` -> `pendingCloseTab`,
  `disposePanel` -> `disposeTab`, `findPanel` -> `findTab`, etc.)
- `PaneTabBar.tsx` `DraggableTab` (`panel` -> `tab`), droppable ids
  `tab-insert:${panel.id}` -> `${tab.id}`, `WorkspaceDndProvider.tsx` `refPanelId`
  -> `refTabId`
- agent layer `isPanelVisible`/`isPanelSeen` -> `isTabVisible`/`isTabSeen`
- settings `tabBarStyle`, `autofocusNewTabs`, `warnOnCloseTabWithRunningProcess`,
  `isBlockTab` are already correct once the entity is `Tab`

### Phase 3 — Secondary inconsistencies

- `RunConfig` -> `Script` (user chose `script`): type `RunConfig` -> `Script`,
  `addRunConfig`->`addScript`, `updateRunConfig`->`updateScript`,
  `removeRunConfig`->`removeScript`, `reorderRunConfigs`->`reorderScripts`,
  `setActiveRunConfig`->`setActiveScript`, `runConfigCommandSeen`->`scriptCommandSeen`,
  `setRunConfigRunning`->`setScriptRunning`. JSON already `scripts` /
  `activeScript` / `scriptPaneId` (unchanged; `newScriptId` already `sc-`). UI
  "Run Configurations" -> "Scripts"; settings section value `run-configurations`
  -> `scripts`. `Script.panelId` -> `tabId` (from Phase 2); `scriptPaneId` stays
  (it is a Pane).
- Agent state `waiting` -> `attention` (user chose `attention`): `AgentStatus`
  value and `AgentEntryVisual` `waiting` -> `attention`, all `setStatus(id,
  "waiting")` call sites; `NotificationKind` `attention` and field
  `attentionSince` already match; tab/bell visuals updated.
- `source-control` -> `git`: drop the `source-control` value (module deleted in
  1b); `cycleSidebarView("source-control")` -> `("git")`; persisted value already
  `git`. The feature folder `modules/source-control/` keeps its name.
- `cwd` -> `cwdLaunch`: `record_session(cwd)` -> `cwd_launch`, `RestorePlan.cwd`
  (Rust + `agentSessionRestore.ts`) -> `cwdLaunch`, matching `cwd_launch` /
  `AgentSessionMeta.cwdLaunch`.
- `claude-code` -> `claude`: fix the dev-helper default in `agentStore.ts`; asset
  filenames (`claudecode-color.svg`) and `claudeCodeUrl` may stay, but the agent
  id string is `claude` (Rust `resume_cmd_for_agent` matches `claude` exactly).
- `pinnedRoot` -> `workspaceRoot`: field in `types.ts`; the explorer-root mode is
  already `workspace`, and `resolveSidebarTarget` already takes `workspaceRoot`.

## Explicitly NOT changed (kept on purpose)

- `AgentStatus` and `WorkspaceStatus` both using "status": different modules,
  different domains (a live runtime value vs a user-defined category). Sidebar
  collapsible "groups" group workspaces by their status; coherent.
- Git `index_status` / `worktree_status` / `status_label`: porcelain XY domain
  language.
- `AgentSignalKind` mixed casing (`started`/`exited` vs `UserPromptSubmit`/`Stop`):
  the PascalCase members mirror real Claude Code hook event names.
- `handle` for background processes vs `id` for pty/shell sessions: distinct
  concepts; left as-is.
- `components/ui/tabs.tsx` (shadcn primitive) and `TAB_KEY` (keyboard key):
  generic, not the Tab entity.
- "leaf" terminology in the terminal slot pool (`leafIdForPty`,
  `refreshTerminalLeaf`): the renderer-slot / tree-leaf concept keyed by tab id,
  not a fourth synonym to rename.
- theme token `bg-sidebar`: now consistent (consumed by `Sidebar`).

## Living documentation

Per `AGENTS.md`/`CLAUDE.md`, update in the same commit as the code:
`docs/ARCHITECTURE.md`, `docs/IPC.md`, `docs/WORKSPACES.md`,
`docs/WORKSPACES_GOTCHAS.md`, `AGENTS.md`, `CLAUDE.md` (all reference `Panel`,
`PaneTabBar`, `RightPanel`, `explorerSidebarWidth`, `panelId`, etc.). The JSON-only
prefs `workspacePaneLimit` and `paneSplitLimit` reference `Pane` and stay.

## Verification

Each phase must independently pass: `pnpm lint`, `pnpm check-types`, `pnpm test`,
`cd src-tauri && cargo clippy && cargo test --locked`. Commits are atomic (one
logical rename per commit), messages in English. Because IDs are opaque strings,
changing the `grp-` -> `pane-` prefix only affects newly-created panes; existing
persisted ids keep working. JSON key and IPC renames rely on the no-backward-compat
rule (users reset to defaults).
