pub mod launch_cmd;
pub mod live_model;
pub mod os_notify;
pub mod provider;
pub mod session_store;

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
// v7: the script tags its frames with agent "claude" (see trigger-event.sh).
const SESSION_HOOK_SCRIPT_VERSION: &str = "kex-session-v7";

// Script lives in hooks/trigger-event.sh; embedded at compile time.
//
// Known extra fields per event:
//   SessionStart:       [5]=source (startup|resume|clear|compact), [6]=sessionTitle
//   UserPromptSubmit:   [5]=prompt
//   Notification:       [5]=notification_type, [6]=message
//   Stop:               [5]=stop_reason, also background_tasks (running subagents)
//   StopFailure:        [5]=error_type, [6]=error_message
//   SessionEnd:         [5]=end_reason
//   PermissionRequest:  [5]=tool_name
//   MessageDisplay:     TBD
//   SubagentStart:      agent_id, agent_type
//   SubagentStop:       agent_id, agent_type
const SESSION_HOOK_SCRIPT: &str = include_str!("hooks/trigger-event.sh");

// OpenCode loads every file in ~/.config/opencode/plugins/ into its own process, and OMP/Pi
// every one in ~/.omp/agent/extensions/ and ~/.pi/agent/extensions/, so the analogue
// integrations ship as static scripts instead of merged settings. The OpenCode status greps
// the installed file for a version marker; the OMP and Pi statuses compare the whole file with
// the script stamped for that runtime, so an outdated or wrongly stamped copy counts as not installed.
const OPENCODE_PLUGIN_VERSION: &str = "kex-opencode-v3";
const OPENCODE_PLUGIN_SCRIPT: &str = include_str!("plugins/opencode-session.js");
const AGENT_EXTENSION_TEMPLATE: &str = include_str!("plugins/kex-agent-status.ts");

fn agent_extension_script(agent: &str) -> String {
    AGENT_EXTENSION_TEMPLATE.replace("__KEX_AGENT__", agent)
}

// All 10 events handled by trigger-event.sh in v7.
const SESSION_HOOK_EVENTS: [&str; 10] = [
    "SessionStart",
    "UserPromptSubmit",
    "Notification",
    "Stop",
    "StopFailure",
    "SessionEnd",
    "PermissionRequest",
    "MessageDisplay",
    "SubagentStart",
    "SubagentStop",
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
        r#"[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" || true  # {SESSION_HOOK_MARKER}"#
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
        arr.retain(|group| {
            !is_session_hook(group) && !is_old_notify(group) && !is_empty_group(group)
        });
        arr.push(json!({
            "hooks": [ { "type": "command", "command": session_hook_cmd(), "timeout": 10 } ]
        }));
    }
    root
}

fn existing_config(contents: Option<&str>, path: &std::path::Path) -> Result<Value, String> {
    match contents {
        Some(s) if !s.trim().is_empty() => serde_json::from_str::<Value>(s).map_err(|e| {
            format!(
                "{} is not valid JSON ({e}); refusing to overwrite",
                path.display()
            )
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
        if existing_str.is_empty() {
            None
        } else {
            Some(&existing_str)
        },
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
        if existing_str.is_empty() {
            None
        } else {
            Some(&existing_str)
        },
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

fn write_agent_file(
    path: std::path::PathBuf,
    script: &str,
    label: &str,
    tmp_ext: &str,
) -> Result<(), String> {
    // Same content already there: leave the file alone so repeated installs never touch it.
    if std::fs::read_to_string(&path).is_ok_and(|current| current == script) {
        return Ok(());
    }
    // A link (a dotfiles repo is the usual reason) is written through, not replaced by a
    // regular file that would leave the repo's copy stale.
    let path = std::fs::canonicalize(&path).unwrap_or(path);
    let dir = path
        .parent()
        .ok_or_else(|| format!("{label} path has no parent"))?;
    std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let tmp = path.with_extension(tmp_ext);
    std::fs::write(&tmp, script).map_err(|e| format!("write {label} tmp: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })
}

fn agent_file_matches(path: std::path::PathBuf, script: &str) -> bool {
    std::fs::read_to_string(path).is_ok_and(|content| content == script)
}

fn agent_file_has_version(path: std::path::PathBuf, version: &str) -> bool {
    std::fs::read_to_string(path).is_ok_and(|content| content.contains(version))
}

fn opencode_plugin_path() -> Result<std::path::PathBuf, String> {
    let root = match std::env::var("OPENCODE_CONFIG_DIR") {
        Ok(v) if !v.is_empty() => std::path::PathBuf::from(v),
        _ => dirs::home_dir()
            .ok_or_else(|| "could not resolve home dir".to_string())?
            .join(".config")
            .join("opencode"),
    };
    Ok(root.join("plugins").join("opencode-session.js"))
}

fn omp_extension_path() -> Result<std::path::PathBuf, String> {
    pi_omp_extension_path(".omp")
}

fn pi_extension_path() -> Result<std::path::PathBuf, String> {
    pi_omp_extension_path(".pi")
}

fn pi_omp_extension_path(dot_dir: &str) -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|home| {
            home.join(dot_dir)
                .join("agent")
                .join("extensions")
                .join("kex-agent-status.ts")
        })
        .ok_or_else(|| "could not resolve home dir".to_string())
}

/// What Kex writes for one integration and how to recognise a file of its own.
struct IntegrationTarget {
    path: std::path::PathBuf,
    script: String,
    label: &'static str,
    tmp_ext: &'static str,
    owned_marker: &'static str,
}

/// The only names the frontend may ask for: anything else is rejected at the boundary.
fn integration_target(agent: &str) -> Result<IntegrationTarget, String> {
    match agent {
        "opencode" => Ok(IntegrationTarget {
            path: opencode_plugin_path()?,
            script: OPENCODE_PLUGIN_SCRIPT.to_string(),
            label: "opencode plugin",
            tmp_ext: "js.kex-tmp",
            owned_marker: "// kex-opencode-v",
        }),
        "omp" => Ok(IntegrationTarget {
            path: omp_extension_path()?,
            script: agent_extension_script("omp"),
            label: "omp extension",
            tmp_ext: "ts.kex-tmp",
            owned_marker: "// kex-agent-status-v",
        }),
        "pi" => Ok(IntegrationTarget {
            path: pi_extension_path()?,
            script: agent_extension_script("pi"),
            label: "pi extension",
            tmp_ext: "ts.kex-tmp",
            owned_marker: "// kex-agent-status-v",
        }),
        other => Err(format!("unknown integration: {other}")),
    }
}

fn is_kex_owned(content: &str, marker: &str) -> bool {
    content.trim_start_matches('\u{feff}').starts_with(marker)
}

/// The number at the end of the first line (`// kex-agent-status-v2` is 2).
fn marker_version(content: &str) -> Option<u32> {
    let first = content.trim_start_matches('\u{feff}').lines().next()?;
    let digits: String = first
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    digits.parse().ok()
}

#[derive(Debug, PartialEq)]
enum SyncOutcome {
    Updated,
    /// The file is not there: nothing is recreated and the agent stays tracked.
    Gone,
    /// A file with the same name that Kex did not write: left untouched.
    Foreign,
}

fn sync_integration(target: &IntegrationTarget) -> Result<SyncOutcome, String> {
    let current = match std::fs::read_to_string(&target.path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(SyncOutcome::Gone),
        Err(e) => return Err(format!("read {}: {e}", target.path.display())),
    };
    if !is_kex_owned(&current, target.owned_marker) {
        return Ok(SyncOutcome::Foreign);
    }
    // An older build starting after a newer one must not turn the file back.
    if let (Some(on_disk), Some(shipped)) =
        (marker_version(&current), marker_version(&target.script))
    {
        if on_disk > shipped {
            return Ok(SyncOutcome::Updated);
        }
    }
    write_agent_file(
        target.path.clone(),
        &target.script,
        target.label,
        target.tmp_ext,
    )?;
    Ok(SyncOutcome::Updated)
}

/// Brings the integrations the user installed up to the version this build ships, so an app
/// update reaches the agent without pressing Reinstall. It only rewrites files that still
/// exist and are Kex's own, and returns the agents whose file is not Kex's any more, which
/// the caller stops tracking. A missing file is not reported: a dotfiles link or a synced
/// folder can be absent for a moment, and the sync never creates a file anyway.
#[tauri::command]
pub fn agent_sync_integrations(agents: Vec<String>) -> Vec<String> {
    let mut dropped = Vec::new();
    for agent in agents {
        match integration_target(&agent).and_then(|t| sync_integration(&t)) {
            Ok(SyncOutcome::Updated | SyncOutcome::Gone) => {}
            Ok(SyncOutcome::Foreign) => dropped.push(agent),
            Err(e) => log::warn!("[agent] sync {agent} failed: {e}"),
        }
    }
    dropped
}

/// Deletes the integration file, but only when it is Kex's own: a same-named file the user
/// wrote by hand is left alone.
#[tauri::command]
pub fn agent_remove_integration(agent: String) -> Result<(), String> {
    remove_integration(&integration_target(&agent)?)
}

fn remove_integration(target: &IntegrationTarget) -> Result<(), String> {
    let content = match std::fs::read_to_string(&target.path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("read {}: {e}", target.path.display())),
    };
    if !is_kex_owned(&content, target.owned_marker) {
        return Err(format!(
            "{} is not a Kex file, leaving it alone",
            target.path.display()
        ));
    }
    std::fs::remove_file(&target.path).map_err(|e| format!("remove {}: {e}", target.path.display()))
}

#[tauri::command]
pub fn agent_setup_opencode() -> Result<(), String> {
    write_agent_file(
        opencode_plugin_path()?,
        OPENCODE_PLUGIN_SCRIPT,
        "opencode plugin",
        "js.kex-tmp",
    )
}

#[tauri::command]
pub fn agent_opencode_plugin_status() -> bool {
    opencode_plugin_path()
        .ok()
        .is_some_and(|p| agent_file_has_version(p, OPENCODE_PLUGIN_VERSION))
}

#[tauri::command]
pub fn agent_setup_omp() -> Result<(), String> {
    write_agent_file(
        omp_extension_path()?,
        &agent_extension_script("omp"),
        "omp extension",
        "ts.kex-tmp",
    )
}

#[tauri::command]
pub fn agent_omp_extension_status() -> bool {
    omp_extension_path()
        .ok()
        .is_some_and(|p| agent_file_matches(p, &agent_extension_script("omp")))
}

#[tauri::command]
pub fn agent_setup_pi() -> Result<(), String> {
    write_agent_file(
        pi_extension_path()?,
        &agent_extension_script("pi"),
        "pi extension",
        "ts.kex-tmp",
    )
}

#[tauri::command]
pub fn agent_pi_extension_status() -> bool {
    pi_extension_path()
        .ok()
        .is_some_and(|p| agent_file_matches(p, &agent_extension_script("pi")))
}

#[tauri::command]
pub async fn agent_session_set_snapshot(
    tab_id: String,
    session_id: String,
    title: String,
    notification: String,
) -> bool {
    session_store::set_snapshot(&tab_id, &session_id, &title, &notification)
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
    // Every subscribed event must have the session hook.
    let all_hooks_present = SESSION_HOOK_EVENTS.iter().all(|event| {
        root["hooks"][event]
            .as_array()
            .is_some_and(|arr| arr.iter().any(is_session_hook))
    });
    if !all_hooks_present {
        return false;
    }
    // Check that the session hook script is up-to-date.
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
    let raw = serde_json::to_string_pretty(value).map_err(|e| format!("serialize: {e}"))?;
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
        // Every subscribed event must have the session hook.
        for event in SESSION_HOOK_EVENTS {
            let arr = out["hooks"][event].as_array().unwrap();
            assert!(!arr.is_empty(), "{event} missing");
            let cmd = arr[0]["hooks"][0]["command"].as_str().unwrap();
            assert!(
                cmd.contains(SESSION_HOOK_MARKER),
                "{event} cmd missing marker"
            );
            assert!(
                cmd.contains("trigger-event.sh"),
                "{event} cmd missing trigger-event.sh"
            );
            let timeout = arr[0]["hooks"][0]["timeout"].as_u64().unwrap();
            assert_eq!(timeout, 10, "{event} timeout should be 10");
        }
    }

    #[test]
    fn subscribes_to_subagent_events() {
        assert!(SESSION_HOOK_EVENTS.contains(&"SubagentStart"));
        assert!(SESSION_HOOK_EVENTS.contains(&"SubagentStop"));
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
        assert_eq!(
            out["hooks"]["SessionStart"][0]["hooks"][0]["command"]
                .as_str()
                .unwrap(),
            "echo hello"
        );
        assert_eq!(
            out["hooks"]["UserPromptSubmit"].as_array().unwrap().len(),
            2
        );
        assert_eq!(
            out["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
                .as_str()
                .unwrap(),
            "echo world"
        );
        assert_eq!(out["hooks"]["Notification"].as_array().unwrap().len(), 2);
        assert_eq!(
            out["hooks"]["Notification"][0]["hooks"][0]["command"]
                .as_str()
                .unwrap(),
            "echo notify"
        );
        assert_eq!(out["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert_eq!(
            out["hooks"]["Stop"][0]["hooks"][0]["command"]
                .as_str()
                .unwrap(),
            "echo stop"
        );
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
            assert_eq!(
                arr.len(),
                1,
                "{event}: expected only session hook after replace"
            );
            let cmd = arr[0]["hooks"][0]["command"].as_str().unwrap();
            assert!(
                cmd.contains(SESSION_HOOK_MARKER),
                "{event}: missing session hook marker"
            );
        }
    }

    #[test]
    fn the_extension_script_is_stamped_with_each_runtime_name() {
        let omp = agent_extension_script("omp");
        let pi = agent_extension_script("pi");
        assert!(omp.contains("const agent = \"omp\";"));
        assert!(pi.contains("const agent = \"pi\";"));
        assert!(!omp.contains("__KEX_AGENT__") && !pi.contains("__KEX_AGENT__"));
        assert!(omp.starts_with("// kex-agent-status-v"));
        assert!(pi.starts_with("// kex-agent-status-v"));
    }

    #[test]
    fn only_known_integrations_resolve_to_a_target() {
        assert!(integration_target("omp").is_ok());
        assert!(integration_target("pi").is_ok());
        assert!(integration_target("opencode").is_ok());
        assert!(integration_target("../../etc/passwd").is_err());
        assert!(integration_target("").is_err());
        assert!(integration_target("claude").is_err());
    }

    #[test]
    fn the_omp_and_pi_targets_point_at_different_folders_with_their_own_stamp() {
        let omp = integration_target("omp").unwrap();
        let pi = integration_target("pi").unwrap();
        assert_ne!(omp.path, pi.path);
        assert!(omp.path.to_string_lossy().contains(".omp"));
        assert!(pi.path.to_string_lossy().contains(".pi"));
        assert!(omp.script.contains("const agent = \"omp\";"));
        assert!(pi.script.contains("const agent = \"pi\";"));
    }

    #[test]
    fn a_file_is_kex_owned_only_when_it_starts_with_the_marker() {
        assert!(is_kex_owned(
            "// kex-agent-status-v2\nrest",
            "// kex-agent-status-v"
        ));
        assert!(is_kex_owned(
            "// kex-agent-status-v1\nrest",
            "// kex-agent-status-v"
        ));
        assert!(!is_kex_owned(
            "export default function () {}",
            "// kex-agent-status-v"
        ));
        assert!(!is_kex_owned(
            "// my own notes\n// kex-agent-status-v1",
            "// kex-agent-status-v"
        ));
        assert!(is_kex_owned(OPENCODE_PLUGIN_SCRIPT, "// kex-opencode-v"));
        assert!(is_kex_owned(
            &agent_extension_script("omp"),
            "// kex-agent-status-v"
        ));
    }

    fn target_in(dir: &std::path::Path, script: &str) -> IntegrationTarget {
        IntegrationTarget {
            path: dir.join("kex-agent-status.ts"),
            script: script.to_string(),
            label: "test extension",
            tmp_ext: "ts.kex-tmp",
            owned_marker: "// kex-agent-status-v",
        }
    }

    #[test]
    fn sync_updates_an_outdated_kex_file() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nnew");
        std::fs::write(&target.path, "// kex-agent-status-v1\nold").unwrap();
        assert_eq!(sync_integration(&target).unwrap(), SyncOutcome::Updated);
        assert_eq!(
            std::fs::read_to_string(&target.path).unwrap(),
            "// kex-agent-status-v2\nnew"
        );
    }

    #[test]
    fn sync_never_recreates_a_file_the_user_removed() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nnew");
        assert_eq!(sync_integration(&target).unwrap(), SyncOutcome::Gone);
        assert!(!target.path.exists());
    }

    #[test]
    fn sync_leaves_a_file_kex_did_not_write_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nnew");
        std::fs::write(&target.path, "export default () => {}").unwrap();
        assert_eq!(sync_integration(&target).unwrap(), SyncOutcome::Foreign);
        assert_eq!(
            std::fs::read_to_string(&target.path).unwrap(),
            "export default () => {}"
        );
    }

    #[test]
    fn sync_never_turns_a_newer_file_back_to_an_older_version() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nbuild");
        std::fs::write(&target.path, "// kex-agent-status-v3\nfrom a newer Kex").unwrap();
        assert_eq!(sync_integration(&target).unwrap(), SyncOutcome::Updated);
        assert_eq!(
            std::fs::read_to_string(&target.path).unwrap(),
            "// kex-agent-status-v3\nfrom a newer Kex"
        );
    }

    #[test]
    fn remove_deletes_a_kex_file_and_refuses_a_foreign_one() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nnew");
        std::fs::write(&target.path, "// kex-agent-status-v2\nnew").unwrap();
        remove_integration(&target).unwrap();
        assert!(!target.path.exists());

        std::fs::write(&target.path, "export default () => {}").unwrap();
        assert!(remove_integration(&target).is_err());
        assert!(target.path.exists());
    }

    #[test]
    fn remove_of_a_missing_file_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nnew");
        assert!(remove_integration(&target).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_synced_symlink_is_written_through_and_stays_a_link() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("dotfiles").join("ext.ts");
        std::fs::create_dir_all(real.parent().unwrap()).unwrap();
        std::fs::write(&real, "// kex-agent-status-v1\nold").unwrap();
        let link_dir = dir.path().join("agent");
        std::fs::create_dir_all(&link_dir).unwrap();
        let link = link_dir.join("kex-agent-status.ts");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let target = IntegrationTarget {
            path: link.clone(),
            script: "// kex-agent-status-v2\nnew".to_string(),
            label: "test",
            tmp_ext: "ts.kex-tmp",
            owned_marker: "// kex-agent-status-v",
        };
        assert_eq!(sync_integration(&target).unwrap(), SyncOutcome::Updated);
        assert!(std::fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            std::fs::read_to_string(&real).unwrap(),
            "// kex-agent-status-v2\nnew"
        );
    }

    #[test]
    fn a_marker_with_a_byte_order_mark_still_counts_as_kex() {
        assert!(is_kex_owned(
            "\u{feff}// kex-agent-status-v2\nx",
            "// kex-agent-status-v"
        ));
        assert_eq!(marker_version("// kex-agent-status-v12\nx"), Some(12));
        assert_eq!(marker_version("no marker"), None);
    }

    #[test]
    fn a_synced_file_is_rewritten_to_the_current_script() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("ext").join("kex-agent-status.ts");
        let script = agent_extension_script("pi");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "// kex-agent-status-v1\nold").unwrap();
        write_agent_file(file.clone(), &script, "pi extension", "ts.kex-tmp").unwrap();
        assert!(agent_file_matches(file.clone(), &script));
        let before = std::fs::metadata(&file).unwrap().modified().unwrap();
        write_agent_file(file.clone(), &script, "pi extension", "ts.kex-tmp").unwrap();
        assert_eq!(
            std::fs::metadata(&file).unwrap().modified().unwrap(),
            before
        );
    }

    #[test]
    fn an_extension_stamped_for_another_runtime_is_not_current() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("kex-agent-status.ts");
        std::fs::write(&file, agent_extension_script("omp")).unwrap();
        assert!(agent_file_matches(
            file.clone(),
            &agent_extension_script("omp")
        ));
        assert!(!agent_file_matches(file, &agent_extension_script("pi")));
    }
}
