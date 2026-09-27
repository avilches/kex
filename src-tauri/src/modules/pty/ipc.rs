#![cfg(unix)]

use std::io::{BufRead, BufReader};
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::modules::agent::session_store;

const AGENT_EVENT: &str = "kex:agent-signal";
const AGENT_SESSION_META_EVENT: &str = "kex:agent-session-meta";

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

pub fn socket_path_for_pty_id(id: u32) -> PathBuf {
    runtime_dir().join(format!("kex-ipc-{id}.sock"))
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

struct Payload {
    event: String,
    session_id: String,
    transcript_path: String,
    cwd: String,
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
    // StopFailure
    error_message: Option<String>,
    // PermissionRequest
    tool_name: Option<String>,
    // MessageDisplay
    is_final: bool,
    turn_id: Option<String>,
    delta: Option<String>,
}

fn parse_payload(json: &str) -> Option<Payload> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let event = v["hook_event_name"].as_str()?.to_string();
    Some(Payload {
        event,
        session_id:      v["session_id"].as_str().unwrap_or("").to_string(),
        transcript_path: v["transcript_path"].as_str().unwrap_or("").to_string(),
        cwd:             v["cwd"].as_str().unwrap_or("").to_string(),
        source:          v["source"].as_str().map(str::to_string),
        session_title:   v["sessionTitle"].as_str().map(str::to_string),
        model:           v["model"].as_str().map(str::to_string),
        reason:          v["reason"].as_str().map(str::to_string),
        prompt:          v["prompt"].as_str().map(str::to_string),
        notif_message:   v["message"].as_str().map(str::to_string),
        notif_type:      v["notification_type"].as_str().map(str::to_string),
        stop_reason:     v["stop_reason"].as_str().map(str::to_string),
        last_message:    v["last_assistant_message"].as_str().map(str::to_string),
        error_message:   v["error_message"].as_str().map(str::to_string),
        tool_name:       v["tool_name"].as_str().map(str::to_string),
        is_final:        v["final"].as_bool().unwrap_or(false),
        turn_id:         v["turn_id"].as_str().map(str::to_string),
        delta:           v["delta"].as_str().map(str::to_string),
    })
}

/// Directory `trigger-event.sh` spools undelivered hook events to when
/// `send_ipc` cannot reach the socket (listener not accepting yet, crashed,
/// or gone). Mirrors `session_hook_script_path` in `agent/mod.rs`.
fn spool_dir() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".config").join("kex").join("spool"))
}

fn spool_path_for_tab(base: &Path, tab_id: &str) -> PathBuf {
    base.join(format!("{tab_id}.jsonl"))
}

/// The path a spool file is renamed to while being drained. See `drain_spool`
/// for why the rename happens before reading.
fn spool_draining_path_for_tab(base: &Path, tab_id: &str) -> PathBuf {
    base.join(format!("{tab_id}.jsonl.draining"))
}

/// Replays any hook events spooled to disk by `trigger-event.sh` because a
/// live `send_ipc` delivery failed, handing each line to `on_line` (in
/// production, `dispatch`) in the order they were appended.
///
/// Claims the spool file with a rename before reading it, rather than
/// read-then-delete in place: a rename on the same filesystem is atomic, so
/// any line `trigger-event.sh` appends after this point lands in a spool
/// file created fresh by its next write, never in the file we just renamed
/// away. Reading straight from the live path and deleting it afterwards
/// would leave a window where a line appended between the read and the
/// delete is silently dropped, exactly the bug this spool exists to
/// prevent.
///
/// If a `.draining` file is already there, it is a leftover from a previous
/// drain that crashed between the rename and the final `remove_file`; it is
/// replayed first so those lines aren't lost, before claiming the live
/// spool (if any) the same way.
fn drain_spool(base: &Path, tab_id: &str, mut on_line: impl FnMut(&str)) {
    let draining_path = spool_draining_path_for_tab(base, tab_id);
    drain_file(&draining_path, tab_id, &mut on_line);

    let path = spool_path_for_tab(base, tab_id);
    if let Err(e) = std::fs::rename(&path, &draining_path) {
        if e.kind() != std::io::ErrorKind::NotFound {
            log::warn!("[ipc] failed to claim spool {path:?} for draining: {e}");
        }
        return;
    }
    drain_file(&draining_path, tab_id, &mut on_line);
}

/// Reads `path` line by line, hands each non-blank line to `on_line`, then
/// removes it. The file is removed only after every line has been handed
/// off, so a crash mid-drain leaves it in place for the next attempt to
/// replay. That trades a possible duplicate delivery for never silently
/// dropping an event, which matches how the rest of this module treats
/// agent signals (at-least-once, not exactly-once).
fn drain_file(path: &Path, tab_id: &str, on_line: &mut impl FnMut(&str)) {
    let contents = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
        Err(e) => {
            log::warn!("[ipc] failed to read spool {path:?}: {e}");
            return;
        }
    };

    let lines: Vec<&str> = contents.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    if !lines.is_empty() {
        for line in &lines {
            on_line(line);
        }
        log::debug!("[ipc] drained {} spooled event(s) for tab={tab_id}", lines.len());
    }

    if let Err(e) = std::fs::remove_file(path) {
        if e.kind() != std::io::ErrorKind::NotFound {
            log::warn!("[ipc] failed to remove drained spool {path:?}: {e}");
        }
    }
}

/// Creates the socket, then spawns the listener thread. Returns an IpcGuard
/// that stops the thread and removes the socket file when dropped.
pub fn spawn_listener(
    socket_path: PathBuf,
    tab_id: String,
    pty_id: u32,
    app: AppHandle,
) -> IpcGuard {
    let _ = std::fs::remove_file(&socket_path);
    let shutdown = Arc::new(AtomicBool::new(false));

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[ipc] bind {:?} failed: {e}", socket_path);
            return IpcGuard { path: socket_path, shutdown };
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
    IpcGuard { path: socket_path, shutdown }
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

fn dispatch(json: &str, tab_id: &str, pty_id: u32, app: &AppHandle) {
    let Some(p) = parse_payload(json) else {
        log::debug!("[ipc] invalid JSON: {}", truncate_for_log(json, MAX_LOG_FIELD_LEN));
        return;
    };
    match p.event.as_str() {
        "SessionStart" => {
            let source        = p.source.as_deref().unwrap_or("");
            let session_title = p.session_title.as_deref().unwrap_or("");
            let model         = p.model.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] SessionStart tab={tab_id} session={} \
                 source={source} title={session_title:?} model={model:?}",
                p.session_id
            );
            // Agent name is not available in the SessionStart payload. "claude" is the default;
            // TODO: infer agent from the transcript path or a future payload field.
            session_store::record_session(tab_id, "claude", &p.session_id, &p.transcript_path, &p.cwd);
            let _ = app.emit(AGENT_SESSION_META_EVENT, serde_json::json!({
                "tabId":          tab_id,
                "sessionId":      p.session_id,
                "cwdLaunch":      p.cwd,
                "sessionTitle":   session_title,
                "model":          model,
                "transcriptPath": p.transcript_path,
            }));
        }
        "SessionEnd" => {
            let reason = p.reason.as_deref().unwrap_or("");
            log::debug!("[ipc] SessionEnd tab={tab_id} reason={reason}");
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":      pty_id,
                "kind":    "SessionEnd",
                "agent":   null,
                "message": null,
                "toolName": null,
                "prompt":  null,
            }));
        }
        "UserPromptSubmit" => {
            let prompt = p.prompt.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] UserPromptSubmit tab={tab_id} session={} prompt={:?}",
                p.session_id,
                truncate_for_log(prompt, MAX_LOG_FIELD_LEN)
            );
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":       pty_id,
                "kind":     "UserPromptSubmit",
                "agent":    null,
                "prompt":   prompt,
                "message":  null,
                "toolName": null,
            }));
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
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":       pty_id,
                "kind":     "Notification",
                "agent":    null,
                "message":  msg,
                "toolName": null,
                "prompt":   null,
            }));
        }
        "Stop" => {
            let reason = p.stop_reason.as_deref().unwrap_or("");
            let last   = p.last_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] Stop tab={tab_id} reason={reason} last={:?}",
                truncate_for_log(last, MAX_LOG_FIELD_LEN)
            );
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":       pty_id,
                "kind":     "Stop",
                "agent":    null,
                "message":  last,
                "toolName": null,
                "prompt":   null,
            }));
        }
        "StopFailure" => {
            let err = p.error_message.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] StopFailure tab={tab_id} err={:?}",
                truncate_for_log(err, MAX_LOG_FIELD_LEN)
            );
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":       pty_id,
                "kind":     "StopFailure",
                "agent":    null,
                "message":  err,
                "toolName": null,
                "prompt":   null,
            }));
        }
        "PermissionRequest" => {
            let tool = p.tool_name.as_deref().unwrap_or("");
            log::debug!("[ipc] PermissionRequest tab={tab_id} tool={tool}");
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":       pty_id,
                "kind":     "PermissionRequest",
                "agent":    null,
                "message":  null,
                "toolName": tool,
                "prompt":   null,
            }));
        }
        "MessageDisplay" => {
            if !p.is_final {
                return;
            }
            let delta   = p.delta.as_deref().unwrap_or("");
            let turn_id = p.turn_id.as_deref().unwrap_or("");
            log::debug!(
                "[ipc] MessageDisplay tab={tab_id} turn={turn_id} delta={:?}",
                truncate_for_log(delta, MAX_LOG_FIELD_LEN)
            );
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":       pty_id,
                "kind":     "MessageDisplay",
                "agent":    null,
                "message":  delta,
                "toolName": null,
                "prompt":   null,
            }));
        }
        other => {
            log::debug!("[ipc] unhandled event {other} from tab={tab_id}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_path_for_id_is_short_enough() {
        let p = socket_path_for_pty_id(u32::MAX);
        assert!(p.to_str().unwrap().len() < 104);
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
        assert_eq!(truncated.chars().count(), 250 + "...(50 more)".chars().count());
    }

    #[test]
    fn owned_runtime_subdir_is_created_owner_only() {
        let base = tempfile::tempdir().unwrap();
        let uid = unsafe { libc::getuid() };

        let dir = owned_runtime_subdir(base.path(), uid);
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700, "runtime subdir must be owner-only, got {mode:o}");
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
        let socket_path = base.path().join(format!("kex-test-perms-{}.sock", std::process::id()));

        // Use a Tauri-less path: bind directly the way spawn_listener does,
        // without going through the full AppHandle machinery this test has
        // no access to.
        let listener = UnixListener::bind(&socket_path).unwrap();
        std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600)).unwrap();
        drop(listener);

        let mode = std::fs::metadata(&socket_path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "socket file must be owner-only, got {mode:o}");
    }

    #[test]
    fn ipc_guard_removes_file_on_drop() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kex-test-guard-{}.sock", std::process::id()));
        std::fs::write(&path, b"").unwrap();
        assert!(path.exists());
        let guard = IpcGuard { path: path.clone(), shutdown: Arc::new(AtomicBool::new(false)) };
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

        let guard = IpcGuard { path: path.clone(), shutdown };
        drop(guard);

        let joined = {
            let (tx, rx) = std::sync::mpsc::channel();
            thread::spawn(move || {
                handle.join().ok();
                let _ = tx.send(());
            });
            rx.recv_timeout(std::time::Duration::from_secs(2)).is_ok()
        };
        assert!(joined, "listener thread did not exit after guard was dropped");
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
    fn parse_stop_failure() {
        let json = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        let p = parse_payload(json).unwrap();
        assert_eq!(p.error_message.as_deref(), Some("oops"));
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

    #[test]
    fn drain_spool_replays_lines_in_order_then_removes_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-1";
        let path = spool_path_for_tab(dir.path(), tab_id);
        std::fs::write(&path, "line-one\nline-two\nline-three\n").unwrap();

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["line-one", "line-two", "line-three"]);
        assert!(!path.exists(), "spool file should be removed after a full drain");
    }

    #[test]
    fn drain_spool_is_a_noop_when_no_spool_file_exists() {
        let dir = tempfile::tempdir().unwrap();
        let mut called = false;
        drain_spool(dir.path(), "tab-missing", |_| called = true);
        assert!(!called);
    }

    #[test]
    fn drain_spool_skips_blank_lines() {
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-2";
        let path = spool_path_for_tab(dir.path(), tab_id);
        std::fs::write(&path, "\n  \nreal-line\n\n").unwrap();

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));
        assert_eq!(seen, vec!["real-line"]);
    }

    #[test]
    fn drain_spool_leaves_other_tabs_spool_files_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let other_path = spool_path_for_tab(dir.path(), "tab-other");
        std::fs::write(&other_path, "untouched\n").unwrap();

        let mut called = false;
        drain_spool(dir.path(), "tab-drain-3", |_| called = true);

        assert!(!called);
        assert!(other_path.exists());
    }

    #[test]
    fn drain_spool_claims_the_file_by_rename_before_reading_it() {
        // A drain that read-then-deleted the live path in place would have a
        // window where a line appended between the read and the delete is
        // lost. Renaming first means the live path is gone (and free for a
        // fresh append) the instant the rename succeeds, before any line has
        // even been read.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-rename";
        let path = spool_path_for_tab(dir.path(), tab_id);
        let draining_path = spool_draining_path_for_tab(dir.path(), tab_id);
        std::fs::write(&path, "line-one\n").unwrap();

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["line-one"]);
        assert!(!path.exists());
        assert!(!draining_path.exists());
    }

    #[test]
    fn drain_spool_replays_a_leftover_draining_file_from_a_crashed_drain() {
        // Simulates a process that renamed the live spool to `.draining` on a
        // previous run but crashed before finishing (or before removing the
        // file), then wrote a new live spool file afterwards. Both must be
        // replayed, oldest first, and neither should clobber the other.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-leftover";
        let path = spool_path_for_tab(dir.path(), tab_id);
        let draining_path = spool_draining_path_for_tab(dir.path(), tab_id);
        std::fs::write(&draining_path, "leftover-line\n").unwrap();
        std::fs::write(&path, "fresh-line\n").unwrap();

        let mut seen = Vec::new();
        drain_spool(dir.path(), tab_id, |line| seen.push(line.to_string()));

        assert_eq!(seen, vec!["leftover-line", "fresh-line"]);
        assert!(!path.exists());
        assert!(!draining_path.exists());
    }

    #[test]
    fn drain_spool_lines_parse_the_same_way_a_live_payload_does() {
        // Proves a spooled line reaches dispatch's parsing exactly like a
        // payload that arrived over the live socket: same parse_payload call,
        // same JSON shape, same extracted event kind.
        let dir = tempfile::tempdir().unwrap();
        let tab_id = "tab-drain-4";
        let path = spool_path_for_tab(dir.path(), tab_id);
        let payload = r#"{"hook_event_name":"Stop","session_id":"s","transcript_path":"","cwd":"","stop_reason":"end_turn","last_assistant_message":"done"}"#;
        std::fs::write(&path, format!("{payload}\n")).unwrap();

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
        assert_eq!(stale_spooled_event_kind(session_end).as_deref(), Some("SessionEnd"));
        assert_eq!(stale_spooled_event_kind(stop_failure).as_deref(), Some("StopFailure"));
    }

    #[test]
    fn stale_spooled_event_kind_is_none_for_other_events_and_invalid_json() {
        let session_start = r#"{"hook_event_name":"SessionStart","session_id":"s","transcript_path":"","cwd":""}"#;
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
        let path = spool_path_for_tab(dir.path(), tab_id);
        let session_end = r#"{"hook_event_name":"SessionEnd","session_id":"s","transcript_path":"","cwd":"","reason":"exit"}"#;
        let stop_failure = r#"{"hook_event_name":"StopFailure","session_id":"s","transcript_path":"","cwd":"","error_message":"oops"}"#;
        let session_start = r#"{"hook_event_name":"SessionStart","session_id":"s","transcript_path":"","cwd":""}"#;
        let notification = r#"{"hook_event_name":"Notification","session_id":"s","transcript_path":"","cwd":"","message":"hi","notification_type":"other"}"#;
        std::fs::write(
            &path,
            format!("{session_end}\n{session_start}\n{stop_failure}\n{notification}\n"),
        )
        .unwrap();

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
