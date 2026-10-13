# Agent session restore

When Kex closes while a Claude Code session is running, the session id and working directory are persisted so the
session can be resumed automatically on the next launch. This document describes the full design: hook architecture,
store format, restore algorithm, frontend integration, and error handling.

---

## Overview

The feature has three cooperating parts:

1. **Hook layer (bash + Claude Code)** — writes session records to disk when a session starts.
2. **Rust restore planner** (`agent_session_restore_plan`) — reads the store at launch, resolves cwd from the JSONL
   transcript, and returns a list of `RestorePlan` entries.
3. **Frontend consumer** (`agentSessionRestore.ts` + `useTerminalSession`) — loads the plan once at app start,
   injects the resume command into the terminal after the PTY opens, and updates the tab UI.

---

## Hook layer

### Prerequisites

Claude Code hooks are installed by `agent_enable_claude_hooks`. The `agentNotifications` preference in Settings
(General > Coding agent notifications) is the master control: enabling it calls `agent_enable_claude_hooks`; disabling
it calls `agent_disable_claude_hooks`. Both commands are idempotent. On every startup, if `agentNotifications` is
true, `agent_enable_claude_hooks` is called silently to repair any missing or outdated hooks.

### KEX_TAB_ID

Every PTY session receives a `KEX_TAB_ID` environment variable (a UUID matching the tab's id in the workspace
state). This is injected in `pty/shell_init.rs` → `apply_common` and is available to all processes running inside the
terminal, including hook scripts.

### SessionStart hook

Triggered by Claude Code at session start. The hook command:

```
[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" || true  # kex-session-hook
```

The script (`~/.config/kex/hooks/trigger-event.sh`, marker: `kex-session-v6`) handles all 10 registered Claude Code
hook events the same way:

1. Reads `KEX_TERMINAL` and `KEX_TAB_ID` from the environment. If either is unset, exits silently (tab is not
   managed by Kex).
2. Reads the full JSON payload from stdin and extracts `hook_event_name` via `jq`, only to pick the handler.
   `jq` is not used to build anything downstream. The script no longer writes the payload to disk: an earlier
   version dumped it unbounded to `/tmp/kex-hook-<event>.log` and `/tmp/kex-tab-<tab_id>.log` for field discovery,
   which on a multi-user Linux box was readable by other local users, a `/tmp` symlink-attack target, and grew
   without rotation (TASK-557); removed with no replacement since nothing depended on it.
3. Forwards the JSON payload byte for byte, unmodified, to the socket at `$KEX_IPC` (`send_ipc`): `nc -w 1 -U`,
   falling back to a small inline `python3` script if `nc` is missing or the connection fails. If both fail, or
   `KEX_IPC` is unset, the event is silently dropped (`|| true`); there is no retry or spool (TASK-730).
4. `pty/ipc.rs::run_listener`, one thread per PTY listening on `kex-ipc-<pid>-<pty_id>.sock`, reads the JSON
   directly with `serde_json`. For `SessionStart` it calls `session_store::record_session(...)` and emits
   `kex:agent-session-meta`; for every other event (`UserPromptSubmit`, `Notification`, `Stop`, `StopFailure`,
   `SessionEnd`, `PermissionRequest`, `MessageDisplay`, `SubagentStart`, `SubagentStop`) it emits `kex:agent-signal` directly with a `kind` matching
   the event name. None of this goes through `agent_detect.rs` or its OSC byte-level state machine.

Only `SessionStart` calls `session_store::record_session` today. The payload carries a `source` field
(`startup|resume|clear|compact`, see the field-discovery comment in `agent/mod.rs`), so a session opened via
`claude --resume` also fires `SessionStart` and gets recorded through the same path; there is no separate
`UserPromptSubmit`-based recording in the live mechanism.

Sessions are cleared from the store only when the agent process exits (the `exited` signal, from `OSC 133;D`, which
`AgentNotificationsBridge.tsx` turns into `agent_detach_session`; the rule lives in `lib/sessionEndPolicy.ts`).
The same signal removes the session shown in the panel and the agent icon of the tab (`agentStore.finish`); the one
predicate `endsAgentSession` decides both. `StopFailure` still raises its error notification but leaves the session
idle, and `SessionEnd` changes nothing, so `/clear` and `/resume` keep the icon and the next `SessionStart` updates its
meta (TASK-792).
`StopFailure` and `SessionEnd` deliberately do not clear the record: the first is just a failed turn, and the second is also
emitted by `/clear` and `/resume`, which keep the process alive. Claude Code only emits `SessionStart` on launch,
resume and `/clear`, so a record dropped while the process is still running would never be written again and the
tab could no longer be restored (TASK-790). Panels typically close while in idle state because the webview is
destroyed before the PTYs finish shutting down, so a single store file is sufficient.

### Launch command capture

The original CLI invocation is captured from `OSC 133;C;<cmd>` (the shell integration "command started" signal).
Because `OSC 133;C` fires in the PTY reader thread while `SessionStart` arrives on its own Unix socket thread,
the command is bridged through a thread-safe stash:

1. **PTY reader thread** (`session.rs`): `Transition::Started { cmd_string }` is emitted (from `agent_detect.rs`,
   still driven by the real `OSC 133;C` byte). If `cmd_string` is non-empty, `session_store::stash_cmd(tab_id,
   cmd_string)` stores it in a `Mutex<HashMap<tab_id, cmd>>`.
2. **Unix socket listener** (`pty/ipc.rs::dispatch`, on `SessionStart`): calls `session_store::record_session(...)`,
   which internally calls `take_stashed_cmd(tab_id)` to consume and remove the entry. The value becomes
   `SessionRecord::launch_cmd`.

The stash is keyed by `tab_id`; entries are consumed exactly once and are not visible across tabs.

### CLAUDE_CONFIG_DIR support

If `CLAUDE_CONFIG_DIR` is set, `load_restore_plan()` searches for JSONL transcripts under that directory instead of
`~/.claude/`.

---

## Session store

`~/Library/Application Support/app.betauer.kex/agent-sessions.json`

```json
{
  "version": 1,
  "tabs": {
    "<tabId>": {
      "agent": "claude",
      "session_id": "<claude-session-id>",
      "cwd_launch": "/home/user/project",
      "transcript_path": "/home/user/.claude/projects/.../session.jsonl",
      "launch_cmd": "claude --safe-mode --add-dir /extra",
      "title": "fixing the build",
      "notification": "attention",
      "updated_at": 1718000000
    }
  }
}
```

`launch_cmd` is optional (`skip_serializing_if = "Option::is_none"`). It captures the original CLI invocation from
`OSC 133;C` so it can be replayed on restore with only the flags that make sense for an interactive session (see
*Command stripping* below). Absent for sessions created before this feature or without shell integration.

`title` and `notification` are optional too. `title` is the name the tab showed (the title the agent sent over OSC,
else the session title); `notification` is the kind (`attention`, `finished` or `error`) of the notification the tab
still had unread. Neither comes from the hooks: the frontend reports them through `agent_session_set_snapshot`
(see *Name and notification* below). A later `SessionStart` rewrites the record but keeps both when the session id is the same (a resume keeps it; `/clear` or an agent launched by hand brings a new one and starts clean). An empty title
never overwrites the stored one, because titles go empty while the app closes.

Initialized via `session_store::init(data_dir)` in `lib.rs` `setup()` using a `OnceLock<PathBuf>`.

Supported agent values: `"claude"`, `"codex"`, `"gemini"`. Unknown values produce an empty `resume_cmd`.

---

## Rust restore planner

`src-tauri/src/modules/agent/session_store.rs` — `load_restore_plan() -> Vec<RestorePlan>`

### Algorithm

For each session in the store:

1. **Find the JSONL transcript.** Checks the stored `transcript_path` first, then globs
   `~/.claude/projects/**/<sessionId>.jsonl` (or `CLAUDE_CONFIG_DIR`).
2. **JSONL missing — reattach with `--session-id`.** If the transcript does not exist, the session was opened but
   no message was ever sent (the JSONL is only created on the first exchange). Rather than silently discarding the
   session, the plan is generated using `claude --session-id <id>`, which starts a *new* session that reuses the
   same UUID — equivalent to what Claude would have done had the user run it again without `--resume`. The stale
   store entry is removed now; if the session produces messages, hooks will re-record it with the new
   `transcript_path`.
3. **Read the launch cwd.** Opens the JSONL with `BufReader` and reads only as many lines as needed. If a
   `worktree-state` entry with a non-null `worktreeSession` comes first (Claude Code writes it before the first entry
   with a cwd), its `originalCwd` is used: it is where the command was launched from, while the `cwd` of the entries is
   the worktree, which may be deleted by restore time. Otherwise the first `cwd` field is used, and `cwd_launch` from
   the store if the transcript has none.
4. **Verify the directory is usable** (`launch_dir_problem`: missing, not a folder, or unreadable). If it is not, the
   plan carries a non-empty `error_reason`, an empty `resume_cmd`, and the command that would have run in
   `attempted_cmd`. The terminal does not start: the tab is held on a modal (see "Blocked start" below). The store
   entry is kept, including when the transcript is also missing (the `--session-id` entry is only dropped once the
   directory check passes), so "Try again" can still find the session; it goes away when the agent exits, the tab is
   closed, or the user cancels the restore.
5. **Build the command.**
   - JSONL found: if `launch_cmd` is present, `strip_for_resume_base(launch_cmd) + --resume <id>`;
     otherwise `claude --resume '<id>'` / `codex resume --last` / `gemini --resume '<id>'`
   - JSONL missing (claude only): if `launch_cmd` is present, `strip_for_resume_base(launch_cmd) + --session-id <id>`;
     otherwise `claude --session-id '<id>'`
   - others/unknown: empty string (tab shows restore error)

The PTY is spawned with `plan.cwdLaunch` as the initial working directory, so no `cd` prefix is needed in the command.

### Command stripping

`strip_for_resume_base(cmd)` is a whitelist-based arg filter. It keeps flags that remain meaningful for an
interactive resume and drops one-time flags (e.g. `--worktree`, `--from-pr`, `--tmux`, `--model`, `--effort`).

Flags kept as boolean (no value):
`--allow-dangerously-skip-permissions`, `--dangerously-skip-permissions`, `--safe-mode`, `--bare`, `--verbose`,
`--no-chrome`, `--chrome`, `--ide`, `--strict-mcp-config`, `--exclude-dynamic-system-prompt-sections`,
`--disable-slash-commands`, `--brief`

Flags kept with their value(s):
`--add-dir`, `--agent`, `--agents`, `--allowedTools`/`--allowed-tools`, `--disallowedTools`/`--disallowed-tools`,
`--name`/`-n`, `--permission-mode`, `--mcp-config`, `--settings`, `--setting-sources`,
`--append-system-prompt`, `--system-prompt`, `--tools`, `--plugin-dir`, `--plugin-url`, `--betas`

`--model` and `--effort` are intentionally excluded: they are configurable in-session via `/model` and do not need
to be replayed on resume. Any flag not in either list is dropped along with any immediately-following non-flag value
tokens.

Limitation: multi-word values containing spaces (e.g. `--system-prompt "hello world"`) split into separate tokens.
This edge case is not handled; the overwhelming majority of real invocations use single-token values.

### Print-mode filtering

Sessions started with `-p` / `--print` are non-interactive and transient. `record_session` checks the stashed
`launch_cmd` via `is_print_mode_cmd` and silently skips recording if the flag is present. The stash is also cleared
in `agent_detect.rs` at the `OSC 133;C` stage — `is_print_mode` returns early before arming the detector.

### RestorePlan type

```rust
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub tab_id: String,      // → "tabId" on the wire
    pub agent: String,
    pub resume_cmd: String,    // → "resumeCmd" on the wire; empty signals error
    pub attempted_cmd: String, // → "attemptedCmd"; the blocked command, only set with error_reason
    pub cwd_launch: String,    // → "cwdLaunch" on the wire
    pub error_reason: String,
    pub title: Option<String>,
    pub notification: Option<String>,
}
```

`rename_all = "camelCase"` is required — the frontend Map is keyed by `tabId` and would silently miss all sessions
if it received `tab_id` instead.

### Single-tab preview

`preview_resume_cmd(tab_id) -> Option<RestorePlan>` computes the same `RestorePlan` for one tab on demand, backing the
`agent_session_preview_cmd` command. It shares `build_plans_from` with `load_restore_plan`, but calls it with
`store_path: None`, which skips every `remove_panel_from_store` call in that function — so, unlike
`load_restore_plan`, it never mutates `agent-sessions.json` and can be called repeatedly while a session is live (e.g.
each time the "Command" submenu opens) without racing the real startup restore.

---

## Frontend integration

### agentSessionRestore.ts

`src/modules/agents/lib/agentSessionRestore.ts`

Loaded once at app start (`App.tsx`) via `loadRestorePlans()`, which calls `agent_session_restore_plan` and stores the
result in a module-level `Map<tabId, RestorePlan>`. `consumeRestorePlan(tabId)` returns and deletes the plan for a
given tab — consume-once semantics prevent double injection.

`previewResumeCmd(tabId)` is a separate, non-consuming call to `agent_session_preview_cmd`, used on demand by
`RunOnStartMenu` to show what will actually run on the *next* launch (see "Terminal path bar UI" below), and by
`useWorkspaces.ts`'s `reopenClosed` (see "Reopening a closed terminal tab" below). It reads `agent-sessions.json`
fresh each time and never mutates it, unlike `load_restore_plan`.

`seedRestorePlan(tabId, plan)` inserts a plan into the same module-level map `loadRestorePlans` populates, keyed by
whatever tab id the caller chooses. It exists so a plan fetched on demand (from `previewResumeCmd`) can still be
consumed through the one normal path, `consumeRestorePlan`.

### useTerminalSession.ts

`attachSession` calls `startLeaf`, which waits for the plans, consumes the one for the tab and asks the pure
`decideStart` (`restoreStart.ts`) what to do, before any PTY exists:

```
decision = decideStart(plan, persistentCommand, initialCwd, dirProblem)
  spawn + resume   -> open PTY at plan.cwdLaunch, then:
                      stageRestoredSnapshot(leafId, plan)   // name + notification, applied later (see below)
                      writeWhenShellReady(pty, " " + plan.resumeCmd + "\r")
  spawn + command  -> open PTY at initialCwd, writeWhenShellReady(pty, persistentCommand + "\r")
  spawn + none     -> plain shell
  blocked          -> no PTY; session.restoreBlock = { reason, dir, command, agent?, restorable }
```

`dirProblem` comes from the `check_launch_dir` command and is only asked for a saved command without an agent plan
(`needsDirCheck`); an agent plan already carries its verdict from Rust.

### Blocked start

A start that cannot happen (unusable directory, or `openPty` rejecting) leaves the session without a PTY and sets
`restoreBlock`. `TerminalPane` then renders `RestoreBlockedOverlay` over that tab's content only, never over the pane
or its tab bar, showing the reason, the directory and the command. `attachSession` does not retry while the block is
set. For an agent plan the tab also gets the `restoreError` placeholder (the `⚠` icon).

- **Try again** (`retryRestore`): clears the placeholder, fetches a fresh plan with `previewResumeCmd`
  (read-only, so the store entry survives a second failure), seeds it, and runs `startLeaf` again. Useful when the
  directory lives on a volume that was not mounted yet. The modal stays up while it works: `startLeaf` clears it on
  success or replaces it with the new block on failure.
- **Retry feedback** (`restoreBusy.ts`): `retryRestore` and `retryPendingRestore` run inside `withRestoreBusy`, a
  per-leaf counter that stays on for at least 1500ms (`MIN_BUSY_MS`) so a fast retry does not just flicker. While it is
  on, the tab swaps its indicator for a spinner (any terminal tab, with or without an agent; larger than the
  working-agent one so it is noticed) and the modal disables both buttons and shows a spinner inside Try again. When
  the retry ends they come back; if the plan is still pending the tab goes back to the red dot. The indicator choice is
  the pure `tabStatusIndicator` (`workspaces/lib`): a tab with a pending restore shows the red dot even without an
  agent session.
- **Open terminal without restoring** (`openWithoutRestoring`): opens a plain shell, in `initialCwd` when that is
  usable and in the shell's default directory otherwise. It deletes nothing: the plan stays in `agent-sessions.json`
  (or in the tab's `persistentCommand`), so it survives the plain shell and a Kex restart (the in-memory pending state does
  not: the next launch blocks again and rebuilds it), and that launch tries again. The modal says so ("The restore plan is kept...").

A PTY open failure (`openFailureBlock`, `restorable: false`) has no terminal to continue in, so its modal shows only
Try again, without the hint, and leaves nothing pending. Every other block is `restorable: true`.

#### Pending restore

A pending restore is a restore plan that has not run and was not deleted. `blockStart` registers each restorable block
in `pendingRestore.ts` (`setPendingRestore`, read in React with `usePendingRestore(leafId)`), apart from
`Session.restoreBlock`, which is the modal and goes away when the user opens a plain shell. It is cleared when a start
finally runs the plan, on Retry restore success, and on Discard restore plan.

The `Run on Start` submenu (`RunOnStartMenu`) reacts to it:

- The submenu trigger turns red (`text-destructive`).
- The `Enabled` checkbox is not rendered (`runOnStartSections`): it makes no sense while a plan waits.
- A "Restore pending" block (only its title is red) shows the reason and the command as it will be typed in the
  normal text colour, two selectable mono lines: `cd <dir>` and the command. It replaces the old red error text of
  the agent preview.
- **Retry restore** (`retryPendingRestore`): works in the live shell. It rechecks the directory (a fresh plan with
  `previewResumeCmd` for an agent, `check_launch_dir` for a saved command). If the problem persists the block stays
  pending with the new reason and a `Restore still failing` toast shows it (the menu is already closed); if the plan is
  gone it just clears; otherwise it types
  ` cd <dir> && <command>` (joined with `; ` on Windows, where PowerShell 5.1 has no `&&`) once the shell is ready.
  A rejection is logged with `console.error`. If the menu is opened while the modal is still up (no shell yet), the
  action runs the modal's Try again instead of doing nothing.
- **Discard restore plan** (`discardPendingRestore`): the only place besides agent exit and tab close that deletes the
  agent entry from the store. For a saved command (no agent) it only forgets this start; `persistentCommand` is kept,
  so the next launch tries it again.

Guards (`retryPendingFlow` / `discardPendingFlow` in `restoreStart.ts`):

- Launching an agent by hand in the plain shell clears the pending restore: a running session replaces the placeholder
  (`isRunningAgentSession`) and `useTerminalSession` subscribes to the agent store to drop the pending entry. Retry and
  Discard also check it, so Retry never types a resume line into a shell already running an agent and Discard never
  deletes the record of a live session. They only remove a restore-error placeholder (`clearRestoreError`).
- A second Retry activation while one is in flight is ignored, so the command is not typed twice.
- When Retry finds the problem persists for an agent plan, the tab's warning placeholder is refreshed with the new
  reason so its tooltip matches the menu.

`restoreBlock` reaches React through `useSyncExternalStore` over a per-leaf listener map.

`writeWhenShellReady` waits for the `kex:shell-ready` event of that PTY (the first `OSC 133;B`, which the shell only
emits when it actually renders its interactive prompt; `133;A` is not usable because the init scripts call
`_kex_precmd` once by hand while still sourcing the rc file) and only then writes. A 1500ms fallback covers shells
without Kex integration. A fixed delay was unreliable: the resume command of the first PTY opened at startup was
silently lost (see `WORKSPACES_GOTCHAS.md`, Bug 14). The same wait applies to a plain `persistentCommand`.

### Name and notification

A restored tab used to lose the name the agent had given it (the agent only resends it when the tab gets focus) and
whether it had a notification waiting. `startAgentSnapshotSync` (`agentSnapshotSync.ts`, mounted by
`AgentNotificationsBridge`) watches `agentStore` and the OSC title store and, 1.5s after the first change of a burst, sends
every agent tab whose snapshot changed (`changedSnapshots` in `agentSnapshot.ts`, pure) to
`agent_session_set_snapshot` together with the session id it captured (Rust ignores the write when the record belongs to another session, e.g. after `/clear`; a session whose id is not known yet waits for the next pass). The notification is the kind of the tab's unread bell entry, else `attention` if
the session carries the amber dot, else empty (which clears it).

On restore, `useTerminalSession` calls `stageRestoredSnapshot(leafId, plan)` when it injects the resume command. The state is
applied by `applyStagedSnapshot` on the first agent signal of that tab (`ensureSession`/`ensureSessionIdle` in the
bridge, which run for the shell-integration `started` signal as well as for hook signals, whether or not the session
already exists), not earlier: a shell that sets its own terminal title would overwrite the name, and the notification
needs a session to attach to. It sets the OSC title, pushes the bell entry and, for `attention`, raises the amber dot,
all silently (no toast, no OS notification). A staged snapshot expires after 90 seconds (`STAGED_SNAPSHOT_TTL_MS`): if the resume failed and the user starts an agent by hand in that tab much later, it must not inherit the old name and notification. If the user is already looking at that tab the bridge marks it seen.

### Reopening a closed terminal tab

"Reopen Closed Tab" (`tab.reopenClosed` in `useWorkspaces.ts`) reuses this same consumption path instead of
duplicating it. A reopened tab gets a brand new id, so it can never find a match in the startup-loaded
`restorePlans` map on its own. Before creating the new tab, `reopenClosed` calls `previewResumeCmd` with the id the
*closed* tab had (available on the captured `ClosedEntry`, gated by `needsResumePlanLookup` so a tab with "Run on
start" off never bothers) and, if a plan comes back, seeds it into the same map under the *new* tab's id via
`seedRestorePlan`. From there `useTerminalSession.ts` cannot tell the difference: it consumes the seeded plan
exactly like one loaded at launch, same `cwdLaunch`, same 200ms injection delay, same `restored`/`restoreError`
states.

This is a fresh lookup, not a cached one: whether the resume command ends up as `--resume <id>` or
`--session-id <id>` depends on whether the JSONL transcript exists yet, which can change between the moment the
tab is closed and the moment it is reopened. Caching the computed command at close time could go stale; caching
only the tab id (already needed to close/reopen at all) and recomputing on demand cannot.

The tab's own entry in `agent-sessions.json`, still keyed by the *old* tab id, is left alone by this path (
`previewResumeCmd` never mutates the store). It becomes an orphan once the resumed session's `SessionStart` hook
writes a fresh record under the new tab id, and is cleaned up the same way any other orphaned entry is: by
`agent_session_restore_plan` on the next app launch.

---

## Terminal path bar UI

Session metadata that was previously accessible from the floating tab HoverCard (which has been removed) is now
surfaced in the `[...]` DropdownMenu (`TerminalPathBarMenu`) in the right side of `TerminalPathBar` (tab id and agent
session details). "Run on start" lives in the tab context menu (`RunOnStartMenu`, used by `TabContextMenuItems`), as a
`Run on Start` submenu with an `Enabled` checkbox and the command field inline (no third submenu). The path bar has no run-on-start icon; while
an agent is alive the agent icon of the tab (struck through when it is off) says it, and the path bar shows no status
dot either, only the model name, because the tab icon already carries the working and attention states.

- **Enabled** checkbox: toggles `restoreOnRestart` on the panel. For agent sessions it defaults to checked
  and enabling it captures the current running command as the `persistentCommand` if none is already set — this is only
  a fallback default now (see below), not what normally gets shown or run.
- **Command preview**: for a tab with a live agent session, this is a *live, read-only* preview of the resume command
  that will actually run on the next Kex launch, fetched from `agent_session_preview_cmd` (via `previewResumeCmd`) when
  the menu opens and whenever the session id changes (e.g. after `/clear`). It is computed the same way as the startup
  restore plan — `claude --resume <id>` once the JSONL transcript exists, `claude --session-id <id>` before that — so it
  always matches what will actually be injected; it is not the `persistentCommand` field and cannot be edited. If the
  tab has no agent session (a plain "Run on start" command like `lazygit`), or an agent session with no matching entry
  in `agent-sessions.json` (e.g. `agentNotifications` was disabled), the inline field is an editable input instead (disabled while `Enabled` is off). Without a manual edit it follows the
  command running in the terminal and writes it to `persistentCommand` while the menu is open; once the user types a
  value it is kept (`persistentCommandManual: true`), and clearing the field makes it follow the terminal again
  (`modules/terminal/lib/runOnStartCommand.ts`). This replaces the previous behaviour where the input always showed
  `persistentCommand`: a value captured once from the currently running command the first time the checkbox was
  toggled on, then frozen forever, unrelated to the id/transcript-based command the app actually resumes with.

  **Exiting and restarting the agent in the same tab** also refreshes the preview, through the existing session
  lifecycle rather than anything preview-specific: when the agent process exits, `kex:agent-signal` fires `"exited"`
  (`AgentNotificationsBridge.tsx`), which calls `store.finish(tabId)` — deleting the session from `agentStore`
  entirely, not just clearing it — and `agent_detach_session`, which removes the tab's entry from
  `agent-sessions.json`. If the menu happens to be open at that exact moment, `agentSession` becomes `null` and the
  preview falls back to the plain editable input, per the case above. When a new agent starts in the same tab, its
  `SessionStart` hook writes a fresh entry (new `session_id`) and emits `kex:agent-session-meta`, which updates
  `sessions[tabId].meta.sessionId`; the preview effect depends on that value, so it refetches and shows the new
  session's command. The only edge case is a menu left open across the exact moment of the switch: it can flicker
  through empty → editable fallback → "…" loading → the new command, before settling. With the menu closed during
  the switch (the common case) and reopened after, only the final, correct command is ever shown.
- **Session id** (agent sessions only): shown read-only; click to copy.
- **Transcript** (agent sessions only): Reveal in Finder. Existence is checked lazily on menu open via `fsStat` so
  there is no up-front IPC cost.
- **Started elapsed**: how long ago the session started.
- **Restore error**: shown when `restoreError` is set on the session (e.g. the resume command failed or the cwd was
  deleted; the tab is also held on the "Blocked start" modal). The tab title turns red and a `⚠` icon appears; the menu surfaces the error reason for diagnosis. The session with `restoreError` is only a placeholder: when
  the user launches an agent by hand in that tab, the `started` signal replaces it (`isRunningAgentSession`) and the
  error clears.

The agent icon in the tab bar (`PaneTabBar.tsx`) gets a diagonal strike-through when the tab's "Run on start" is off
(`agentRestoreDisabled`), meaning the live session will not come back on the next launch. It only shows while an
agent is alive: a clean exit deletes the store entry, so there is no idle "saved session" state to represent.

Tabs carry only a native `title` tooltip (cwd, agent model and sessionId when an agent is active) -- no HoverCard.

---

## agentStore extensions

`AgentSession` has two restore-specific fields:

- `restored: boolean` — true while the session was opened via restore (cleared on the first real OSC event).
- `restoreError: boolean` / `restoreErrorReason?: string` — set if the plan had an empty `resumeCmd`.

Actions:

- `startRestored(tabId, workspaceId, agent)` — creates a session record with `restored: true`, `status: "working"`. No production code calls it today (TASK-666); the session of a restored tab is created by the first agent signal.
- `setRestoreError(tabId, workspaceId, agent, reason?)` — sets `restoreError: true`.
- `setStatus` (existing) — clears `restored` on the first real state transition.

---

## Hibernating a workspace

Hibernating a workspace kills its PTYs, and each kill produces an `exited` signal. The stored
session record in `agent-sessions.json` must survive that exit, because waking the workspace
restores the agent from it. A normal exit detaches the record (`agent_detach_session`).

- `lib/hibernatingTabs.ts` keeps an in-memory set of the tab ids being killed for hibernation.
  `markHibernating` and `unmarkHibernating` maintain it; `isHibernating` reads it. It is never persisted.
- `lib/sessionEndPolicy.ts` `detachesRecord(kind, hibernating)` decides whether an end signal drops
  the record: only `exited` does, and not when the tab is hibernating.
- `AgentNotificationsBridge.tsx` `handleSignal` always finishes the session in the store and calls
  `agent_detach_session` only when `detachesRecord` says so.

The record was already safe before this set existed, through an implicit order: `disposeSession`
removes the session from the `sessions` map synchronously, so when `exited` arrives `leafIdForPty`
already returns `null` and `handleSignal` returns before reaching the detach. The set makes that
protection explicit instead of depending on the order.

`window_state.rs` `terminal_tab_ids` is what `agent_session_restore_plan` uses to find orphan
records: a stored session whose tab is in no window is dropped. A hibernated workspace keeps its
tabs in the saved state (flagged, not removed), so its records are not orphans. A regression test
pins that, so a later change cannot make hibernated tabs look gone.

---

## Diagnosing a failed restore with Kex.log

`kex_lib::modules::agent`, `kex_lib::modules::pty::agent_detect` and `kex_lib::modules::pty::ipc` all log at
`Debug` (see the `tauri_plugin_log::Builder` in `lib.rs`), which covers every step of the hook and restore-planner
path above: hook payloads arriving over the Unix socket (`pty::ipc::dispatch`), `SessionStart` recording, and the
`OSC 133;C` launch-command stash.

The log file is reachable without hunting for the OS-specific path: `user-data/logs/Kex.log` (a symlink to
`~/Library/Logs/app.betauer.kex/Kex.log` on macOS, see the root `AGENTS.md`/`CLAUDE.md` for the other platforms).
`user-data/logs-dev` is the equivalent for a `pnpm tauri dev` build.

Two things to check if the log looks unhelpful right after a restore failure:

- **The file is empty or was just created.** Until TASK-769, the rotation policy was `RotationStrategy::KeepOne`,
  which deletes the previous log with no backup, and does so as soon as the app starts (the size check runs before
  the new session writes anything) — so a log that had already grown past `max_file_size` in the *previous* session,
  the one that actually failed to restore, was gone before you could open it. Kex now rotates with
  `RotationStrategy::KeepSome(4)`, which renames the oversized file instead of deleting it: look for
  `Kex_<date>.log` siblings next to the active `Kex.log` in the same directory and check those too, not just
  the current file.
- **`prompt`/`msg`/`last`/`err`/`delta` fields look cut off.** `pty::ipc::dispatch` truncates these free-text agent
  payload fields to `MAX_LOG_FIELD_LEN` (250 characters) before logging them, appending `...(N more)` when it does.
  This is intentional (a single long `MessageDisplay` delta was observed to reach 7000+ characters, and unbounded logging
  of a handful of those was enough to blow through the rotation size); it is not a truncation happening elsewhere in
  the restore path, and the full untruncated value was still delivered over IPC and handled by the frontend, it is
  only the log line that is short.

## Error cases

| Case | Behaviour |
|---|---|
| `agentNotifications` disabled | Hooks not installed; store not written; `load_restore_plan` returns `[]` |
| Agent process exited | `agent_detach_session` removes panel from store; not in plan |
| Turn failed (`StopFailure`) or session ended (`SessionEnd`, incl. `/clear`, `/resume`) while the process lives | Store entry kept; the tab stays restorable |
| Session started with `-p`/`--print` | `record_session` skips; session never written to store |
| JSONL transcript missing (no messages sent) | Entry removed from store (unless the launch directory is unusable); `claude --session-id <id>` injected — new session reuses same UUID |
| launch cwd deleted, not a folder, or unreadable | `resumeCmd` empty, `errorReason` and `attemptedCmd` set; no PTY, the tab is held on the Try again / Open terminal without restoring modal and shows `⚠`; store entry kept |
| saved command (no agent) whose directory is unusable | Same modal, built on the frontend from `check_launch_dir` |
| `openPty` rejects at start | Modal with the reason `Could not start the terminal: ...` and only Try again; nothing is left pending |
| Open terminal without restoring | Plain shell; plan kept in `agent-sessions.json` / `persistentCommand` and shown as pending in the Run on Start menu; the in-memory pending state is rebuilt by blocking again at the next launch |
| Retry restore with the problem still there | Block stays pending with the new reason; nothing typed |
| Discard restore plan on a saved command | Forgets this start only; `persistentCommand` kept |
| session entered a worktree later deleted | restored in the worktree's `originalCwd` (from `worktree-state`), not in the worktree |
| `KEX_TAB_ID` not set in shell | Hook exits silently; session not recorded |
| `agent_session_restore_plan` IPC fails | `loadRestorePlans` catches and sets an empty Map; no crash |
| Resume command fails inside terminal | User sees the error in the terminal; `⚠` stays until user types |

### Dev-only restore check (`pnpm tauri dev`)

One failure leaves no trace in the UI, so dev builds (`import.meta.env.DEV`, absent from production) warn with a
Sonner toast. The pure logic is in `agents/lib/restoreCheck.ts`; the toast is fired from `agentSessionRestore.ts`.

- **Plan whose tab no longer exists.** `agent_session_restore_plan` (Rust) drops it and detaches its store entry. A tab
  counts as gone only when it is in *no* window: `WindowStateManager::terminal_tab_ids` returns the union over every
  window, and `split_orphans` partitions the plans against it. This must not be decided per window (see Bug 16 in
  `WORKSPACES_GOTCHAS.md`).
- **Resume command that never reports a session.** `watchResume` runs after the command is written to the PTY and, 30 s
  later (`RESUME_CHECK_MS`), toasts if `sessions[tabId].meta.sessionId` is still empty (it is filled by `SessionStart`
  via `kex:agent-session-meta`). The timer starts when the tab's terminal spawns, so a plan in a workspace that is never
  opened is not a failure.

Each toast is also written to `Kex.log` (`user-data/logs-dev/Kex.log`) as a `WARN` line starting with
`[agent-session]`, so the log can be searched for it after the toast is gone.

It cannot see a session that was never recorded in the store (hook without `KEX_TAB_ID`, `agentNotifications` off,
`-p`): that session is not among the N plans to begin with.
