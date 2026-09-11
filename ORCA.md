# Orca comparison: Claude Code hooks, notifications, and session restore

Research notes from 2026-09-11, comparing how Kex detects a running Claude Code
session, notifies the user, and restores that session after an app restart,
against how Orca implements the same three features. Written so an agent can
pick this up later without redoing the investigation. The matching backlog
milestone is "Orca notification" (`backlog milestone list`), tasks TASK-729
through TASK-735 (`backlog task 729` .. `backlog task 735`, or filter by
milestone in `backlog board`).

Orca repo referenced throughout: `~/Work/Proy/Repos/orca` (Electron app,
TypeScript main and renderer processes, pnpm monorepo). All Orca paths below
are repo-relative to that checkout, current as of commit `a1f198be0d`.

Kex paths below are repo-relative to this repo's root, current as of the
commit this branch was cut from (`1c6c7031`, "Stop rewriting a markdown file
that nobody edited").

## 1. How Orca does it

### 1.1 Notifications

Native OS notifications via Electron's `Notification` API, not anything
terminal-based or OSC-based.

Flow: an agent status change (from a hook, the process table, or the terminal
title, see 1.2) reaches the main process in `AgentHookServer`
(`src/main/agent-hooks/server.ts`), which pushes it over IPC to the renderer.
There, `dispatchTerminalNotification`
(`src/renderer/src/components/terminal-pane/use-notification-dispatch.ts`)
decides whether it's worth it (pane visible, window focused, snapshot fresh,
PTY still alive, agent actually transitioned to a terminal state) and calls
`window.api.notifications.dispatch`, which the main process turns into a real
`Notification` (`src/main/ipc/native-notification-delivery.ts`). There is a
burst cooldown (`src/main/ipc/notification-burst-cooldown.ts`) to avoid
spamming when many events land close together.

### 1.2 Detecting a live Claude Code session

Three independent signals, combined with explicit precedence, none of them OSC:

1. **HTTP hooks (strongest signal).** Orca installs a hook script at
   `~/.orca/agent-hooks/claude-hook.sh` and registers it in
   `~/.claude/settings.json` for a long list of events, defined in
   `src/main/claude/hook-settings.ts` (`CLAUDE_EVENTS`): the official
   `SessionStart`, `UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse`,
   plus several that are **not** documented Claude Code events today
   (`StopFailure`, `PermissionRequest`, `PostCompact`, `SubagentStart`,
   `SubagentStop`, `TeammateIdle`). The code is explicit about why this is
   safe: older Claude builds silently ignore event names they don't
   recognize (comment: "Older Claude builds ignore unregistered event names
   (StopFailure precedent)").

   The script (built in `src/main/claude/hook-service.ts::getManagedScript()`
   and `src/main/agent-hooks/hook-post-command.ts`) always prints `{}` first
   (some Claude versions fail closed on empty stdout), reads the hook JSON
   from stdin, then POSTs it to `http://127.0.0.1:<ORCA_AGENT_HOOK_PORT>/hook/claude`
   with an `X-Orca-Agent-Hook-Token` header. Port and token travel to the PTY
   as env vars (`ORCA_AGENT_HOOK_PORT`, `ORCA_AGENT_HOOK_TOKEN`,
   `ORCA_PANE_KEY`), plus `ORCA_AGENT_HOOK_ENDPOINT`, a small file the script
   can re-source to refresh port/token if Orca restarted mid-session.

   **If the POST fails**, the event is appended to a spool file on disk
   (`src/main/agent-hooks/hook-stdin-contract.ts::buildPosixHookSpoolLines()`,
   under `~/.orca/agent-hooks/spool/pane-<id>.jsonl`, capped at 5 MB, rotated
   after 7 days) to be drained later. This is the direct precedent for
   TASK-730 in Kex.

   The receiving side is `AgentHookServer` in `src/main/agent-hooks/server.ts`:
   an HTTP listener inside the Electron main process, one process for the
   whole app (not one per pane), keyed by pane.

2. **OS process table.** `src/main/providers/agent-foreground-process.ts`
   (`resolveAgentForegroundProcess`) snapshots `ps` (POSIX) or WMIC/PowerShell
   (Windows), walks the shell's descendants, and matches the foreground
   candidate's command line against a known-agent catalog in
   `src/shared/agent-process-recognition.ts` (`TUI_AGENT_CONFIG`), including
   unwrapping `node <entrypoint>` to detect Claude running through its JS
   entrypoint.

3. **Terminal title glyphs.** `src/shared/agent-title-core.ts::isClaudeAgent()`
   recognizes the status glyphs Claude Code prepends to the terminal title
   (`✳` idle, `. ` / `* ` working).

Precedence is explicit (a live hook outranks a process-table read, which
outranks the title) and lives around `resolvePaneAgentOwner` in
`src/main/runtime/orca-runtime.ts`.

### 1.3 Session restore across an app restart

Orca does **not** re-read `~/.claude/projects/*.jsonl` to recover the
`session_id` after a restart. Claude Code includes `session_id` and
`transcript_path` natively in the JSON payload of every hook event, including
`SessionStart`, so Orca just captures them straight from the hook payload it
already receives (`src/shared/agent-session-resume.ts::extractAgentProviderSession`).

That gets stored as a `SleepingAgentSessionRecord` (same file, includes
`providerSession`, last assistant message, terminal title, captured-at
timestamp) inside the renderer's Zustand store
(`src/renderer/src/store/slices/agent-status.ts`), persisted as part of the
whole-window `WorkspaceSessionState` snapshot.

On reopen, `src/renderer/src/lib/resume-sleeping-agent-session.ts` compares
the stored `providerSession` against any live session (to avoid double
launch) and, if needed, builds `claude --resume <session_id>`
(`agent-session-resume.ts::getAgentResumeArgv`) and relaunches it in a fresh
PTY.

Separately, a "Native Chat" mode reads the JSONL transcripts directly (no PTY
involved) via `src/main/native-chat/session-file-resolver.ts`
(`resolveClaudeSessionFile`, since the transcript filename can be a UUID that
differs from the hook's `session_id`) and validates, record by record using
`uuid`/`parentUuid`, that the last leaf is still on the same conversation
branch (`src/main/claude/claude-transcript-branch-proof.ts`), to detect a
`/rewind` or a fork before showing it.

### 1.4 OSC usage in Orca (narrower than it looks)

- **OSC 133** (standard shell integration, command boundaries): generic, used
  to know when the terminal's foreground goes back to the shell. Not Claude
  specific.
- **OSC 777** (`orca-shell-ready`): Orca's own marker, used only after an SSH
  reconnect, to know when the remote shell finished initializing before
  reinjecting the resume command.
- **OSC 9999** (`\x1b]9999;<json>`): Orca's own JSON status channel
  (`src/shared/agent-status-osc.ts`), consumed identically in main
  (`src/main/runtime/orca-runtime.ts`) and renderer
  (`src/renderer/src/components/terminal-pane/pty-output-processor.ts`), and
  reconciled with hook-derived status in `AgentHookServer.ingestTerminalStatus`.
  Nothing in this repo's Claude hook script or statusline script actually
  emits these bytes; they appear to come from Orca's own CLIs
  (`openclaude`, `command-code`, source outside this repo).

**Bottom line: for Claude Code specifically, Orca does not depend on OSC at
all.** Session id and status arrive entirely over the HTTP hook; process
table and title are fallbacks for when the hook hasn't spoken yet.

## 2. How Kex does it today (confirmed against code, not docs)

**The existing docs are stale.** `docs/AGENT_SESSION_RESTORE.md`,
`docs/NOTIFICATIONS.md`, and `AGENTS.md` describe an older ("v4") design
where the Claude Code hooks emit `OSC 777;kex;...` and Kex parses it from the
PTY byte stream. That parser still exists and still has tests, but nothing
active emits that sequence anymore. See:

```
2145a981 feat(ipc): migrate all hook events from OSC to Unix socket
ed14289f feat(ipc): use Unix socket IPC for SessionStart and SessionEnd hook events
```

The current mechanism is marked `kex-session-v5` inside the hook script
itself.

### 2.1 OSC still in use

- **OSC 133 / 7** are emitted by Kex's own shell init scripts
  (`src-tauri/src/modules/pty/scripts/zshrc.zsh`,
  `src-tauri/src/modules/pty/scripts/bashrc.bash`, applied via
  `shell_init.rs::apply_common`), for prompt lifecycle and cwd tracking, the
  same standard shell-integration idea as Orca's OSC 133. `OSC 133;C;<cmd>`
  is what arms the agent detector when the command matches `claude`/`codex`.
- **OSC 9** is Claude Code's own native fallback, emitted only when the user
  has no Kex hooks installed. If the detector is armed, this triggers a
  generic "needs attention" with no `session_id`/`transcript_path`
  (`agent_detect.rs`, `generic_attention`).
- **OSC 777;kex;...** is the legacy unified protocol (`handle_kex_unified`,
  `agent_detect.rs`), format
  `OSC 777;kex;<event>;<tab_id>;<session_id>;<transcript_path>;<cwd>[;extra...]`.
  Dead as an input today (see TASK-733), though `mod.rs::is_old_notify`
  already detects and cleans up even older "old-style notify" installs.

All OSC parsing happens in `AgentDetector::process`
(`src-tauri/src/modules/pty/agent_detect.rs`), a byte-level state machine fed
from the PTY reader thread (`src-tauri/src/modules/pty/session.rs`).

### 2.2 Hooks (the v5 mechanism, what's actually live)

Installed into `~/.claude/settings.json` by
`src-tauri/src/modules/agent/mod.rs::agent_enable_claude_hooks()`, which
merges hooks (preserving anything not owned by Kex) and writes atomically
(`.json.kex-tmp` + rename). The installed script lives at
`~/.config/kex/hooks/trigger-event.sh`
(`session_hook_script_path()`), content embedded via `include_str!`.

Eight events, all official documented Claude Code hook events (a more
conservative choice than Orca's, which registers several undocumented ones):

```rust
const SESSION_HOOK_EVENTS: [&str; 8] = [
    "SessionStart", "UserPromptSubmit", "Notification",
    "Stop", "StopFailure", "SessionEnd", "PermissionRequest", "MessageDisplay",
];
```

`trigger-event.sh` reads the hook's JSON from stdin and forwards it, byte for
byte, over a **Unix domain socket, one per PTY**
(`src-tauri/src/modules/pty/ipc.rs::socket_path_for_pty_id`, path
`$TMPDIR/kex-ipc-<pty_id>.sock`, passed to the child as `KEX_IPC`):

```bash
send_ipc() {
    [ -n "$KEX_IPC" ] || return 0
    printf '%s\n' "$PAYLOAD" | nc -w 1 -U "$KEX_IPC" 2>/dev/null && return 0
    python3 -c "... socket.AF_UNIX ..." "$KEX_IPC" <<< "$PAYLOAD" 2>/dev/null || true
}
```

If both `nc` and the `python3` fallback fail, the script exits 0 anyway
(`|| true`) and the event is gone. No retry, no spool (TASK-730).

The listener (`ipc.rs::run_listener`, `#![cfg(unix)]`, so **this whole path
is absent on native Windows**, see TASK-731) reads one line per connection
and dispatches: `SessionStart` calls `session_store::record_session(...)`,
everything else re-emits as a generic `kex:agent-signal` Tauri event consumed
by React.

### 2.3 Session persistence and resume

Store: `~/Library/Application Support/app.betauer.kex/agent-sessions.json`
(macOS path; `data_dir()`-relative elsewhere), managed by
`src-tauri/src/modules/agent/session_store.rs`.

`session_id` is captured directly from the `SessionStart` hook payload over
IPC, not by re-reading the `.jsonl`. Kex **also** records on
`UserPromptSubmit`, specifically because `claude --resume` does not fire
`SessionStart`, so without that second hook a resumed session would never
make it back into the store for the next Kex restart. This is a real gap
Orca's design doesn't have to solve the same way (Orca just re-derives
`providerSession` from whatever hook fires next, since it stores state per
pane rather than needing a dedicated "first sighting" event).

Restore plan (`load_restore_plan` → `build_plans_from`,
`session_store.rs`): reads the real cwd from the `.jsonl`'s first line when
available (more accurate than the launch cwd if the user `cd`'d), applies an
explicit allow-list of resume-safe flags to the original launch command
(`strip_for_resume_base`, drops `--model`/`--effort`/`--worktree`/`--tmux`,
keeps `--add-dir`/`--permission-mode`/`--mcp-config`), and appends
`--resume <id>`. If the `.jsonl` doesn't exist yet, it reuses the session's
UUID via `claude --session-id <id>` instead of discarding the record.

Injected on the frontend side in
`src/modules/terminal/lib/useTerminalSession.ts` after the PTY opens, with a
leading space before the command (so shells with `histignorespace` don't log
it to history).

**Failure mode with no safety net (TASK-735):** if `agent-sessions.json`
fails to parse, `load_restore_plan()` logs a warning and returns an empty
list. Every open session's restore state is gone in one shot, with nothing
to fall back to. The store is already written atomically (temp + rename);
keeping one `.bak` of the previous version before overwriting is a small
change that avoids total loss from a single corrupted write.

### 2.4 Foreground/liveness detection

No process-table polling drives agent state. It's purely reactive to PTY
bytes: `AgentDetector` arms on `OSC 133;C;<cmd>` matching `claude`/`codex`
(or auto-arms if a hook event arrives without having seen `133;C`, covering
tmux/old-bash cases), and disarms on `OSC 133;D` or PTY close. `Stop` does
**not** disarm (Claude is still running, it just finished a turn).

There is a `pgrep`/`CreateToolhelp32Snapshot`-based check
(`pty_has_foreground_process` in `src-tauri/src/modules/pty/mod.rs`), but
it's unrelated to agent detection: it only powers the "a process is running,
are you sure you want to close this tab" confirmation dialog.

### 2.5 Notifications

`src/modules/agents/lib/route.ts::routeAgentNotification` routes by focus
state: tab active + window focused -> nothing; window unfocused -> native OS
notification (`@tauri-apps/plugin-notification`); window focused but tab
hidden -> in-app toast. `Stop`, `Notification`, `PermissionRequest` map to
`"attention"`; `StopFailure` maps to `"error"`.

Clicking a native notification needs to know which tab to focus; that's
`agent_queue_nav` (`src-tauri/src/modules/agent/pending_nav.rs`), a
`Mutex<Option<PendingNav>>` with a 5 second TTL, consumed once.

### 2.6 What's missing, compared to Orca (fallbacks)

Confirmed absent, not just "not found in this pass":

- No retry queue or offline spool when the IPC send fails (TASK-730).
- No defense against the startup race (hook fires before the socket listener
  is up) beyond the same missing spool (TASK-730).
- No cross-platform transport: the Unix-socket + bash-script combination
  simply doesn't run on native Windows (TASK-731).
- No explicit socket permission hardening or per-connection auth, unlike
  Orca's per-session HTTP token (TASK-732).
- No rotation/size cap on the `/tmp/kex-hook-*.log` / `/tmp/kex-tab-*.log`
  debug files, unlike Orca's 5 MB / 7 day spool rotation (TASK-734).
- No backup of the previous `agent-sessions.json` before an overwrite
  (TASK-735).

The one thing Kex already does that's arguably more conservative than Orca:
it only relies on real, documented Claude Code hook events, never on
speculative/undocumented ones.

## 3. Findings to backlog task map

| # | Finding | Task |
|---|---|---|
| 1 | Docs describe v4 OSC-777, code is v5 Unix socket | TASK-729 |
| 2 | No retry/spool on failed IPC send (also covers the startup race) | TASK-730 |
| 3 | No session restore path on native Windows (Unix-only transport) | TASK-731 |
| 4 | Socket permissions / auth not hardened | TASK-732 |
| 5 | Legacy OSC 777 parser: keep-and-document or delete | TASK-733 |
| 6 | Unbounded debug logs in /tmp | TASK-734 |
| 7 | Corrupt `agent-sessions.json` loses all restore state silently | TASK-735 (high priority, data loss) |

## 4. Suggested reading order for whoever picks this up

Kex side, in the order the data actually flows:
1. `src-tauri/src/modules/agent/hooks/trigger-event.sh` (what leaves the hook)
2. `src-tauri/src/modules/pty/ipc.rs` (socket listener, `#![cfg(unix)]`)
3. `src-tauri/src/modules/agent/session_store.rs` (persistence + restore plan)
4. `src-tauri/src/modules/agent/mod.rs` (settings.json install/status)
5. `src-tauri/src/modules/pty/agent_detect.rs` (OSC state machine, legacy 777 path)
6. `src/modules/agents/lib/route.ts` + `notify.ts` (notification routing)
7. `src/modules/terminal/lib/useTerminalSession.ts` (resume command injection)

Orca side, for comparison while implementing any of the above:
1. `src/main/claude/hook-service.ts` + `hook-settings.ts` (install, script contents)
2. `src/main/agent-hooks/server.ts` + `hook-post-command.ts` + `hook-stdin-contract.ts` (transport, spool)
3. `src/shared/agent-session-resume.ts` (session id capture, resume argv)
4. `src/renderer/src/store/slices/agent-status.ts` (persisted sleeping-session record)
5. `src/main/native-chat/session-file-resolver.ts` + `claude-transcript-branch-proof.ts` (JSONL reading, only if Kex ever wants a no-PTY transcript viewer)
