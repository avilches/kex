# Actions: one model, one variable, one icon field

## Why

Actions (agents, scripts, apps) have grown three overlapping systems that the user has to understand at once:

- A script decides where it is offered from the variables its command uses (`{cwd}`, `{dir}`, `{branch}`, `{repo}` make it a folder script, `{filepath}` and `{filename}` a file script, `{workspace}`, `{host}` or nothing a workspace script), and separately chooses where it runs (`Run in folder`: Home, Workspace root, Current tab folder, Absolute path). The two can contradict each other (a `{filepath}` script with a fixed folder), and neither is evident from the edit modal.
- Eight variables are injected into scripts. Most users need none of them.
- The identity of an Action lives in three fields (`appId`, `iconId`, `icon`). Editing a command clears `appId` and copies it into `iconId`, which is why two Claude agents, one with Yolo, render differently in the Header (one icon only, one with its name).
- The focused tab, the context menus and the Header each decide what to list with slightly different rules, so the submenu of a focused terminal is empty for most users while the right-click menu of the same terminal is full.

Goal: configuring an Action is obvious, and what is shown afterwards follows from that configuration with no hidden rules.

## Goals

1. Every Action has one clear answer to "what does it act on", chosen from a short closed list that the edit modal offers according to its kind. Nonsense combinations cannot be expressed in the UI and are rejected by `normalizeAction`.
2. One variable, `{target}`, for apps and for scripts that act on a folder or a file.
3. The Header, the submenu of the focused tab and the context menus list Actions by the same rule, from the same function.
4. One icon field. Editing a command never changes how an Action looks.
5. The second line under a name appears only when it tells something the menu does not already say.

## Non-goals

- No change to agent seeding, the Yolo checkbox, app detection or the app catalog.
- No change to drag and drop rules, scopes (workspace and global), the Add combo structure, the palette modes, or hibernation.
- No migration, shim or fallback for the old fields. Saved Actions that do not fit the new shape are dropped by `normalizeAction`; users start from the defaults (project rule: no backwards compatibility).

## Anti-goals

- A user must never be able to run a script in an arbitrary folder by accident. Running somewhere specific is an explicit choice, made once.
- An agent must never be configurable as a file editor, an app as a script place, and so on. The modal offers each kind only what makes sense for it.

## The model

### What an Action acts on

| Kind | What it can act on | How the user chooses |
|---|---|---|
| agent | folders, always | nothing to choose |
| app | folders, files or both (`accepts`, as today) | two checkboxes, in this order: Open folders, Edit files; at least one stays checked |
| script | exactly one of four places | a radio group "Where it runs" |

The four places of a script (`runs`):

1. **Any folder** (`folder`): offered in the Header, acting on the workspace root, and in every folder menu (explorer row, folder segment of the path bar, terminal tab, submenu of a focused terminal), acting on that folder. It runs in the folder it is offered at. `{target}` is that folder.
2. **Any file** (`file`): offered in every file menu (explorer row, editor tab, file segment of the path bar, submenu of a focused file). It runs in the folder that contains the file. `{target}` is the full path of the file. Never in the Header.
3. **Workspace root only** (`workspace`): offered in the Header, runs in the workspace root. No variable. Never in a context menu.
4. **One fixed folder** (`fixed`): the user picks the path once; offered in the Header, runs there. No variable. Never in a context menu. The old "Home" becomes this option with `~`.

Default for a new script: **Workspace root only**.

### Variables

Only `{target}` exists.

- Apps: `{target}`, as today (the folder or file they open; the workspace root in the Header).
- Scripts with `runs` of `folder` or `file`: `{target}` is allowed and optional (a folder script that only runs `pnpm install` does not need it, because it already runs in the folder).
- Scripts with `runs` of `workspace` or `fixed`, and agents: no variable. `{target}` is rejected with a clear message from `commandProblem` ("{target} needs a script that runs on any folder or any file"). Agents keep treating braces as literal text.
- `{cwd}`, `{dir}`, `{branch}`, `{repo}`, `{workspace}`, `{filename}`, `{filepath}` and `{host}` are removed everywhere: the command template parser, `buildCommandVars`, the variable list in the edit modal, the Settings labels (`SETTINGS_LABELS`), the docs. A command that uses one is rejected as unknown at save time and at run time. A user who wants the branch writes `git branch --show-current` in the command.

### Identity and icon

The three fields `appId`, `iconId` and `icon` collapse into `icon`, with the existing shapes `app:<id>`, `agent:<id>` and `glyph:<name>`.

- The icon is set when the Action is created from a preset, and changes only when the user picks another one (picker in the modal header, as today). Editing the command never touches it.
- `ownedAfterEdit` is removed. "Is this Action an installed preset" stays a computed question: `presetOf(action)` compares kind and command, as it does today. It is never stored.
- A button of the Header shows only its icon when it is an agent whose icon is an `agent:<id>` logo and no other button of the bar has the same icon. A glyph, or a logo shared with another button, keeps the name. Result: Claude and Claude with Yolo (same logo) both show their name; a lone Codex shows the icon.

## What is shown where

One function builds the entries of every place; the places only differ in the folder or file they pass in. It extends `contextActionEntries`.

| Place | Folder | File |
|---|---|---|
| Header (buttons and Actions menu) | agents; apps that open folders; scripts `folder`, `workspace`, `fixed`; all act on the workspace root except `fixed` | none |
| Submenu of the focused tab at the top of the Actions menu | terminal focused: the folder of the terminal (or its worktree); same entries as the context menu of that tab | editor, markdown, git-diff or git-commit-file focused: its file; same entries as the context menu of that tab |
| Context menu of a folder row or tab | agents (started in that folder); apps that open folders; scripts `folder` | |
| Context menu of a file row or tab | | apps that open files; scripts `file` |

- In a context menu, an app that cannot open that kind of row appears muted with "takes folders only" or "takes files only", as today. The submenu of the focused tab is the same menu as the right-click menu of that tab, so it shows the same muted rows.
- The submenu is a single entry named after the folder or file. With nothing focused that offers a folder or file it is grey with the reason; with a folder or file but no Action for it, grey with "No folder Actions yet" or "No file Actions yet". It no longer depends on the old `BarModel.contextCombo` rules.
- Own buttons: agents and scripts of the Header (`folder`, `workspace`, `fixed`) may have one. Apps never do (already implemented). Scripts of `file` never do.
- A script `folder` in the Header with no workspace root is grey with "A workspace root is needed" and a click leads to the root picker (`fixRoot`), like today. `workspace` is the same. `fixed` is validated with `scriptCwdProblem`.

### Second line under the name

| Action | Header, menus, palette, Settings |
|---|---|
| agent | none |
| app | none (the hover says what it opens) |
| script `folder` or `file` | none: the place already says where it runs |
| script `workspace` | the workspace root path (in Settings: "Workspace root") |
| script `fixed` | the fixed path |

## The edit modal

Order: scope (This workspace / Global) and icon button next to the title, then:

- agent: name, command, Yolo when known, Own button / Inside the combo.
- app: name, command, "What it opens" (Open folders, Edit files), a note saying where it lives (Actions menu; submenu of the focused file; or both). No Own button.
- script: name, command, "Where it runs" radio (the four places, with a path picker under "One fixed folder"), the variable list (`{target}` only, and only for `folder` and `file`), Own button / Inside the combo when the place allows a button.

The Add combo, the Settings rows and the palette read the second line from the table above.

## Constraints

- Project rules apply: no migration code, no em-dash, no emojis, ids through `nid()`, shortcuts untouched, comments only for the why.
- New or changed logic is pure and dependency-light (`actionTargets.ts`, `actionsBar.ts`, `contextActionEntries.ts`); React components stay thin.
- Settings controls are shadcn (`RadioGroup`, `Checkbox`), inputs use `INPUT_CLASS` (`docs/SETTINGS_UI.md`).
- A change to a core subsystem needs a test that locks the invariant. Required invariants: a script's `runs` decides the places it is offered and nothing else; unknown variables are rejected; an agent never gets file entries; an app is never a button; icon is unchanged by editing the command; two agents with the same logo never render icon-only.
- Docs updated in the same commit as the code: `CLAUDE.md` (the Action row of the glossary, which shrinks a lot), `docs/ARCHITECTURE.md` (Header bar, What an app opens, Context menus, Action model table), `docs/SETTINGS_UI.md`, `docs/FORK.md` if the divergence list mentions variables.

## Left to the builder

- Exact field names (`runs`, `cwd` for the fixed path) and the shape of the new `Action` type; delete `ScriptCwdMode`, `cwdMode`, `appId`, `iconId`, `commandVariablesUsed` branches and the helpers only they used.
- Whether `BarModel.contextCombo` survives as a thin adapter over the shared function or is removed.
- How the run overlay (`runOverlayFor`) passes the folder or file for scripts, reusing what apps already do with `{target}`.
- Splitting into atomic commits: model and `normalizeAction` first, then the shared listing function, then the modal, then the icon field, then docs. Each commit keeps lint, types and tests green.

## My calls (flag if you disagree)

- Default for a new script is "Workspace root only".
- Scripts `folder` and `file` allow `{target}` but do not require it.
- Scripts `workspace` and `fixed` show a second line; `folder` and `file` do not.
- The submenu of the focused tab reuses the context menu of that tab, including muted app rows.
- Old Actions that do not fit the new shape are dropped, not repaired.
- An icon-only Header button is limited to agents with an `agent:` logo that is unique in the bar.
