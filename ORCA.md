# Orca comparison: Claude Code hooks, notifications, and session restore

Research notes from 2026-09-11, comparing how Kex detects a running Claude Code
session, notifies the user, and restores that session after an app restart,
against how Orca implements the same three features. Written so an agent can
pick this up later without redoing the investigation. The matching backlog
milestone is "Orca notification" (`backlog milestone list`, id `m-8`); the
task map is in section 3. Updated 2026-10-24: the first pass (TASK-729 to
TASK-735) is mostly done, section 2.6 and 3 now say what is still open, and
section 5 holds measurements taken on that date.

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

The Claude Code hooks forward their JSON over a Unix socket (channel 2,
below). An older ("v4") design had the hook emit an `OSC 777;kex;...` marker
through the PTY stream instead; once the socket migration (`2145a981`,
`ed14289f`) left nothing emitting it, that parser was deleted from
`agent_detect.rs` (TASK-733), so the Rust detector now only handles the OSC
channel. The current mechanism is marked `kex-session-v10` inside the hook
script itself (`SESSION_HOOK_SCRIPT_VERSION` in `agent/mod.rs`).

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
- Any other **OSC 777** triggers the same generic "needs attention" as `OSC 9`
  when the detector is armed. `mod.rs::is_old_notify` still detects and cleans
  up the even older "old-style notify" hook installs.

All OSC parsing happens in `AgentDetector::process`
(`src-tauri/src/modules/pty/agent_detect.rs`), a byte-level state machine fed
from the PTY reader thread (`src-tauri/src/modules/pty/session.rs`).

### 2.2 Hooks (the Unix socket mechanism, what's actually live)

Installed into `~/.claude/settings.json` by
`src-tauri/src/modules/agent/mod.rs::agent_enable_claude_hooks()`, which
merges hooks (preserving anything not owned by Kex) and writes atomically
(`.json.kex-tmp` + rename). The installed script lives at
`~/.config/kex/hooks/trigger-event.sh`
(`session_hook_script_path()`), content embedded via `include_str!`.

Ten events, all of them real Claude Code hook events. They are written to
`settings.json` unconditionally, without looking at which Claude Code version
is installed (TASK-893 changes that, see section 5):

```rust
const SESSION_HOOK_EVENTS: [&str; 10] = [
    "SessionStart", "UserPromptSubmit", "Notification",
    "Stop", "StopFailure", "SessionEnd", "PermissionRequest", "MessageDisplay",
    "SubagentStart", "SubagentStop",
];
```

`trigger-event.sh` reads the hook's JSON from stdin and forwards it, byte for
byte, over a **Unix domain socket, one per PTY**
(`src-tauri/src/modules/pty/ipc.rs::socket_path_for_pty_id`, path
`kex-ipc-<pid>-<pty_id>.sock` in the per-user `kex-ipc-<uid>` directory, passed to the child as `KEX_IPC`):

```bash
send_ipc() {
    [ -n "$KEX_IPC" ] || return 0
    printf '%s\n' "$PAYLOAD" | nc -w 1 -U "$KEX_IPC" 2>/dev/null && return 0
    python3 -c "... socket.AF_UNIX ..." "$KEX_IPC" <<< "$PAYLOAD" 2>/dev/null || true
}
```

If both `nc` and the `python3` fallback fail, the script appends the payload to
`~/.config/kex/spool/<tab_id>.jsonl` (capped at 200 lines, oldest dropped
first) and exits 0; the listener replays that file when it starts
(`ipc.rs::drain_spool`, which skips stale `SessionEnd` and `StopFailure`).
This is TASK-730, done. TASK-896 proposes replacing the bash rotation with one
file per event.

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

**Corruption safety net (TASK-735, done):** every write of `agent-sessions.json`
first copies the previous content to `agent-sessions.json.bak`
(`session_store.rs`), and `load_restore_plan()` falls back to that copy when
the main file fails to parse, instead of returning an empty list. A corrupt
main file never overwrites a good `.bak`.

### 2.4 Foreground/liveness detection

No process-table polling drives agent state. It's purely reactive to PTY
bytes: `AgentDetector` arms on `OSC 133;C;<cmd>` matching `claude`/`codex`, and
disarms on `OSC 133;D` or PTY close. Turn-level state (`Stop` and the rest) is
not tracked in Rust; it comes from the socket channel.

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

### 2.6 What is still missing, compared to Orca

Checked again on 2026-10-24. Closed since the first pass: the offline spool
and startup race (TASK-730), the backup of `agent-sessions.json` (TASK-735),
socket permissions (TASK-732: `kex-ipc-<uid>` directory mode 0700, socket mode
0600, see section 5) and the unbounded `/tmp` debug logs (TASK-734: the logging
was removed). Still open:

- No cross-platform transport: the Unix-socket + bash-script combination does
  not run on native Windows (TASK-731, depends on TASK-736).
- One socket and one listener thread per PTY, no per-connection auth: a
  process of the same user can send forged events (TASK-736).
- Hook events are written to `settings.json` without checking the installed
  Claude Code version (TASK-893).
- The hook script prints nothing to stdout, Orca prints `{}` first (TASK-894).
- Orca forwards more events than Kex (`PostCompact`, `PreToolUse`,
  `PostToolUse`, `PostToolUseFailure`, `TeammateIdle`); whether Kex should is
  TASK-895.
- No `statusLine` integration for usage limits (TASK-738).
- No viewer for a session that has no live terminal (TASK-737).

Kex registers only events that exist in Claude Code. Orca also registers
events that older Claude builds do not know; it protects itself by checking the
installed version first, which Kex does not do yet.

## 3. Findings to backlog task map

Milestone `m-8` ("Orca notification"). Each task states its own context, so an
agent can start from "do TASK-N" without reading the rest of this file.

Done:

| Finding | Task |
|---|---|
| Docs described the old OSC 777 design, code uses a Unix socket | TASK-729 |
| No retry or spool when the socket send fails (also the startup race) | TASK-730 |
| Legacy OSC 777 parser removed | TASK-733 |
| Corrupt `agent-sessions.json` lost all restore state | TASK-735 |
| Socket permissions (already fixed in code, closed 2026-10-24) | TASK-732 |
| Unbounded `/tmp` debug logs (already fixed in code, closed 2026-10-24) | TASK-734 |

Open, by suggested order:

| Task | What | Priority | Depends on |
|---|---|---|---|
| TASK-893 | Register only the hook events the installed Claude Code version knows | High | none |
| TASK-894 | `trigger-event.sh` prints `{}` to stdout first | Low | none |
| TASK-895 | Decide whether to forward more events (measure cost first) | Low | TASK-893 |
| TASK-896 | Spool as one file per event, no bash rotation | Low | TASK-730 (done) |
| TASK-736 | One hook server for the whole app instead of one socket per tab | Medium | none |
| TASK-731 | Agents on native Windows | Low | TASK-736 |
| TASK-738 | `statusLine` for usage limits (user already has their own) | Low | TASK-736 |
| TASK-737 | Last assistant message on dormant sessions | Medium | none |
| TASK-856 | OpenCode, OMP and Pi rows on Windows (milestone `m-10`) | Low | related to TASK-731, no formal link |

## 4. Suggested reading order for whoever picks this up

Kex side, in the order the data actually flows:
1. `src-tauri/src/modules/agent/hooks/trigger-event.sh` (what leaves the hook)
2. `src-tauri/src/modules/pty/ipc.rs` (socket listener, `#![cfg(unix)]`)
3. `src-tauri/src/modules/agent/session_store.rs` (persistence + restore plan)
4. `src-tauri/src/modules/agent/mod.rs` (settings.json install/status)
5. `src-tauri/src/modules/pty/agent_detect.rs` (OSC state machine)
6. `src/modules/agents/lib/route.ts` + `notify.ts` (notification routing)
7. `src/modules/terminal/lib/useTerminalSession.ts` (resume command injection)

Orca side, for comparison while implementing any of the above:
1. `src/main/claude/hook-service.ts` + `hook-settings.ts` (install, script contents)
2. `src/main/agent-hooks/server.ts` + `hook-post-command.ts` + `hook-stdin-contract.ts` (transport, spool)
3. `src/shared/agent-session-resume.ts` (session id capture, resume argv)
4. `src/renderer/src/store/slices/agent-status.ts` (persisted sleeping-session record)
5. `src/main/native-chat/session-file-resolver.ts` + `claude-transcript-branch-proof.ts` (JSONL reading, only if Kex ever wants a no-PTY transcript viewer)

## 5. Measurements taken on 2026-10-24

Things that were checked by running them, so nobody has to repeat it. Claude
Code used was 2.1.310 (`claude --version`).

- **Unknown hook event in `settings.json`.** On 2.1.310 an invented event name
  does not break anything: Claude prints "These settings entries were skipped;
  the rest of each file is in effect ... Unknown hook event" at startup and the
  other hooks still run. Orca's fixture
  (`src/main/claude/__fixtures__/claude-hook-event-enums.json`, read from each
  release's `cli.js`) says that on 1.0.23 to 2.1.100 an unknown key makes
  Claude discard the whole user `settings.json`. Behaviour between 2.1.110 and
  2.1.310 is not measured, and newer npm releases no longer ship `cli.js`, so
  the extraction cannot be repeated. See TASK-893.
- **First Claude Code version that knows each event** (from that fixture):
  Notification 1.0.23, Stop 1.0.31, SubagentStop 1.0.41, UserPromptSubmit
  1.0.53, SessionStart 1.0.62, SessionEnd 1.0.85, SubagentStart 2.0.43,
  PermissionRequest 2.0.45, StopFailure 2.1.78, PostCompact 2.1.76,
  PostToolUseFailure 2.0.56, TeammateIdle 2.1.33, PreToolUse and PostToolUse
  1.0.23. `MessageDisplay` is not in the fixture (it ends at 2.1.110); Claude
  Code's CHANGELOG adds it in 2.1.152, and 2.1.310 accepts it and sends the
  fields `turn_id`, `message_id`, `index`, `final`, `delta`.
- **Hook script cost.** One run of `trigger-event.sh` takes about 108 ms when
  the socket send fails (20 runs in 2.15 s, spool path included). The success
  path was not measured; TASK-895 asks for it. `PostToolUse` is ignored by the
  script today and exits 0 without writing anything.
- **Socket hardening is already in place.** `ipc.rs::runtime_dir` uses
  `XDG_RUNTIME_DIR` or a `kex-ipc-<uid>` directory created with mode 0700 and
  refuses one owned by someone else (commit `490f1fc7`); `spawn_listener`
  forces the socket file to 0600. A process of the same user can still connect.
- **`statusLine` is single-slot and this machine already uses it.**
  `~/.claude/settings.json` has
  `"statusLine": {"type": "command", "command": "$HOME/.claude/hooks/run-hud.sh"}`.
  Orca leaves a user-owned `statusLine` alone, so copying it as is would do
  nothing here. Claude does not run the `statusLine` command in `-p` mode, so
  the stdin it receives was not captured; do it in an interactive session
  first (TASK-738).
- **`Stop` already carries the assistant's last message.**
  `ipc.rs` reads `last_assistant_message` into `last_message` and sends it to
  the frontend as `message`; it is just not stored in `SessionRecord` (TASK-737).
- **Kex terminals do not outlive the app.** Kex opens PTYs in-process with
  `portable-pty` (`pty/session.rs`), there is no daemon, and
  `docs/WORKSPACES.md` says the agent and its resume command die with the PTY;
  a session comes back with `claude --resume` in a new PTY, which gets a fresh
  `KEX_IPC`. Inferred from those, not from reading the app-exit code. That is why Orca's endpoint file (`ORCA_AGENT_HOOK_ENDPOINT`,
  needed because its terminals outlive the app) buys little for Kex; the
  reasons for TASK-736 are one listener instead of N, tab identity in the
  payload, a token, and a shared base for Windows and `statusLine`.
