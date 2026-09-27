#![cfg(unix)]

use std::io::{BufRead, BufReader};
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
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

fn run_listener(
    listener: UnixListener,
    tab_id: String,
    pty_id: u32,
    app: AppHandle,
    shutdown: Arc<AtomicBool>,
) {
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

fn dispatch(json: &str, tab_id: &str, pty_id: u32, app: &AppHandle) {
    let Some(p) = parse_payload(json) else {
        log::debug!("[ipc] invalid JSON: {json}");
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
            log::debug!("[ipc] UserPromptSubmit tab={tab_id} session={} prompt={prompt:?}", p.session_id);
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
            log::debug!("[ipc] Notification tab={tab_id} type={notif_type:?} msg={msg:?}");
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
            log::debug!("[ipc] Stop tab={tab_id} reason={reason} last={last:?}");
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
            log::debug!("[ipc] StopFailure tab={tab_id} err={err:?}");
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
            log::debug!("[ipc] MessageDisplay tab={tab_id} turn={turn_id} delta={delta:?}");
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
    fn parse_message_display_streaming() {
        let json = r#"{"hook_event_name":"MessageDisplay","session_id":"s","transcript_path":"","cwd":"","final":false,"delta":"chunk"}"#;
        let p = parse_payload(json).unwrap();
        assert!(!p.is_final);
    }
}
