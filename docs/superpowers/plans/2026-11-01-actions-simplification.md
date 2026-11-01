# Actions simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the variable-driven, three-field Action model with one explicit place per Action, one variable (`{target}`) and one icon field.

**Architecture:** `Action` gains `runs` (scripts) and loses `appId`, `iconId`, `cwdMode`. Pure predicates in `actionTargets.ts` (`inHeader`, `offeredAt`) decide where an Action is listed; the Header model, the focused-tab submenu and the context menus all call them. The runner derives the working folder from `runs`. UI components stay thin.

**Tech Stack:** TypeScript, React 19, vitest, shadcn `RadioGroup`/`Checkbox`, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-01-actions-simplification-design.md`

## Global Constraints

- No migration, shim or fallback for old fields: `normalizeAction` drops what does not fit (spec, non-goals).
- No em-dash, no emojis, comments only for the why, imports `@/...` across modules.
- Commits atomic, English messages, no co-author lines. Run `pnpm lint`, `pnpm check-types`, `pnpm test` before each commit; all three stay green at every commit.
- Docs updated in the same commit as the code they describe (`CLAUDE.md` Action row, `docs/ARCHITECTURE.md`, `docs/SETTINGS_UI.md`).
- Settings controls are shadcn (`RadioGroup`, `Checkbox`); inputs use `INPUT_CLASS`.
- Work in a worktree under `.claude/worktrees/`, merge to `main` at the end, no PR.

## Corrections to the spec (decided while planning)

- A fixed folder is stored as an absolute path. `scriptCwdProblem` rejects `~` and relative paths, so "Home" is no longer a stored value: the folder picker of that option can fill the home folder as an absolute path.
- The "Default icon" entry of `IconPicker` is removed: with one `icon` field there is no separate preset icon to go back to. The user picks the logo again from the grid.
- The submenu of the focused tab hides apps that cannot open the focused kind (JetBrains on a file). Right-click menus keep showing them muted with "takes folders only". This differs from "My calls" 3 of the spec; flag it at review.

## Review Focus

- A saved script with no valid `runs` (everything saved before this change) is dropped, the rest of the list loads, nothing throws. Test: `normalizeActions`.
- A `file` script whose command lacks `{target}` is refused at save time (`actionProblems`) and at run time (`planActionRun` returns `blocked`). Test: both.
- A file path containing `$`, a quote or a backtick, passed as `{target}` to a script, ends as a `blocked` plan with the existing "holds a character a script cannot take safely" message, never as a typed command. Test: `planActionRun`.
- No workspace root: `folder` and `workspace` scripts, agents and folder-taking apps are grey in the Header with `WORKSPACE_UNSET` and stay clickable (`needsRoot`); a `fixed` script is not affected. Test: `buildActionsBarModel`.
- Claude and Claude with Yolo (same `agent:claude` icon) both render with their name; a lone Codex renders icon-only; editing a command never changes `icon`. Test: `soleIconButtons`, `updateAction`.

---

### Task 1: One icon field

**Files:**
- Modify: `src/modules/actions/lib/types.ts`, `lib/actions.ts`, `lib/appSuggestions.ts`, `lib/agentSeed.ts`, `lib/actionsBar.ts` (`soleIconButtons`), `ActionIcon.tsx`, `IconPicker.tsx`, `AddActionMenu.tsx`, `ActionsColumns.tsx`, `OwnButtonChoice.tsx`
- Delete: `lib/appOwnership.ts` and its test
- Test: `lib/actions.test.ts`, `lib/actionsBar.test.ts`, `lib/agentSeed.test.ts`, `lib/appSuggestions.test.ts`, `ActionsColumns.test.tsx`

**Interfaces:**
- Produces: `Action` without `appId` and `iconId`; `icon?: string` in the shapes `app:<id>`, `agent:<id>`, `glyph:<name>` (validated by `parseIcon`).
- Produces: `actionFromSuggestion(s: AppSuggestion, ownButton?: boolean): Action` sets `icon` to `` `${s.kind}:${s.appId}` `` when `s.appId` exists.
- Produces: `soleIconButtons(buttons: readonly Pick<Action, "id" | "kind" | "icon">[]): Set<string>`: only an agent whose `icon` starts with `agent:` is a candidate, and it is sole when no other button in the list has the same `icon`.
- Produces: `ActionIcon` prop `action: Pick<Action, "kind" | "icon">`.

- [ ] **Step 1: Write failing tests.** `soleIconButtons`: two agents with `icon: "agent:claude"` return an empty set; one `agent:codex` returns its id; an agent with `glyph:star` or no icon is never sole. `updateAction(list, id, { command: "claude --dangerously-skip-permissions" })` leaves `icon` equal to `"agent:claude"`. `normalizeAction({ ..., appId: "zed", iconId: "zed" })` returns an Action without those keys. `planAgentSeed` output has `icon: "agent:<id>"`.
- [ ] **Step 2: Run** `pnpm test src/modules/actions` and see these fail.
- [ ] **Step 3: Implement.** Remove the two fields from `types.ts` and `normalizeAction`; delete `ownedAfterEdit` and its call in `ActionsColumns.tsx`; `ActionsColumns` passes `preset={!!presetOf(action, suggestions)}`; `ActionIcon.resolve` draws `parseIcon(action.icon)` first, then the kind default (agent: generic agent logo, script: terminal glyph, app: window glyph); `IconPicker` and `AddActionMenu` take/pass `{ kind, icon }`; drop the "Default icon" entry. `OwnButtonChoice` type picks no `appId`.
- [ ] **Step 4: Run** `pnpm lint && pnpm check-types && pnpm test`; all pass.
- [ ] **Step 5: Docs and commit.** Update the identity paragraph of the Action row in `CLAUDE.md` and the Action model table in `docs/ARCHITECTURE.md`. Commit `Actions: one icon field replaces appId and iconId`.

### Task 2: Scripts say where they run; one variable

**Files:**
- Modify: `lib/types.ts`, `lib/actions.ts`, `lib/actionTargets.ts`, `lib/commandTemplate.ts`, `lib/commandVars.ts`, `lib/actionForm.ts`, `lib/actionRun.ts`, `lib/useActionRunner.ts`, `lib/useActionContext.ts`, `lib/runOverlay.ts`, `ActionEditDialog.tsx`, `ActionsColumns.tsx` (script draft), `OwnButtonChoice.tsx`, `src/modules/workspaces/lib/scriptCwd.ts`, `src/modules/workspaces/lib/types.ts` (remove `ScriptCwdMode`)
- Test: `lib/actions.test.ts`, `lib/actionTargets.test.ts`, `lib/commandTemplate.test.ts`, `lib/commandVars.test.ts`, `lib/actionForm.test.ts`, `lib/actionRun.test.ts`, `lib/useActionRunner.test.ts`, `ActionsColumns.test.tsx`

**Interfaces:**
- Produces in `types.ts`: `export type ScriptRuns = "folder" | "file" | "workspace" | "fixed";` and `Action.runs?: ScriptRuns` (scripts only), `Action.cwd?: string` (only with `runs: "fixed"`). `cwdMode` is removed.
- Produces in `actions.ts`: `normalizeAction` returns `null` for a script whose `runs` is not one of the four, or whose `runs` is `fixed` without a `cwd`; `runs`/`cwd` are stripped from agents and apps.
- Produces in `commandTemplate.ts`: `COMMAND_VARIABLES = ["target"] as const`. Any other `{name}` is refused by `commandProblem`.
- Produces in `commandTemplate.ts`: `commandProblem(command: string, shell?: CommandShell, vars?: TemplateVars, runs?: ScriptRuns): string | null`. For a script (`shell` set): `{target}` is refused when `runs` is `workspace` or `fixed` ("{target} needs a script that runs on any folder or any file"), required when `runs` is `file` ("a file script must use {target}"), optional for `folder`.
- Produces in `commandVars.ts`: `buildCommandVars(ws: Pick<Workspace, "workspaceRoot">): { target: string }` (target is the trimmed root, "" without one). No git info, no host, no tab: `useActionContext` stops calling `useDirGit` and `useSystemInfo`.
- Produces in `actionRun.ts`: `scriptStartFolder(action: Action, ctx: Pick<RunContext, "startFolder" | "folders">): string | undefined`: `folder` gives `ctx.startFolder` else the workspace root; `file` gives the directory of `ctx.vars.target`; `workspace` gives the workspace root; `fixed` gives `action.cwd`. `planScript` blocks with `WORKSPACE_UNSET` when the result is empty for `folder`/`workspace`, runs `scriptCwdProblem` on it, and keeps the tab-reuse logic as is.
- Produces in `actionTargets.ts`: `takes(action: Action): { folder: boolean; file: boolean }` (agent: folder; app: from `accepts`; script: `runs === "folder"` folder, `runs === "file"` file, else neither). `actionTarget`, `inBar`, `inCombo`, `comboCandidate`, `acceptsOnlyFile` are replaced in Task 3, not here; keep them compiling by deriving from `takes` and `runs`.
- Removes `resolveScriptCwd`, `ScriptCwdInput`, `ScriptCwdMode`, `CWD_MODE_LABELS`, the eight old variables and their docs. `commandVariableDocs(action)` lists `{target}` only for apps and for scripts with `runs` of `folder` or `file`.

- [ ] **Step 1: Write failing tests.** `normalizeActions` keeps `[{runs:"folder"}, {runs:"fixed", cwd:"/srv"}]`, drops a script with no `runs`, drops `fixed` without `cwd`. `commandProblem("echo {cwd}", "posix")` is non-null; `commandProblem("open {target}", "posix", undefined, "workspace")` is non-null; `commandProblem("echo hi", "posix", undefined, "file")` is non-null; `commandProblem("open {target}", "posix", undefined, "file")` is null. `planActionRun` for a `file` script with `vars.target = "/p/a b.txt"` returns `new-tab` with `cwd: "/p"` and input containing the quoted path; with `target = "/p/a$b.txt"` returns `blocked`. A `fixed` script uses `action.cwd`; `workspace` without root is blocked with `WORKSPACE_UNSET`.
- [ ] **Step 2: Run** the listed test files; see them fail.
- [ ] **Step 3: Implement** the interfaces above. `actionProblems` (in `actionForm.ts`) reports the `runs`-specific `commandProblem` and the `cwd` problem for `fixed`; its "context" problems (variables without value) disappear because only `target` exists. In `ActionEditDialog.tsx` replace "Run in folder" with a shadcn `RadioGroup` labelled "Where it runs" with four options ("Any folder", "Any file", "Workspace root only", "One fixed folder"), a path input (`INPUT_CLASS`) plus a "Use home folder" button under the last, and show Own button / Inside the combo only for `folder`, `workspace`, `fixed`. A new script draft in `ActionsColumns.tsx` is `{ kind: "script", runs: "workspace", ... }`. `OwnButtonChoice` no longer reads `cwdMode`.
- [ ] **Step 4: Run** `pnpm lint && pnpm check-types && pnpm test`; all pass. Update every old-model test that now fails; do not delete coverage, translate it to `runs`.
- [ ] **Step 5: Docs and commit.** Update the variables, "Run in folder" and "Un script tiene un target unico" passages of `CLAUDE.md`, plus `docs/ARCHITECTURE.md` and `docs/SETTINGS_UI.md`. Commit `Actions: a script declares where it runs and {target} is the only variable`.

### Task 3: One rule decides where an Action is offered

**Files:**
- Modify: `lib/actionTargets.ts`, `lib/actionsBar.ts`, `lib/contextActionEntries.ts`, `lib/useActionsBar.ts`, `RowActionsMenu.tsx`, `ActionsBar.tsx` (`ContextSubmenu`), `ActionRow.tsx`, `AddActionMenu.tsx`, `OwnButtonChoice.tsx`
- Test: `lib/actionTargets.test.ts`, `lib/actionsBar.test.ts`, `lib/contextActionEntries.test.ts`, `ActionsBar.test.tsx`, `ActionsColumns.test.tsx`

**Interfaces:**
- Produces in `actionTargets.ts`: `inHeader(action: Action): boolean` (agent; app that takes folders; script with `runs` of `folder`, `workspace` or `fixed`) and `offeredAt(action: Action, place: "folder" | "file"): boolean` (agent: folder only; app: `takes(...)[place]`; script: `runs === place`). `inBar`, `inCombo`, `comboCandidate`, `actionTarget`, `acceptsOnlyFile`, `appCombos` are deleted; `onBar(action, state)` in `actionsBar.ts` uses `inHeader`.
- Produces in `actionsBar.ts`: `scriptSubtitle(action, ctx)` returns text only for `runs: "workspace"` (the root, or "Workspace root" when `ctx.labels`; `WORKSPACE_UNSET` when the context has no root) and `runs: "fixed"` (the path, start-trimmed); every other Action returns `{ text: null, startTrim: false }`. `actionSubtitle` and the `{cwd}`/`{filepath}` words in `SETTINGS_LABELS` are removed (keep the `labels` flag).
- Produces in `actionsBar.ts`: `actionAvailability` returns `WORKSPACE_UNSET` for agents, folder-taking apps, and `folder`/`workspace` scripts when the root is empty; `scriptCwdProblem(action.cwd)` for `fixed`; a `file` script is only available with a file target.
- `BarModel.contextCombo` keeps its shape. It is filled with `offeredAt(action, kind)` where `kind` is the focused tab's `"folder"` (terminal, with the agent worktree applied through `inWorktree`) or `"file"`; items are built with the focused folder or file as `runTarget`, so an agent started from the submenu goes through `runOverlayFor(folder, "folder")` and starts there, and a file script gets `vars.target` and the file's folder.
- `contextActionEntries` uses `offeredAt` for scripts and keeps its muted app rows; agents get no subtitle (already done), scripts follow `scriptSubtitle`.

- [ ] **Step 1: Write failing tests.** A table test over `offeredAt` and `inHeader` for one Action of each kind and each `runs`/`accepts` value, asserting exactly the matrix in the spec ("What is shown where"). `buildActionsBarModel` with a focused terminal: `contextCombo.workspace` contains the agent, the folder-taking app and the `folder` script, not the `file` script; with a focused file: the file-taking app and the `file` script. `scriptSubtitle` returns null for `folder` and `file` scripts and the path for `fixed`. `contextActionEntries` for a file row lists a folders-only app as `enabled: false, reason: "takes folders only"`.
- [ ] **Step 2: Run** the listed test files; see them fail.
- [ ] **Step 3: Implement** the interfaces above; `ContextSubmenu` already renders `contextCombo`, so its component needs only the new empty-state text ("No folder Actions yet" / "No file Actions yet") if it changed. Remove the dead helpers from the old target rules and their tests. In `ActionEditDialog.tsx` list the app switches as Open folders first, then Edit files (`ACCEPTS_SWITCHES` order).
- [ ] **Step 4: Run** `pnpm lint && pnpm check-types && pnpm test`; all pass.
- [ ] **Step 5: Docs and commit.** Rewrite the Header bar, context menu and "What an app opens" passages in `docs/ARCHITECTURE.md` from the spec tables; update the matching `CLAUDE.md` glossary text. Commit `Actions: one rule lists an Action in the Header, the focused-tab submenu and the context menus`.

### Task 4: Glossary and manual check

**Files:**
- Modify: `CLAUDE.md` (Action row), `docs/ARCHITECTURE.md`, `docs/SETTINGS_UI.md`, `docs/FORK.md` if it lists the old variables

- [ ] **Step 1: Re-read** the Action row of `CLAUDE.md` end to end and remove every remaining mention of `{cwd}`, `{workspace}`, `{filepath}`, `Run in folder`, `appId`, `iconId`, `ownedAfterEdit`, `inBar`, `inCombo`; the row should now describe the three kinds, the four script places and `{target}`. Run `grep -n "cwdMode\|appId\|iconId\|{cwd}\|{filepath}" CLAUDE.md docs/*.md src -r` and expect no hit outside tests that assert their removal.
- [ ] **Step 2: Manual check** with `pnpm tauri dev` (fresh process, no HMR leftovers): create one script of each place; confirm the Header and the submenu of a focused terminal and of a focused file list exactly the spec matrix; Claude and Claude with Yolo show names; the file `a b.txt` runs a file script in its folder.
- [ ] **Step 3: Commit** `Docs: describe the simplified Action model`, merge the branch into `main`, remove the worktree.
