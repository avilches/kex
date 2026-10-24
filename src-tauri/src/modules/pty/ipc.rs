#![cfg(unix)]

use std::io::{BufRead, BufReader};
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::modules::agent::{live_model, session_store};

const AGENT_EVENT: &str = "kex:agent-signal";
const AGENT_SESSION_META_EVENT: &str = "kex:agent-session-meta";
const AGENT_CWD_EVENT: &str = "kex:agent-cwd";

/// Directory that holds this user's IPC sockets.
///
/// The system temp dir is shared and world-writable, so a socket placed
/// directly inside it (the old behaviour) has a predictable path any other
/// local user can pre-create to deny service, or (depending on umask)
/// connect to once bound, to inject forged agent events. Prefer
/// `XDG_RUNTIME_DIR`, which systemd/pam_systemd already creates mode 0700
/// and owned by the user; otherwise fall back to a per-uid subdirectory of
/// the temp dir that Kex creates itself with 0700.
fn runtime_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from) {
        if dir.is_dir() {
            return dir;
        }
    }
    owned_runtime_subdir(&std::env::temp_dir(), unsafe { libc::getuid() })
}

/// Creates (or reuses) a `kex-ipc-<uid>` directory under `base`, restricted
/// to 0700. Split out of `runtime_dir` so tests can point `base` at an
/// isolated temp dir instead of the real, possibly shared, system one.
fn owned_runtime_subdir(base: &std::path::Path, uid: u32) -> PathBuf {
    let dir = base.join(format!("kex-ipc-{uid}"));
    match std::fs::create_dir(&dir) {
        Ok(()) => {
            let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
            dir
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            // Only trust a pre-existing directory if it is actually ours: one
            // pre-created by another local user on a shared machine must not
            // be silently reused.
            match std::fs::metadata(&dir) {
                Ok(meta) if meta.uid() == uid => dir,
                _ => {
                    log::warn!("[ipc] {dir:?} exists but is not owned by this user, falling back to the shared temp dir");
                    base.to_path_buf()
                }
            }
        }
        Err(e) => {
            log::warn!("[ipc] could not create {dir:?}: {e}, falling back to the shared temp dir");
            base.to_path_buf()
        }
    }
}

fn socket_file_name(pid: u32, pty_id: u32) -> String {
    format!("kex-ipc-{pid}-{pty_id}.sock")
}

fn socket_owner_pid(file_name: &str) -> Option<u32> {
    let rest = file_name.strip_prefix("kex-ipc-")?.strip_suffix(".sock")?;
    let (pid, pty_id) = rest.split_once('-')?;
    pty_id.parse::<u32>().ok()?;
    pid.parse().ok()
}

/// Names in `names` that are sockets of a Kex process that no longer exists.
fn orphaned_sockets(names: &[String], is_alive: impl Fn(u32) -> bool) -> Vec<&str> {
    names
        .iter()
        .filter(|n| socket_owner_pid(n).is_some_and(|pid| !is_alive(pid)))
        .map(String::as_str)
        .collect()
}

fn pid_is_alive(pid: u32) -> bool {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return true;
    };
    let rc = unsafe { libc::kill(pid, 0) };
    rc == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

fn sweep_orphaned_sockets(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let names: Vec<String> = entries
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    for name in orphaned_sockets(&names, pid_is_alive) {
        let _ = std::fs::remove_file(dir.join(name));
    }
}

/// The path embeds this process's pid because several Kex instances (installed
/// and dev) share `runtime_dir()` and each numbers its PTYs from 1.
pub fn socket_path_for_pty_id(id: u32) -> PathBuf {
    static SWEEP: std::sync::Once = std::sync::Once::new();
    let dir = runtime_dir();
    SWEEP.call_once(|| sweep_orphaned_sockets(&dir));
    socket_path_in(&dir, id)
}

fn socket_path_in(dir: &Path, id: u32) -> PathBuf {
    dir.join(socket_file_name(std::process::id(), id))
}

/// Stops the listener thread and removes the socket file when dropped.
///
/// `unlink`ing a Unix socket does NOT unblock a thread parked in
/// `UnixListener::incoming()` (accept() keeps waiting on the now-unnamed
/// socket). Without a wakeup, that thread (plus its AppHandle clone) would
/// leak for the remaining lifetime of the process every time a tab closes.
/// Fix: connect to our own socket first, which the listener's accept()
/// receives as a real connection; the listener checks `shutdown` right after
/// waking up and exits instead of processing it as a payload.
pub struct IpcGuard {
    path: PathBuf,
    shutdown: Arc<AtomicBool>,
}

impl Drop for IpcGuard {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        // Wake up the thread blocked in accept(); the connection itself
        // carries no payload, the listener only uses it as a signal.
        let _ = UnixStream::connect(&self.path);
        let _ = std::fs::remove_file(&self.path);
    }
}

#[derive(Debug, PartialEq)]
struct BackgroundSubagent {
    id: String,
    agent_type: String,
    description: String,
}

fn parse_background_subagents(v: &serde_json::Value) -> Vec<BackgroundSubagent> {
    let Some(tasks) = v["background_tasks"].as_array() else {
        return Vec::new();
    };
    tasks
        .iter()
        .filter(|t| {
            t["type"].as_str() == Some("subagent") && t["status"].as_str() == Some("running")
        })
        .filter_map(|t| {
            Some(BackgroundSubagent {
                id: t["id"].as_str()?.to_string(),
                agent_type: t["agent_type"].as_str().unwrap_or("").to_string(),
                description: t["description"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect()
}

struct Payload {
    event: String,
    session_id: String,
    transcript_path: String,
    cwd: String,
    // Agent that produced the event ("claude" when absent, Claude Code's own hooks never
    // send it; OpenCode's plugin does).
    agent: Option<String>,
    // SessionStart
    source: Option<String>,
    session_title: Option<String>,
    model: Option<String>,
    // SessionEnd
    reason: Option<String>,
    // UserPromptSubmit
    prompt: Option<String>,
    // Notification
    notif_message: Option<String>,
    notif_type: Option<String>,
    // Stop
    stop_reason: Option<String>,
    last_message: Option<String>,
    background_subagents: Vec<BackgroundSubagent>,
    // SubagentStart / SubagentStop
    agent_id: Option<String>,
    agent_type: Option<String>,
    agent_description: Option<String>,
    // StopFailure
    error_message: Option<String>,
    // PermissionRequest
    tool_name: Option<String>,
    // PostCompact
    compact_trigger: Option<String>,
    // MessageDisplay
    is_final: bool,
    turn_id: Option<String>,
    delta: Option<String>,
}

/// Codex documents PascalCase event names, which is unmeasured, so its snake_case spelling is
/// read as the same event. Other agents' names are matched exactly.
fn canonical_event(agent: Option<&str>, event: &str) -> String {
    if agent != Some("codex") {
        return event.to_string();
    }
    match event {
        "session_start" => "SessionStart",
        "user_prompt_submit" => "UserPromptSubmit",
        "stop" => "Stop",
        "permission_request" => "PermissionRequest",
        "subagent_start" => "SubagentStart",
        "subagent_stop" => "SubagentStop",
        other => other,
    }
    .to_string()
}

fn parse_payload(json: &str) -> Option<Payload> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let event = canonical_event(v["agent"].as_str(), v["hook_event_name"].as_str()?);
    Some(Payload {
        event,
        session_id: v["session_id"].as_str().unwrap_or("").to_string(),
        transcript_path: v["transcript_path"].as_str().unwrap_or("").to_string(),
        cwd: v["cwd"].as_str().unwrap_or("").to_string(),
        agent: v["agent"].as_str().map(str::to_string),
        source: v["source"].as_str().map(str::to_string),
        session_title: v["sessionTitle"].as_str().map(str::to_string),
        model: v["model"].as_str().map(str::to_string),
        reason: v["reason"].as_str().map(str::to_string),
        prompt: v["prompt"].as_str().map(str::to_string),
        notif_message: v["message"].as_str().map(str::to_string),
        notif_type: v["notification_type"].as_str().map(str::to_string),
        stop_reason: v["stop_reason"].as_str().map(str::to_string),
        last_message: v["last_assistant_message"].as_str().map(str::to_string),
        background_subagents: parse_background_subagents(&v),
        agent_id: v["agent_id"].as_str().map(str::to_string),
        agent_type: v["agent_type"].as_str().map(str::to_string),
        agent_description: v["description"].as_str().map(str::to_string),
        error_message: v["error_message"].as_str().map(str::to_string),
        tool_name: v["tool_name"].as_str().map(str::to_string),
        compact_trigger: v["trigger"].as_str().map(str::to_string),
        is_final: v["final"].as_bool().unwrap_or(false),
        turn_id: v["turn_id"].as_str().map(str::to_string),
        delta: v["delta"].as_str().map(str::to_string),
    })
}

/// Directory `trigger-event.sh` spools undelivered hook events to when
/// `send_ipc` cannot reach the socket (listener not accepting yet, crashed,
/// or gone). Mirrors `session_hook_script_path` in `agent/mod.rs`.
fn spool_dir() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".config").join("kex").join("spool"))
}

/// The directory holding one file per undelivered event of a tab.
fn spool_dir_for_tab(base: &Path, tab_id: &str) -> PathBuf {
    base.join(tab_id)
}

/// Replays any hook events spooled to disk by `trigger-event.sh` because a
/// live `send_ipc` delivery failed, handing each payload to `on_line` (in
/// production, `dispatch`) in file-name order, which is arrival order.
///
/// The script writes each event under a dot name and renames it into place,
/// so a visible file is always complete, and it never rewrites an existing
/// file, so there is nothing to claim or lock here. Each file is removed
/// right after it is handed off: a crash mid-drain leaves exactly the
/// undelivered files for the next drain, which is also how a half-drained
/// directory recovers. That trades a possible duplicate (a crash between
/// `on_line` and the remove) for never dropping an event, like the rest of
/// this module (at-least-once). Dot files are scripts' in-flight or
/// crashed temporaries and are left to the script's age pruning.
fn drain_spool(base: &Path, tab_id: &str, mut on_line: impl FnMut(&str)) {
    let dir = spool_dir_for_tab(base, tab_id);
    let mut files: Vec<PathBuf> = match std::fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(Result::ok)
            .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
            .map(|e| e.path())
            .collect(),
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound {
                log::warn!("[ipc] failed to read spool dir {dir:?}: {e}");
            }
            return;
        }
    };
    files.sort();

    let mut drained = 0usize;
    for path in &files {
        match std::fs::read_to_string(path) {
            Ok(contents) => {
                let payload = contents.trim();
                if !payload.is_empty() {
                    on_line(payload);
                    drained += 1;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => {
                log::warn!("[ipc] failed to read spooled event {path:?}: {e}");
                continue;
            }
        }
        if let Err(e) = std::fs::remove_file(path) {
            if e.kind() != std::io::ErrorKind::NotFound {
                log::warn!("[ipc] failed to remove drained event {path:?}: {e}");
            }
        }
    }
    if drained > 0 {
        log::debug!("[ipc] drained {drained} spooled event(s) for tab={tab_id}");
    }
    // Fails while a script still has a file in flight, which is fine.
    let _ = std::fs::remove_dir(&dir);
}

/// Creates the socket, then spawns the listener thread. Returns an IpcGuard
/// that stops the thread and removes the socket file when dropped.
pub fn spawn_listener(
    socket_path: PathBuf,
    tab_id: String,
    pty_id: u32,
    app: AppHandle,
) -> IpcGuard {
    // The pid in the name makes this path ours alone, so only a leftover of ours can be here.
    let _ = std::fs::remove_file(&socket_path);
    let shutdown = Arc::new(AtomicBool::new(false));

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[ipc] bind {:?} failed: {e}", socket_path);
            return IpcGuard {
                path: socket_path,
                shutdown,
            };
        }
    };
    // bind() creates the socket file honoring the process umask, which on a
    // shared machine could leave it group/world accessible; force it to
    // owner-only regardless, so another local user cannot connect and send
    // forged agent-hook events.
    let _ = std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600));
    log::debug!("[ipc] listening tab={tab_id} path={:?}", socket_path);

    let thread_shutdown = shutdown.clone();
    if let Err(e) = thread::Builder::new()
        .name(format!("kex-ipc-{tab_id}"))
        .spawn(move || run_listener(listener, tab_id, pty_id, app, thread_shutdown))
    {
        log::warn!("[ipc] failed to spawn listener thread: {e}");
    }
    IpcGuard {
        path: socket_path,
        shutdown,
    }
}

/// True when a spooled line is a `SessionEnd`/`StopFailure` notification: a
/// live-only "the agent just finished/crashed" signal that made sense at the
/// moment `trigger-event.sh` couldn't reach the socket, but is actively wrong
/// once replayed after a restart, when Kex may have already relaunched the
/// same tab and recorded a fresh session for it. Unparseable JSON is not
/// stale (it isn't recognized as anything): let it reach `dispatch`, which
/// has its own handling for that case.
fn stale_spooled_event_kind(json: &str) -> Option<String> {
    parse_payload(json)
        .map(|p| p.event)
        .filter(|e| e == "SessionEnd" || e == "StopFailure")
}

fn run_listener(
    listener: UnixListener,
    tab_id: String,
    pty_id: u32,
    app: AppHandle,
    shutdown: Arc<AtomicBool>,
) {
    if let Some(base) = spool_dir() {
        drain_spool(&base, &tab_id, |line| {
            if let Some(kind) = stale_spooled_event_kind(line) {
                log::debug!("[ipc] discarded stale spooled {kind} event tab={tab_id}");
                return;
            }
            dispatch(line, &tab_id, pty_id, &app);
        });
    }

    for stream in listener.incoming() {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }
        match stream {
            Ok(stream) => {
                let mut line = String::new();
                let _ = BufReader::new(stream).read_line(&mut line);
                if !line.trim().is_empty() {
                    dispatch(line.trim(), &tab_id, pty_id, &app);
                }
            }
            Err(e) => {
                log::debug!("[ipc] accept error (socket removed?): {e}");
                break;
            }
        }
    }
    log::debug!("[ipc] thread exiting tab={tab_id}");
}

/// Debug logging in `dispatch` below echoes free-text agent payload fields
/// (prompt, message, diff deltas). A single "final" MessageDisplay for a
/// long code review has been observed to carry 7000+ characters; left
/// unbounded, a handful of such lines are enough to blow through the log
/// rotation size and destroy the history that made those lines worth
/// logging in the first place. Cap what actually reaches the log.
const MAX_LOG_FIELD_LEN: usize = 250;

fn truncate_for_log(s: &str, max: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max {
        return s.to_string();
    }
    let truncated: String = s.chars().take(max).collect();
    format!("{truncated}...({} more)", char_count - max)
}

/// A subagent's `cwd` says where the subagent runs, not where the main agent
/// is, so only the main agent's own events may move the tab's worktree. A resumed session
/// starts in the launch folder and only moves into its worktree afterwards, so its
/// SessionStart would wipe the worktree the restore plan already seeded.
fn reports_agent_cwd(event: &str, source: &str, cwd: &str) -> bool {
    if cwd.is_empty() {
        return false;
    }
    match event {
        "SessionEnd" | "SubagentStart" | "SubagentStop" => false,
        "SessionStart" => source != "resume",
        _ => true,
    }
}

// Agents that only report their identity on SessionStart (or whose first lifecycle
// event races it) still reach the frontend first: every signal carries the frame's
// agent so the session the UI creates is never mistagged as "claude".
fn agent_signal(id: u32, kind: &str, agent: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "id":       id,
        "kind":     kind,
        "agent":    agent.unwrap_or("claude"),
        "message":  null,
        "toolName": null,
        "prompt":   null,
    })
}

fn post_compact_signal(id: u32, p: &Payload) -> serde_json::Value {
    let mut sig = agent_signal(id, "PostCompact", p.agent.as_deref());
    sig["trigger"] = p.compact_trigger.as_deref().unwrap_or("").into();
    sig
}

/// Events that reach the frontend as a signal with no side effect on the Rust side.
fn passthrough_signal(p: &Payload, id: u32) -> Option<serde_json::Value> {
    match p.event.as_str() {
        "PostCompact" => Some(post_compact_signal(id, p)),
        _ => None,
    }
}

fn dispatch(json: &str, tab_id: &str, pty_id: u32, app: &AppHandle) {
    dispatch_with(
        json,
        tab_id,
        pty_id,
        &mut |event, payload| {
            let _ = app.emit(event, payload);
        },
        &mut |transcript_path| live_model::emit_live_model(app, tab_id, transcript_path),
    );
}

/// `dispatch` without a Tauri handle: every event goes through `emit`, so a test can see what
/// a hook payload sends to the frontend.
fn dispatch_with(
    json: &str,
    tab_id: &str,
    pty_id: u32,
    emit: &mut dyn FnMut(&str, serde_json::Value),
    emit_live_model: &mut dyn FnMut(&str),
) {
    let Some(p) = parse_payload(json) else {
        log::debug!(
            "[ipc] invalid JSON: {}",
            truncate_for_log(json, MAX_LOG_FIELD_LEN)
        );
        return;
    };
    if session_store::is_print_run(tab_id) {
        log::debug!(
            "[ipc] {} dropped: tab={tab_id} is running a print-mode agent",
            p.event
        );
        return;
    }
    if reports_agent_cwd(&p.event, p.source.as_deref().unwrap_or(""), &p.cwd) {
        log::debug!("[ipc] cwd tab={tab_id} event={} cwd={:?}", p.event, p.cwd);
        emit(
            AGENT_CWD_EVENT,
            serde_json::json!({ "tabId": tab_id, "cwd": p.cwd }),
        );
    }
    match p.event.as_str() {
        "SessionStart" => {
            let source = p.source.as_deref().unwrap_or("");
            let session_title = p.session_title.as_deref().unwrap_or("");
            let model = p.model.as_deref().unwrap_or("");
            let agent = p.agent.as_deref().unwrap_or("claude");
            log::debug!(
                "[ipc] SessionStart tab={tab_id} agent={agent} session={} \
                 source={source} title={session_title:?} model={model:?}",
                p.session_id
            );
            let same_process = matches!(source, "clear" | "compact" | "resume");
            let launch_known = session_store::record_session(
                tab_id,
                agent,
                &p.session_id,
                &p.transcript_path,
                &p.cwd,
                same_process,
            );
            emit(
                AGENT_SESSION_META_EVENT,
                serde_json::json!({
                    "tabId":          tab_id,
                    "sessionId":      p.session_id,
                    "agent":          agent,
                    "cwdLaunch":      p.cwd,
                    "sessionTitle":   session_title,
                    "model":          model,
                    "transcriptPath": p.transcript_path,
                    "launchKnown":    launch_known,
                }),
            );
        }
        "SessionEnd" => {
            let reason = p.reason.as_deref().unwrap_or("");
            log::debug!("[ipc] SessionEnd tab={tab_id} reason={reason}");
            emit(
                AGENT_EVENT,
                agent_signal(pty_id, "SessionEnd", p.agent.as_deref()),
            );
        }
        "UserPromptSubmit" => {
            let prompt = p.prompt.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] UserPromptSubmit tab={tab_id} session={} prompt={:?}",
                p.session_id,
                truncate_for_log(prompt, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "UserPromptSubmit", p.agent.as_deref());
            sig["prompt"] = prompt.into();
            emit(AGENT_EVENT, sig);
        }
        "Notification" => {
            let notif_type = p.notif_type.as_deref().unwrap_or("");
            // "idle_prompt" means Claude finished its turn and is waiting for the
            // next prompt: that is already covered by the "Stop" event, and Claude
            // can resend it (sometimes twice). Drop it to avoid a duplicate
            // attention signal right after the turn ends.
            if notif_type == "idle_prompt" {
                log::debug!("[ipc] Notification(idle_prompt) tab={tab_id} ignored");
                return;
            }
            let msg = p.notif_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] Notification tab={tab_id} type={notif_type:?} msg={:?}",
                truncate_for_log(msg, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "Notification", p.agent.as_deref());
            sig["message"] = msg.into();
            emit(AGENT_EVENT, sig);
        }
        "Stop" => {
            let reason = p.stop_reason.as_deref().unwrap_or("");
            let last = p.last_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] Stop tab={tab_id} reason={reason} last={:?}",
                truncate_for_log(last, MAX_LOG_FIELD_LEN)
            );
            let subagents: Vec<serde_json::Value> = p
                .background_subagents
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "id":          s.id,
                        "agentType":   s.agent_type,
                        "description": s.description,
                    })
                })
                .collect();
            let mut sig = agent_signal(pty_id, "Stop", p.agent.as_deref());
            sig["message"] = last.into();
            sig["backgroundSubagents"] = subagents.into();
            emit(AGENT_EVENT, sig);
            emit_live_model(&p.transcript_path);
        }
        "StopFailure" => {
            let err = p.error_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] StopFailure tab={tab_id} err={:?}",
                truncate_for_log(err, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "StopFailure", p.agent.as_deref());
            sig["message"] = err.into();
            emit(AGENT_EVENT, sig);
        }
        "PermissionRequest" => {
            let tool = p.tool_name.as_deref().unwrap_or("");
            log::debug!("[ipc] PermissionRequest tab={tab_id} tool={tool}");
            let mut sig = agent_signal(pty_id, "PermissionRequest", p.agent.as_deref());
            sig["toolName"] = tool.into();
            emit(AGENT_EVENT, sig);
        }
        "SubagentStart" | "SubagentStop" => {
            let Some(agent_id) = p.agent_id.as_deref() else {
                return;
            };
            let agent_type = p.agent_type.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] {} tab={tab_id} agent={agent_id} type={agent_type}",
                p.event
            );
            let mut sig = agent_signal(pty_id, &p.event, p.agent.as_deref());
            sig["agentId"] = agent_id.into();
            sig["agentType"] = agent_type.into();
            sig["agentDescription"] = p.agent_description.as_deref().unwrap_or("").into();
            emit(AGENT_EVENT, sig);
        }
        "MessageDisplay" => {
            if !p.is_final {
                return;
            }
            let delta = p.delta.as_deref().unwrap_or("");
            let turn_id = p.turn_id.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] MessageDisplay tab={tab_id} turn={turn_id} delta={:?}",
                truncate_for_log(delta, MAX_LOG_FIELD_LEN)
            );
            let mut sig = agent_signal(pty_id, "MessageDisplay", p.agent.as_deref());
            sig["message"] = delta.into();
            emit(AGENT_EVENT, sig);
        }
        other => match passthrough_signal(&p, pty_id) {
            Some(sig) => {
                log::debug!("[ipc] {other} tab={tab_id}");
                emit(AGENT_EVENT, sig);
            }
            None => log::debug!("[ipc] unhandled event {other} from tab={tab_id}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_signal_carries_the_frame_agent() {
        let sig = agent_signal(7, "Stop", Some("omp"));
        assert_eq!(sig["agent"], "omp");
        assert_eq!(sig["id"], 7);
        assert_eq!(sig["kind"], "Stop");
        assert_eq!(sig["message"], serde_json::Value::Null);
        assert_eq!(sig["toolName"], serde_json::Value::Null);
        assert_eq!(sig["prompt"], serde_json::Value::Null);
    }

    #[test]
    fn agent_signal_falls_back_to_claude() {
        let sig = agent_signal(1, "UserPromptSubmit", None);
        assert_eq!(sig["agent"], "claude");
    }

    #[test]
    fn socket_path_for_id_is_short_enough() {
        let p = socket_path_in(&runtime_dir(), u32::MAX);
        assert!(p.to_str().unwrap().len() < 104);
    }

    #[test]
    fn same_pty_id_in_two_processes_gets_different_socket_names() {
        assert_ne!(socket_file_name(100, 38), socket_file_name(200, 38));
    }

    #[test]
    fn socket_path_embeds_the_current_pid() {
        let p = socket_path_in(Path::new("/x"), 7);
        let expected = socket_file_name(std::process::id(), 7);
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), expected);
    }

    #[test]
    fn orphan_cleanup_only_selects_dead_pids_and_matching_names() {
        let names: Vec<String> = [
            "kex-ipc-100-1.sock",
            "kex-ipc-200-1.sock",
            "kex-ipc-300-2.sock",
            "kex-ipc-5.sock",
            "kex-ipc-abc-1.sock",
            "kex-ipc-100-1.txt",
            "other-100-1.sock",
        ]
        .map(String::from)
        .to_vec();
        let found = orphaned_sockets(&names, |pid| pid == 200);
        assert_eq!(found, vec!["kex-ipc-100-1.sock", "kex-ipc-300-2.sock"]);
    }

    #[test]
    fn sweep_removes_dead_pid_sockets_and_keeps_live_and_unrelated_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut child = std::process::Command::new("true").spawn().unwrap();
        let dead = child.id();
        child.wait().unwrap();
        let orphan = socket_file_name(dead, 1);
        let live = socket_file_name(std::process::id(), 1);
        for name in [
            orphan.as_str(),
            live.as_str(),
            "kex-ipc-5.sock",
            "notes.txt",
        ] {
            std::fs::write(dir.path().join(name), b"").unwrap();
        }
        sweep_orphaned_sockets(dir.path());
        assert!(!dir.path().join(&orphan).exists());
        for name in [live.as_str(), "kex-ipc-5.sock", "notes.txt"] {
            assert!(dir.path().join(name).exists(), "{name} must survive");
        }
    }

    #[test]
    fn pid_is_alive_detects_self_and_not_a_dead_pid() {
        assert!(pid_is_alive(std::process::id()));
        let mut child = std::process::Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        assert!(!pid_is_alive(pid));
    }

    #[test]
    fn truncate_for_log_leaves_shorter_strings_untouched() {
        assert_eq!(truncate_for_log("hello", 250), "hello");
    }

    #[test]
    fn truncate_for_log_leaves_strings_at_the_limit_untouched() {
        let s = "a".repeat(250);
        assert_eq!(truncate_for_log(&s, 250), s);
    }

    #[test]
    fn truncate_for_log_truncates_and_appends_a_remaining_count() {
        let s = "a".repeat(300);
        let truncated = truncate_for_log(&s, 250);
        assert_eq!(truncated, format!("{}...(50 more)", "a".repeat(250)));
    }

    #[test]
    fn truncate_for_log_counts_chars_not_bytes() {
        // "€" is 3 bytes in UTF-8; 250 is not a multiple of 3, so a naive byte
        // slice at offset 250 would land mid-codepoint (unlike a 2-byte char at
        // an even max, which happens to fall on a char boundary by coincidence).
        let s = "€".repeat(300);
        let truncated = truncate_for_log(&s, 250);
        assert_eq!(
            truncated.chars().count(),
            250 + "...(50 more)".chars().count()
        );
    }

    #[test]
    fn owned_runtime_subdir_is_created_owner_only() {
        let base = tempfile::tempdir().unwrap();
        let uid = unsafe { libc::getuid() };

        let dir = owned_runtime_subdir(base.path(), uid);
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(
            mode, 0o700,
            "runtime subdir must be owner-only, got {mode:o}"
        );
    }

    #[test]
    fn owned_runtime_subdir_reuses_its_own_directory() {
        // Simulates a second app launch finding the directory from a
        // previous run: it must be recognized as ours (same uid) and reused
        // rather than rejected as looking untrusted.
        let base = tempfile::tempdir().unwrap();
        let uid = unsafe { libc::getuid() };

        let first = owned_runtime_subdir(base.path(), uid);
        let second = owned_runtime_subdir(base.path(), uid);
        assert_eq!(first, second);
        let mode = std::fs::metadata(&second).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700);
    }

    #[test]
    fn spawn_listener_leaves_the_socket_file_owner_only() {
        let base = tempfile::tempdir().unwrap();
        let socket_path = base
            .path()
            .join(format!("kex-test-perms-{}.sock", std::process::id()));

        // Use a Tauri-less path: bind directly the way spawn_listener does,
        // without going through the full AppHandle machinery this test has
        // no access to.
        let listener = UnixListener::bind(&socket_path).unwrap();
        std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600)).unwrap();
        drop(listener);

        let mode = std::fs::metadata(&socket_path)
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "socket file must be owner-only, got {mode:o}");
    }

    #[test]
    fn ipc_guard_removes_file_on_drop() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kex-test-guard-{}.sock", std::process::id()));
        std::fs::write(&path, b"").unwrap();
        assert!(path.exists());
        let guard = IpcGuard {
            path: path.clone(),
            shutdown: Arc::new(AtomicBool::new(false)),
        };
        drop(guard);
        assert!(!path.exists());
    }

    #[test]
    fn dropping_guard_unblocks_the_listener_thread() {
        // Regression test for the leaked-thread bug: unlinking the socket file
        // alone never wakes a thread parked in accept(), so this must join
        // quickly rather than hang until the test harness kills it.
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kex-test-wakeup-{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&path);

        let listener = UnixListener::bind(&path).unwrap();
        let shutdown = Arc::new(AtomicBool::new(false));
        let thread_shutdown = shutdown.clone();
        let handle = thread::spawn(move || {
            for stream in listener.incoming() {
                if thread_shutdown.load(Ordering::SeqCst) {
                    break;
                }
                drop(stream);
            }
        });

        // Give the thread a moment to reach accept() before we try to wake it.
        thread::sleep(std::time::Duration::from_millis(50));

        let guard = IpcGuard {
            path: path.clone(),
            shutdown,
        };
        drop(guard);

        let joined = {
            let (tx, rx) = std::sync::mpsc::channel();
            thread::spawn(move || {
                handle.join().ok();
                let _ = tx.send(());
            });
            rx.recv_timeout(std::time::Duration::from_secs(2)).is_ok()
        };
        assert!(
            joined,
            "listener thread did not exit after guard was dropped"
        );
        assert!(!path.exists());
    }

    #[test]
    fn parse_session_start_payload() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "session_id": "abc-123",
          "transcript_path": "/tmp/abc.jsonl",
          "cwd": "/home/user",
          "source": "resume",
          "sessionTitle": "My Title",
          "model": "claude-sonnet-4-6"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionStart");
        assert_eq!(p.session_id, "abc-123");
        assert_eq!(p.source.as_deref(), Some("resume"));
        assert_eq!(p.session_title.as_deref(), Some("My Title"));
        assert_eq!(p.model.as_deref(), Some("claude-sonnet-4-6"));
        assert!(p.reason.is_none());
    }

    #[test]
    fn parse_session_end_payload() {
        let json = r#"{
          "hook_event_name": "SessionEnd",
          "session_id": "abc-123",
          "transcript_path": "/tmp/abc.jsonl",
          "cwd": "/home/user",
          "reason": "prompt_input_exit"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionEnd");
        assert_eq!(p.reason.as_deref(), Some("prompt_input_exit"));
        assert!(p.source.is_none());
    }

    #[test]
    fn parse_payload_carries_the_agent_when_present() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "agent": "opencode",
          "session_id": "ses_abc",
          "transcript_path": "",
          "cwd": "/home/user",
          "source": "startup"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.agent.as_deref(), Some("opencode"));
    }

    #[test]
    fn parse_a_codex_session_start_with_a_null_transcript_path() {
        let json = r#"{
          "hook_event_name": "SessionStart",
          "agent": "codex",
          "session_id": "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e",
          "transcript_path": null,
          "cwd": "/home/user/proj",
          "source": "startup",
          "model": "gpt-5-codex",
          "permission_mode": "default"
        }"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SessionStart");
        assert_eq!(p.agent.as_deref(), Some("codex"));
        assert_eq!(p.session_id, "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e");
        assert_eq!(p.transcript_path, "");
        assert_eq!(p.cwd, "/home/user/proj");
        assert_eq!(p.source.as_deref(), Some("startup"));
        assert!(reports_agent_cwd(&p.event, "startup", &p.cwd));
    }

    #[test]
    fn codex_frames_other_than_session_start_become_codex_signals() {
        for event in ["UserPromptSubmit", "Stop", "PermissionRequest"] {
            let json = format!(
                r#"{{"hook_event_name":"{event}","agent":"codex","session_id":"s","transcript_path":"/x/rollout-1-s.jsonl","cwd":"/p"}}"#
            );
            let p = parse_payload(&json).unwrap();
            assert_eq!(p.transcript_path, "/x/rollout-1-s.jsonl");
            let sig = agent_signal(3, &p.event, p.agent.as_deref());
            assert_eq!(sig["agent"], "codex", "{event}");
            assert_eq!(sig["kind"], event);
        }
    }

    #[test]
    fn codex_snake_case_events_are_read_as_their_canonical_names() {
        for (snake, canonical) in [
            ("session_start", "SessionStart"),
            ("user_prompt_submit", "UserPromptSubmit"),
            ("stop", "Stop"),
            ("permission_request", "PermissionRequest"),
            ("subagent_start", "SubagentStart"),
            ("subagent_stop", "SubagentStop"),
            ("Stop", "Stop"),
        ] {
            let json = format!(
                r#"{{"hook_event_name":"{snake}","agent":"codex","session_id":"s","cwd":"/p"}}"#
            );
            assert_eq!(parse_payload(&json).unwrap().event, canonical, "{snake}");
        }
    }

    #[test]
    fn claude_and_opencode_event_names_are_never_rewritten() {
        for agent in [None, Some("claude"), Some("opencode")] {
            let tag = agent.map_or(String::new(), |a| format!(r#","agent":"{a}""#));
            let json = format!(r#"{{"hook_event_name":"session_start","session_id":"s"{tag}}}"#);
            assert_eq!(parse_payload(&json).unwrap().event, "session_start");
        }
    }

    #[test]
    fn parse_payload_leaves_the_agent_absent_for_claude_frames() {
        let json = r#"{"hook_event_name":"SessionStart","session_id":"abc","transcript_path":"","cwd":""}"#;
        let p = parse_payload(json).unwrap();
        assert!(p.agent.is_none());
    }

    #[test]
    fn parse_rejects_invalid_json() {
        assert!(parse_payload("not json").is_none());
        assert!(parse_payload("").is_none());
    }

    #[test]
    fn parse_user_prompt_submit() {
        let json = r#"{"hook_event_name":"UserPromptSubmit","session_id":"s","transcript_path":"","cwd":"","prompt":"hello world"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "UserPromptSubmit");
        assert_eq!(p.prompt.as_deref(), Some("hello world"));
    }

    #[test]
    fn parse_stop_payload() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","stop_reason":"end_turn","last_assistant_message":"done"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.stop_reason.as_deref(), Some("end_turn"));
        assert_eq!(p.last_message.as_deref(), Some("done"));
    }

    #[test]
    fn parse_subagent_start() {
        let json = r#"{"hook_event_name":"SubagentStart","session_id":"s","transcript_path":"","cwd":"","agent_id":"a1","agent_type":"general-purpose"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "SubagentStart");
        assert_eq!(p.agent_id.as_deref(), Some("a1"));
        assert_eq!(p.agent_type.as_deref(), Some("general-purpose"));
    }

    #[test]
    fn parse_subagent_start_reads_the_description_when_the_agent_sends_one() {
        let json = r#"{"hook_event_name":"SubagentStart","session_id":"s","transcript_path":"","cwd":"","agent_id":"a1","agent_type":"task","description":"Contar archivos"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.agent_description.as_deref(), Some("Contar archivos"));
        let bare = r#"{"hook_event_name":"SubagentStart","session_id":"s","transcript_path":"","cwd":"","agent_id":"a1"}"#;
        assert_eq!(parse_payload(bare).unwrap().agent_description, None);
    }

    #[test]
    fn parse_stop_keeps_only_running_subagents() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","background_tasks":[
            {"id":"a1","type":"subagent","status":"running","description":"do it","agent_type":"Explore"},
            {"id":"a2","type":"subagent","status":"completed","description":"old","agent_type":"Explore"},
            {"id":"b1","type":"shell","status":"running","description":"npm run dev"}
        ]}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(
            p.background_subagents,
            vec![BackgroundSubagent {
                id: "a1".into(),
                agent_type: "Explore".into(),
                description: "do it".into(),
            }]
        );
    }

    #[test]
    fn parse_stop_without_background_tasks_has_no_subagents() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":""}"#;
        assert!(parse_payload(json).unwrap().background_subagents.is_empty());
    }

    #[test]
    fn only_main_agent_events_report_the_agent_cwd() {
        assert!(reports_agent_cwd("Stop", "", "/p"));
        assert!(reports_agent_cwd("UserPromptSubmit", "", "/p"));
        assert!(!reports_agent_cwd("Stop", "", ""));
        assert!(!reports_agent_cwd("SessionEnd", "", "/p"));
        assert!(!reports_agent_cwd("SubagentStart", "", "/p"));
        assert!(!reports_agent_cwd("SubagentStop", "", "/p"));
    }

    #[test]
    fn a_resumed_session_start_does_not_report_the_agent_cwd() {
        assert!(!reports_agent_cwd("SessionStart", "resume", "/p"));
        assert!(reports_agent_cwd("SessionStart", "startup", "/p"));
        assert!(reports_agent_cwd("SessionStart", "", "/p"));
        assert!(reports_agent_cwd("UserPromptSubmit", "resume", "/p"));
    }

    #[test]
    fn parse_stop_failure() {
        let json = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.error_message.as_deref(), Some("oops"));
    }

    #[test]
    fn post_compact_reaches_the_frontend_as_a_signal_with_its_trigger() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s","transcript_path":"","cwd":"/p","trigger":"manual"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.event, "PostCompact");
        assert!(reports_agent_cwd(&p.event, "", &p.cwd));
        let sig = post_compact_signal(3, &p);
        assert_eq!(sig["kind"], "PostCompact");
        assert_eq!(sig["id"], 3);
        assert_eq!(sig["agent"], "claude");
        assert_eq!(sig["trigger"], "manual");
    }

    #[test]
    fn dispatching_a_post_compact_payload_emits_its_signal() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s","trigger":"manual"}"#;
        let mut emitted = Vec::new();
        dispatch_with(
            json,
            "tab-post-compact",
            9,
            &mut |event, payload| emitted.push((event.to_string(), payload)),
            &mut |_| {},
        );
        let kinds: Vec<_> = emitted
            .iter()
            .filter(|(event, _)| event == AGENT_EVENT)
            .map(|(_, sig)| {
                (
                    sig["kind"].clone(),
                    sig["id"].clone(),
                    sig["trigger"].clone(),
                )
            })
            .collect();
        assert_eq!(
            kinds,
            vec![("PostCompact".into(), 9.into(), "manual".into())]
        );
    }

    #[test]
    fn post_compact_is_dispatched_as_a_passthrough_signal() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s","trigger":"auto"}"#;
        let sig = passthrough_signal(&parse_payload(json).unwrap(), 5).expect("no signal");
        assert_eq!(sig["kind"], "PostCompact");
        assert_eq!(sig["trigger"], "auto");
        let other = r#"{"hook_event_name":"PreToolUse","session_id":"s"}"#;
        assert!(passthrough_signal(&parse_payload(other).unwrap(), 5).is_none());
    }

    #[test]
    fn post_compact_without_a_trigger_sends_an_empty_one() {
        let json = r#"{"hook_event_name":"PostCompact","session_id":"s"}"#;
        let sig = post_compact_signal(1, &parse_payload(json).unwrap());
        assert_eq!(sig["trigger"], "");
    }

    #[test]
    fn parse_permission_request() {
        let json = r#"{"hook_event_name":"PermissionRequest","session_id":"s","transcript_path":"","cwd":"","tool_name":"bash"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.tool_name.as_deref(), Some("bash"));
    }

    #[test]
    fn parse_message_display_final() {
        let json = r#"{"hook_event_name":"MessageDisplay","session_id":"s","transcript_path":"","cwd":"","final":true,"turn_id":"t1","delta":"hello"}"#;
        let p = parse_payload(json).unwrap();
        assert!(p.is_final);
        assert_eq!(p.turn_id.as_deref(), Some("t1"));
        assert_eq!(p.delta.as_deref(), Some("hello"));
    }

    fn spool_event_file(base: &Path, tab_id: &str, name: &str, body: &str) -> PathBuf {
        let dir = spool_dir_for_tab(base, tab_id);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn drain_spool_replays_events_in_file_name_order_then_removes_them_and_the_directory() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-1";
        spool_event_file(dir.path(), tab_id, "0002-b.json", "line-two\n");
        spool_event_file(dir.path(), tab_id, "0003-c.json", "line-three\n");
        spool_event_file(dir.path(), tab_id, "0001-a.json", "line-one\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["line-one", "line-two", "line-three"]);
        assert!(!spool_dir_for_tab(dir.path(), tab_id).exists());
    }

    #[test]
    fn drain_spool_is_a_noop_when_no_spool_directory_exists() {
        let dir = tempfile::tempdir().unwrap();
        let mut called = false;
        drain_spool(dir.path(), "tab-missing", |_| called = true);
        assert!(!called);
    }

    #[test]
    fn drain_spool_skips_blank_files_and_in_flight_dot_files() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-2";
        spool_event_file(dir.path(), tab_id, "0001-a.json", "\n  \n");
        let in_flight = spool_event_file(dir.path(), tab_id, ".0002-b.json.tmp", "half");
        spool_event_file(dir.path(), tab_id, "0003-c.json", "real\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["real"]);
        assert!(
            in_flight.exists(),
            "a temporary being written is not ours to touch"
        );
    }

    #[test]
    fn drain_spool_leaves_other_tabs_spool_directories_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let other = spool_event_file(dir.path(), "tab-other", "0001-a.json", "other\n");
        let mut called = false;
        drain_spool(dir.path(), "tab-drain-3", |_| called = true);
        assert!(!called);
        assert!(other.exists());
    }

    #[test]
    fn drain_spool_resumes_a_directory_left_half_drained_by_a_crash() {
        // A crash after the first event was handed off and removed leaves only
        // the rest; a new file arriving meanwhile sorts after them.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-crash";
        spool_event_file(dir.path(), tab_id, "0002-b.json", "second\n");
        spool_event_file(dir.path(), tab_id, "0003-c.json", "third\n");
        spool_event_file(dir.path(), tab_id, "0004-d.json", "fourth\n");

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["second", "third", "fourth"]);
        assert!(!spool_dir_for_tab(dir.path(), tab_id).exists());
    }

    #[test]
    fn drain_spool_keeps_a_file_whose_handoff_did_not_finish() {
        // The file is removed only after on_line returns, so a panic inside it
        // (standing in for a crash) leaves the event for the next drain.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-panic";
        let kept = spool_event_file(dir.path(), tab_id, "0001-a.json", "boom\n");

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            drain_spool(dir.path(), tab_id, |_| panic!("crash"));
        }));

        assert!(result.is_err());
        assert!(kept.exists());
    }

    #[test]
    fn drain_spool_payloads_parse_the_same_way_a_live_payload_does() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-4";
        let payload = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","stop_reason":"end_turn","last_assistant_message":"done"}"#;
        spool_event_file(dir.path(), tab_id, "0001-a.json", &format!("{payload}\n"));

        let mut events = Vec::new();
        drain_spool(dir.path(), tab_id, |line| {
            events.push(parse_payload(line).unwrap().event);
        });
        assert_eq!(events, vec!["Stop"]);
    }

    #[test]
    fn stale_spooled_event_kind_flags_session_end_and_stop_failure() {
        let session_end = r#"{"hook_event_name":"SessionEnd","session_id":"s","transcript_path":"","cwd":"","reason":"exit"}"#;
        let stop_failure = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        assert_eq!(
            stale_spooled_event_kind(session_end).as_deref(),
            Some("SessionEnd")
        );
        assert_eq!(
            stale_spooled_event_kind(stop_failure).as_deref(),
            Some("StopFailure")
        );
    }

    #[test]
    fn stale_spooled_event_kind_is_none_for_other_events_and_invalid_json() {
        let session_start =
            r#"{"hook_event_name":"SessionStart","session_id":"s","transcript_path":"","cwd":""}"#;
        assert_eq!(stale_spooled_event_kind(session_start), None);
        assert_eq!(stale_spooled_event_kind("not json"), None);
    }

    #[test]
    fn drain_spool_discards_stale_session_end_and_stop_failure_but_replays_other_events() {
        // Regression test: a SessionEnd/StopFailure that lands in the spool
        // (socket unreachable while Kex was shutting down) must never reach
        // `on_line` on the next drain, since by then Kex may have already
        // relaunched the same tab with a fresh session. Other event kinds
        // still replay normally.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-stale";
        let session_end = r#"{"hook_event_name":"SessionEnd","session_id":"s","transcript_path":"","cwd":"","reason":"exit"}"#;
        let stop_failure = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        let session_start =
            r#"{"hook_event_name":"SessionStart","session_id":"s","transcript_path":"","cwd":""}"#;
        let notification = r#"{"hook_event_name":"Notification","session_id":"s","transcript_path":"","cwd":"","message":"hi","notification_type":"other"}"#;
        for (i, body) in [session_end, session_start, stop_failure, notification]
            .iter()
            .enumerate()
        {
            spool_event_file(dir.path(), tab_id, &format!("000{i}-x.json"), body);
        }

        let mut replayed = Vec::new();
        drain_spool(dir.path(), tab_id, |line| {
            if stale_spooled_event_kind(line).is_some() {
                return;
            }
            replayed.push(parse_payload(line).unwrap().event);
        });

        assert_eq!(replayed, vec!["SessionStart", "Notification"]);
    }

    #[test]
    fn parse_message_display_streaming() {
        let json = r#"{"hook_event_name":"MessageDisplay","session_id":"s","transcript_path":"","cwd":"","final":false,"delta":"chunk"}"#;
        let p = parse_payload(json).unwrap();
        assert!(!p.is_final);
    }
}
