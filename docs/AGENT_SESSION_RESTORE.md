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

The script (`~/.config/kex/hooks/session.sh`, marker: `kex-session-v1`):

1. Reads `KEX_PANEL_ID` from the environment. If unset, exits silently (panel is not managed by Kex).
2. Reads the JSON event from stdin and extracts `session_id`, `transcript_path`, and `cwd` via `jq`.
3. Atomically writes/updates `~/.config/kex/agent-sessions.json` using `jq + mktemp + mv`.
4. Sets `state: "idle"` for this panel — sessions stay `"idle"` in the store until the panel is explicitly detached.

### SessionEnd hook

Registered in Claude Code's `SessionEnd` event but **intentionally a no-op**: the hook fires when the PTY dies
(including when Kex itself closes), not only when the user exits Claude. Writing `"exited"` here would prevent restore
on the next launch. Sessions are cleared only via "Detach Claude" in the tab context menu.

### CLAUDE_CONFIG_DIR support

If `CLAUDE_CONFIG_DIR` is set, `load_restore_plan()` searches for JSONL transcripts under that directory instead of
`~/.claude/`.

---

## Session store format

`~/.config/kex/agent-sessions.json`

```json
{
  "version": 1,
  "panels": {
    "<panelId>": {
      "agent": "claude",
      "session_id": "<claude-session-id>",
      "cwd_launch": "/home/user/project",
      "transcript_path": "/home/user/.claude/projects/.../session.jsonl",
      "state": "idle",
      "updated_at": 1718000000
    }
  }
}
```

`state` is written as `"idle"` by the hook and stays `"idle"` until the panel entry is removed via detach. The restore
planner skips entries where `state == "exited"` (set only by future mechanisms, not the current hook).

Supported agent values: `"claude"`, `"codex"`, `"gemini"`. Unknown values generate a bare `cd '<cwd>'` restore command.

---

## Restore candidates snapshot

`~/.config/kex/restore-candidates.json`

Written by `snapshot_idle_sessions()` just before the last window closes (`on_window_event::Destroyed` in `lib.rs`).
Contains only the panels whose `state == "idle"` at that moment — a snapshot that bypasses the race where `SessionEnd`
might fire in the seconds after the PTY dies and overwrite state.

`load_restore_plan()` consumes (reads + deletes) this file first. Deletion prevents double-restore across repeated
launches without a new session in between. If the file is absent (SIGKILL, crash, first launch), the planner falls
back to reading `agent-sessions.json` directly and filtering `state != "exited"`.

---

## Rust restore planner

`src-tauri/src/modules/agent/session_store.rs` — `load_restore_plan() -> Vec<RestorePlan>`

### Algorithm

For each eligible session:

1. **Find the JSONL transcript.** Checks the stored `transcript_path` first, then globs
   `~/.claude/projects/**/<sessionId>.jsonl` (or `CLAUDE_CONFIG_DIR`).
2. **Read the launch cwd.** Opens the JSONL with `BufReader` and reads only as many lines as needed to find the first
   `cwd` field. Avoids loading potentially large transcripts into memory.
3. **Verify the directory exists.** If the cwd is missing or was deleted, the plan has an empty `resumeCmd` (signals a
   restore error in the tab UI).
4. **Build the resume command.**
   - `claude`: `cd '<cwd>' && claude --resume '<sessionId>'`
   - `codex`: `cd '<cwd>' && codex resume --last`
   - `gemini`: `cd '<cwd>' && gemini --resume '<sessionId>'`
   - others: `cd '<cwd>'`

### RestorePlan type

```rust
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub panel_id: String,   // → "panelId" on the wire
    pub agent: String,
    pub resume_cmd: String, // → "resumeCmd" on the wire
    pub cwd: String,
}
```

The `rename_all = "camelCase"` is required — the frontend Map is keyed by `panelId` and would silently miss all
sessions if it received `panel_id` instead.

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
    setRestoreError(leafId)
```

The 200ms delay lets the shell finish its init sequence before the command is injected.

---

## agentStore extensions

`AgentSession` gains two fields:

- `restored: boolean` — true while the session was opened via restore (cleared on the first real OSC event).
- `restoreError: boolean` — true if the plan had an empty `resumeCmd` (cwd missing or transcript not found).

Actions:

- `startRestored(panelId, tabId, agent)` — creates a minimal session record with `restored: true`.
- `setRestoreError(panelId, tabId, agent)` — sets `restoreError: true`.
- `setStatus` (existing) — clears `restored` on the first real state transition.

---

## Tab UI

`PaneTabBar` / `DraggableTab` reads from `agentStore`:

| Condition | Icon | Title | Status dot |
|---|---|---|---|
| Agent working | `✦` | `agentname · dirname` | white spinner |
| Agent waiting for input | `✦` | `agentname · dirname` | amber dot |
| Agent finished / idle | panel icon | panel title | none |
| Agent restored, no error | `✦` | `agentname · dirname` | white spinner |
| Restore error | `⚠` | `agentname · dirname` (red) | red static dot |
| No agent | panel icon | panel title | none |

`dirname` is the last path segment of `panel.cwd`.

### Indicator lifecycle

The spinner or dot is cleared by the first of these events to arrive:

- `finished` signal — agent's `Stop` hook fired normally.
- `exited` signal — OSC 133;D (shell command ended) or PTY closed.
- User types anything in the terminal — `writeToPty` in `useTerminalSession` calls `store.finish()` when a session is active. This ensures the indicator disappears immediately after Ctrl+C or any abnormal termination, without a timer.

---

## Error cases

| Case | Behaviour |
|---|---|
| `agentNotifications` disabled | Hooks not installed; store file is not written; `load_restore_plan` returns `[]` |
| Session ended cleanly and user detached | Panel removed from store; not included in plan |
| JSONL transcript missing | `RestorePlan.resumeCmd` is empty; tab shows `⚠` restore error |
| cwd deleted between sessions | Same as above |
| `KEX_PANEL_ID` not set in shell | Hook exits silently; session not recorded |
| `agent_session_restore_plan` IPC fails | `loadRestorePlans` catches and sets an empty Map; no crash |
| Resume command fails inside terminal | User sees the error in the terminal; `⚠` indicator stays until user types |
| SIGKILL / crash (no window close event) | `snapshot_idle_sessions` does not run; fallback reads `agent-sessions.json` directly |
