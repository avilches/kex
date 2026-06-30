pub mod pending_nav;
pub mod session_store;
pub use pending_nav::{agent_queue_nav, PendingNavState};

use serde_json::{json, Value};

// A group with no hooks is inert cruft (e.g. left behind when someone deletes
// our command but not its wrapper). Drop it so the file stays clean.
fn is_empty_group(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_none_or(|hs| hs.is_empty())
}

const SESSION_HOOK_MARKER: &str = "kex-session-hook";

// Bump this when the script behaviour changes in a way that requires reinstall.
// agent_claude_hooks_status checks the installed file for this marker so that
// users with an older script see the "Set up Claude Code" button again.
const SESSION_HOOK_SCRIPT_VERSION: &str = "kex-session-v5";

// Script lives in hooks/trigger-event.sh; embedded at compile time.
// Each invocation also appends the full payload to /tmp/kex-hook-<EVENT>.log for field discovery.
//
// Known extra fields per event:
//   SessionStart:       [5]=source (startup|resume|clear|compact), [6]=sessionTitle
//   UserPromptSubmit:   [5]=prompt
//   Notification:       [5]=notification_type, [6]=message
//   Stop:               [5]=stop_reason
//   StopFailure:        [5]=error_type, [6]=error_message
//   SessionEnd:         [5]=end_reason
//   PermissionRequest:  [5]=tool_name
//   MessageDisplay:     TBD (see /tmp/kex-hook-MessageDisplay.log)
const SESSION_HOOK_SCRIPT: &str = include_str!("hooks/trigger-event.sh");

// All 8 events handled by trigger-event.sh in v5.
const SESSION_HOOK_EVENTS: [&str; 8] = [
    "SessionStart",
    "UserPromptSubmit",
    "Notification",
    "Stop",
    "StopFailure",
    "SessionEnd",
    "PermissionRequest",
    "MessageDisplay",
];

fn session_hook_script_path() -> Result<std::path::PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| "could not resolve home dir".to_string())?
        .join(".config")
        .join("kex")
        .join("hooks")
        .join("trigger-event.sh"))
}

fn session_hook_cmd() -> String {
    format!(
        r#"[ -n "$KEX_PANEL_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" || true  # {SESSION_HOOK_MARKER}"#
    )
}

fn is_session_hook(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .is_some_and(|c| c.contains(SESSION_HOOK_MARKER))
            })
        })
}

// Detects old-style v1/v2/v3 notify hooks so they can be cleaned up on merge/remove.
fn is_old_notify(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .is_some_and(|c| c.contains("notify;Kex;"))
            })
        })
}

fn remove_hooks(mut root: Value) -> Value {
    if !root.is_object() {
        return root;
    }
    let obj = root.as_object_mut().unwrap();
    let hooks = match obj.get_mut("hooks").filter(|h| h.is_object()) {
        Some(h) => h.as_object_mut().unwrap(),
        None => return root,
    };
    // Remove session hooks from all v5 events.
    for event in SESSION_HOOK_EVENTS {
        if let Some(arr) = hooks.get_mut(event).and_then(Value::as_array_mut) {
            arr.retain(|g| !is_session_hook(g) && !is_empty_group(g));
        }
    }
    // Also clean up old-style notify hooks (backward compat v1/v2/v3).
    for event in ["UserPromptSubmit", "Notification", "Stop"] {
        if let Some(arr) = hooks.get_mut(event).and_then(Value::as_array_mut) {
            arr.retain(|g| !is_old_notify(g) && !is_empty_group(g));
        }
    }
    root
}

fn merge_hooks(mut root: Value) -> Value {
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().unwrap();

    for event in SESSION_HOOK_EVENTS {
        let arr = hooks.entry(event).or_insert_with(|| json!([]));
        if !arr.is_array() {
            *arr = json!([]);
        }
        let arr = arr.as_array_mut().unwrap();
        // Remove old-style notify hooks and any prior session hook before adding v4.
        arr.retain(|group| !is_session_hook(group) && !is_old_notify(group) && !is_empty_group(group));
        arr.push(json!({
            "hooks": [ { "type": "command", "command": session_hook_cmd(), "timeout": 10 } ]
        }));
    }
    root
}

fn existing_config(contents: Option<&str>, path: &std::path::Path) -> Result<Value, String> {
    match contents {
        Some(s) if !s.trim().is_empty() => serde_json::from_str::<Value>(s).map_err(|e| {
            format!("{} is not valid JSON ({e}); refusing to overwrite", path.display())
        }),
        _ => Ok(json!({})),
    }
}

fn settings_path() -> Result<std::path::PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| "could not resolve home dir".to_string())?
        .join(".claude")
        .join("settings.json"))
}

#[tauri::command]
pub fn agent_enable_claude_hooks() -> Result<(), String> {
    // Update session hook script only when the installed version is outdated.
    let script_path = session_hook_script_path()?;
    let current = std::fs::read_to_string(&script_path).unwrap_or_default();
    if current != SESSION_HOOK_SCRIPT {
        let script_dir = script_path
            .parent()
            .ok_or_else(|| "session hook script path has no parent".to_string())?;
        std::fs::create_dir_all(script_dir)
            .map_err(|e| format!("create {}: {e}", script_dir.display()))?;
        let script_tmp = script_path.with_extension("sh.kex-tmp");
        std::fs::write(&script_tmp, SESSION_HOOK_SCRIPT)
            .map_err(|e| format!("write session hook tmp: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script_tmp, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("chmod session hook: {e}"))?;
        }
        std::fs::rename(&script_tmp, &script_path).map_err(|e| {
            let _ = std::fs::remove_file(&script_tmp);
            format!("rename session hook: {e}")
        })?;
    }

    let path = settings_path()?;
    let dir = path.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;

    let existing_str = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };

    let existing = existing_config(
        if existing_str.is_empty() { None } else { Some(&existing_str) },
        &path,
    )?;
    let merged = merge_hooks(existing.clone());

    // Skip writing when nothing changed -- avoids reformatting the user's file
    // on repeated runs (e.g. the startup auto-reinstall path).
    if merged == existing {
        return Ok(());
    }

    // Detect the original indent so we don't change the user's preferred style.
    let indent = detect_json_indent(existing_str.as_str());
    let out = serialize_pretty(&merged, indent)?;

    // Atomic write via temp file so a crash mid-write never truncates the file.
    let tmp = path.with_extension("json.kex-tmp");
    std::fs::write(&tmp, out).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })?;
    Ok(())
}

#[tauri::command]
pub fn agent_disable_claude_hooks() -> Result<(), String> {
    let path = settings_path()?;
    let existing_str = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    let existing = existing_config(
        if existing_str.is_empty() { None } else { Some(&existing_str) },
        &path,
    )?;
    let cleaned = remove_hooks(existing.clone());
    if cleaned == existing {
        return Ok(());
    }
    let indent = detect_json_indent(existing_str.as_str());
    let out = serialize_pretty(&cleaned, indent)?;
    let tmp = path.with_extension("json.kex-tmp");
    std::fs::write(&tmp, out).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })?;
    Ok(())
}

#[tauri::command]
pub fn agent_detach_session(tab_id: String) -> Result<(), String> {
    session_store::detach_session(&tab_id)
}

#[tauri::command]
pub fn agent_claude_hooks_status() -> bool {
    let Some(content) = settings_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
    else {
        return false;
    };
    let Ok(root) = serde_json::from_str::<Value>(&content) else {
        return false;
    };
    // All 8 events must have the session hook (v5 unified protocol).
    let all_hooks_present = SESSION_HOOK_EVENTS.iter().all(|event| {
        root["hooks"][event]
            .as_array()
            .is_some_and(|arr| arr.iter().any(is_session_hook))
    });
    if !all_hooks_present {
        return false;
    }
    // Check that the session hook script is up-to-date (v4).
    session_hook_script_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default()
        .contains(SESSION_HOOK_SCRIPT_VERSION)
}

fn detect_json_indent(s: &str) -> usize {
    for line in s.lines().skip(1) {
        let trimmed = line.trim_start_matches(' ');
        let spaces = line.len() - trimmed.len();
        if spaces > 0 {
            return spaces;
        }
    }
    2
}

fn serialize_pretty(value: &Value, indent: usize) -> Result<String, String> {
    let raw = serde_json::to_string_pretty(value)
        .map_err(|e| format!("serialize: {e}"))?;
    if indent == 2 {
        return Ok(raw);
    }
    let pad = " ".repeat(indent);
    let out = raw
        .lines()
        .map(|line| {
            let depth = (line.len() - line.trim_start_matches(' ').len()) / 2;
            format!("{}{}", pad.repeat(depth), line.trim_start())
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_unrelated_settings_and_foreign_hooks() {
        let input = json!({
            "permissions": { "allow": ["bash"] },
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": "echo hi" } ] }
                ]
            }
        });
        let out = merge_hooks(input.clone());
        assert_eq!(out["permissions"], input["permissions"]);
        let arr = out["hooks"]["UserPromptSubmit"].as_array().unwrap();
        assert!(arr.len() >= 2);
        assert_eq!(arr[0]["hooks"][0]["command"].as_str().unwrap(), "echo hi");
    }

    #[test]
    fn existing_config_parses_valid_json() {
        let p = std::path::Path::new("/x/settings.json");
        assert_eq!(
            existing_config(Some(r#"{"permissions":{}}"#), p).unwrap(),
            json!({ "permissions": {} })
        );
    }

    #[test]
    fn adds_session_hooks_to_empty_config() {
        let out = merge_hooks(json!({}));
        // All 8 events must have the session hook in v5.
        for event in SESSION_HOOK_EVENTS {
            let arr = out["hooks"][event].as_array().unwrap();
            assert!(!arr.is_empty(), "{event} missing");
            let cmd = arr[0]["hooks"][0]["command"].as_str().unwrap();
            assert!(cmd.contains(SESSION_HOOK_MARKER), "{event} cmd missing marker");
            assert!(cmd.contains("trigger-event.sh"), "{event} cmd missing trigger-event.sh");
            let timeout = arr[0]["hooks"][0]["timeout"].as_u64().unwrap();
            assert_eq!(timeout, 10, "{event} timeout should be 10");
        }
    }

    #[test]
    fn session_hooks_are_idempotent() {
        let once = merge_hooks(json!({}));
        let twice = merge_hooks(once.clone());
        for event in SESSION_HOOK_EVENTS {
            assert_eq!(
                twice["hooks"][event].as_array().unwrap().len(),
                once["hooks"][event].as_array().unwrap().len(),
                "{event} idempotency failed"
            );
        }
    }

    #[test]
    fn session_hooks_preserve_foreign_hooks() {
        let input = json!({
            "hooks": {
                "SessionStart": [
                    { "hooks": [ { "type": "command", "command": "echo hello" } ] }
                ],
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": "echo world" } ] }
                ],
                "Notification": [
                    { "hooks": [ { "type": "command", "command": "echo notify" } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": "echo stop" } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        // Each event: foreign hook preserved at index 0, session hook appended.
        assert_eq!(out["hooks"]["SessionStart"].as_array().unwrap().len(), 2);
        assert_eq!(out["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str().unwrap(), "echo hello");
        assert_eq!(out["hooks"]["UserPromptSubmit"].as_array().unwrap().len(), 2);
        assert_eq!(out["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"].as_str().unwrap(), "echo world");
        assert_eq!(out["hooks"]["Notification"].as_array().unwrap().len(), 2);
        assert_eq!(out["hooks"]["Notification"][0]["hooks"][0]["command"].as_str().unwrap(), "echo notify");
        assert_eq!(out["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(out["hooks"]["Stop"][0]["hooks"][0]["command"].as_str().unwrap(), "echo stop");
    }

    #[test]
    fn old_notify_hook_replaced_by_session_hook_on_merge() {
        // Simulate an existing v1/v2/v3 installation with old notify hooks.
        let old_notify_cmd = r#"[ -n "$KEX_TERMINAL" ] && printf '{"terminalSequence":"]777;notify;Kex;Notification"}' || true"#;
        let old_stop_cmd = r#"[ -n "$KEX_TERMINAL" ] && printf '{"terminalSequence":"]777;notify;Kex;Stop"}' || true"#;
        let input = json!({
            "hooks": {
                "UserPromptSubmit": [
                    { "hooks": [ { "type": "command", "command": "[ -n \"$KEX_TERMINAL\" ] && printf '{\"terminalSequence\":\"\\u001b]777;notify;Kex;UserPromptSubmit\\u0007\"}' || true" } ] }
                ],
                "Notification": [
                    { "hooks": [ { "type": "command", "command": old_notify_cmd } ] }
                ],
                "Stop": [
                    { "hooks": [ { "type": "command", "command": old_stop_cmd } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        // Old notify hooks must be gone; only session hook remains.
        for event in ["UserPromptSubmit", "Notification", "Stop"] {
            let arr = out["hooks"][event].as_array().unwrap();
            assert_eq!(arr.len(), 1, "{event}: expected only session hook after replace");
            let cmd = arr[0]["hooks"][0]["command"].as_str().unwrap();
            assert!(cmd.contains(SESSION_HOOK_MARKER), "{event}: missing session hook marker");
        }
    }
}
