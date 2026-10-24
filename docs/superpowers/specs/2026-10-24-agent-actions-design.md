# Agent Actions: design

Task: TASK-897.

## Intent

Coding agents (`claude`, `codex`, `opencode`, `omp`, `pi`) should be launchable from the Header with an icon, like apps. They are not apps (an app is spawned in the background with no shell) and not scripts (a script is a single instance with a running state and a stop). An agent needs a terminal, a start folder, and as many instances as the user wants.

## Goals

- A third Action kind, `agent`, next to `app` and `script`.
- Click: always opens a NEW terminal tab in the resolved folder and types the agent command there. Kex never closes that tab; when the agent exits the shell stays alive and the user closes the tab.
- Agents are discovered by the existing editor scan (Rust), offered as presets in the Add combo, and auto-added once.

## Non-goals and anti-goals

- No running state, no stop button, no red zone, no `actionStateStore` entry for agents. A second click must never focus or reuse the first tab.
- No backward compatibility, migration or fallback for the old `runInTerminal` boolean (project rule: users start from defaults, stored Actions in the old shape are dropped by normalization).
- No second hardcoded list of agent names on the frontend: Rust `DEFAULT_AGENTS` (`src-tauri/src/modules/agent/launch_cmd.rs`) is the single source.
- Not a success if clicking an agent twice ends in one tab, if removing the seeded agents brings them back on the next launch, or if app and script behaviour regresses.

## Model

Replace `Action.runInTerminal: boolean` (`src/modules/actions/lib/types.ts`) with `kind: "app" | "script" | "agent"`, everywhere (about 60 non-test uses in `src`, plus tests, docs and the glossary row in `CLAUDE.md`). Every place that branched on the boolean decides explicitly what an agent does; none may silently treat `agent` as `app`.

Agent reuses: `command`, `appId`/`iconId`, `cwdMode`/`cwd` (same "Run in folder" choices as scripts: Home, Workspace root, Current tab folder, Absolute path), `ownButton`. Target comes from the command variables as for any Action (`actionTarget`).

## Execution

Reuse the script path that opens a terminal tab in a resolved folder and writes the command (`useActionRunner`, `actionRun.ts`), minus everything stateful: no link to a previous tab (`linkFor`/`getActionTab`/`linkActionTab`), no `setScriptRunning`/`setScriptCommand`, no `scriptPaneId` reuse that implies a single tab. Each click calls the open-tab path again. Where the new tab goes (focused pane vs script pane) is left to the builder, with the constraint that it respects `workspacePaneLimit` the same way scripts do, and that a hibernated workspace behaves as for scripts. The same value rules as scripts apply (a script rejects `$`, quotes, backtick and backslash in variable values because they go to a shell; an agent command also goes to a shell, so the same rejection applies).

## Detection and presets

- Rust: extend `editor_scan` (`src-tauri/src/modules/editors/`) so it also returns the agents found on PATH (`which`, same helper as editors), built from `DEFAULT_AGENTS`. The returned entry carries `binary` and a marker that it is an agent. Update `docs/IPC.md`.
- Frontend: `suggestionsFromDetected` (`actions/lib/appSuggestions.ts`) yields for each enabled detected agent two presets, `{workspace}` and `{cwd}` (no `{filepath}`), with the agent kind, the icon from `modules/agents/lib/agentIcon.tsx` (fall back to the generic one for agents without a logo), and the same "installed presets stay out of the combo" rule (`hasCommandOf`, `presetOf`, `ownedAfterEdit` must understand the agent kind).
- Detected agents are not editors: they must not appear in editor-only lists (Open in, external editors settings).

## First-time seeding

After the first successful scan, for each detected agent, add the `{cwd}` variant globally (`globalActions.add`) with `ownButton: true` and `kind: "agent"`. A persisted preference flag (name left to the builder, in `settings/store.ts` with its default) is set after seeding so it happens once per machine, even if the user later deletes the Actions and restarts. If the scan finds no agents the flag is NOT set (so a later install can still seed once). Agents installed later only appear in the combo. Seeding must be idempotent under two windows scanning at once (the global actions queue already serializes writes) and must skip an agent whose command already exists.

## UI

- Header (`ActionsBar`): agents go with the apps, before scripts. A single own button of a detected agent is drawn icon-only like apps. Never shows a running or stop state.
- Settings > Actions: each column gets three lists (scripts, apps, agents) that do not mix when reordering; the Add combo creates the kind from the chosen preset; the kind cannot change afterwards (delete and recreate), as today. The modal shows "Run in folder" for agents as for scripts.
- Drag and drop (`actionDrop.ts`, `barOps.ts`): agents are their own type; the bar has a zone per type and scope as already done for apps and scripts, and a zone only admits its own type.
- Context menus (`RowActionsMenu`, `contextActionEntries.ts`): agents follow their target (folder agents in folder menus).

## Variants of a preset (decided after the builder check)

The command of an agent is the bare binary (`claude`), never with a path argument. The two variants differ only in the start folder: `{workspace}` is `cwdMode: "workspace"` (Workspace root) and `{cwd}` is `cwdMode: "context"` (Current tab folder, the same mode scripts already have). So the identity of an installed agent preset is the pair (command, cwdMode), not the command alone: `hasCommandOf`, `presetOf`, `uninstalledSuggestions` and `ownedAfterEdit` compare both for agents, and installing one variant leaves the other in the combo. Seeding compares the same pair.

Visibility in the Header follows the start folder, as for scripts: a `workspace` agent is always shown (grey with "Set a root to this workspace" when there is no root), a `context` agent needs a terminal tab focused to know its folder, exactly like a script with Run in Current tab folder; the builder reuses the script rule and must check what `actionTarget` and the Header filter do for a script with that mode, and keep agents consistent with it. Preset names show the variant the way app presets do (`Claude Code {cwd}`).

## Constraints

Project rules apply: no em-dash, no emojis, shortcuts untouched, IDs via `newActionId`, functional core with pure functions, tests for the invariants (kind normalization, new tab per click, seeding once, presets, drop rules), no migration code, update `docs/ARCHITECTURE.md`, `docs/IPC.md`, `docs/FORK.md` and the Action glossary row in `CLAUDE.md` in the same commits. Commits atomic, in English, no attribution lines. Checks: `pnpm lint`, `pnpm check-types`, `pnpm test`, `cd src-tauri && cargo clippy && cargo test --locked`.

## Left to the builder

Flag name, exact icon fallback, tab placement, the order of agents inside their list, and how to split the work into atomic commits (suggested order: model rename with tests, Rust detection, presets, runner, UI and drag, seeding, docs).
