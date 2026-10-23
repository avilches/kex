# Agent session restore

When Kex closes while a Claude Code session is running, the session id and working directory are persisted so the
session can be resumed automatically on the next launch. This document describes the full design: hook architecture,
store format, restore algorithm, frontend integration, and error handling.

---

## Overview

The feature has three cooperating parts:

1. **Hook layer (bash + Claude Code)** - writes session records to disk when a session starts.
2. **Rust restore planner** (`agent_session_restore_plan`) - reads the store at launch, resolves cwd from the JSONL
   transcript, and returns a list of `RestorePlan` entries.
3. **Frontend consumer** (`agentSessionRestore.ts` + `useTerminalSession`) - loads the plan once at app start,
   injects the resume command into the terminal after the PTY opens, and updates the tab UI.

---

## Hook layer

### Prerequisites

Claude Code hooks are installed by `agent_enable_claude_hooks`. The `agentNotifications` preference in Settings
(General > Coding agent notifications) is the master control: enabling it calls `agent_enable_claude_hooks`; disabling
it calls `agent_disable_claude_hooks`. Both commands are idempotent. On every startup, if `agentNotifications` is
true, `agent_enable_claude_hooks` is called silently to repair any missing or outdated hooks.

OpenCode, OMP and Pi are wired by file instead of by a settings merge. Kex writes one script into the agent's own
config folder, and the agent's process loads it: `agent_setup_opencode` writes
`<opencode config dir>/plugins/opencode-session.js` (`~/.config/opencode/` normally, the `OPENCODE_CONFIG_DIR`
directory when set), `agent_setup_omp` writes `~/.omp/agent/extensions/kex-agent-status.ts` and `agent_setup_pi` the
same file under `~/.pi/agent/extensions/`. Without Kex's per-terminal env vars the script does nothing. The install
lives in the bell popover (a row per agent, shown only while the integration is missing) and in Settings > General >
Agents (`AgentIntegrations`: one row per agent, Claude Code included, with Install or Uninstall and a "View changes"
link that opens the `agent_integration_preview` dry run as a diff, with one tab per file and the file's `note` above
it). `agent_*_status` tells whether the installed file is current. The frontend folds every status into one
`IntegrationStatus` (`installed`, `missing`, `malformed`, `unavailable`; `lib/integrations.ts`): the boolean of the
file-based agents maps to the first two, and `agent_codex_status` maps `upToDate` to installed and `notInstalled` and
`outdated` to missing, so Install refreshes an outdated Codex install like a stale OMP file. `malformed` and
`unavailable` block Install: the Settings row says "Cannot read config" or "Not found" ("Not supported" on Windows),
explains it and offers only "Check again" (no Install, Uninstall or View changes); the bell shows a malformed Codex as
a row without a button and hides an unavailable one.

Kex remembers what the user installed. `installedIntegrations` (in `settings-general.json`, the list of `opencode`,
`omp`, `pi` and `codex`) is written only after the file is on disk, and removed when the user presses Uninstall. On every startup
`syncIntegrations` calls `agent_sync_integrations` with that list, which rewrites each file to the version this build
ships, so an app update reaches the agent without reinstalling. The sync never creates a file and never turns a
newer one back to an older version. A file that does not start with Kex's marker is left alone and the agent drops out
of the list; one that is merely missing (a dotfiles link or a synced folder not there yet) stays on it. A link is
written through, not replaced.
`agent_remove_integration` deletes only a file that starts with Kex's marker (`// kex-opencode-v`,
`// kex-agent-status-v`) and refuses any other name than those three agents and `codex`.

Codex is wired through its own hooks instead (`codex_integration.rs`, built on the pure `codex_hooks.rs` and
`codex_trust.rs`). The Codex folder is `CODEX_HOME` when set (canonicalized, as Codex does) and `~/.codex` otherwise;
Kex never creates it, so `agent_setup_codex` fails with a clear error until Codex has been run once. Setup writes
`trigger-event.sh` (the same script and installer as Claude Code), adds one Kex handler per event (`SessionStart`,
`UserPromptSubmit`, `Stop`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, command
`[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" codex || true  # kex-session-hook`) to
`hooks.json`, and trusts each one with a `[hooks.state."<hooks.json path>:<event>:<group>:<handler>"]` table in
`config.toml`, computed from the positions the handlers really landed on. Both files are shared with Orca and Kaji, so:

- Only handlers carrying `# kex-session-hook` and only Kex's trust tables are touched. Kex's tables are the keys its
  handlers held before the edit plus any table on that `hooks.json` holding the exact hash of a Kex handler at its
  position (a leftover after positions moved); a stale one is removed on reinstall and all of them on uninstall.
  A table the user set to `enabled = false` keeps it while its key stays the same.
- `hooks.json` is written only for a semantic change: when the parsed result equals the parsed file (key order
  ignored) the bytes are kept, so the startup sync never rewrites a file Kaji reformatted in its Swift style (sorted
  keys, `" : "`, `\/`) and the preview shows nothing. A real change re-serializes it (`serde_json` keeps key order, but
  whitespace and `\/` escapes are normalized), so other tools' handlers stay equal as JSON, not as bytes; the "View
  changes" preview says so in its `note`. `config.toml` is edited textually and keeps every other byte.
- A `hooks.json` or `config.toml` that cannot be parsed is never written: setup, uninstall and the preview fail with
  "leaving it alone". The edited `config.toml` is checked the same way before anything is written: it must parse as
  TOML and every Kex table must read back with its hash, so a trust table in a form the textual editor does not see
  (an inline table under `[hooks.state]`, a quoted `["hooks".state."..."]` header) is never duplicated into a file
  Codex would refuse; neither file is written and the integration counts as malformed. In those cases
  `agent_codex_status` reports `malformed` and Settings blocks Install. The startup sync only skips `codex` (with a
  warning in the log) and keeps it in `installedIntegrations`, because a file that does not parse may be another tool
  halfway through a write, and dropping it would stop refreshing an install that is still there. A `hooks.json`
  without Kex handlers is different: it drops `codex` from the list, as a file that lost its marker does for the
  other agents. A missing `hooks.json` or Codex folder keeps it tracked and nothing is created.
- Windows is not supported yet (`codex_integration::HOOKS_SUPPORTED` is `cfg!(unix)`): the handler command is POSIX
  shell and how Codex runs a hook there has not been measured. `agent_codex_status` reports `unavailable`, setup and
  the install preview fail, the startup sync skips `codex` and keeps it tracked, and nothing is written.
- Both files are read, planned and re-read just before writing; if another tool wrote in between the plan starts over
  (three attempts). On install the trust tables go in before the handlers, on uninstall they come out after them, so
  Codex never sees a Kex handler without its trust.

### KEX_TAB_ID

Every PTY session receives a `KEX_TAB_ID` environment variable (a UUID matching the tab's id in the workspace
state). This is injected in `pty/shell_init.rs` → `apply_common` and is available to all processes running inside the
terminal, including hook scripts.

### SessionStart hook

Triggered by Claude Code at session start. The hook command:

```
[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" || true  # kex-session-hook
```

The script (`~/.config/kex/hooks/trigger-event.sh`, marker: `kex-session-v8`) handles all 10 registered Claude Code
hook events the same way:

1. Reads `KEX_TERMINAL` and `KEX_TAB_ID` from the environment. If either is unset, exits silently (tab is not
   managed by Kex).
2. Uses `jq` to re-serialize the payload tagged with `"agent"` set to the script's first argument, `claude` when
   there is none (Claude Code's hook command has no argument; the Codex handlers installed by `codex_hooks.rs`
   pass `codex`; OpenCode's plugin writes the socket itself with `agent: opencode`) and to extract
   `hook_event_name`, only to pick the handler. The marker conditions the reinstall check in
   `agent_claude_hooks_status`: users with a `kex-session-v7` file see the install button again.
   The script no longer writes the payload to disk: an earlier
   version dumped it unbounded to `/tmp/kex-hook-<event>.log` and `/tmp/kex-tab-<tab_id>.log` for field discovery,
   which on a multi-user Linux box was readable by other local users, a `/tmp` symlink-attack target, and grew
   without rotation (TASK-557); removed with no replacement since nothing depended on it.
3. Forwards the JSON payload, re-serialized by the `agent` tag, to the socket at `$KEX_IPC` (`send_ipc`): `nc -w 1 -U`,
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

`record_session` returns whether the stored record has a `launch_cmd`, and the `kex:agent-session-meta` payload carries
it as `launchKnown`. A `SessionStart` with `source` `clear`, `compact` or `resume` may continue the process already running in the
tab (`/clear`, `/compact` and `/resume` inside it), so no new line went through the shell and the previous record's
`launch_cmd` is kept when nothing was stashed; `startup` never inherits it. The stash itself is dropped when the
agent exits, so a launch that never reached `SessionStart` cannot leak its command into the next one.
`launchKnown: false` means that a restore can only use the agent's plain command.

In the frontend, `AgentNotificationsBridge.handleSessionMeta` creates the tab's agent session (idle) if none exists yet
and stores `launchKnown` in `session.meta`. Without this the icon of an agent launched by an unrecognised script
would only appear with the first prompt, because the hooks other than `SessionStart` are the only ones that emit
`kex:agent-signal`. `PaneTabBar` draws the icon struck through with the tooltip "Launch command unknown: restore will
use plain claude --resume" when `meta.launchKnown === false` (`agentIconMark` in `workspaces/lib/agentRestore.ts`).
The strike of "Run on start is off" wins when both apply. The restore itself is unchanged: it still relaunches with
`claude --resume '<id>'`. After that restore the line Kex types is recognised, so the strike goes away.

Known limits of a launcher that was not recognised: the detector was never armed, so no `OSC 133;D` ends the session
and the icon stays on the tab after the agent quits, until the tab closes (the same as it already did after the first
prompt). A `claude -p` run is also not filtered, because the print-mode check needs the shell line; it shows the
struck icon until the tab closes.

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

### OpenCode plugin

OpenCode has no hook commands; its extension surface is plugins (JS modules its own process loads from
`~/.config/opencode/plugins/`). Kex ships `plugins/opencode-session.js` (`agent::OPENCODE_PLUGIN_SCRIPT`, marker
`kex-opencode-v3`, embedded with `include_str!` and written atomically by `agent_setup_opencode`). When `KEX_IPC` and
`KEX_TAB_ID` are present in the plugin host's environment it translates the session lifecycle into the frames Claude
Code's hooks emit, sent directly on the socket:

- `SessionStart` once per session id, with `agent: "opencode"`, an empty `transcript_path` and a `cwd` (the session
  directory from `session.created`, `process.cwd()` otherwise). It is sent on `session.created` and, for a TUI resumed
  with `--session`, on the first `session.status` busy, `permission.asked` or `question.asked` that names the session
  (measured on opencode 1.19.3: those arrive although `session.created` does not, the gap reported in
  anomalyco/opencode#39711). A second session in the same process is sent with `source: "resume"`, so the tab keeps its
  launch line, and switching back to a known session re-records it as the tab's.
- `UserPromptSubmit` when `session.status` turns `busy` or `retry` and no session of the process was working.
- `Stop` when the last working session goes idle (`session.idle` and `session.status` idle both mean that; one `Stop`
  per turn). A user abort (`MessageAbortedError`) also ends the turn this way.
- `PermissionRequest` on `permission.asked` (the permission is the tool name) and `question.asked`. A subagent that
  asks sends it on behalf of its parent session.
- `StopFailure` on any other `session.error`, carrying the message; the turn then sends no `Stop`.
- `SubagentStart` when a child session (one with a `parentID`) is created under a session the tab already shows, and
  `SubagentStop` when that child goes idle or fails. The row label is the child's title without OpenCode's
  `(@<agent> subagent)` suffix, and the type is the child's agent. A child never ends the turn of its parent.

Subagent sessions (those with a `parentID`) are never reported as the tab's session. `session.created` carries the parent; for a session that
already existed, the plugin asks the OpenCode client once (`client.session.get`) and treats the session as a subagent
when the lookup fails. OpenCode does not await plugin handlers, so the plugin claims a session before its first send and
remembers a turn that ends while the registration is still in flight. Frames are best-effort: no spooling, a 2 s send
cap, silent failure. The plugin host is born in the launch directory and never moves.

OpenCode keeps its history in a SQLite database (`~/.local/share/opencode/opencode.db`), not in a per-session file, so
the frames carry no transcript path and the tab menu's OpenCode block has no transcript actions: it offers "Copy Session ID"
and "Run on Start" only.
A restored tab has the same record as any other: it is keyed by the tab's old session id, never pruned (the provider
row's policy is `ResumeAnyway`) and `opencode --session '<id>'` runs in the same launch directory.

The OSC/`AgentDetector` layer still detects plain `opencode` invocations like any other agent (loaded via
`DEFAULT_AGENTS`), which is what produces `Started`, the `exited` signal and the capture of the launch line.

### OMP and Pi extension

OMP and Pi share an extension API: TypeScript modules their own process loads from `~/.omp/agent/extensions/` (Pi:
`~/.pi/agent/extensions/`, `--extension`/`-e` for ad hoc loads, `--no-extensions` to disable discovery). Kex ships one
source, `plugins/kex-agent-status.ts` (`agent::AGENT_EXTENSION_TEMPLATE`, marker `kex-agent-status-v4`, embedded with
`include_str!`). `agent_setup_omp` and `agent_setup_pi` stamp the runtime name into the template's `agent` constant and
write the result atomically into the matching folder, so one file reports `agent: omp` and the other `agent: pi`. Their
status commands compare the whole installed file with the script stamped for that runtime, so an outdated copy, or one
stamped for the other runtime, counts as not installed.

The extension computes nothing about sessions itself: it translates the runtime's lifecycle events into the frames
Claude Code's hooks emit.

- `session_start` becomes `SessionStart` as soon as the runtime opens the session, before any prompt, so a restored or
  woken tab gets its icon and transcript menu right away; OMP announces `/new` and `/resume` with `session_switch`
  instead, which is handled the same way; `before_agent_start` and `agent_start` report it too if it was missed and add
  `UserPromptSubmit`. One `SessionStart` per session id. The first one is sent with `source: "startup"` and any later one
  with `source: "resume"`, so a `/new` inside the TUI keeps the tab's launch command.
- OMP runs subagents through its `task` tool, in the same process, each in its own session whose header names the
  parent (`parentSession`). The extension listens on `pi.events` for `task:subagent:lifecycle` (`started`, then
  `completed`, `failed` or `aborted`, with the subagent `id`) and sends `SubagentStart` and `SubagentStop` with
  `agent_id`, `agent_type` and `description`, under the session the tab shows. A subagent's own session is never
  reported as the tab's session, its prompts and turn ends are ignored, and an approval it asks for raises attention on
  the parent. Pi has no subagents (its tools are read, bash, edit and write), so the channel never fires there.
- A run started with `-p` or `--print` (before any `--`) sends nothing at all: a one-shot answer is not a session to
  restore.
- Because the session is reported at startup, a tab where the agent was opened and closed without a prompt records a
  session whose file does not exist yet. It has no restore plan and replaces the tab's previous record.
- Every frame carries `transcript_path`, the runtime's session file (`ctx.sessionManager.getSessionFile()`), which feeds the
  tab's "Reveal Transcript" menu and the live model read (`live_model` also understands their `{type:"message"}` entries).
- `message_end` caches the assistant text.
- `tool_approval_requested` (OMP only) becomes `PermissionRequest`. Pi has no approval flow, so it never raises
  attention from a permission prompt.
- The turn ends with a single `Stop` carrying the cached text. OMP uses `agent_end` and skips the ones flagged
  `willContinue`; Pi ignores `agent_end` because it keeps working afterwards (retries, compaction, queued work) and
  only `agent_settled` is final.

Frames go on the `KEX_IPC` socket (1 s send cap, silent failure), session ids come from
`ctx.sessionManager.getSessionId()` and every send is gated on `KEX_IPC` + `KEX_TAB_ID`, so a bare `omp` or `pi` run is
untouched. Child processes inheriting a parent's environment may load the extension again; the first loader asserts
itself with `KEX_AGENT_STATUS_OWNED` (pid).

Measured facts that drive the two provider rows:

- **OMP** (18.11.3): resume is `omp --resume` (id, prefix or path, picker when no value). Sessions are
  `~/.omp/agent/sessions/<cwd-encoded>/<timestamp>_<id>.jsonl`, whose line 2 is the `session` header
  (`{type:"session", version, id, timestamp, cwd}`) after a `title` line. `agent.db` is auth and history only.
- **Pi** (1.3.0): resume is `pi --session <path|id>` (`--resume` only opens a picker; `--session-id` creates a session
  when missing and is not used). Sessions are `~/.pi/agent/sessions/<cwd-encoded>/<timestamp>_<id>.jsonl`, with the
  `session` header on line 1 and no `title` line. A Pi started without a prompt creates an empty group directory but no
  file, and the extension reports the session at startup, so the record exists but its file does not, which means no restore plan
  and nothing to resume.

Both rows use `KeepWithoutPlan` with empty whitelists and the same suffix scan (`SessionsSource::OmpSessions` /
`PiSessions`, `CwdRead::HeaderLine(2)` / `HeaderLine(1)`).

OMP draws its own OSC 133 marks as one unbroken `B C D;0` string around every message it shows and again when it
resumes a session. `AgentDetector` ignores a `D` that is stuck to a `C` without command text (nothing at all between
them) while an agent armed by a named command is running: a shell that names its commands never sends a bare `C`, and
its own `D` comes after the agent's output. Without this the tab lost its agent on the first message, the launch
command was forgotten and the icon was struck through. Pi draws `A B C` and never a `D`, so the shell's `D` after it is
the real exit and ends the session; any text or escape sequence between the `C` and the `D` has the same effect.

OMP does not start in the user's home folder: unless `--allow-home` is given it switches to a temporary directory, so
its session header and the extension's frames report `/tmp`. Kex restores such a tab in `/tmp`, which is where OMP
says the session lives.

The OSC/`AgentDetector` layer still detects plain `omp` and `pi` invocations like any other agent (loaded via
`DEFAULT_AGENTS`), which is what produces `Started`, the `exited` signal, the capture of the launch line and the
print-mode gate.

### Codex hooks

Codex reports its sessions through the hooks described under "Hook layer": one Kex handler per event in Codex's
`hooks.json` (`SessionStart`, `UserPromptSubmit`, `Stop`, `PermissionRequest`, `SubagentStart`, `SubagentStop`), each
trusted with its `[hooks.state."<key>"]` table in `config.toml`, because Codex skips a handler it has not trusted. Every
handler runs `trigger-event.sh codex`, and the argument is what tags the frame: the script puts it in `agent`, so
`pty/ipc.rs` needs nothing Codex-specific. Frames carry the same fields as Claude Code's (`session_id`,
`transcript_path`, `cwd`, `hook_event_name`, `source`); `transcript_path` may be `null` and is then recorded as empty.
`SessionStart` records the session (id, transcript path, cwd and the stashed launch line) and emits
`kex:agent-session-meta` with `agent: codex`; the other events become `kex:agent-signal` frames tagged `codex`, exactly
as for Claude. `SubagentStart` / `SubagentStop` feed the same subagent gate; Codex's `Stop` carries no subagent list, so
the ones it reported are kept until their own `SubagentStop`, as for OMP. The tab menu block offers Copy Session ID and
Run on Start, and the transcript actions only when the frame named a rollout (`hasTranscriptActions`): with an empty
path there is nothing to reveal, so it hides them, as for OpenCode, instead of "Transcript not created yet".

The provider row (`provider.rs`) reads Codex's own files and nothing else:

- **Rollouts.** Codex writes one JSONL per session at
  `<CODEX_HOME or ~/.codex>/sessions/YYYY/MM/DD/rollout-<local timestamp>-<uuid>.jsonl`; the uuid is the session id.
  `SessionsSource::CodexSessions` tries the recorded `transcript_path` first, then walks the three date levels newest
  first and returns the `rollout-*-<id>.jsonl` of the first day that holds one. The depth is fixed, so a recent session
  costs a handful of directory reads even when the tree holds thousands of rollouts; anything else in the tree (files
  that do not start with `rollout-`, other extensions, directories) is ignored. `CODEX_HOME` is resolved like the
  hooks folder (canonicalized when set). Kex reads it from its own environment, so a `CODEX_HOME` exported only in the
  shell is not seen by a Kex started from the Dock; the recorded `transcript_path` covers that case when Codex sends it.
- **Launch cwd.** Line 1 of a rollout is `{"type":"session_meta","payload":{"id":...,"cwd":...}}`;
  `CwdRead::HeaderLine(1)` reads `payload.cwd` from it (the same reader takes OMP's and Pi's `{type:"session", cwd}`).
- **Resume.** `codex resume '<id>'` on top of the stripped launch line (Codex's stripping whitelists are empty, so the
  base collapses to the launcher, `codex-max` included).
- **Missing rollout.** The policy is `ResumeAnyway`: a session may have no rollout yet, and `codex resume <id>` is the
  only way back to it, so the plan still runs in the recorded launch directory and the record is never pruned.
- **One-shot runs.** `codex exec ...` and its alias `codex e ...` are Codex's non-interactive mode and never become a
  session to restore. The print-mode check (`Invocation::is_print_mode` in `launch_cmd.rs`) looks for that subcommand
  as the first word after Codex's global options, skipping the value of the options that take one (`-c`, `-m`, `-p`,
  `-s`, `-a`, `-C`, `-i`, `--add-dir`, `--enable`, `--disable`, `--local-provider` and their long forms), so
  `codex -c model=o3 exec ...` is caught and `codex -m exec` is not. For Codex `-p` is `--profile`, so `codex -p work`
  is an interactive session and is recorded. `codex`, `codex "prompt"` and `codex resume <id>` are recorded.

**Measured and assumed.** The Codex integration was written on a machine without Codex credentials, so no session with
a model ever ran against it. Measured: the trust hash (the algorithm reproduces the 10 real `trusted_hash` values of an
Orca `config.toml`), the rollout file layout and the `session_meta` line, and the behaviour of every Kex-side piece under
unit tests. Assumed from Codex's documentation and Orca's code, and not yet seen live: the events Codex really fires
and their payloads (including whether `transcript_path` is `null` before the first message and whether `SubagentStart` /
`SubagentStop` exist in a given version), what `codex resume <id>` does for a session with no rollout (hence
`ResumeAnyway`; `KeepWithoutPlan` is the one-line fallback), the list of options that take a value in the `codex exec`
gate, whether Codex draws OSC 133 marks of its own (the rule OMP needed in `AgentDetector`, see above; until measured
`AgentDetector` treats Codex like any other agent) and whether `live_model` can read the model from a rollout (it
reports nothing for Codex). The manual steps that settle each one are in `RESTORE_SESSION_TESTS.md`, Bloque K, K15.

`MissingTranscriptPolicy` has four values: `Reattach` (claude), `ResumeAnyway` (codex, opencode: always run the resume
template in the recorded directory and never prune), `KeepWithoutPlan` (omp, pi: keep the record, plan nothing) and
`Ignore` (no row uses it today). `KeepWithoutPlan` was introduced with the Codex rollout lookup, because
`ResumeAnyway` used to mean "no plan, never prune" for a provider with a sessions source (omp, pi) and "always resume"
for one without (codex, opencode); with codex gaining a source the two had to be told apart.

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

#### Which part of the line is kept

The `OSC 133;C` text is the line as typed: aliases are not expanded, control characters (newlines included) are
flattened to spaces, and the zsh, fish and PowerShell scripts cut it at 256 characters. bash sends no text at all (its
`PS0` marker is empty), so bash tabs never get a `launch_cmd`. The line can therefore be `cd dir && claude-max --resume
x`, `(cd dir; FOO=1 claude)` or `cd ~/claude-docs`, and only the invocation of the agent must be stored and replayed.

`agent/launch_cmd.rs::find_agent_invocation` (pure, no IO) splits the line into segments at `&&`, `||`, `;`, `|`,
`&` and parentheses outside quotes, and keeps the **last segment whose command word is an agent** (`claude`, `codex`,
`opencode`; `claude-max`, `/opt/bin/claude` and `\claude` count). The command word is the first token that is not a leading
reserved word (`{`, `!`, `then`, `do`, `else`), a `VAR=value` assignment, a redirection or a wrapper (`env`, `time`,
`command`, `nohup`, `nice`, `sudo`, `exec`, `timeout`, `npx`, `caffeinate`, with the options listed in the code). What
is stored is that segment from its first assignment or wrapper to its end, without any redirection that came before
the command word, so `cd x && FOO=1 claude-max --resume 'a'` stores `FOO=1 claude-max --resume 'a'`.

Anything it cannot resolve with certainty is not guessed, and what happens depends on the case:

- **No match.** A wrapper option it does not know (`sudo -Eu bob claude`), a subcommand-style launcher (`pnpm dlx
  claude`, `bun x claude`, `direnv exec . claude`, `ssh host claude`) or an alias or function typed by its own name
  (`cm`, `cf`) is not detected. No `Started` is emitted, nothing is stashed and the restore falls back to a plain
  `claude --resume '<id>'`, which silently drops the launcher name and its environment. This is deliberate: the
  alternative is storing a wrong command.
- **Shell-dependent quoting.** `'it\'s'` closes at the second quote in zsh and not in fish, and a backtick inside
  double quotes is a substitution in POSIX shells and the escape character in PowerShell. The OSC does not say which
  shell sent the line, so the whole line gives no match.
- **Cut line.** If the line ended inside a quote, a substitution, `${...}` or after a lone backslash, or is 256
  characters or longer (it may have been cut), the agent is still detected but `Started.cmd_string` is empty: the text
  is never replayed, because retyping it would leave the shell at a continuation prompt. `strip_for_resume_base`
  applies the same rule to stored values.
- **Known blind spots.** A `\` + newline continuation arrives as `\ ` plus a space and becomes a stray argument.
  Command substitutions, backticks, `<(...)` and `${...}` are consumed whole, quotes inside them included, but never
  analysed, so fish's `(cmd)` substitution splits the segment. `#` comments are not parsed: zsh does not treat them as
  comments interactively, while fish and PowerShell do, so `ls # ; claude` is detected there.

The process the shell runs is not a source for the command: a wrapper such as `claude-max` ends with `exec claude`,
so the process shows a plain `claude` and its cleaned environment is gone.

The stripping whitelists are empty for `codex`, `opencode`, `omp` and `pi`, so the stripped base collapses to the
launcher (pinned by tests). The plain templates used when no launch command is known are `claude --resume '<id>'`,
`codex resume '<id>'`, `opencode --session '<id>'`, `omp --resume '<id>'` (id, prefix or path) and `pi --session '<id>'`
(id or path).

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

Per-agent knowledge lives in one table: `src-tauri/src/modules/agent/provider.rs` (transcript source and scan root,
how the launch cwd is read back from a transcript, resume and reattach templates, missing-transcript policy, and the
stripping whitelists). `session_store.rs` stays agent-agnostic: it owns the store file, the print-mode gate (still
driven by `DEFAULT_AGENTS`) and the launch-line recognizer, but builds no commands itself. Rows today: `"claude"`,
`"codex"`, `"opencode"`, `"omp"` and `"pi"`. A record whose agent has no provider row emits no plan: the planner logs a warning and prunes the
record once its launch directory is usable (kept otherwise), so the store cannot fill with entries nothing can
ever resume.

---

## Rust restore planner

`src-tauri/src/modules/agent/session_store.rs` - `load_restore_plan() -> Vec<RestorePlan>`

### Algorithm

For each session in the store:

1. **Resolve the provider row** (`provider::Provider::of`); `claude`, `codex`, `opencode`, `omp` and `pi` exist today. A record of an agent
   with no row produces no plan and no command (see above).
2. **Find the transcript.** Only providers with a sessions source do this; opencode has none and jumps straight
   to its resume template. OpenCode keeps its sessions in a SQLite database (Kex does not read it; the plugin
   supplies the session id and cwd directly), so there is nothing to seek on disk. Claude's source checks the stored `transcript_path` first, then scans
   `$CLAUDE_CONFIG_DIR/projects/**/<sessionId>.jsonl` (or `~/.claude/projects` when the override is unset).
   OMP's and Pi's sources (`OmpSessions`, `PiSessions`) keep the never-populated `transcript_path` shortcut for symmetry
   and scan `~/.omp/agent/sessions/**/<timestamp>_<sessionId>.jsonl` (Pi: `~/.pi/agent/sessions/**/...`), keeping the
   lexicographically latest file (names carry a timestamp). Codex's (`CodexSessions`) checks the recorded
   `transcript_path`, then walks `<CODEX_HOME or ~/.codex>/sessions/YYYY/MM/DD/` newest first for
   `rollout-*-<sessionId>.jsonl` (see "Codex hooks").
3. **Transcript found - resume.** The launch cwd is read back with the row's cwd-read strategy (claude: if a
   `worktree-state` entry with a non-null `worktreeSession` comes before the first entry carrying a `cwd`, its
   `originalCwd` wins, because the entries' own `cwd` is the worktree and may be deleted by restore time; otherwise
   the first `cwd` field, and `cwd_launch` from the store when the transcript has none. omp and pi: the `cwd` of the
   `session` header, JSONL line 2 for omp and line 1 for pi; codex: `payload.cwd` of the `session_meta` entry on line 1). For claude the plan also carries `worktreeCwd`: the
   `worktreePath` of the last `worktree-state` entry, only when that folder still exists. The resumed agent
   reports its folder after the first prompt (its resume `SessionStart` carries the launch folder, so that event
   is not forwarded as an agent cwd), so `applyStagedSnapshot` seeds `agentCwd`/`worktreeCwd` from the plan and
   New Terminal ("last folder") lands in the worktree from the start. The command is the row's
   resume template on top of the stripped launch line: `strip_for_resume_base(launch_cmd, agent) + --resume '<id>'`
   (shell-quoted), or the plain per-agent template when no launch command is known (`claude --resume '<id>'`,
   `omp --resume '<id>'`, `pi --session '<id>'`, `codex resume '<id>'`).
4. **Transcript missing - the row's missing-transcript policy decides.**
   - `Reattach` (claude): the session was opened but no message was ever sent (a transcript only appears on the
     first exchange). The plan is `strip_for_resume_base(...) + --session-id '<id>'` (or the plain template), which
     starts a new session reusing the same UUID, equivalent to rerunning the CLI with no `--resume`. The store
     entry is pruned once the directory check passes; if the new session produces messages, hooks re-record it with
     the new `transcript_path`.
   - `ResumeAnyway` (codex and opencode): the resume template runs anyway in the recorded launch directory. For
      codex it is `launch base/launcher + resume '<id>'` (or the plain `codex resume '<id>'`), reached when the
      session has no rollout yet or the lookup cannot see it; opencode has no source at all and always takes its
      template, `launch base/launcher + --session '<ses id>'` (or the plain `opencode --session '<ses id>'`, since its
      stripping whitelists are empty). The entry is never pruned: nothing re-records a resumed codex session that
      never reaches a new `SessionStart`, and the plugin is silent on the resumed session of an opencode TUI
      (anomalyco/opencode#39711).
   - `KeepWithoutPlan` (omp and pi): reachable when the sessions root no longer holds the file (neither cleans
      anything today, but a copy deleted by the user, or a session closed before its first turn, is the case in
      point). Without the file there is nothing to verify: the record is kept and no plan runs. With the file,
      omp's command is `launch base/launcher + --resume '<id>'` (or the plain `omp --resume '<id>'`), which accepts
      id, prefix or path, and pi's is `launch base/launcher + --session '<id>'` (or the plain `pi --session '<id>'`).
   - `Ignore` (reserved for providers whose sessions cannot be revived): no plan is emitted; the entry is pruned
     once its directory is usable.
5. **Verify the directory is usable** (`launch_dir_problem`: missing, not a folder, or unreadable) *before* any
   pruning. If it is not, the plan carries a non-empty `error_reason`, an empty `resume_cmd`, and the command that
   would have run in `attempted_cmd`. The terminal does not start: the tab is held on a modal (see "Blocked start"
   below). The store entry is kept (even when the transcript is also missing), so "Try again" can still find the
   session; it goes away when the agent exits, the tab is closed, or the user cancels the restore.

`preview_resume_cmd` runs this same planner but passes no store path, so the preview can never mutate the file on
disk.

The PTY is spawned with `plan.cwdLaunch` as the initial working directory, so no `cd` prefix is needed in the command.

### Command stripping

`strip_for_resume_base(cmd, agent)` first runs `find_agent_invocation` again on the stored text, so a record written
with a `cd dir && claude ...` prefix (the bug of TASK-826) is healed on read instead of restoring as `cd --resume`.
It returns `None` when the agent has no provider row or no agent is launched in the text, and the planner then uses
the plain per-agent template. The
launcher part (assignments, wrappers and the command word) is kept as typed; the arguments go through the whitelist
stored in the agent's provider row (`CLAUDE_KEEP_FLAGS` / `CLAUDE_KEEP_WITH_VALUE` in `provider.rs`). It keeps flags
that remain meaningful for an
interactive resume and drops one-time flags (e.g. `--worktree`, `--from-pr`, `--tmux`, `--model`, `--effort`).
Redirections after the launcher (`2>/dev/null`, `> out.log`) are dropped and never consumed as a flag's value; `<(cmd)` and `>(cmd)` are values, not redirections, and are kept.

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

Tokens keep their quotes, so a quoted value with spaces (`--system-prompt "hello world"`) stays one value. Tokens keep their quotes, so a quoted value with spaces (`--system-prompt "hello world"`) stays one value. A positional prompt that follows a whitelisted value flag is still read as one more value of that flag. A stored command that was cut is refused (see above).

### Print-mode filtering

Sessions started with `-p` / `--print` are non-interactive and transient. `agent_detect.rs` looks for the flag in
the arguments of the agent segment only, and not after `--` (`ls -p; claude` and `time -p claude` are not print mode) and returns before
arming the detector, so nothing is stashed. It emits `PrintRun` instead, and `session.rs` marks the tab
(`session_store::mark_print_run`); the shell's `OSC 133;D` (or the PTY closing, or the next agent start) emits
`PrintRunEnded` and clears the mark. While the mark is set `ipc.rs` drops every hook frame of the tab, because Claude
Code fires `SessionStart`, `UserPromptSubmit`, `Stop` and `SessionEnd` in print mode too, and each of them would
create an agent session (a struck icon with `launchKnown: false`) that nothing ever closes. `record_session` still
checks a stashed `launch_cmd` with `is_print_mode_cmd` as a second gate. OpenCode's non-interactive entry point is the
subcommand `opencode run <prompt>`, which carries no `-p`/`--print` flag and therefore passes this gate: it is
recorded and its restored session reopens the TUI on that session. Codex's one-shot mode is the subcommand
`codex exec` (alias `codex e`); for `codex` the check looks for that subcommand instead of `-p`, which there means
`--profile` (see "Codex hooks").

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

`rename_all = "camelCase"` is required - the frontend Map is keyed by `tabId` and would silently miss all sessions
if it received `tab_id` instead.

### Single-tab preview

`preview_resume_cmd(tab_id) -> Option<RestorePlan>` computes the same `RestorePlan` for one tab on demand, backing the
`agent_session_preview_cmd` command. It shares `build_plans_from` with `load_restore_plan`, but calls it with
`store_path: None`, which skips every `remove_panel_from_store` call in that function - so, unlike
`load_restore_plan`, it never mutates `agent-sessions.json` and can be called repeatedly while a session is live (e.g.
each time the "Command" submenu opens) without racing the real startup restore.

---

## Frontend integration

### agentSessionRestore.ts

`src/modules/agents/lib/agentSessionRestore.ts`

Loaded once at app start (`App.tsx`) via `loadRestorePlans()`, which calls `agent_session_restore_plan` and stores the
result in a module-level `Map<tabId, RestorePlan>`. `consumeRestorePlan(tabId)` returns and deletes the plan for a
given tab - consume-once semantics prevent double injection.

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
  per-leaf counter that stays on for at least 650ms (`MIN_BUSY_MS`) so a fast retry does not just flicker. While it is
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

### Reopening a closed terminal tab or workspace

"Reopen Closed Tab" (`tab.reopenClosed` in `useWorkspaces.ts`) reuses this same consumption path instead of
duplicating it. A reopened tab gets a brand new id, so it can never find a match in the startup-loaded
`restorePlans` map on its own. Before creating the new tab, `reopenClosed` calls `previewResumeCmd` with the id the
*closed* tab had (available on the captured `ClosedEntry`, gated by `needsResumePlanLookup` so a tab with "Run on
start" off never bothers) and, if a plan comes back, seeds it into the same map under the *new* tab's id via
`seedRestorePlan`. From there `useTerminalSession.ts` cannot tell the difference: it consumes the seeded plan
exactly like one loaded at launch, same `cwdLaunch`, same 200ms injection delay, same `restored`/`restoreError`
states.

Reopening a closed workspace runs the same lookup for each of its terminal tabs, keyed by the old id and seeded
under the new one, and moves the stashed attention sessions and notifications to the new ids with
`restoreClosedSession`. A workspace closed while hibernated keeps its terminal ids and skips this: its stored sessions
are untouched and the normal wake-up restores them.

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
surfaced in the tab context menu (`TabAgentMenuItems`, rendered by `TabContextMenuItems`): Copy Tab ID for every tab, and
for agent tabs Copy Session ID (only with a `sessionId`) plus Open Transcript Folder and Reveal Transcript in Finder (only
with a `transcriptPath`). The two copy entries show the id they copy below their label. "Run on start" lives in the tab context menu (`RunOnStartMenu`, used by `TabContextMenuItems`), as a
`Run on Start` submenu with an `Enabled` checkbox and the command field inline (no third submenu). The path bar has no run-on-start icon; while
an agent is alive the agent icon of the tab (struck through when it is off) says it, and the path bar shows no status
dot either, only the model name, because the tab icon already carries the working and attention states.

- **Enabled** checkbox: toggles `restoreOnRestart` on the panel. For agent sessions it defaults to checked
  and enabling it captures the current running command as the `persistentCommand` if none is already set - this is only
  a fallback default now (see below), not what normally gets shown or run.
- **Command preview**: for a tab with a live agent session, this is a *live, read-only* preview of the resume command
  that will actually run on the next Kex launch, fetched from `agent_session_preview_cmd` (via `previewResumeCmd`) when
  the menu opens and whenever the session id changes (e.g. after `/clear`). It is computed the same way as the startup
  restore plan - `claude --resume <id>` once the JSONL transcript exists, `claude --session-id <id>` before that - so it
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
  (`AgentNotificationsBridge.tsx`), which calls `store.finish(tabId)` - deleting the session from `agentStore`
  entirely, not just clearing it - and `agent_detach_session`, which removes the tab's entry from
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

- `restored: boolean` - true while the session was opened via restore (cleared on the first real OSC event).
- `restoreError: boolean` / `restoreErrorReason?: string` - set if the plan had an empty `resumeCmd`.

Actions:

- `startRestored(tabId, workspaceId, agent)` - creates a session record with `restored: true`, `status: "working"`. No production code calls it today (TASK-666); the session of a restored tab is created by the first agent signal.
- `setRestoreError(tabId, workspaceId, agent, reason?)` - sets `restoreError: true`.
- `setStatus` (existing) - clears `restored` on the first real state transition.

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
`~/Library/Logs/app.betauer.kex/Kex.log` on macOS, see `docs/USER_DATA.md` for the other folders).
`user-data/logs-dev` is the equivalent for a `pnpm tauri dev` build.

Two things to check if the log looks unhelpful right after a restore failure:

- **The file is empty or was just created.** Until TASK-769, the rotation policy was `RotationStrategy::KeepOne`,
  which deletes the previous log with no backup, and does so as soon as the app starts (the size check runs before
  the new session writes anything) - so a log that had already grown past `max_file_size` in the *previous* session,
  the one that actually failed to restore, was gone before you could open it. Kex now rotates with
  `RotationStrategy::KeepSome(20)`, which renames the oversized file instead of deleting it: look for
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
| JSONL transcript missing (no messages sent) | Entry removed from store (unless the launch directory is unusable); `claude --session-id <id>` injected - new session reuses same UUID |
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
  opened is not a failure. OpenCode is exempt (`expectsSessionReport`): its plugin only names a session on its first
  event, so a restored tab nobody has typed in is silent by design, and the id is already in the resume command.

Each toast is also written to `Kex.log` (`user-data/logs-dev/Kex.log`) as a `WARN` line starting with
`[agent-session]`, so the log can be searched for it after the toast is gone.

It cannot see a session that was never recorded in the store (hook without `KEX_TAB_ID`, `agentNotifications` off,
`-p`): that session is not among the N plans to begin with.
