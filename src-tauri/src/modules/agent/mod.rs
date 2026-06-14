pub mod session_store;

use serde_json::{json, Value};

const HOOK_EVENTS: [(&str, &str); 3] = [
    ("UserPromptSubmit", "working"),
    ("Notification", "attention"),
    ("Stop", "finished"),
];

// Includes legacy Terax markers so re-running migrates them to the Kex name.
const OWNED_MARKERS: [&str; 3] = ["notify;Kex;", "notify;Terax;", "terax;notify"];

// Gated on KEX_TERMINAL; no-op outside Kex. Returns the sequence via
// `terminalSequence` because hooks lost /dev/tty access in v2.1.139.
fn hook_cmd(event: &str) -> String {
    format!(
        r#"[ -n "$KEX_TERMINAL" ] && printf '{{"terminalSequence":"\\u001b]777;notify;Kex;{event}\\u0007"}}' || true"#
    )
}

fn is_ours(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .is_some_and(|c| OWNED_MARKERS.iter().any(|m| c.contains(m)))
            })
        })
}

// A group with no hooks is inert cruft (e.g. left behind when someone deletes
// our command but not its wrapper). Drop it so the file stays clean.
fn is_empty_group(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_none_or(|hs| hs.is_empty())
}

const SESSION_HOOK_MARKER: &str = "terax-session-hook";

// Bump this when the script behaviour changes in a way that requires reinstall.
// agent_claude_hooks_status checks the installed file for this marker so that
// users with an older script see the "Set up Claude Code" button again.
const SESSION_HOOK_SCRIPT_VERSION: &str = "kex-session-v1";

const SESSION_HOOK_SCRIPT: &str = r#"#!/usr/bin/env bash
# kex-session-v1
set -euo pipefail

PANEL_ID="${KEX_PANEL_ID:-}"
[ -z "$PANEL_ID" ] && exit 0

PAYLOAD="$(cat)"
EVENT="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // empty')"

# Only act on SessionStart. SessionEnd is intentionally ignored: the hook fires
# when the PTY dies (e.g. Kex closing), not only when the user exits claude,
# so writing "exited" here would prevent restore on the next launch.
# Sessions that the user wants to detach are cleared via the "Detach Claude"
# option in the tab context menu.
[ "$EVENT" = "SessionStart" ] || exit 0

SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty')"
TRANSCRIPT="$(printf '%s' "$PAYLOAD" | jq -r '.transcript_path // empty')"
CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd // empty')"

STORE="$HOME/.config/kex/agent-sessions.json"
mkdir -p "$(dirname "$STORE")"
[ -f "$STORE" ] || printf '{"version":1,"panels":{}}' > "$STORE"

TMP="$(mktemp)"
jq --arg p "$PANEL_ID" --arg sid "$SESSION_ID" \
   --arg tp "$TRANSCRIPT" --arg cwd "$CWD" \
   --arg ts "$(date +%s)" \
   '.panels[$p] = {agent:"claude",session_id:$sid,cwd_launch:$cwd,transcript_path:$tp,state:"idle",updated_at:($ts|tonumber)}' \
   "$STORE" > "$TMP" && mv -f "$TMP" "$STORE"
exit 0
"#;

fn session_hook_script_path() -> Result<std::path::PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| "could not resolve home dir".to_string())?
        .join(".config")
        .join("kex")
        .join("hooks")
        .join("session.sh"))
}

fn session_hook_cmd() -> String {
    format!(
        r#"[ -n "$KEX_PANEL_ID" ] && "$HOME/.config/kex/hooks/session.sh" || true  # {SESSION_HOOK_MARKER}"#
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

fn remove_hooks(mut root: Value) -> Value {
    if !root.is_object() {
        return root;
    }
    let obj = root.as_object_mut().unwrap();
    let hooks = match obj.get_mut("hooks").filter(|h| h.is_object()) {
        Some(h) => h.as_object_mut().unwrap(),
        None => return root,
    };
    for (event, _) in HOOK_EVENTS {
        if let Some(arr) = hooks.get_mut(event).and_then(Value::as_array_mut) {
            arr.retain(|g| !is_ours(g) && !is_empty_group(g));
        }
    }
    for event in ["SessionStart", "SessionEnd"] {
        if let Some(arr) = hooks.get_mut(event).and_then(Value::as_array_mut) {
            arr.retain(|g| !is_session_hook(g) && !is_empty_group(g));
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

    for (event, marker) in HOOK_EVENTS {
        let arr = hooks.entry(event).or_insert_with(|| json!([]));
        if !arr.is_array() {
            *arr = json!([]);
        }
        let arr = arr.as_array_mut().unwrap();
        arr.retain(|group| !is_ours(group) && !is_empty_group(group));
        arr.push(json!({
            "hooks": [ { "type": "command", "command": hook_cmd(marker) } ]
        }));
    }

    for event in ["SessionStart", "SessionEnd"] {
        let arr = hooks.entry(event).or_insert_with(|| json!([]));
        if !arr.is_array() {
            *arr = json!([]);
        }
        let arr = arr.as_array_mut().unwrap();
        arr.retain(|group| !is_session_hook(group) && !is_empty_group(group));
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

    // Skip writing when nothing changed — avoids reformatting the user's file
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

/// Detect the indent used in a JSON string (spaces or tab, min 1 char).
/// Falls back to two spaces if nothing is found.
fn detect_json_indent(s: &str) -> &[u8] {
    for line in s.lines() {
        let trimmed = line.trim_start_matches([' ', '\t']);
        if !trimmed.is_empty() && trimmed != line {
            let indent_len = line.len() - trimmed.len();
            if indent_len > 0 {
                return &line.as_bytes()[..indent_len];
            }
        }
    }
    b"  "
}

fn serialize_pretty(value: &serde_json::Value, indent: &[u8]) -> Result<String, String> {
    let mut buf = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(indent);
    let mut ser = serde_json::Serializer::with_formatter(&mut buf, formatter);
    serde::Serialize::serialize(value, &mut ser).map_err(|e| e.to_string())?;
    buf.push(b'\n');
    String::from_utf8(buf).map_err(|e| e.to_string())
}

/// Remove a panel's session entry from the persistent store.
/// Called from the "Detach Claude" tab context menu option so the user can
/// opt out of restore for a specific session without closing the tab.
#[tauri::command]
pub fn agent_detach_session(panel_id: String) -> Result<(), String> {
    session_store::detach_session(&panel_id)
}

#[tauri::command]
pub fn agent_claude_hooks_status() -> bool {
    let Some(content) = settings_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
    else {
        return false;
    };
    // Check that the installed script is the current version. An older script
    // (e.g. one that wrote "exited" on SessionEnd) won't have SESSION_HOOK_SCRIPT_VERSION
    // and will return false here so the user sees the install button again.
    let script_current = session_hook_script_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .is_some_and(|s| s.contains(SESSION_HOOK_SCRIPT_VERSION));
    HOOK_EVENTS
        .iter()
        .all(|(_, m)| content.contains(&format!("notify;Kex;{m}")))
        && content.contains(SESSION_HOOK_MARKER)
        && script_current
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hook_count(root: &Value, event: &str) -> usize {
        root["hooks"][event].as_array().map_or(0, Vec::len)
    }

    fn command(root: &Value, event: &str, idx: usize) -> String {
        root["hooks"][event][idx]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[test]
    fn adds_all_event_hooks_to_empty_config() {
        let out = merge_hooks(json!({}));
        assert_eq!(hook_count(&out, "UserPromptSubmit"), 1);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert_eq!(hook_count(&out, "Stop"), 1);
        assert!(command(&out, "Notification", 0).contains("notify;Kex;attention"));
        assert!(command(&out, "Stop", 0).contains("notify;Kex;finished"));
        assert!(command(&out, "UserPromptSubmit", 0).contains("notify;Kex;working"));
        assert!(command(&out, "Stop", 0).contains("terminalSequence"));
        assert!(!command(&out, "Stop", 0).contains("/dev/tty"));
    }

    #[test]
    fn is_idempotent() {
        let once = merge_hooks(json!({}));
        let twice = merge_hooks(once.clone());
        assert_eq!(once, twice);
        assert_eq!(hook_count(&twice, "Notification"), 1);
    }

    #[test]
    fn migrates_legacy_dev_tty_hook() {
        let legacy = json!({
            "hooks": {
                "Notification": [
                    { "hooks": [ {
                        "type": "command",
                        "command": "[ -n \"$KEX_TERMINAL\" ] && printf '\\033]777;terax;notify\\033\\\\' > /dev/tty || true"
                    } ] }
                ]
            }
        });
        let out = merge_hooks(legacy);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert!(command(&out, "Notification", 0).contains("terminalSequence"));
        assert!(!command(&out, "Notification", 0).contains("/dev/tty"));
    }

    #[test]
    fn preserves_unrelated_settings_and_foreign_hooks() {
        let input = json!({
            "permissions": { "allow": ["Bash"] },
            "hooks": {
                "Notification": [
                    { "hooks": [ { "type": "command", "command": "say hi" } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        assert_eq!(out["permissions"]["allow"][0], "Bash");
        assert_eq!(hook_count(&out, "Notification"), 2);
        assert_eq!(command(&out, "Notification", 0), "say hi");
    }

    #[test]
    fn replaces_non_object_root() {
        let out = merge_hooks(json!("garbage"));
        assert_eq!(hook_count(&out, "Notification"), 1);
    }

    #[test]
    fn prunes_empty_groups_and_collapses_duplicates() {
        let input = json!({
            "hooks": {
                "Notification": [
                    { "hooks": [] },
                    { "hooks": [ { "type": "command", "command": hook_cmd("attention") } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert!(command(&out, "Notification", 0).contains("notify;Kex;attention"));
    }

    #[test]
    fn existing_config_absent_or_empty_starts_fresh() {
        let p = std::path::Path::new("/x/settings.json");
        assert_eq!(existing_config(None, p).unwrap(), json!({}));
        assert_eq!(existing_config(Some("   \n"), p).unwrap(), json!({}));
    }

    #[test]
    fn existing_config_refuses_to_clobber_invalid_json() {
        let p = std::path::Path::new("/x/settings.json");
        assert!(existing_config(Some("{ not json,"), p).is_err());
        assert_eq!(
            existing_config(Some(r#"{"permissions":{}}"#), p).unwrap(),
            json!({ "permissions": {} })
        );
    }

    #[test]
    fn adds_session_hooks_to_empty_config() {
        let out = merge_hooks(json!({}));
        assert!(out["hooks"]["SessionStart"].as_array().unwrap().len() >= 1);
        assert!(out["hooks"]["SessionEnd"].as_array().unwrap().len() >= 1);
        let cmd = out["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str().unwrap();
        assert!(cmd.contains(SESSION_HOOK_MARKER));
        assert!(cmd.contains("session.sh"));
    }

    #[test]
    fn session_hooks_are_idempotent() {
        let once = merge_hooks(json!({}));
        let twice = merge_hooks(once.clone());
        assert_eq!(
            twice["hooks"]["SessionStart"].as_array().unwrap().len(),
            once["hooks"]["SessionStart"].as_array().unwrap().len()
        );
    }

    #[test]
    fn session_hooks_preserve_foreign_hooks() {
        let input = json!({
            "hooks": {
                "SessionStart": [
                    { "hooks": [ { "type": "command", "command": "echo hello" } ] }
                ]
            }
        });
        let out = merge_hooks(input);
        assert_eq!(out["hooks"]["SessionStart"].as_array().unwrap().len(), 2);
        assert_eq!(out["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str().unwrap(), "echo hello");
    }
}
