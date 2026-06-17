#![cfg(unix)]

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

    if let Err(e) = thread::Builder::new()
        .name(format!("kex-ipc-{panel_id}"))
        .spawn(move || run_listener(listener, panel_id, pty_id, app))
    {
        log::warn!("[ipc] failed to spawn listener thread: {e}");
    }
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
        "UserPromptSubmit" => {
            let prompt = p.prompt.as_deref().unwrap_or("");
            log::debug!("[ipc] UserPromptSubmit panel={panel_id} prompt_len={}", prompt.len());
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
            let msg = p.notif_message.as_deref().unwrap_or("");
            log::debug!("[ipc] Notification panel={panel_id}");
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
            log::debug!("[ipc] Stop panel={panel_id} reason={reason}");
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
            log::debug!("[ipc] StopFailure panel={panel_id}");
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
            log::debug!("[ipc] PermissionRequest panel={panel_id} tool={tool}");
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
            log::debug!("[ipc] MessageDisplay panel={panel_id} turn={turn_id}");
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
