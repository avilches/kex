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

### KEX_PANEL_ID

Every PTY session receives a `KEX_PANEL_ID` environment variable (a UUID matching the panel's id in the workspace
state). This is injected in `pty/shell_init.rs` → `apply_common` and is available to all processes running inside the
terminal, including hook scripts.

### SessionStart hook

Triggered by Claude Code at session start. The hook command:

```
[ -n "$KEX_PANEL_ID" ] && "$HOME/.config/kex/hooks/session.sh" || true  # kex-session-hook
```

The script (`~/.config/kex/hooks/session.sh`, marker: `kex-session-v4`) handles multiple Claude Code hook events:

1. Reads `KEX_PANEL_ID` from the environment. If unset, exits silently (panel is not managed by Kex).
2. Reads the JSON event from stdin and extracts `hook_event_name`, `session_id`, `transcript_path`, and `cwd` via `jq`.
3. For `SessionStart` and `UserPromptSubmit`: records the session via `session_store::record_session` (necessary
   for `--resume` to work across restarts).
4. For all events (SessionStart, UserPromptSubmit, Notification, Stop, StopFailure, SessionEnd, PermissionRequest):
   builds a unified OSC sequence: `OSC 777;kex;<event>;<panel_id>;<session_id>;<transcript_path>;<cwd>[;<extra>]`
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
    "<panelId>": {
      "agent": "claude",
      "session_id": "<claude-session-id>",
      "cwd_launch": "/home/user/project",
      "transcript_path": "/home/user/.claude/projects/.../session.jsonl",
      "updated_at": 1718000000
    }
  }
}
```

Initialized via `session_store::init(data_dir)` in `lib.rs` `setup()` using a `OnceLock<PathBuf>`.

Supported agent values: `"claude"`, `"codex"`, `"gemini"`. Unknown values produce an empty `resume_cmd`.

---

## Rust restore planner

`src-tauri/src/modules/agent/session_store.rs` — `load_restore_plan() -> Vec<RestorePlan>`

### Algorithm

For each session in the store:

1. **Find the JSONL transcript.** Checks the stored `transcript_path` first, then globs
   `~/.claude/projects/**/<sessionId>.jsonl` (or `CLAUDE_CONFIG_DIR`).
2. **Skip if no JSONL.** If the transcript does not exist, the user never sent a message in this session —
   `claude --resume` would fail. The entry is removed from the store and excluded from the plan.
3. **Read the launch cwd.** Opens the JSONL with `BufReader` and reads only as many lines as needed to find the first
   `cwd` field, avoiding loading large transcripts into memory.
4. **Verify the directory exists.** If the cwd is missing or was deleted, the plan carries a non-empty `error_reason`
   and an empty `resume_cmd` (signals a restore error in the tab UI). Entry is removed from the store.
5. **Build the resume command.**
   - `claude`: `claude --resume '<sessionId>'`
   - `codex`: `codex resume --last`
   - `gemini`: `gemini --resume '<sessionId>'`
   - others: empty string

The PTY is spawned with `plan.cwd` as the initial working directory, so no `cd` prefix is needed in the command.

### RestorePlan type

```rust
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub panel_id: String,    // → "panelId" on the wire
    pub agent: String,
    pub resume_cmd: String,  // → "resumeCmd" on the wire; empty signals error
    pub cwd: String,
    pub error_reason: String,
}
```

`rename_all = "camelCase"` is required — the frontend Map is keyed by `panelId` and would silently miss all sessions
if it received `panel_id` instead.

---

## Frontend integration

### agentSessionRestore.ts

`src/modules/agents/lib/agentSessionRestore.ts`

Loaded once at app start (`App.tsx`) via `loadRestorePlans()`, which calls `agent_session_restore_plan` and stores the
result in a module-level `Map<panelId, RestorePlan>`. `consumeRestorePlan(panelId)` returns and deletes the plan for a
given panel — consume-once semantics prevent double injection.

### useTerminalSession.ts

In `attachSession`, after the PTY is open:

```
if plan = consumeRestorePlan(leafId):
  if plan.resumeCmd is non-empty:
    startRestored(leafId, plan.agent)
    setTimeout(() => pty.write(plan.resumeCmd + "\r"), 200)
  else:
    setRestoreError(leafId, plan.errorReason)
```

The 200ms delay lets the shell finish its init sequence before the command is injected.

---

## agentStore extensions

`AgentSession` has two restore-specific fields:

- `restored: boolean` — true while the session was opened via restore (cleared on the first real OSC event).
- `restoreError: boolean` / `restoreErrorReason?: string` — set if the plan had an empty `resumeCmd`.

Actions:

- `startRestored(panelId, tabId, agent)` — creates a session record with `restored: true`, `status: "working"`.
- `setRestoreError(panelId, tabId, agent)` — sets `restoreError: true`.
- `setStatus` (existing) — clears `restored` on the first real state transition.

---

## Error cases

| Case | Behaviour |
|---|---|
| `agentNotifications` disabled | Hooks not installed; store not written; `load_restore_plan` returns `[]` |
| Agent exited cleanly | `agent_detach_session` removes panel from store; not in plan |
| JSONL transcript missing (no messages sent) | Entry removed from store; excluded from plan entirely |
| cwd deleted between sessions | `resumeCmd` empty, `errorReason` set; tab shows `⚠` restore error |
| `KEX_PANEL_ID` not set in shell | Hook exits silently; session not recorded |
| `agent_session_restore_plan` IPC fails | `loadRestorePlans` catches and sets an empty Map; no crash |
| Resume command fails inside terminal | User sees the error in the terminal; `⚠` stays until user types |
