# Fork notes

This repository is a fork of [crynta/terax-ai](https://github.com/crynta/terax-ai).

The original project is a terminal emulator with an integrated AI side-panel (BYOK, local models, agentic workflow).
This fork strips the AI subsystem and replaces it with a deeper terminal workspace UX: a multi-workspace layout with
per-pane tab strips, full layout persistence, and drag-and-drop panel management.

But this project has a similar, but different goal: 
  - The goal is a clean, fast terminal-first workspace with no AI runtime dependency, no API keys, and no keychain access
  - While investing the saved complexity budget into a more powerful pane and workspace model.

---

## What has been removed

### AI subsystem (frontend)

- `src/modules/ai/` — entire module: composer, multi-session agent runner, slash commands, voice input, AI autocomplete
  CodeMirror extension, session hydration, tool execution, plan mode
- `src/modules/agents/store/managedAgentsStore.ts` — managed agents launched via `/claude-code`
- AI and Agents sections in the Settings window
- AI controls in `StatusBar` (provider selector, model picker)
- `AiInputBar` / `WorkspaceInputBar` AI composer surface
- `AiComposerProvider`, `AgentRunBridge`, `useAiLiveBridge`, `hydrateSessions` wiring in `App.tsx`

What survives from `src/modules/agents/`: the passive notification bell (OSC-based Claude Code detection, OS
notifications, Sonner toasts). Zero cost when no agent runs.

### AI subsystem (Rust)

- `src-tauri/src/modules/net.rs` — HTTP proxy used exclusively for AI API calls (`reqwest`)
- `src-tauri/src/modules/secrets.rs` — OS keychain access used exclusively for API key storage (`keyring`)
- All related `tauri::generate_handler![]` entries and capability entries

### npm dependencies

`ai` (Vercel AI SDK v6), `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/cerebras`, `@ai-sdk/groq`,
`@ai-sdk/xai`, `@ai-sdk/react`, `streamdown` — all removed. Reduces the frontend bundle by roughly half.

### Features de upstream evaluadas y omitidas

- `src/modules/spaces/` (Spaces, agrupacion de tabs): evaluado en el upstream sync 2026-06-13, omitido. El upstream anade
  "spaces" como una capa que agrupa tabs planos (cada tab con su propio paneTree), persistida en `terax-spaces.json`. El
  fork ya cubre esa necesidad (varios entornos de trabajo agrupados, conmutables, reordenables, persistidos) con su
  modelo Workspace -> Pane -> Panel y el WorkspaceSidebar, sin un nivel intermedio de tabs. Traer spaces introduciria un
  segundo eje de agrupacion redundante, un segundo store en disco, y resucitaria el modelo de tabs planos eliminado en la
  Phase 2. Se omite por conflicto de arquitectura, no por falta de valor. Piezas de UI sueltas (SpaceAvatar con acento
  oklch, InlineRename, DropIndicator) quedan como posible pulido futuro del WorkspaceSidebar.
- `src/modules/dnd/` (dnd foundation del upstream): omitido. Es una fachada sobre @dnd-kit; el fork ya tiene
  `WorkspaceDndProvider` (drag de panels entre panes y de archivos del explorer a panes), mas avanzado.
- Empaquetado Nix (`flake.nix`, `nix/`): el upstream distribuye via Nix; el fork no. Se ignoran todos los commits nix.

---

## What has been added or changed

### Phase 1 — 3-column layout

**Problem in the original:** a horizontal tab bar at the top and a collapsible left sidebar holding Explorer, Source
Control, and Git History. This layout does not scale to many workspaces and leaves no room for a workspace-level pane
model.

**What was built:**

- `WorkspaceSidebar` (52px vertical strip, left) — replaces the horizontal `TabBar`. Lists workspaces as icon avatars
  with stable colors derived from their ID. Keyboard-navigable.
- `RightPanel` (collapsible, default 240px, right) — holds Explorer, Source Control, and Git History as tabs. Width,
  active tab, and open/closed state persist via `tauri-plugin-store`.
- `rightPanelSide` preference — moves the tool panel to the left of the center content for users who prefer that layout.
- `SidebarRail` and `useSidebarPanel` deleted (replaced by RightPanel).
- `Header` no longer owns the tab bar.
- `open_main_window` Tauri command — mirrors the settings window pattern, enables multiple independent main windows (
  `Cmd+Shift+N`).
- `Tab.id` migrated from `number` to `string` UUID — stable IDs required for cross-window entity transfer in later
  phases.
- `@dnd-kit/core` and `@dnd-kit/sortable` installed (no UI in Phase 1, needed for Phase 4).

### Phase 2 — Workspace/Pane/Panel model

**Problem in the original:** a flat `Tab` model where each tab was the unit of content. Split panes existed but were
scoped inside a terminal tab, not composable with editor or preview tabs. No per-pane tab strips.

**What was built:**

Three-level hierarchy:

```
Workspace  (UUID, title, cwd, binary pane tree)
  SplitNode  (kind: "pane" | "split"; binary, not N-ary)
    Panel  (UUID, kind: terminal | editor | preview | markdown | git-*)
```

- `useWorkspaces` replaces `useTabs` entirely. Owns workspace list, active workspace, and all pane/panel operations (
  split, close, move, activate).
- `splitNode.ts` — pure tree-operation library (split, remove, find, flatten, sibling lookup, directional neighbor lookup via `findPaneInDirection`). Fully unit-tested.
- `WorkspaceView` → `SplitNodeView` (recursive) → `PaneView` → `PanelContent` — new rendering path. All content kinds (
  terminal, editor, preview, git-*) now live as panels inside panes.
- `PaneTabBar` — per-pane tab strip with close buttons and a `+` button to open a new terminal panel in that pane.
- `dividerPosition` stored explicitly on split nodes (0.0–1.0) — layout persists without relying on
  `react-resizable-panels` internal state.
- PTY session key migrated from `leafId: number` to `panelId: string` (UUID) throughout: `useTerminalSession`,
  `rendererPool`, `pty-bridge`, all call sites.
- `src/modules/tabs/` deleted.
- Never-unmount rule preserved: panels hidden via CSS, never unmounted. PTYs keep streaming in the background.

### Layout persistence

**Problem in the original:** no layout persistence. Restarting Terax always opened a fresh terminal with no memory of
previous workspaces or pane layout.

**What was built:**

- Full `Workspace[]` serialized to `workspace-state.json` via `tauri-plugin-store` on every state change (debounced
  300ms).
- Pane tree, panel list, divider positions, active pane, and active panel all restored on restart.
- Terminal panels restart with a fresh PTY in the saved `cwd`.
- Editor and other non-terminal panels restore their content reference (`path`, `url`, etc.).
- `sanitizeWorkspace` clears transient state at save time (e.g. `editor.dirty = false`).

### UX improvements

- **Focus restore on workspace switch** — when switching workspaces (via sidebar click or keyboard shortcut), the active
  terminal panel of the new workspace receives focus automatically via `requestAnimationFrame`. No manual click needed.
- **Active-pane tab indicator** — a 2px blue line (`bg-primary`) at the top of the tab that currently holds keyboard
  focus. Distinguishes "active in its pane" from "has global focus" when multiple panes are visible.
- **`workspace.new` shortcut (`Cmd+N`)** — creates a new workspace directly from the keyboard or command palette. In the
  original, the equivalent was `Cmd+T` for a new tab.
- **Adjacent tab activation on close** — closing a panel activates the panel to its right (if any), then to its left.
  More natural than the original behavior of always activating the last panel.
- **Workspace auto-close** — closing the last panel in a workspace closes the workspace itself (unless it is the last
  workspace).
- **Directional pane focus shortcuts** — `Cmd+Ctrl+Arrow` (Mac) / `Ctrl+Alt+Arrow` (non-Mac) moves focus to the
  geometrically adjacent pane in the given direction. Uses `findPaneInDirection` (spatial scoring on DOM rects: closest
  pane wins, tie-broken by perpendicular overlap). Hard stop at borders; no wrap-around. Replaces the old cyclic
  `Cmd+[` / `Cmd+]` shortcuts.

### Technical fixes and refactors

- **WebGL canvas refresh** — after a workspace switch, the `opacity-0` CSS change does not trigger a WebGL repaint. A
  `useEffect` with `requestAnimationFrame` calls `refreshTerminalLeaf` on each visible panel to force the canvas to
  repaint.
- **DnD zone isolation** — drop targets from inactive workspaces share screen coordinates with the active workspace (all
  positioned absolute inset-0). Drop events now validate that the target pane belongs to the same workspace as the
  dragged panel.
- **Renderer pool simplified** — the original eviction logic (score-based LRU with `POOL_MAX_SIZE = 5`) removed. With
  the Workspace/Panel model each panel gets and keeps its own slot; eviction no longer applies.
- **`TERMINAL_ID` env var** — injected into the shell environment at PTY spawn (both Unix and Windows). Available to
  shell scripts and tools running inside the terminal.
- **`KEX_PANEL_ID` env var** (formerly `TERAX_PANEL_ID`) — UUID injected into each PTY shell at spawn. Used by session
  persistence hooks to associate an agent session with a specific terminal panel across restarts.
- **App env var prefix renamed to `KEX_`** — all shell integration env vars (`TERAX_TERMINAL`, `TERAX_BLOCKS`,
  `TERAX_PANEL_ID`, `TERAX_USER_ZDOTDIR`) have been renamed to `KEX_TERMINAL`, `KEX_BLOCKS`, `KEX_PANEL_ID`,
  `KEX_USER_ZDOTDIR`. Shell integration cache moved from `~/.cache/terax/` to `~/.cache/kex/`. Fish integration file
  is now `kex.fish`. **Sync impact**: any upstream commit that references `TERAX_` env vars or `terax` paths will
  need manual adaptation. The old Terax hook markers are still in `OWNED_MARKERS` as migration targets (they get
  replaced when the user reinstalls hooks).
- **Claude Code hooks config path renamed to `~/.config/kex/`** (formerly `~/.config/terax/`) — `agent-sessions.json`,
  `restore-candidates.json`, and `hooks/session.sh` are now under `~/.config/kex/`. Hook OSC signal changed from
  `notify;Terax;` to `notify;Kex;`. Script version marker is now `kex-session-v1`. Users with the old Terax hooks
  installed will see the "Enable Claude Code alerts" button again (status check detects the outdated script via the
  version marker) and reinstalling updates both the script and the OSC signal.
- **Agent session restore** — when Claude Code hooks are installed, the app writes the active session id and cwd to
  `~/.config/kex/agent-sessions.json` (via `SessionStart` hook; `SessionEnd` is intentionally ignored to avoid a
  race with PTY death). On relaunch, `agent_session_restore_plan` (Rust) reads the store (preferring
  `restore-candidates.json` written just before the last close), locates the Claude Code JSONL transcript to verify
  the cwd, and returns a resume command per recoverable session. The frontend types the command
  (`claude --resume '<id>'`) into the terminal 200ms after the PTY opens. Tab UI: `agentname · dirname` title, `✦`
  icon, colored status dot; `⚠` on error. See `docs/AGENT_SESSION_RESTORE.md`.
- **`agentNotifications` setting** (formerly `claudeHooksEnabled`) — boolean persisted in the app settings store.
  Controls both notification routing and hook lifecycle. Enabling it calls `agent_enable_claude_hooks`; disabling it
  calls `agent_disable_claude_hooks` (removes Kex hooks from `~/.claude/settings.json`). On every startup, the app
  silently calls `agent_enable_claude_hooks` when this is true (idempotent). Controlled via Settings > General >
  Coding agent notifications; also accessible from the notification bell popup ("Enable Claude Code alerts").
- **Minimal `~/.claude/settings.json` writes** — `agent_enable_claude_hooks` now uses `serde_json` with
  `preserve_order` (insertion-order key serialization via IndexMap) and detects the original indent style, so
  reformatting is kept to the minimum necessary. If our hooks are already present, settings.json is not touched at
  all. **Sync impact**: `Cargo.toml` now has `serde_json = { version = "1", features = ["preserve_order"] }` instead
  of `serde_json = "1"`. Upstream commits that add direct `serde_json` usage will still compile; only the object key
  order in serialized output changes from alphabetical to insertion order.
- `native.ts` moved from `src/modules/terminal/` to `src/lib/native.ts` — shared across all modules.

---

## Roadmap (planned, not yet built)

These phases are designed but not fully implemented:

- **Phase 3 — Persistent terminal sessions** — a tmux daemon per workspace that keeps shell sessions alive across Kex
  restarts. Panels restore with their full scrollback and running processes intact.
- **Phase 4 — Drag-and-drop panel management** — drag panels between panes (5-zone drop: top / bottom / left / right /
  center), drag workspaces to reorder the sidebar, drag panels to other workspaces. Infrastructure (dnd-kit, stable
  UUIDs, `movePanel` / `splitPaneAndPlace` operations) is already in place; the full drop UX is in progress.
- **Multi-window workspace migration** — workspaces can be dragged from one window's sidebar to another window's
  sidebar. Requires a Tauri event protocol (`terax:workspace-transfer`) that transfers the workspace entity by ID across
  WebView instances.

---

### Upstream sync log

#### 2026-06-13

- Upstream HEAD: 8e1c4743fb4efcf1f3d089457c32dc1326552683
- Commits revisados: f69eecc34df5be9aa1b23166de7e84b231bca481..8e1c4743fb4efcf1f3d089457c32dc1326552683 (50 commits reales, 5 merges)
- Outcome: work plan creado en docs/upstream-2026-06-13.md y ejecutado (rama sync/upstream-2026-06-13)
- Bug fixes / perf aplicados (Bucket B): pwsh startup cursor query (tab blanco Windows, da_filter CPR); dormantRing coalesce + keep-history-on-overflow; raw-body pty_write (solo la parte de latencia, sin el watchdog que el upstream luego revierte ni tcgetpgrp); macOS press-and-hold off; editor cursor zoom macOS; AppImage env strip; integracion de blocks en bash/fish/pwsh (serie de 4 commits); test del ciclo OSC 133 de blocks; perf del explorer (RowActions memo + sameDirListing); tokens de motion compartidos (2 commits)
- New features aplicadas (Bucket C): git status decorations en el explorer (+ fix de gitignore-fuera-de-repo); drag-to-move dentro del explorer; aceptar archivos soltados desde el SO (fs_copy)
- Blocks (segunda tanda): cableada la activacion del modo blocks (campo blocks en Panel, propagacion en PanelContent, openNewBlock, montaje de ShellInput en TerminalPane) y aplicado C5 (toolbar de acciones via DropdownMenu, exit badge, navegacion por bloques Cmd+Up/Down con allowRepeat). navigateBlocks/selectBlock/clearBlockSelection en blockDecorations con keys panelId:string; navigateFocusedBlocks en la sesion; firstIndexEndingAtOrAfter (binary search por frame). Sistema de hover JS retirado a favor de CSS .bt-bar:hover (elimina un setInterval por bloque vivo y el LiveTimer).
- Divergencias conscientes en la integracion:
  - git decorations OFF por defecto (el upstream lo trae ON). El WalkBuilder por-directorio tiene coste real y la filosofia del fork es "lo no usado cuesta cero"; se activa en Settings > General > Explorer.
  - drag-to-move reimplementado con @dnd-kit en lugar del hook pointer-based del upstream (useExplorerDnd). El fork ya gestiona el drag de filas con @dnd-kit (arrastrar archivos a panes via WorkspaceDndProvider); dos sistemas de pointer-events sobre la misma fila chocarian. Carpetas como useDroppable (explorer-dir:<path>), drag de carpetas con prefijo dir:, move via useDndMonitor + movePath. El hook useExplorerDnd del upstream NO se integro.
  - C5 sin outputCap.ts ni accion "Attach to AI chat": en el upstream el dropdown de bloque adjunta el output al chat AI y capAttachOutput (outputCap.ts) lo recorta para no inundar el contexto del modelo. El fork elimino el subsistema AI, asi que ese unico consumidor no existe y outputCap seria codigo muerto; se omitieron ambos. El dropdown del fork ofrece Run again, Copy command, Copy output, Copy command and output y Find in block.
- Changes skipped (removed surface): subsistema AI (chips, OsIcon, parte AI de WorkspaceInputBar); empaquetado Nix (5 commits); modelo de tabs/spaces del upstream; modulo dnd del upstream; version bump 0.8.0; band-aids de conpty stall revertidos por el propio upstream (solo se aplico la causa raiz, 18187f4)
- New features rejected: Spaces (modelo de agrupacion de tabs, conflicto con el modelo Workspace del fork); dnd foundation (ya superado por WorkspaceDndProvider)
- New features deferred (no en esta ronda; ver sub-entrada 2026-06-14): markdown rendered/raw toggle; blocks watermark; blocks "hide live toolbar" + focus-on-open + copy-grid-selection; Cmd+Shift+T para New block terminal; mejoras de UI derivadas de motion tokens. Mejoras menores anotadas en docs/TODO-explorer-dnd-drop-targets.md (drop sobre archivo/raiz, color git en fila seleccionada, drag explorer->SO). Bug conocido del toolbar de blocks anotado en docs/pending (BUG-36: el menu desaparece en bloques muy largos).

#### 2026-06-14

- Continuacion del sync 2026-06-13 (misma rama sync/upstream-2026-06-13, sin mergear). SYNC AUN ABIERTO.
- Diferidos del Bucket C aplicados (reimplementados sobre el modelo del fork, no cherry-pick):
  - C8 (a9493ec): atajo `tab.newBlock` = Cmd+Shift+T cableado a `openNewBlock`. El commit upstream tocaba TabBar.tsx (inexistente en el fork); reimplementado en shortcuts.ts + App.tsx. La entrada de command palette ya existia; se le anadio el shortcutId.
  - C6 (b3000f2): watermark de primer uso (`BlockWatermark.tsx`) sobre un block terminal sin comandos; se desvanece al primer comando. Gate `blockWatermarkState` + `hasAnyBlock()` en BlockDecorations (con tests). Hints ADAPTADOS al fork (sin AI): historial, autocomplete, blocks.prev/next, tab.newBlock. El upstream referenciaba terminal.toggleInput y ai.toggle (inexistentes aqui). El refactor de hover que traia este commit ya estaba hecho en el fork (C5).
  - C7 (a10a63c + cd3c85c): hide-live-toolbar (el chrome del bloque aparece solo al terminar), focus-on-open del input, y copy-grid-selection (Cmd+C sobre seleccion del grid con el input enfocado, via onCopyCapture + leafGridSelection con keys string). Extra: Escape en el input limpia la seleccion de bloque (onEscape nuevo en shellEditor).
  - C4 (66f77c4): markdown rendered/raw toggle. isMarkdownPath + MarkdownViewToggle portados; conmutacion reimplementada como `setPanelView` en useWorkspaces (muta un Panel entre kind "markdown" y "editor", gateada por dirty). Los .md abren renderizados por defecto desde el explorer. Eliminado el menu contextual "Open Preview" (redundante) y su threading. NOTA: MarkdownViewToggle se importa del fichero directo en PanelContent, no del barrel, para no arrastrar streamdown al bundle eager (eager-budget.test).
- Bug arreglado: BUG-37 (Cmd+U fantasma). Eliminado el shortcut muerto terminal.toggleInput ("Toggle Shell / AI input", residuo del modo AI), el evento TOGGLE_BLOCK_INPUT_EVENT (sin listener) y el hint enganoso. A peticion del usuario se recupero solo el hint visual estilo Cmd+U en el prompt (decorativo, sin accion ni atajo en Settings); el toggle real blocks<->normal queda anotado en docs/TODO.md (requiere integracion de shell dinamica + persistencia tipo tmux porque TERAX_BLOCKS se lee solo al arrancar la shell).
- Items opcionales re-decididos (cierre del sync):
  - 731da51 (header polish): APLICADO. Hover `hover:bg-accent hover:text-foreground` en el boton Command palette y divisores suavizados `bg-border` -> `bg-border/70`. El resto del commit (bloque spaceSwitcher+TabBar) no existe en el fork.
  - c4aaca2 (CI pnpm): APLICADO. release.yml y signpath-test.yml leen pnpm 11.5 del campo `packageManager` (antes pineaban version 10, un mismatch real con el proyecto). ci.yml ya no tenia pin.
  - 6ebb6b8 (panel swap animation): DESCARTADO. No aplica al fork: los 3 paneles del RightPanel estan montados siempre (invisible pointer-events-none) y no se remontan al cambiar de tab, asi que una animacion de entrada CSS no se dispara. Portarlo exigiria AnimatePresence/remount (rompe el estado vivo). Queda como pulido independiente.
  - afd1167 (appimage updater sig): DESCARTADO del sync, anotado como mejora M8 (docs/pending/improvements). El release.yml del fork divergio en el merge-base 8200938 (96 lineas) y nunca recibio la cadena de mejoras del AppImage del upstream (hoy 202 lineas, sin wayland/signer/patch-appimage). afd1167 modifica un step que el fork no tiene; adoptar el sistema completo es trabajo de infra aparte.
  - bb155d2 (tab enter animation): POSPUESTO. Portable a PaneTabBar, pero ese fichero estaba bajo un WIP de rename de pestanas (ya descartado por el usuario); se retoma cuando se quiera.
- El resto del scope aceptado (Bucket B completo, C1/C2/C3/C5) ya estaba aplicado de sesiones previas.
- Quality suite completa (cierre): check-types OK, lint exit 0 (85 warnings preexistentes), 180 tests, vite build OK; Rust cargo clippy OK, cargo test --locked OK.
