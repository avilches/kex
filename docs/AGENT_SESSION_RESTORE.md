# Agent session restore

When Terax closes while a Claude Code session is running, the session id and working directory are persisted so the
session can be resumed automatically on the next launch. This document describes the full design: hook architecture,
store format, restore algorithm, frontend integration, and error handling.

---

## Overview

The feature has three cooperating parts:

1. **Hook layer (bash + Claude Code)** — writes session records to disk when a session starts or ends.
2. **Rust restore planner** (`agent_session_restore_plan`) — reads the store at launch, resolves cwd from the JSONL
   transcript, and returns a list of `RestorePlan` entries.
3. **Frontend consumer** (`agentSessionRestore.ts` + `useTerminalSession`) — loads the plan once at app start,
   injects the resume command into the terminal after the PTY opens, and updates the tab UI.

---

## Hook layer

### Prerequisites

Claude Code hooks are installed by `agent_enable_claude_hooks`. The same call that installs the
`terax:agent-signal` notification hooks also installs the two session hooks described below.

### TERAX_PANEL_ID

Every PTY session receives a `TERAX_PANEL_ID` environment variable (a UUID matching the panel's id in the workspace
state). This is injected in `pty/shell_init.rs` → `apply_common` and is available to all processes running inside the
terminal, including hook scripts.

### SessionStart hook

Triggered by Claude Code at session start. The hook script (`~/.config/terax/session.sh` by default):

1. Reads `TERAX_PANEL_ID` from the environment. If unset, exits silently (panel is not managed by Terax).
2. Reads the JSON event from stdin and extracts `session_id` and `cwd` via `jq` (or with sed/awk as a fallback).
3. Atomically writes/updates `~/.config/terax/agent-sessions.json`:
   - Uses `mktemp` + `mv` to prevent partial writes.
   - Preserves existing records for other panels.
   - Sets `state: "running"` for this `panelId`.

### SessionEnd hook

Triggered by Claude Code when the session ends (normal exit or crash). Updates `state` to `"exited"` for the matching
`panelId` in the same store file.

### CLAUDE_CONFIG_DIR support

If `CLAUDE_CONFIG_DIR` is set, the hook writes the store and the hook script itself under that directory instead of
`~/.config/terax/`. The Rust restore planner respects the same variable when searching for JSONL transcripts.

### Idempotency

`agent_enable_claude_hooks` only adds the session hook entries if they are not already present (marker string
`terax-session-hook` in the script content). Re-running it is safe.

---

## Session store format

`~/.config/terax/agent-sessions.json`

```json
{
  "sessions": {
    "<panelId>": {
      "panel_id": "<uuid>",
      "agent": "claude",
      "session_id": "<claude-session-id>",
      "cwd": "/home/user/project",
      "state": "running"
    }
  }
}
```

`state` is either `"running"` or `"exited"`. Only `"running"` sessions are candidates for restore.

Supported agent values: `"claude"`, `"codex"`, `"gemini"`. Unknown values generate a bare `cd '<cwd>'` restore command.

---

## Rust restore planner

`src-tauri/src/modules/agent/session_store.rs` — `load_restore_plan() -> Vec<RestorePlan>`

### Algorithm

For each session in the store where `state != "exited"`:

1. **Find the JSONL transcript.** Globs `~/.claude/projects/**/<sessionId>.jsonl` (or under `CLAUDE_CONFIG_DIR`).
2. **Read the launch cwd.** Opens the JSONL with `BufReader` and reads only as many lines as needed to find the first
   line with a `cwd` field. This avoids loading potentially large transcript files into memory.
3. **Verify the directory exists.** If the cwd from the transcript is missing or the directory no longer exists, the
   session is skipped (not included in the plan).
4. **Build the resume command.**
   - `claude`: `cd '<cwd>' && claude --resume '<sessionId>'`
   - `codex`: `cd '<cwd>' && codex resume --last`
   - `gemini`: `cd '<cwd>' && gemini --resume '<sessionId>'`
   - others: `cd '<cwd>'`
   Both `cwd` and `sessionId` are shell-quoted (single-quote with internal `'` escaped as `'\''`).

### RestorePlan type

```rust
pub struct RestorePlan {
    pub panel_id: String,
    pub agent: String,
    pub resume_cmd: String,
    pub cwd: String,
}
```

Serialized to the frontend as camelCase via `serde`.

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
  if plan succeeds:
    startRestored(leafId, plan.agent)
    setTimeout(() => pty.write(plan.resumeCmd + "\r"), 200)
  else:
    setRestoreError(leafId)
```

The 200ms delay lets the shell finish its init sequence before the command is injected.

If the user types in a terminal that has a `restoreError`, the error state is cleared (the agent store `finish` action
is called). This prevents a stale error indicator from persisting after the user takes over the session manually.

---

## agentStore extensions

`AgentSession` gains two fields:

- `restored: boolean` — true while the session was opened via restore (cleared on the first real OSC event).
- `restoreError: boolean` — true if `consumeRestorePlan` returned a plan but the terminal failed to receive it, or if
  the plan indicated a bad cwd. Never both `restored` and `restoreError` at the same time.

Actions:

- `startRestored(panelId, agent)` — sets `restored: true`, creates a minimal session record.
- `setRestoreError(panelId)` — sets `restoreError: true`.
- `setStatus` (existing) — clears `restored: false` on the first real state transition.

---

## Tab UI

`PaneTabBar` / `DraggableTab` reads from `agentStore`:

| Condition | Icon | Title | Status dot |
|---|---|---|---|
| Agent running (normal) | `✦` | agent name + workspace | colored dot |
| Agent restored, no error | `✦` | `agentname · dirname` | green/amber dot |
| Restore error | `⚠` (red) | `agentname · dirname` (red) | red static dot |
| No agent | panel icon | panel title | none |

`dirname` is the last path segment of `panel.cwd`, falling back to the full `cwd` string if the path has no segments.

The root `<div>` title tooltip is enriched with the full `cwd` and agent name when a session is active.

---

## Error cases

| Case | Behaviour |
|---|---|
| Hooks not installed | Store file does not exist; `load_restore_plan` returns `[]`; no restore attempted |
| Session ended cleanly before close | `state = "exited"` in store; skipped by planner |
| JSONL transcript missing | Session skipped by planner (no `RestorePlan` returned) |
| cwd deleted between sessions | Session skipped by planner |
| `jq` not installed on host | Hook falls back to sed/awk JSON parsing |
| `TERAX_PANEL_ID` not set in shell | Hook exits silently; session not recorded |
| `agent_session_restore_plan` IPC fails | `loadRestorePlans` catches and sets an empty Map; no crash |
| Resume command fails inside terminal | User sees the error in the terminal; `⚠` indicator stays until user types |
