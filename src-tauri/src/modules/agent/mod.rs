pub mod claude_version;
pub mod codex_hooks;
pub mod codex_integration;
pub mod codex_trust;
pub mod json_patch;
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
// v8: the script tags its frames with its first argument, defaulting to "claude" (see trigger-event.sh).
// v10: the script prints `{}` on stdout before anything else.
// v11: the script forwards PostCompact.
// v12: undelivered events are spooled as one file per event instead of a rotated .jsonl.
// v13: every frame carries `tab_id` and `pty_id`, since one socket serves every tab.
const SESSION_HOOK_SCRIPT_VERSION: &str = "kex-session-v13";

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
//   PostCompact:        trigger (manual|auto)
const SESSION_HOOK_SCRIPT: &str = include_str!("hooks/trigger-event.sh");

// OpenCode loads every file in ~/.config/opencode/plugins/ into its own process, and OMP/Pi
// every one in ~/.omp/agent/extensions/ and ~/.pi/agent/extensions/, so the analogue
// integrations ship as static scripts instead of merged settings. The OpenCode status greps
// the installed file for a version marker; the OMP and Pi statuses compare the whole file with
// the script stamped for that runtime, so an outdated or wrongly stamped copy counts as not installed.
const OPENCODE_PLUGIN_VERSION: &str = "kex-opencode-v4";
const OPENCODE_PLUGIN_SCRIPT: &str = include_str!("plugins/opencode-session.js");
const AGENT_EXTENSION_TEMPLATE: &str = include_str!("plugins/kex-agent-status.ts");

fn agent_extension_script(agent: &str) -> String {
    AGENT_EXTENSION_TEMPLATE.replace("__KEX_AGENT__", agent)
}

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
    // Every event Kex knows, not only those the installed Claude would get today.
    for event in claude_version::known_events() {
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

/// Writes Kex's hook for each event in `events`. With `prune`, an event Kex knows but the
/// installed Claude does not (after a downgrade) loses Kex's hook, and its key goes when nothing
/// else is left in it, because an unknown key makes old releases discard the whole file. Without
/// it (the version could not be read) the hooks Kex wrote in other events stay as they are.
fn merge_hooks(mut root: Value, events: &[&str], prune: bool) -> Value {
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().unwrap();

    for event in claude_version::known_events().filter(|e| prune && !events.contains(e)) {
        let Some(arr) = hooks.get_mut(event).and_then(Value::as_array_mut) else {
            continue;
        };
        arr.retain(|g| !is_session_hook(g) && !is_empty_group(g));
        if arr.is_empty() {
            hooks.remove(event);
        }
    }

    for &event in events {
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

/// Writes trigger-event.sh, shared by the Claude Code and Codex hooks, only when it differs.
fn install_session_hook_script(script_path: &std::path::Path) -> Result<(), String> {
    let current = std::fs::read_to_string(script_path).unwrap_or_default();
    if current == SESSION_HOOK_SCRIPT {
        return Ok(());
    }
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
    std::fs::rename(&script_tmp, script_path).map_err(|e| {
        let _ = std::fs::remove_file(&script_tmp);
        format!("rename session hook: {e}")
    })
}

/// `claude --version` runs on the blocking pool so the UI thread and the async runtime stay free.
async fn detect_version(refresh: bool) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        claude_version::detect_claude_version_cached(refresh)
    })
    .await
    .ok()
    .flatten()
}

/// `refresh` is for the user's own install: it runs `claude --version` again. The startup sync of
/// every window passes false and reuses the answer of the last minute; a new Kex process starts
/// with no answer, so a Claude update is still seen on the next start.
#[tauri::command]
pub async fn agent_enable_claude_hooks(refresh: bool) -> Result<(), String> {
    let version = detect_version(refresh).await;
    install_session_hook_script(&session_hook_script_path()?)?;

    let path = settings_path()?;
    let dir = path.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    apply_settings(&path, true, version.as_deref())
}

/// Reads the settings file, and when the hooks need to change writes the new text atomically.
/// Writing nothing when nothing changes avoids reformatting the user's file on repeated runs
/// (the startup reinstall path).
fn apply_settings(
    path: &std::path::Path,
    install: bool,
    version: Option<&str>,
) -> Result<(), String> {
    let existing_str = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !install => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    let Some(out) = plan_settings(&existing_str, path, install, version)? else {
        return Ok(());
    };
    // Atomic write via temp file so a crash mid-write never truncates the file.
    let tmp = path.with_extension("json.kex-tmp");
    std::fs::write(&tmp, out).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })
}

/// The text the settings file would hold after installing or removing the hooks, or `None`
/// when it already is as it should be. The real write and the preview both come from here, so
/// what the user reviews is what lands on disk.
fn plan_settings(
    existing_str: &str,
    path: &std::path::Path,
    install: bool,
    version: Option<&str>,
) -> Result<Option<String>, String> {
    let existing = existing_config(
        if existing_str.is_empty() {
            None
        } else {
            Some(existing_str)
        },
        path,
    )?;
    let next = if install {
        merge_hooks(
            existing.clone(),
            &claude_version::hook_events_for(version),
            claude_version::is_known(version),
        )
    } else {
        remove_hooks(existing.clone())
    };
    if next == existing {
        return Ok(None);
    }
    // Patched by text so the diff only shows the hooks.
    Ok(Some(json_patch::patch(existing_str, &next)))
}

#[tauri::command]
pub fn agent_disable_claude_hooks() -> Result<(), String> {
    apply_settings(&settings_path()?, false, None)
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

/// What one integration needs from the startup sync. Codex has two files of its own, so it is
/// handled by `codex_integration` instead of a single `IntegrationTarget`.
enum Integration {
    File(IntegrationTarget),
    Codex(codex_integration::CodexPaths),
}

fn resolve_integration(agent: &str) -> Result<Integration, String> {
    if agent == "codex" {
        return codex_integration::CodexPaths::from_env().map(Integration::Codex);
    }
    integration_target(agent).map(Integration::File)
}

#[derive(Debug, PartialEq)]
pub enum SyncOutcome {
    Updated,
    /// The file is not there: nothing is recreated and the agent stays tracked.
    Gone,
    /// A file with the same name that Kex did not write: left untouched.
    Foreign,
    /// A shared file Kex cannot parse: left untouched and skipped, but still tracked.
    Malformed,
    /// A shared file that parses but that Kex cannot edit safely: left untouched, still tracked.
    UnsafeToEdit,
    /// The integration does not run on this platform: skipped, still tracked.
    Unsupported,
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
/// folder can be absent for a moment, and the sync never creates a file anyway. Nor is a
/// shared file that does not parse right now: it is skipped and left as it is.
#[tauri::command]
pub fn agent_sync_integrations(agents: Vec<String>) -> Vec<String> {
    let mut dropped = Vec::new();
    for agent in agents {
        let outcome = resolve_integration(&agent).and_then(|i| match i {
            Integration::File(t) => sync_integration(&t),
            Integration::Codex(p) => codex_integration::sync(&p),
        });
        match outcome {
            Ok(SyncOutcome::Updated | SyncOutcome::Gone | SyncOutcome::Unsupported) => {}
            // Another tool may be halfway through writing the shared file: dropping the agent
            // here would stop refreshing an install that is still there once it settles.
            Ok(SyncOutcome::Malformed) => {
                log::warn!("[agent] sync {agent}: a config file does not parse, skipped");
            }
            Ok(SyncOutcome::UnsafeToEdit) => {
                log::warn!(
                    "[agent] sync {agent}: a config file holds Kex's trust in a form Kex cannot edit safely, skipped"
                );
            }
            Ok(SyncOutcome::Foreign) => dropped.push(agent),
            Err(e) => log::warn!("[agent] sync {agent} failed: {e}"),
        }
    }
    dropped
}

/// Deletes the integration file, but only when it is Kex's own: a same-named file the user
/// wrote by hand is left alone. For Codex, removes Kex's handlers and trust tables only.
#[tauri::command]
pub fn agent_remove_integration(agent: String) -> Result<(), String> {
    match resolve_integration(&agent)? {
        Integration::File(t) => remove_integration(&t),
        Integration::Codex(p) => codex_integration::remove(&p),
    }
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
pub fn agent_setup_codex() -> Result<(), String> {
    codex_integration::setup(&codex_integration::CodexPaths::from_env()?)
}

#[tauri::command]
pub fn agent_codex_status() -> codex_integration::CodexStatus {
    codex_integration::CodexPaths::from_env()
        .map_or(codex_integration::CodexStatus::Unavailable, |p| {
            codex_integration::status(&p)
        })
}

/// What one file would hold after an install or an uninstall. `None` in `before` means the
/// file is not there; `None` in `after` means it would be deleted. `note` explains a change
/// the diff alone would not, such as a shared file being reformatted.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    path: String,
    before: Option<String>,
    after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

fn tilde(path: &std::path::Path) -> String {
    dirs::home_dir()
        .and_then(|home| {
            path.strip_prefix(home)
                .ok()
                .map(|rest| format!("~/{}", rest.display()))
        })
        .unwrap_or_else(|| path.display().to_string())
}

fn changed(
    path: &std::path::Path,
    before: Option<&str>,
    after: Option<String>,
) -> Vec<FilePreview> {
    if before == after.as_deref() {
        return Vec::new();
    }
    vec![FilePreview {
        path: tilde(path),
        before: before.map(str::to_string),
        after,
        note: None,
    }]
}

fn claude_preview(
    settings_path: &std::path::Path,
    script_path: &std::path::Path,
    settings: Option<&str>,
    script: Option<&str>,
    install: bool,
    version: Option<&str>,
) -> Result<Vec<FilePreview>, String> {
    let after = plan_settings(settings.unwrap_or(""), settings_path, install, version)?
        .or_else(|| settings.map(str::to_string));
    let mut files = changed(settings_path, settings, after);
    if install {
        files.extend(changed(
            script_path,
            script,
            Some(SESSION_HOOK_SCRIPT.to_string()),
        ));
    }
    Ok(files)
}

fn integration_preview(
    target: &IntegrationTarget,
    current: Option<&str>,
    install: bool,
) -> Result<Vec<FilePreview>, String> {
    if install {
        return Ok(changed(&target.path, current, Some(target.script.clone())));
    }
    match current {
        None => Ok(Vec::new()),
        Some(c) if is_kex_owned(c, target.owned_marker) => Ok(changed(&target.path, current, None)),
        Some(_) => Err(format!(
            "{} is not a Kex file, leaving it alone",
            target.path.display()
        )),
    }
}

fn read_optional(path: &std::path::Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

/// Dry run of an install or an uninstall: the files that would change with their text before
/// and after. Writes nothing.
#[tauri::command]
pub async fn agent_integration_preview(
    agent: String,
    install: bool,
) -> Result<Vec<FilePreview>, String> {
    if agent == "claude" {
        let version = if install {
            detect_version(false).await
        } else {
            None
        };
        let settings_path = settings_path()?;
        let script_path = session_hook_script_path()?;
        let settings = read_optional(&settings_path)?;
        let script = read_optional(&script_path)?;
        return claude_preview(
            &settings_path,
            &script_path,
            settings.as_deref(),
            script.as_deref(),
            install,
            version.as_deref(),
        );
    }
    match resolve_integration(&agent)? {
        Integration::File(target) => {
            let current = read_optional(&target.path)?;
            integration_preview(&target, current.as_deref(), install)
        }
        Integration::Codex(paths) => codex_integration::preview(&paths, install),
    }
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
pub async fn agent_claude_hooks_status() -> bool {
    let version = detect_version(false).await;
    let Some(content) = settings_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
    else {
        return false;
    };
    let Ok(root) = serde_json::from_str::<Value>(&content) else {
        return false;
    };
    // Every event this Claude version knows must have the session hook.
    let all_hooks_present = claude_version::hook_events_for(version.as_deref())
        .iter()
        .all(|event| {
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

#[cfg(test)]
mod tests {
    use super::*;

    const LATEST: Option<&str> = Some("2.1.310");

    fn all() -> Vec<&'static str> {
        claude_version::known_events().collect()
    }

    fn hooked(root: &Value, event: &str) -> bool {
        root["hooks"][event]
            .as_array()
            .is_some_and(|a| a.iter().any(is_session_hook))
    }

    #[cfg(unix)]
    const STOP_FRAME: &str = r#"{"hook_event_name":"Stop","session_id":"s1"}"#;

    #[cfg(unix)]
    fn run_trigger_script(arg: Option<&str>, tab_id: Option<&str>) -> Option<String> {
        run_trigger_script_with(arg, tab_id, STOP_FRAME)
    }

    #[cfg(unix)]
    fn run_trigger_script_with(
        arg: Option<&str>,
        tab_id: Option<&str>,
        payload: &str,
    ) -> Option<String> {
        run_trigger_script_env(arg, tab_id, payload, &[])
    }

    #[cfg(unix)]
    fn run_trigger_script_env(
        arg: Option<&str>,
        tab_id: Option<&str>,
        payload: &str,
        env: &[(&str, &str)],
    ) -> Option<String> {
        use std::io::{BufRead, BufReader, Write};
        use std::os::unix::net::UnixListener;
        use std::process::{Command, Stdio};

        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("trigger-event.sh");
        std::fs::write(&script, SESSION_HOOK_SCRIPT).unwrap();
        let sock = dir.path().join("s.sock");
        let listener = UnixListener::bind(&sock).unwrap();
        listener.set_nonblocking(true).unwrap();

        let mut cmd = Command::new("bash");
        cmd.arg(&script)
            .args(arg)
            .env("HOME", dir.path())
            .env("KEX_TERMINAL", "1")
            .env("KEX_IPC", &sock)
            .env_remove("KEX_TAB_ID")
            .env_remove("KEX_PTY_ID")
            .stdin(Stdio::piped());
        if let Some(t) = tab_id {
            cmd.env("KEX_TAB_ID", t);
        }
        cmd.envs(env.iter().copied());
        let mut child = cmd.spawn().unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(payload.as_bytes())
            .unwrap();
        child.wait().unwrap();

        let (stream, _) = listener.accept().ok()?;
        stream.set_nonblocking(false).unwrap();
        let mut line = String::new();
        BufReader::new(stream).read_line(&mut line).unwrap();
        Some(line)
    }

    #[cfg(unix)]
    fn trigger_script_stdout(env: &[(&str, &str)], remove: &[&str]) -> String {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("trigger-event.sh");
        std::fs::write(&script, SESSION_HOOK_SCRIPT).unwrap();
        let mut cmd = Command::new("bash");
        cmd.arg(&script)
            .env("HOME", dir.path())
            .env_remove("KEX_TERMINAL")
            .env_remove("KEX_TAB_ID")
            .env_remove("KEX_IPC")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped());
        for (k, v) in env {
            cmd.env(k, v);
        }
        for k in remove {
            cmd.env_remove(k);
        }
        let mut child = cmd.spawn().unwrap();
        let mut stdin = child.stdin.take().unwrap();
        let _ = stdin.write_all(STOP_FRAME.as_bytes());
        drop(stdin);
        let out = child.wait_with_output().unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_prints_an_empty_object_even_when_the_socket_is_unreachable() {
        let out = trigger_script_stdout(
            &[
                ("KEX_TERMINAL", "1"),
                ("KEX_TAB_ID", "tab-1"),
                ("KEX_IPC", "/nonexistent/kex.sock"),
            ],
            &[],
        );
        assert_eq!(out, "{}\n");
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_prints_an_empty_object_on_the_early_exits() {
        assert_eq!(trigger_script_stdout(&[], &[]), "{}\n");
        assert_eq!(trigger_script_stdout(&[("KEX_TERMINAL", "1")], &[]), "{}\n");
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_tags_codex_when_given_the_codex_argument() {
        let frame = run_trigger_script(Some("codex"), Some("tab-1")).unwrap();
        let v: Value = serde_json::from_str(&frame).unwrap();
        assert_eq!(v["agent"], "codex");
        assert_eq!(v["session_id"], "s1");
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_forwards_post_compact() {
        let payload = r#"{"hook_event_name":"PostCompact","session_id":"s1","trigger":"manual"}"#;
        let frame = run_trigger_script_with(None, Some("tab-1"), payload).expect("not sent");
        let v: Value = serde_json::from_str(&frame).unwrap();
        assert_eq!(v["hook_event_name"], "PostCompact");
        assert_eq!(v["trigger"], "manual");
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_accepts_snake_case_codex_events_as_their_canonical_names() {
        for (snake, canonical) in [
            ("session_start", "SessionStart"),
            ("user_prompt_submit", "UserPromptSubmit"),
            ("stop", "Stop"),
            ("permission_request", "PermissionRequest"),
            ("subagent_start", "SubagentStart"),
            ("subagent_stop", "SubagentStop"),
        ] {
            let payload = format!(r#"{{"hook_event_name":"{snake}","session_id":"s1"}}"#);
            let frame = run_trigger_script_with(Some("codex"), Some("tab-1"), &payload)
                .unwrap_or_else(|| panic!("{snake} was not sent"));
            let v: Value = serde_json::from_str(&frame).unwrap();
            assert_eq!(v["hook_event_name"], canonical, "{snake}");
            assert_eq!(v["agent"], "codex");
        }
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_keeps_claude_event_names_exact() {
        let payload = r#"{"hook_event_name":"stop","session_id":"s1"}"#;
        assert!(run_trigger_script_with(None, Some("tab-1"), payload).is_none());
        let frame = run_trigger_script(None, Some("tab-1")).unwrap();
        let v: Value = serde_json::from_str(&frame).unwrap();
        assert_eq!(v["hook_event_name"], "Stop");
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_names_the_tab_and_pty_from_the_environment_only() {
        let payload =
            r#"{"hook_event_name":"Stop","session_id":"s1","tab_id":"tab-other","pty_id":"99"}"#;
        let frame = run_trigger_script_with(None, Some("tab-1"), payload).unwrap();
        let v: Value = serde_json::from_str(&frame).unwrap();
        assert_eq!(v["tab_id"], "tab-1");
        assert_eq!(v["pty_id"], "", "KEX_PTY_ID is unset in this run");
        let frame =
            run_trigger_script_env(None, Some("tab-1"), payload, &[("KEX_PTY_ID", "7")]).unwrap();
        let v: Value = serde_json::from_str(&frame).unwrap();
        assert_eq!(
            (v["tab_id"].as_str(), v["pty_id"].as_str()),
            (Some("tab-1"), Some("7"))
        );
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_defaults_to_claude_without_an_argument() {
        let frame = run_trigger_script(None, Some("tab-1")).unwrap();
        let v: Value = serde_json::from_str(&frame).unwrap();
        assert_eq!(v["agent"], "claude");
    }

    #[cfg(unix)]
    fn spool_script(home: &std::path::Path) -> std::path::PathBuf {
        let script = home.join("trigger-event.sh");
        std::fs::write(&script, SESSION_HOOK_SCRIPT).unwrap();
        script
    }

    #[cfg(unix)]
    fn spawn_spooling_script(
        script: &std::path::Path,
        home: &std::path::Path,
        payload: &str,
    ) -> std::process::Child {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let mut child = Command::new("bash")
            .arg(script)
            .env("HOME", home)
            .env("KEX_TERMINAL", "1")
            .env("KEX_TAB_ID", "tab-spool")
            .env("KEX_IPC", home.join("missing.sock"))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        // The script may exit before reading when nothing needs the payload.
        let _ = child.stdin.take().unwrap().write_all(payload.as_bytes());
        child
    }

    #[cfg(unix)]
    fn spooled_files(home: &std::path::Path) -> Vec<std::path::PathBuf> {
        let dir = home.join(".config/kex/spool/tab-spool");
        let mut files: Vec<_> = std::fs::read_dir(dir)
            .map(|rd| rd.filter_map(Result::ok).map(|e| e.path()).collect())
            .unwrap_or_default();
        files.sort();
        files
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_spools_30_concurrent_events_without_losing_any() {
        let dir = tempfile::tempdir().unwrap();
        let script = spool_script(dir.path());
        let children: Vec<_> = (0..30)
            .map(|i| {
                let payload =
                    format!(r#"{{"hook_event_name":"Notification","session_id":"s{i}"}}"#);
                spawn_spooling_script(&script, dir.path(), &payload)
            })
            .collect();
        for mut c in children {
            assert!(c.wait().unwrap().success());
        }

        let files = spooled_files(dir.path());
        assert_eq!(files.len(), 30);
        assert!(files
            .iter()
            .all(|f| !f.file_name().unwrap().to_string_lossy().starts_with('.')));
        let mut sessions: Vec<_> = files
            .iter()
            .map(|f| {
                let v: serde_json::Value =
                    serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
                v["session_id"].as_str().unwrap().to_string()
            })
            .collect();
        sessions.sort();
        let mut expected: Vec<_> = (0..30).map(|i| format!("s{i}")).collect();
        expected.sort();
        assert_eq!(sessions, expected);
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_spool_names_sort_in_arrival_order() {
        let dir = tempfile::tempdir().unwrap();
        let script = spool_script(dir.path());
        for i in 0..3 {
            let payload = format!(r#"{{"hook_event_name":"Notification","session_id":"s{i}"}}"#);
            spawn_spooling_script(&script, dir.path(), &payload)
                .wait()
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(1100));
        }
        let order: Vec<_> = spooled_files(dir.path())
            .iter()
            .map(|f| std::fs::read_to_string(f).unwrap())
            .collect();
        for (i, body) in order.iter().enumerate() {
            assert!(body.contains(&format!("\"s{i}\"")), "{order:?}");
        }
        assert_eq!(order.len(), 3);
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_spools_with_owner_only_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let script = spool_script(dir.path());
        let payload = r#"{"hook_event_name":"Notification","session_id":"s"}"#;
        spawn_spooling_script(&script, dir.path(), payload)
            .wait()
            .unwrap();
        let files = spooled_files(dir.path());
        assert_eq!(files.len(), 1);
        let mode = |p: &std::path::Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&files[0]), 0o600);
        assert_eq!(mode(files[0].parent().unwrap()), 0o700);
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_refuses_tab_ids_that_could_escape_the_spool() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let dir = tempfile::tempdir().unwrap();
        let script = spool_script(dir.path());
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let victim = outside.join("victim.json");
        std::fs::write(&victim, "keep").unwrap();
        let abs = outside.to_string_lossy().to_string();
        for tab in ["..", "../outside", abs.as_str(), "a/b", ".", ""] {
            let mut child = Command::new("bash")
                .arg(&script)
                .env("HOME", dir.path())
                .env("KEX_TERMINAL", "1")
                .env("KEX_TAB_ID", tab)
                .env("KEX_IPC", dir.path().join("missing.sock"))
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .spawn()
                .unwrap();
            let _ = child
                .stdin
                .take()
                .unwrap()
                .write_all(br#"{"hook_event_name":"Notification","session_id":"s"}"#);
            assert!(child.wait().unwrap().success());
        }
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "keep");
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 1);
        assert!(!dir.path().join(".config/kex/spool").exists());
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_prunes_the_spool_by_count_and_by_age() {
        let dir = tempfile::tempdir().unwrap();
        let script = spool_script(dir.path());
        let spool = dir.path().join(".config/kex/spool/tab-spool");
        std::fs::create_dir_all(&spool).unwrap();
        for i in 0..205 {
            std::fs::write(spool.join(format!("{i:016}-0000001-00000.json")), "{}\n").unwrap();
        }
        let old = spool.join("0000000000000000-old.json");
        std::fs::write(&old, "{}\n").unwrap();
        let week_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(9 * 86400);
        std::fs::File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_modified(week_ago)
            .unwrap();

        let payload = r#"{"hook_event_name":"Notification","session_id":"new"}"#;
        assert!(spawn_spooling_script(&script, dir.path(), payload)
            .wait()
            .unwrap()
            .success());

        let files = spooled_files(dir.path());
        assert_eq!(files.len(), 200);
        assert!(!old.exists());
        assert!(
            !spool.join(format!("{:016}-0000001-00000.json", 0)).exists(),
            "the oldest by name goes first"
        );
        let newest = files.last().unwrap();
        assert!(std::fs::read_to_string(newest).unwrap().contains("\"new\""));
    }

    #[cfg(unix)]
    #[test]
    fn trigger_script_without_a_tab_id_sends_nothing() {
        assert!(run_trigger_script(Some("codex"), None).is_none());
    }

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
        let out = merge_hooks(input.clone(), &all(), true);
        assert_eq!(out["permissions"], input["permissions"]);
        let arr = out["hooks"]["UserPromptSubmit"].as_array().unwrap();
        assert!(arr.len() >= 2);
        assert_eq!(arr[0]["hooks"][0]["command"].as_str().unwrap(), "echo hi");
    }

    #[test]
    fn installing_into_a_foreign_style_settings_file_only_adds_lines() {
        let path = std::path::Path::new("/x/settings.json");
        let src = "{\n\t\"model\" : \"a\\/b\",\n\t\"permissions\":{\"allow\":[ \"x\" ]}\n}\n";
        let out = plan_settings(src, path, true, LATEST).unwrap().unwrap();
        let kept: Vec<&str> = src
            .lines()
            .filter(|l| l.contains("model") || l.contains("permissions"))
            .collect();
        assert!(kept.iter().all(|l| out.contains(l)));
        assert!(out.contains("\"SessionStart\"") || out.contains("\"Stop\""));
        let removed = plan_settings(&out, path, false, None).unwrap().unwrap();
        assert!(removed.contains("\"permissions\":{\"allow\":[ \"x\" ]}"));
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
        let out = merge_hooks(json!({}), &all(), true);
        // Every subscribed event must have the session hook.
        for event in all() {
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
        assert!(all().contains(&"SubagentStart"));
        assert!(all().contains(&"SubagentStop"));
    }

    #[test]
    fn session_hooks_are_idempotent() {
        let once = merge_hooks(json!({}), &all(), true);
        let twice = merge_hooks(once.clone(), &all(), true);
        for event in all() {
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
        let out = merge_hooks(input, &all(), true);
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
        let out = merge_hooks(input, &all(), true);
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
    fn integration_preview_matches_what_install_and_remove_do() {
        let dir = tempfile::tempdir().unwrap();
        let target = target_in(dir.path(), "// kex-agent-status-v2\nnew");

        let files = integration_preview(&target, None, true).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].before, None);
        assert_eq!(files[0].after.as_deref(), Some(target.script.as_str()));

        assert!(integration_preview(&target, Some(&target.script), true)
            .unwrap()
            .is_empty());

        let files = integration_preview(&target, Some(&target.script), false).unwrap();
        assert_eq!(files[0].before.as_deref(), Some(target.script.as_str()));
        assert_eq!(files[0].after, None);

        assert!(integration_preview(&target, None, false)
            .unwrap()
            .is_empty());
        assert!(integration_preview(&target, Some("export default () => {}"), false).is_err());
    }

    #[test]
    fn claude_preview_is_the_text_install_writes_and_touches_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("settings.json");
        let original = "{\n    \"theme\": \"dark\"\n}\n";
        std::fs::write(&settings, original).unwrap();
        let script = dir.path().join("trigger-event.sh");

        let files = claude_preview(&settings, &script, Some(original), None, true, LATEST).unwrap();
        assert_eq!(std::fs::read_to_string(&settings).unwrap(), original);
        assert!(!script.exists());
        assert_eq!(files.len(), 2);
        assert_eq!(files[1].before, None);
        assert_eq!(files[1].after.as_deref(), Some(SESSION_HOOK_SCRIPT));

        apply_settings(&settings, true, LATEST).unwrap();
        let written = std::fs::read_to_string(&settings).unwrap();
        assert_eq!(files[0].after.as_deref(), Some(written.as_str()));

        let removal =
            claude_preview(&settings, &script, Some(&written), None, false, None).unwrap();
        assert_eq!(removal.len(), 1);
        apply_settings(&settings, false, None).unwrap();
        let cleaned = std::fs::read_to_string(&settings).unwrap();
        assert_eq!(removal[0].after.as_deref(), Some(cleaned.as_str()));
        assert!(cleaned.contains("\"theme\""));
    }

    #[test]
    fn claude_preview_of_an_up_to_date_install_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let settings = dir.path().join("settings.json");
        apply_settings(&settings, true, LATEST).unwrap();
        let text = std::fs::read_to_string(&settings).unwrap();
        let files = claude_preview(
            &settings,
            &dir.path().join("t.sh"),
            Some(&text),
            Some(SESSION_HOOK_SCRIPT),
            true,
            LATEST,
        )
        .unwrap();
        assert!(files.is_empty());
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

    #[test]
    fn an_unknown_version_installs_only_the_1_0_events() {
        let out: Value = serde_json::from_str(
            &plan_settings("", std::path::Path::new("/x/s.json"), true, None)
                .unwrap()
                .unwrap(),
        )
        .unwrap();
        let keys: Vec<&String> = out["hooks"].as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), 6, "{keys:?}");
        assert!(!hooked(&out, "MessageDisplay") && !hooked(&out, "StopFailure"));
    }

    #[test]
    fn a_claude_update_adds_the_new_events_on_the_next_install() {
        let path = std::path::Path::new("/x/s.json");
        let old = plan_settings("", path, true, Some("2.0.50"))
            .unwrap()
            .unwrap();
        assert!(!old.contains("MessageDisplay") && !old.contains("StopFailure"));
        assert!(old.contains("PermissionRequest"));
        let new = plan_settings(&old, path, true, LATEST).unwrap().unwrap();
        assert!(new.contains("MessageDisplay") && new.contains("StopFailure"));
        assert_eq!(plan_settings(&new, path, true, LATEST).unwrap(), None);
    }

    #[test]
    fn a_claude_downgrade_drops_the_events_it_does_not_know() {
        let path = std::path::Path::new("/x/s.json");
        let full = plan_settings("", path, true, LATEST).unwrap().unwrap();
        let down = plan_settings(&full, path, true, Some("1.0.90"))
            .unwrap()
            .unwrap();
        let root: Value = serde_json::from_str(&down).unwrap();
        assert!(root["hooks"].get("MessageDisplay").is_none());
        assert!(hooked(&root, "Stop"));
    }

    #[test]
    fn an_unknown_version_never_prunes_the_events_kex_already_hooked() {
        let path = std::path::Path::new("/x/s.json");
        let full = plan_settings("", path, true, LATEST).unwrap().unwrap();
        assert_eq!(plan_settings(&full, path, true, None).unwrap(), None);
    }

    #[test]
    fn an_unknown_version_adds_the_baseline_and_keeps_the_rest() {
        let path = std::path::Path::new("/x/s.json");
        let partial = merge_hooks(json!({}), &["PermissionRequest", "PostCompact"], true);
        let text = serde_json::to_string_pretty(&partial).unwrap();
        let out: Value =
            serde_json::from_str(&plan_settings(&text, path, true, None).unwrap().unwrap())
                .unwrap();
        for event in claude_version::hook_events_for(None) {
            assert!(hooked(&out, event), "{event} missing");
        }
        assert!(hooked(&out, "PermissionRequest") && hooked(&out, "PostCompact"));
        assert!(out["hooks"].get("MessageDisplay").is_none());
    }

    #[test]
    fn a_known_older_version_prunes_the_events_it_does_not_have() {
        let path = std::path::Path::new("/x/s.json");
        let full = plan_settings("", path, true, LATEST).unwrap().unwrap();
        let out: Value = serde_json::from_str(
            &plan_settings(&full, path, true, Some("2.0.50"))
                .unwrap()
                .unwrap(),
        )
        .unwrap();
        for event in ["StopFailure", "MessageDisplay", "PostCompact"] {
            assert!(out["hooks"].get(event).is_none(), "{event} kept");
        }
        for event in ["PermissionRequest", "SubagentStart", "Stop"] {
            assert!(hooked(&out, event), "{event} missing");
        }
    }

    #[test]
    fn uninstall_removes_kex_from_every_known_event() {
        let full = merge_hooks(json!({}), &all(), true);
        let out = remove_hooks(full);
        for event in all() {
            assert!(!hooked(&out, event), "{event} still hooked");
        }
    }
}
