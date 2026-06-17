use std::io::{BufRead, BufReader};
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::modules::agent::session_store;

const AGENT_EVENT: &str = "kex:agent-signal";
const AGENT_SESSION_META_EVENT: &str = "kex:agent-session-meta";

pub fn socket_path_for_pty_id(id: u32) -> PathBuf {
    std::env::temp_dir().join(format!("kex-ipc-{id}.sock"))
}

/// Removes the socket file when dropped, stopping the listener thread.
pub struct IpcGuard(pub PathBuf);

impl Drop for IpcGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

struct Payload {
    event: String,
    session_id: String,
    transcript_path: String,
    cwd: String,
    source: Option<String>,
    session_title: Option<String>,
    model: Option<String>,
    reason: Option<String>,
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
    })
}

/// Creates the socket, then spawns the listener thread. Returns an IpcGuard
/// that removes the socket file when dropped (which causes the thread to exit).
pub fn spawn_listener(
    socket_path: PathBuf,
    panel_id: String,
    pty_id: u32,
    app: AppHandle,
) -> IpcGuard {
    let _ = std::fs::remove_file(&socket_path);

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[ipc] bind {:?} failed: {e}", socket_path);
            return IpcGuard(socket_path);
        }
    };
    log::debug!("[ipc] listening panel={panel_id} path={:?}", socket_path);

    thread::spawn(move || run_listener(listener, panel_id, pty_id, app));
    IpcGuard(socket_path)
}

fn run_listener(listener: UnixListener, panel_id: String, pty_id: u32, app: AppHandle) {
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let mut line = String::new();
                let _ = BufReader::new(stream).read_line(&mut line);
                if !line.trim().is_empty() {
                    dispatch(line.trim(), &panel_id, pty_id, &app);
                }
            }
            Err(e) => {
                log::debug!("[ipc] accept error (socket removed?): {e}");
                break;
            }
        }
    }
    log::debug!("[ipc] thread exiting panel={panel_id}");
}

fn dispatch(json: &str, panel_id: &str, pty_id: u32, app: &AppHandle) {
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
                "[ipc] SessionStart panel={panel_id} session={} \
                 source={source} title={session_title:?} model={model:?}",
                p.session_id
            );
            session_store::record_session(panel_id, "claude", &p.session_id, &p.transcript_path, &p.cwd);
            let _ = app.emit(AGENT_SESSION_META_EVENT, serde_json::json!({
                "panelId":      panel_id,
                "sessionId":    p.session_id,
                "cwdLaunch":    p.cwd,
                "sessionTitle": session_title,
                "model":        model,
            }));
        }
        "SessionEnd" => {
            let reason = p.reason.as_deref().unwrap_or("");
            log::debug!("[ipc] SessionEnd panel={panel_id} reason={reason}");
            let _ = app.emit(AGENT_EVENT, serde_json::json!({
                "id":      pty_id,
                "kind":    "SessionEnd",
                "agent":   null,
                "message": null,
                "toolName": null,
                "prompt":  null,
            }));
        }
        other => {
            log::debug!("[ipc] unhandled event {other} from panel={panel_id}");
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
    fn ipc_guard_removes_file_on_drop() {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("kex-test-guard-{}.sock", std::process::id()));
        std::fs::write(&path, b"").unwrap();
        assert!(path.exists());
        let guard = IpcGuard(path.clone());
        drop(guard);
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
}
