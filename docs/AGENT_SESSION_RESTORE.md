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
[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/session.sh" || true  # kex-session-hook
```

The script (`~/.config/kex/hooks/session.sh`, marker: `kex-session-v5`) handles multiple Claude Code hook events:

1. Reads `KEX_TAB_ID` from the environment. If unset, exits silently (tab is not managed by Kex).
2. Reads the JSON event from stdin and extracts `hook_event_name`, `session_id`, `transcript_path`, and `cwd` via `jq`.
3. For `SessionStart` and `UserPromptSubmit`: records the session via `session_store::record_session` (necessary
   for `--resume` to work across restarts).
4. For all events (SessionStart, UserPromptSubmit, Notification, Stop, StopFailure, SessionEnd, PermissionRequest):
   builds a unified OSC sequence: `OSC 777;kex;<event>;<tab_id>;<session_id>;<transcript_path>;<cwd>[;<extra>]`
   where `<extra>` fields (e.g., error type, message) are only present for certain events and are percent-encoded.
5. Emits the OSC sequence through `terminalSequence`.
6. Rust `agent_detect.rs` intercepts and processes the OSC, calling `session_store::record_session` for recording
   events and emitting appropriate signals to the frontend.

`UserPromptSubmit` handling is required because Claude Code does not fire `SessionStart` when resuming a session
with `--resume`. Without it, sessions started via `claude --resume` (whether by the user or by Kex at startup) are
never written to the store on subsequent runs and cannot be restored on the next launch.

Sessions are cleared from the store when the agent exits (`OSC 133;D` → `agent_detach_session`) or the user detaches
manually. Panels typically close while in idle state because the webview is destroyed before the PTYs finish shutting
down, so a single store file is sufficient.

### Launch command capture

The original CLI invocation is captured from `OSC 133;C;<cmd>` (the shell integration "command started" signal).
Because `OSC 133;C` fires in the PTY reader thread while `SessionStart` arrives via the IPC socket thread,
the command is bridged through a thread-safe stash:

1. **Reader thread** (`session.rs`): `Transition::Started { cmd_string }` is emitted. If `cmd_string` is non-empty,
   `session_store::stash_cmd(tab_id, cmd_string)` stores it in a `Mutex<HashMap<tab_id, cmd>>`.
2. **IPC handler** (`agent_detect.rs` → `record_session`): `take_stashed_cmd(tab_id)` consumes and removes the
   entry. The value becomes `SessionRecord::launch_cmd`.

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
  "panels": {
    "<tabId>": {
      "agent": "claude",
      "session_id": "<claude-session-id>",
      "cwd_launch": "/home/user/project",
      "transcript_path": "/home/user/.claude/projects/.../session.jsonl",
      "launch_cmd": "claude --safe-mode --add-dir /extra",
      "updated_at": 1718000000
    }
  }
}
```

`launch_cmd` is optional (`skip_serializing_if = "Option::is_none"`). It captures the original CLI invocation from
`OSC 133;C` so it can be replayed on restore with only the flags that make sense for an interactive session (see
*Command stripping* below). Absent for sessions created before this feature or without shell integration.

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
3. **Read the launch cwd.** Opens the JSONL with `BufReader` and reads only as many lines as needed to find the first
   `cwd` field, avoiding loading large transcripts into memory.
4. **Verify the directory exists.** If the cwd is missing or was deleted, the plan carries a non-empty `error_reason`
   and an empty `resume_cmd` (signals a restore error in the tab UI). Entry is removed from the store.
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
    pub cwd_launch: String,    // → "cwdLaunch" on the wire
    pub error_reason: String,
}
```

`rename_all = "camelCase"` is required — the frontend Map is keyed by `tabId` and would silently miss all sessions
if it received `tab_id` instead.

---

## Frontend integration

### agentSessionRestore.ts

`src/modules/agents/lib/agentSessionRestore.ts`

Loaded once at app start (`App.tsx`) via `loadRestorePlans()`, which calls `agent_session_restore_plan` and stores the
result in a module-level `Map<tabId, RestorePlan>`. `consumeRestorePlan(tabId)` returns and deletes the plan for a
given tab — consume-once semantics prevent double injection.

### useTerminalSession.ts

In `attachSession`, after the PTY is open:

```
if plan = consumeRestorePlan(leafId):
  if plan.resumeCmd is non-empty:
    startRestored(leafId, workspaceId, plan.agent)
    setTimeout(() => pty.write(plan.resumeCmd + "\r"), 200)
  else:
    setRestoreError(leafId, workspaceId, plan.agent, plan.errorReason)
```

The 200ms delay lets the shell finish its init sequence before the command is injected.

---

## Terminal path bar UI

Session metadata that was previously accessible from the floating tab HoverCard (which has been removed) is now
surfaced in the `[...]` DropdownMenu (`TerminalPathBarMenu`) in the right side of `TerminalPathBar`:

- **Run on start** checkbox: toggles `restoreOnRestart` on the panel. When enabled (and a `persistentCommand` is set), a
  reload icon appears inline in the path bar as a visual indicator. For agent sessions the checkbox defaults to checked
  and enabling it captures the current running command as the `persistentCommand` if none is already set.
- **Persistent command input**: the command that will be run when the terminal restarts. Editable inline in the menu.
- **Session id** (agent sessions only): shown read-only; click to copy.
- **Transcript** (agent sessions only): Reveal in Finder. Existence is checked lazily on menu open via `fsStat` so
  there is no up-front IPC cost.
- **Started elapsed**: how long ago the session started.
- **Restore error**: shown when `restoreError` is set on the session (e.g. the resume command failed or the cwd was
  deleted). The tab title turns red and a `⚠` icon appears; the menu surfaces the error reason for diagnosis.

Tabs carry only a native `title` tooltip (cwd, agent model and sessionId when an agent is active) -- no HoverCard.

---

## agentStore extensions

`AgentSession` has two restore-specific fields:

- `restored: boolean` — true while the session was opened via restore (cleared on the first real OSC event).
- `restoreError: boolean` / `restoreErrorReason?: string` — set if the plan had an empty `resumeCmd`.

Actions:

- `startRestored(tabId, agent)` — creates a session record with `restored: true`, `status: "working"`.
- `setRestoreError(tabId, agent)` — sets `restoreError: true`.
- `setStatus` (existing) — clears `restored` on the first real state transition.

---

## Error cases

| Case | Behaviour |
|---|---|
| `agentNotifications` disabled | Hooks not installed; store not written; `load_restore_plan` returns `[]` |
| Agent exited cleanly | `agent_detach_session` removes panel from store; not in plan |
| Session started with `-p`/`--print` | `record_session` skips; session never written to store |
| JSONL transcript missing (no messages sent) | Entry removed from store; `claude --session-id <id>` injected — new session reuses same UUID |
| cwd deleted between sessions | `resumeCmd` empty, `errorReason` set; tab shows `⚠` restore error |
| `KEX_PANEL_ID` not set in shell | Hook exits silently; session not recorded |
| `agent_session_restore_plan` IPC fails | `loadRestorePlans` catches and sets an empty Map; no crash |
| Resume command fails inside terminal | User sees the error in the terminal; `⚠` stays until user types |
