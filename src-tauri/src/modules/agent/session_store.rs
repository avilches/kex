use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

// Per-tab pending launch command, stashed by the PTY reader when OSC 133;C fires
// and consumed by record_session when SessionStart arrives via the IPC socket.
static PENDING_CMDS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn pending_cmds() -> &'static Mutex<HashMap<String, String>> {
    PENDING_CMDS.get_or_init(|| Mutex::new(HashMap::new()))
}

// Serializes the read-parse-mutate-serialize-write-rename cycle on agent-sessions.json
// across remove_panel_from_store, record_session and detach_session, which can run
// concurrently from the PTY reader thread and the IPC socket listener thread.
static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn store_lock() -> &'static Mutex<()> {
    STORE_LOCK.get_or_init(|| Mutex::new(()))
}

/// Called by the PTY reader when OSC 133;C fires for an agent command.
/// The stashed string is consumed by the next `record_session` call for this tab.
pub fn stash_cmd(tab_id: &str, cmd: String) {
    if let Ok(mut map) = pending_cmds().lock() {
        map.insert(tab_id.to_string(), cmd);
    }
}

fn take_stashed_cmd(tab_id: &str) -> Option<String> {
    pending_cmds().lock().ok()?.remove(tab_id)
}

/// Must be called once in setup() before any session store operation.
/// Accepts the app data dir (e.g. ~/Library/Application Support/app.betauer.kex/).
pub fn init(data_dir: PathBuf) {
    let _ = DATA_DIR.set(data_dir);
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionRecord {
    pub agent: Option<String>,
    pub session_id: String,
    pub cwd_launch: String,
    pub transcript_path: String,
    /// Original CLI invocation captured from OSC 133;C (e.g. "claude --model opus").
    /// Absent for sessions started before this feature or without shell integration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_cmd: Option<String>,
    /// Last tab name the agent reported (OSC title or session title), so a restored tab shows
    /// it before the agent sends a new one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Kind of the unread notification the tab had (attention, finished or error).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification: Option<String>,
    pub updated_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct SessionStore {
    version: u32,
    tabs: HashMap<String, SessionRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub tab_id: String,
    pub agent: String,
    pub resume_cmd: String,
    /// The command that would have run had the launch directory been usable. Only set when
    /// `error_reason` is, so the UI can show what is blocked without it ever being executed.
    pub attempted_cmd: String,
    pub cwd_launch: String,
    pub error_reason: String,
    pub title: Option<String>,
    pub notification: Option<String>,
}

/// Splits plans into those whose tab exists in some window and those whose tab is gone
/// from every window. A single window cannot tell the two apart, so `known` must be the
/// union over all windows.
pub fn split_orphans(plans: Vec<RestorePlan>, known: &std::collections::HashSet<String>) -> (Vec<RestorePlan>, Vec<RestorePlan>) {
    plans.into_iter().partition(|p| known.contains(&p.tab_id))
}

fn store_path() -> Option<PathBuf> {
    DATA_DIR.get().map(|d| d.join("agent-sessions.json"))
}

fn claude_projects_root() -> PathBuf {
    if let Ok(v) = std::env::var("CLAUDE_CONFIG_DIR") {
        if !v.is_empty() {
            return PathBuf::from(v).join("projects");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".claude")
        .join("projects")
}

fn find_jsonl(session_id: &str, transcript_path: &str) -> Option<PathBuf> {
    let tp = PathBuf::from(transcript_path);
    if tp.exists() {
        return Some(tp);
    }
    let root = claude_projects_root();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            let candidate = entry.path().join(format!("{session_id}.jsonl"));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

fn read_launch_cwd_from_jsonl(jsonl: &PathBuf) -> Option<String> {
    let file = std::fs::File::open(jsonl).ok()?;
    let reader = std::io::BufReader::new(file);
    for line in reader.lines() {
        let line = line.ok()?;
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        // Claude Code writes `worktree-state` before the first entry carrying a cwd. While the
        // session is inside a worktree, `originalCwd` is where the command was launched from;
        // the entry's own `cwd` is the worktree, which may be deleted by the time of the restore.
        if let Some(original) = obj
            .get("worktreeSession")
            .and_then(|w| w.get("originalCwd"))
            .and_then(|v| v.as_str())
            .filter(|c| !c.is_empty())
        {
            return Some(original.to_string());
        }
        if let Some(cwd) = obj.get("cwd").and_then(|v| v.as_str()) {
            if !cwd.is_empty() {
                return Some(cwd.to_string());
            }
        }
    }
    None
}

/// True when the original invocation was non-interactive (`-p` / `--print`).
/// Such sessions are never persisted.
pub fn is_print_mode_cmd(cmd: &str) -> bool {
    cmd.split_whitespace()
        .skip(1) // skip binary name
        .any(|t| t == "-p" || t == "--print")
}

/// Whitelist-based arg stripper for session restore.
///
/// Keeps only the flags that make sense when resuming an existing session:
/// auth/permission settings, model/effort, tool allow-lists, add-dirs, MCP config, etc.
/// One-time flags (--worktree, --from-pr, --tmux) and print-mode flags are dropped.
///
/// Limitation: does not handle shell-quoted values with internal whitespace
/// (e.g. --system-prompt "hello world" splits into two tokens). This covers the
/// overwhelming majority of real invocations.
fn strip_for_resume_base(cmd: &str) -> String {
    // Boolean flags — keep as-is, no following value token.
    const KEEP_FLAGS: &[&str] = &[
        "--allow-dangerously-skip-permissions",
        "--dangerously-skip-permissions",
        "--safe-mode",
        "--bare",
        "--verbose",
        "--no-chrome",
        "--chrome",
        "--ide",
        "--strict-mcp-config",
        "--exclude-dynamic-system-prompt-sections",
        "--disable-slash-commands",
        "--brief",
    ];
    // Value flags — keep flag + consume all immediately-following non-flag tokens.
    // Handles both "--flag value" and "--flag=value" forms.
    const KEEP_WITH_VALUE: &[&str] = &[
        "--add-dir",
        "--agent",
        "--agents",
        "--allowedTools", "--allowed-tools",
        "--disallowedTools", "--disallowed-tools",
        "--name", "-n",
        "--permission-mode",
        "--mcp-config",
        "--settings",
        "--setting-sources",
        "--append-system-prompt",
        "--system-prompt",
        "--tools",
        "--plugin-dir",
        "--plugin-url",
        "--betas",
    ];

    let tokens: Vec<&str> = cmd.split_whitespace().collect();
    if tokens.is_empty() {
        return String::new();
    }
    let mut result = vec![tokens[0]]; // always keep binary name
    let mut i = 1;
    while i < tokens.len() {
        let token = tokens[i];
        let (flag, has_eq) = match token.find('=') {
            Some(pos) => (&token[..pos], true),
            None => (token, false),
        };
        if KEEP_FLAGS.contains(&flag) {
            result.push(token);
            i += 1;
            continue;
        }
        if KEEP_WITH_VALUE.contains(&flag) {
            result.push(token);
            i += 1;
            if !has_eq {
                // Consume all immediately-following non-flag tokens as values.
                while i < tokens.len() && !tokens[i].starts_with('-') {
                    result.push(tokens[i]);
                    i += 1;
                }
            }
            continue;
        }
        // Not in whitelist: skip this token (and any orphaned non-flag value that follows).
        i += 1;
        while i < tokens.len() && !tokens[i].starts_with('-') {
            i += 1;
        }
    }
    result.join(" ")
}

// Returns only the agent command. The frontend spawns the PTY with plan.cwdLaunch as the
// initial working directory, so no `cd` prefix is needed here.
fn resume_cmd_for_agent(agent: &str, session_id: &str) -> String {
    match agent {
        "claude" => format!("claude --resume {}", shell_quote(session_id)),
        "codex" => "codex resume --last".to_string(),
        "gemini" => format!("gemini --resume {}", shell_quote(session_id)),
        _ => String::new(),
    }
}

// Used when the JSONL transcript is missing: starts a new session but reuses the same
// session ID (equivalent to what Claude would have done with no arguments, except the
// UUID is preserved so the user's session identity is not lost).
fn reattach_cmd_for_agent(agent: &str, session_id: &str) -> String {
    match agent {
        "claude" => format!("claude --session-id {}", shell_quote(session_id)),
        _ => String::new(),
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Why `path` cannot be the working directory of a restored terminal, or `None` when it can.
pub fn launch_dir_problem(path: &str) -> Option<String> {
    let p = Path::new(path);
    match std::fs::metadata(p) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Some(format!("Directory not found: {path}")),
        Err(e) => Some(format!("Cannot access directory: {path} ({e})")),
        Ok(m) if !m.is_dir() => Some(format!("Not a directory: {path}")),
        Ok(_) => std::fs::read_dir(p).err().map(|e| format!("Cannot access directory: {path} ({e})")),
    }
}

fn build_plans_from(tabs: HashMap<String, SessionRecord>, store_path: Option<&PathBuf>) -> Vec<RestorePlan> {
    let mut plans = Vec::new();
    for (tab_id, record) in tabs {
        let agent = record.agent.unwrap_or_else(|| "claude".to_string());

        // Prefer the launch directory recorded in the transcript (the worktree's originalCwd when
        // the session entered one, else the first cwd) over cwd_launch.
        let jsonl = find_jsonl(&record.session_id, &record.transcript_path);

        // When JSONL is absent the session was opened but no message was ever sent.
        // Use --session-id to start a new session that reuses the same UUID instead of
        // dropping it silently. Remove the stale entry now; hooks will re-record if the
        // new session produces messages.
        let (cwd_launch, cmd) = if let Some(ref j) = jsonl {
            let cwd_launch = read_launch_cwd_from_jsonl(j).unwrap_or_else(|| record.cwd_launch.clone());
            let cmd = match record.launch_cmd.as_deref() {
                Some(lc) => {
                    let base = strip_for_resume_base(lc);
                    format!("{base} --resume {}", shell_quote(&record.session_id))
                }
                None => resume_cmd_for_agent(&agent, &record.session_id),
            };
            (cwd_launch, cmd)
        } else {
            log::info!(
                "[agent-session] restore plan: tab={tab_id} agent={agent} session={} \
                 JSONL not found, reattaching with --session-id",
                record.session_id
            );
            let cwd_launch = record.cwd_launch.clone();
            let cmd = match record.launch_cmd.as_deref() {
                Some(lc) => {
                    let base = strip_for_resume_base(lc);
                    format!("{base} --session-id {}", shell_quote(&record.session_id))
                }
                None => reattach_cmd_for_agent(&agent, &record.session_id),
            };
            (cwd_launch, cmd)
        };

        if let Some(reason) = launch_dir_problem(&cwd_launch) {
            log::warn!("[agent-session] restore plan: tab={tab_id} agent={agent} {reason}");
            plans.push(RestorePlan {
                tab_id, agent,
                resume_cmd: String::new(),
                attempted_cmd: cmd,
                cwd_launch,
                error_reason: reason,
                title: record.title,
                notification: record.notification,
            });
            continue;
        }

        // Dropped only now: a plan blocked by its directory keeps the entry so "Try again" can
        // still find the session once the directory is back.
        if jsonl.is_none() {
            if let Some(path) = store_path {
                remove_panel_from_store(&tab_id, path);
            }
        }

        log::info!("[agent-session] restore plan: tab={tab_id} agent={agent} session={} cwd_launch={cwd_launch} cmd={cmd:?}", record.session_id);
        plans.push(RestorePlan {
            tab_id,
            agent,
            resume_cmd: cmd,
            attempted_cmd: String::new(),
            cwd_launch,
            error_reason: String::new(),
            title: record.title,
            notification: record.notification,
        });
    }
    plans
}

// Preserves the version of agent-sessions.json about to be overwritten, so
// load_restore_plan can recover from it if the new write is corrupted or truncated.
fn write_backup(path: &Path, previous_content: &str) {
    let _ = std::fs::write(path.with_extension("json.bak"), previous_content);
}

fn remove_panel_from_store(tab_id: &str, path: &PathBuf) {
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(content) = std::fs::read_to_string(path) else { return };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else { return };
    store.tabs.remove(tab_id);
    let Ok(out) = serde_json::to_string_pretty(&store) else { return };
    let tmp = path.with_extension("json.kex-tmp");
    if std::fs::write(&tmp, out).is_ok() {
        write_backup(path, &content);
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Write or update a tab entry in agent-sessions.json.
/// Called from the PTY reader (OSC 777 path) or the IPC socket (v5 path) on SessionStart/UserPromptSubmit.
///
/// Consumes the pending launch command stashed by `stash_cmd`. If the stashed command
/// is print-mode (`-p` / `--print`), the session is not persisted.
pub fn record_session(tab_id: &str, agent: &str, session_id: &str, transcript_path: &str, cwd_launch: &str) {
    let path = match store_path() {
        Some(p) => p,
        None => return,
    };
    record_session_at_path(&path, tab_id, agent, session_id, transcript_path, cwd_launch);
}

fn record_session_at_path(path: &PathBuf, tab_id: &str, agent: &str, session_id: &str, transcript_path: &str, cwd_launch: &str) {
    let launch_cmd = take_stashed_cmd(tab_id);
    if launch_cmd.as_deref().is_some_and(is_print_mode_cmd) {
        log::info!("[agent-session] skip record: print-mode session tab={tab_id}");
        return;
    }
    log::info!(
        "[agent-session] record tab={tab_id} agent={agent} session={session_id} cwd_launch={cwd_launch} \
         launch_cmd={launch_cmd:?}"
    );
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut record = SessionRecord {
        agent: Some(agent.to_string()),
        session_id: session_id.to_string(),
        cwd_launch: cwd_launch.to_string(),
        transcript_path: transcript_path.to_string(),
        launch_cmd,
        title: None,
        notification: None,
        updated_at: now,
    };
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let existing_content = if path.exists() {
        std::fs::read_to_string(path).ok()
    } else {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        None
    };
    // Only a previous version that parses as a SessionStore is worth backing
    // up. A corrupt main file must leave any existing .bak untouched, or a
    // second corruption (this write) destroys the last recoverable copy that
    // load_restore_plan could otherwise fall back to.
    let mut store = SessionStore { version: 1, tabs: HashMap::new() };
    let mut valid_existing: Option<&str> = None;
    if let Some(s) = existing_content.as_deref() {
        if let Ok(parsed) = serde_json::from_str::<SessionStore>(s) {
            store = parsed;
            valid_existing = Some(s);
        }
    }
    // SessionStart fires again on every resume and replaces the record; the name and the
    // pending notification it held must survive until the frontend reports new ones. A resume
    // keeps the session id, while /clear or an agent launched by hand brings a new one, which
    // must not inherit the old conversation's name.
    if let Some(previous) = store.tabs.get(tab_id).filter(|p| p.session_id == session_id) {
        record.title = previous.title.clone();
        record.notification = previous.notification.clone();
    }
    store.tabs.insert(tab_id.to_string(), record);
    if let Ok(out) = serde_json::to_string_pretty(&store) {
        let tmp = path.with_extension("json.kex-tmp");
        if std::fs::write(&tmp, out).is_ok() {
            if let Some(prev) = valid_existing {
                write_backup(path, prev);
            }
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

const MAX_TITLE_CHARS: usize = 200;
const NOTIFICATION_KINDS: [&str; 3] = ["attention", "finished", "error"];

/// Stores the tab name and the pending notification of an already recorded session. An empty
/// `title` keeps the stored one (the title also goes empty while the app is closing, which
/// must not erase it); an empty or unknown `notification` clears it. Tabs without a record are
/// ignored (returns false): only a session that can be resumed has anything to restore, and
/// the caller retries once something changes. A record of another session id is ignored too, so
/// a flush still in flight for the session before /clear cannot land on the one after it.
pub fn set_snapshot(tab_id: &str, session_id: &str, title: &str, notification: &str) -> bool {
    match store_path() {
        Some(path) => set_snapshot_at_path(&path, tab_id, session_id, title, notification),
        None => false,
    }
}

fn set_snapshot_at_path(path: &Path, tab_id: &str, session_id: &str, title: &str, notification: &str) -> bool {
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(content) = std::fs::read_to_string(path) else { return false };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else { return false };
    let Some(record) = store.tabs.get_mut(tab_id) else { return false };
    if record.session_id != session_id {
        return false;
    }
    let next_title = if title.is_empty() {
        record.title.clone()
    } else {
        Some(title.chars().take(MAX_TITLE_CHARS).collect::<String>())
    };
    let next_notification = NOTIFICATION_KINDS
        .contains(&notification)
        .then(|| notification.to_string());
    if record.title == next_title && record.notification == next_notification {
        return true;
    }
    record.title = next_title;
    record.notification = next_notification;
    let Ok(out) = serde_json::to_string_pretty(&store) else { return false };
    let tmp = path.with_extension("json.kex-tmp");
    if std::fs::write(&tmp, out).is_err() {
        return false;
    }
    write_backup(path, &content);
    if std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
        return false;
    }
    true
}

/// Remove a tab entry from agent-sessions.json.
/// Called when the agent exits (exited signal) or the user detaches manually.
pub fn detach_session(tab_id: &str) -> Result<(), String> {
    if let Some(path) = store_path() {
        detach_session_at_path(&path, tab_id);
    }
    Ok(())
}

fn detach_session_at_path(path: &Path, tab_id: &str) {
    log::info!("[agent-session] detach tab={tab_id}");
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) {
            store.tabs.remove(tab_id);
            if let Ok(out) = serde_json::to_string_pretty(&store) {
                let tmp = path.with_extension("json.kex-tmp");
                if std::fs::write(&tmp, out).is_ok() {
                    write_backup(path, &content);
                    let _ = std::fs::rename(&tmp, path);
                }
            }
        }
    }
}

/// Read-only preview of the resume command for a single tab, used by the frontend to show
/// what will actually run on the next Kex launch (e.g. in the "Run on start" menu) instead
/// of a stale captured string. Runs the same computation as `load_restore_plan` but, unlike
/// it, never mutates the store: `build_plans_from` only calls `remove_panel_from_store` when
/// given a `store_path`, which this passes as `None`.
pub fn preview_resume_cmd(tab_id: &str) -> Option<RestorePlan> {
    let path = store_path()?;
    preview_resume_cmd_from_path(tab_id, &path)
}

fn preview_resume_cmd_from_path(tab_id: &str, path: &PathBuf) -> Option<RestorePlan> {
    let content = std::fs::read_to_string(path).ok()?;
    let store: SessionStore = serde_json::from_str(&content).ok()?;
    let record = store.tabs.get(tab_id)?.clone();
    let mut tabs = HashMap::new();
    tabs.insert(tab_id.to_string(), record);
    build_plans_from(tabs, None).into_iter().next()
}

fn read_backup_store(path: &Path) -> Option<SessionStore> {
    let content = std::fs::read_to_string(path.with_extension("json.bak")).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn load_restore_plan() -> Vec<RestorePlan> {
    match store_path() {
        Some(p) => load_restore_plan_from_path(&p),
        None => vec![],
    }
}

fn load_restore_plan_from_path(path: &PathBuf) -> Vec<RestorePlan> {
    let main_store = std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<SessionStore>(&content).ok());

    let store = match main_store {
        Some(s) => s,
        None => match read_backup_store(path) {
            Some(s) => {
                log::warn!("[agent-session] restore: main store unavailable, recovered from backup");
                s
            }
            None => {
                // Missing main AND missing backup is a normal first launch, not an anomaly.
                if path.exists() || path.with_extension("json.bak").exists() {
                    log::warn!("[agent-session] restore: store corrupt or wrong schema");
                } else {
                    log::debug!("[agent-session] restore: no store file, starting fresh");
                }
                return vec![];
            }
        },
    };
    log::info!("[agent-session] restore: {} session(s) in store", store.tabs.len());
    build_plans_from(store.tabs, Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_quote_escapes_single_quotes() {
        assert_eq!(shell_quote("/home/user/my repo"), "'/home/user/my repo'");
        assert_eq!(shell_quote("/path/with'quote"), "'/path/with'\\''quote'");
    }

    #[test]
    fn resume_cmd_claude() {
        let cmd = resume_cmd_for_agent("claude", "abc-123");
        assert_eq!(cmd, "claude --resume 'abc-123'");
    }

    #[test]
    fn resume_cmd_codex() {
        let cmd = resume_cmd_for_agent("codex", "any");
        assert_eq!(cmd, "codex resume --last");
    }

    #[test]
    fn resume_cmd_unknown_agent() {
        let cmd = resume_cmd_for_agent("amp", "any");
        assert_eq!(cmd, "");
    }

    #[test]
    fn reattach_cmd_claude() {
        let cmd = reattach_cmd_for_agent("claude", "abc-123");
        assert_eq!(cmd, "claude --session-id 'abc-123'");
    }

    #[test]
    fn reattach_cmd_unknown_agent_returns_empty() {
        let cmd = reattach_cmd_for_agent("codex", "any");
        assert_eq!(cmd, "");
    }

    #[test]
    fn is_print_mode_detects_p_flag() {
        assert!(is_print_mode_cmd("claude -p hello"));
        assert!(is_print_mode_cmd("claude --print"));
        assert!(is_print_mode_cmd("claude --model opus -p"));
        assert!(!is_print_mode_cmd("claude --model opus"));
        assert!(!is_print_mode_cmd("claude"));
    }

    #[test]
    fn strip_keeps_whitelisted_flags() {
        // --model and --effort are NOT kept (configurable in-session via /model)
        let base = strip_for_resume_base("claude --model opus --effort high --safe-mode");
        assert_eq!(base, "claude --safe-mode");
    }

    #[test]
    fn strip_removes_non_whitelisted_flags() {
        let base = strip_for_resume_base("claude --model opus --worktree my-branch --effort high");
        assert_eq!(base, "claude");
    }

    #[test]
    fn strip_removes_flag_with_value() {
        // --debug-file has a value; both flag and value should be dropped
        let base = strip_for_resume_base("claude --model opus --debug-file /tmp/out.log --effort high");
        assert_eq!(base, "claude");
    }

    #[test]
    fn strip_keeps_add_dir_multiple_values() {
        let base = strip_for_resume_base("claude --add-dir /a /b --model opus");
        assert_eq!(base, "claude --add-dir /a /b");
    }

    #[test]
    fn strip_handles_eq_form() {
        // --model=opus and --effort=high are dropped (in-session configurable)
        let base = strip_for_resume_base("claude --model=opus --effort=high");
        assert_eq!(base, "claude");
    }

    #[test]
    fn resume_cmd_from_launch_cmd_strips_and_adds_resume() {
        let lc = "claude --model opus --worktree feat -p";
        let base = strip_for_resume_base(lc);
        let cmd = format!("{base} --resume {}", shell_quote("abc-123"));
        // --worktree, -p, --model all removed; --resume added
        assert_eq!(cmd, "claude --resume 'abc-123'");
    }

    #[test]
    fn reattach_from_launch_cmd_uses_session_id() {
        let lc = "claude --model opus --safe-mode";
        let base = strip_for_resume_base(lc);
        let cmd = format!("{base} --session-id {}", shell_quote("abc-123"));
        // --model dropped; --safe-mode kept
        assert_eq!(cmd, "claude --safe-mode --session-id 'abc-123'");
    }

    fn write_store(path: &PathBuf, tabs: HashMap<String, SessionRecord>) {
        let store = SessionStore { version: 1, tabs };
        std::fs::write(path, serde_json::to_string(&store).unwrap()).unwrap();
    }

    #[test]
    fn preview_resume_cmd_from_path_returns_plan_for_known_tab() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(&jsonl, format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display())).unwrap();

        let mut tabs = HashMap::new();
        tabs.insert("tab-1".to_string(), SessionRecord {
            agent: Some("claude".to_string()),
            session_id: "abc-123".to_string(),
            cwd_launch: cwd_launch.display().to_string(),
            transcript_path: jsonl.display().to_string(),
            launch_cmd: Some("claude --model opus --safe-mode".to_string()),
            title: None,
            notification: None,
            updated_at: 0,
        });
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plan = preview_resume_cmd_from_path("tab-1", &store_path).expect("plan for known tab");
        assert_eq!(plan.tab_id, "tab-1");
        assert_eq!(plan.resume_cmd, "claude --safe-mode --resume 'abc-123'");
        assert_eq!(plan.error_reason, "");
    }

    #[test]
    fn preview_resume_cmd_from_path_none_for_unknown_tab() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, HashMap::new());

        assert!(preview_resume_cmd_from_path("missing-tab", &store_path).is_none());
    }

    #[test]
    fn preview_resume_cmd_from_path_reports_missing_cwd_without_mutating_store() {
        let dir = tempfile::tempdir().unwrap();
        let mut tabs = HashMap::new();
        tabs.insert("tab-1".to_string(), SessionRecord {
            agent: Some("claude".to_string()),
            session_id: "abc-123".to_string(),
            cwd_launch: dir.path().join("does-not-exist").display().to_string(),
            transcript_path: dir.path().join("missing.jsonl").display().to_string(),
            launch_cmd: None,
            title: None,
            notification: None,
            updated_at: 0,
        });
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);
        let before = std::fs::read_to_string(&store_path).unwrap();

        let plan = preview_resume_cmd_from_path("tab-1", &store_path).expect("plan with error");
        assert_eq!(plan.resume_cmd, "");
        assert!(plan.error_reason.contains("Directory not found"));

        // Unlike load_restore_plan, this must never touch the store file on disk.
        let after = std::fs::read_to_string(&store_path).unwrap();
        assert_eq!(before, after);
    }

    fn plan_for_transcript(dir: &Path, lines: &[String], cwd_launch: &Path) -> (RestorePlan, PathBuf) {
        let jsonl = dir.join("session.jsonl");
        std::fs::write(&jsonl, lines.join("\n") + "\n").unwrap();
        let store_path = dir.join("agent-sessions.json");
        write_store(&store_path, sample_tabs(cwd_launch, &jsonl));
        let plans = load_restore_plan_from_path(&store_path);
        (plans.into_iter().next().expect("one plan"), store_path)
    }

    #[test]
    fn restore_uses_original_cwd_when_session_entered_a_worktree() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        std::fs::create_dir_all(&launch).unwrap();
        let worktree = dir.path().join("deleted-worktree");
        let lines = vec![
            r#"{"type":"mode"}"#.to_string(),
            format!(
                r#"{{"type":"worktree-state","worktreeSession":{{"originalCwd":"{}","worktreePath":"{}"}}}}"#,
                launch.display(), worktree.display()
            ),
            format!(r#"{{"type":"user","cwd":"{}"}}"#, worktree.display()),
        ];

        let (plan, _) = plan_for_transcript(dir.path(), &lines, &worktree);

        assert_eq!(plan.error_reason, "");
        assert_eq!(plan.cwd_launch, launch.display().to_string());
    }

    #[test]
    fn restore_falls_back_to_first_cwd_without_worktree_state() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        std::fs::create_dir_all(&launch).unwrap();
        let lines = vec![
            r#"{"type":"mode"}"#.to_string(),
            r#"{"type":"worktree-state","worktreeSession":null}"#.to_string(),
            format!(r#"{{"type":"user","cwd":"{}"}}"#, launch.display()),
        ];

        let (plan, _) = plan_for_transcript(dir.path(), &lines, &dir.path().join("elsewhere"));

        assert_eq!(plan.error_reason, "");
        assert_eq!(plan.cwd_launch, launch.display().to_string());
    }

    #[test]
    fn restore_keeps_store_entry_when_launch_dir_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone");
        let lines = vec![format!(r#"{{"type":"user","cwd":"{}"}}"#, missing.display())];

        let (plan, store_path) = plan_for_transcript(dir.path(), &lines, &missing);

        assert!(plan.error_reason.contains("Directory not found"));
        assert_eq!(plan.resume_cmd, "");
        let store: SessionStore = serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(store.tabs.contains_key("tab-1"));
    }

    #[test]
    fn restore_error_plan_carries_the_blocked_command() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone");
        let lines = vec![format!(r#"{{"type":"user","cwd":"{}"}}"#, missing.display())];

        let (plan, _) = plan_for_transcript(dir.path(), &lines, &missing);

        assert_eq!(plan.resume_cmd, "");
        assert!(plan.attempted_cmd.contains("--resume 'abc-123'"), "{}", plan.attempted_cmd);
    }

    #[test]
    fn restore_keeps_store_entry_when_transcript_and_launch_dir_are_both_missing() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone");
        let mut tabs = HashMap::new();
        tabs.insert("tab-1".to_string(), SessionRecord {
            agent: Some("claude".to_string()),
            session_id: "abc-123".to_string(),
            cwd_launch: missing.display().to_string(),
            transcript_path: dir.path().join("missing.jsonl").display().to_string(),
            launch_cmd: None,
            title: None,
            notification: None,
            updated_at: 0,
        });
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert!(plans[0].error_reason.contains("Directory not found"));
        assert!(plans[0].attempted_cmd.contains("--session-id 'abc-123'"));
        let store: SessionStore = serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(store.tabs.contains_key("tab-1"));
    }

    #[test]
    fn launch_dir_problem_is_none_for_a_readable_directory() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(launch_dir_problem(&dir.path().display().to_string()), None);
    }

    #[test]
    fn launch_dir_problem_reports_missing_directory() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone").display().to_string();
        assert_eq!(launch_dir_problem(&missing), Some(format!("Directory not found: {missing}")));
    }

    #[test]
    fn launch_dir_problem_reports_a_file_as_not_a_directory() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("f.txt");
        std::fs::write(&file, "x").unwrap();
        let file = file.display().to_string();
        assert_eq!(launch_dir_problem(&file), Some(format!("Not a directory: {file}")));
    }

    #[cfg(unix)]
    #[test]
    fn launch_dir_problem_reports_an_unreadable_directory() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let locked = dir.path().join("locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        let reason = launch_dir_problem(&locked.display().to_string());
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        // Root can read anything, so only assert when the permission bits were honored.
        if let Some(r) = reason {
            assert!(r.starts_with("Cannot access directory"), "{r}");
        }
    }

    #[test]
    fn load_restore_plan_returns_empty_when_no_file() {
        let plans = load_restore_plan();
        let _ = plans;
    }

    fn sample_tabs(cwd_launch: &Path, jsonl: &Path) -> HashMap<String, SessionRecord> {
        let mut tabs = HashMap::new();
        tabs.insert("tab-1".to_string(), SessionRecord {
            agent: Some("claude".to_string()),
            session_id: "abc-123".to_string(),
            cwd_launch: cwd_launch.display().to_string(),
            transcript_path: jsonl.display().to_string(),
            launch_cmd: None,
            title: None,
            notification: None,
            updated_at: 0,
        });
        tabs
    }

    #[test]
    fn remove_panel_from_store_writes_backup_of_previous_version() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        let jsonl = dir.path().join("session.jsonl");
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, sample_tabs(&cwd_launch, &jsonl));
        let original_content = std::fs::read_to_string(&store_path).unwrap();

        remove_panel_from_store("tab-1", &store_path);

        let bak_content = std::fs::read_to_string(store_path.with_extension("json.bak")).unwrap();
        assert_eq!(bak_content, original_content);

        let after: SessionStore = serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(after.tabs.is_empty());
    }

    #[test]
    fn detach_session_at_path_writes_backup_of_previous_version() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        let jsonl = dir.path().join("session.jsonl");
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, sample_tabs(&cwd_launch, &jsonl));
        let original_content = std::fs::read_to_string(&store_path).unwrap();

        detach_session_at_path(&store_path, "tab-1");

        let bak_content = std::fs::read_to_string(store_path.with_extension("json.bak")).unwrap();
        assert_eq!(bak_content, original_content);

        let after: SessionStore = serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(after.tabs.is_empty());
    }

    #[test]
    fn record_session_at_path_skips_backup_when_no_previous_file() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        record_session_at_path(&store_path, "tab-1", "claude", "abc-123", "/tmp/session.jsonl", "/tmp/project");

        assert!(store_path.exists());
        assert!(!store_path.with_extension("json.bak").exists());
    }

    #[test]
    fn record_session_at_path_writes_backup_of_previous_version() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        record_session_at_path(&store_path, "tab-1", "claude", "abc-123", "/tmp/session.jsonl", "/tmp/project");
        let first_write = std::fs::read_to_string(&store_path).unwrap();

        record_session_at_path(&store_path, "tab-2", "claude", "def-456", "/tmp/session2.jsonl", "/tmp/project2");

        let bak_content = std::fs::read_to_string(store_path.with_extension("json.bak")).unwrap();
        assert_eq!(bak_content, first_write);
    }

    #[test]
    fn load_restore_plan_from_path_recovers_from_backup_when_main_file_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(&jsonl, format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display())).unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        // Two writes so the second one produces a .bak of the first, valid version.
        record_session_at_path(&store_path, "tab-1", "claude", "abc-123", &jsonl.display().to_string(), &cwd_launch.display().to_string());
        record_session_at_path(&store_path, "tab-1", "claude", "abc-123", &jsonl.display().to_string(), &cwd_launch.display().to_string());
        assert!(store_path.with_extension("json.bak").exists());

        std::fs::write(&store_path, "{ not valid json").unwrap();

        let plans = load_restore_plan_from_path(&store_path);
        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].tab_id, "tab-1");
        assert_eq!(plans[0].resume_cmd, "claude --resume 'abc-123'");
    }

    #[test]
    fn load_restore_plan_from_path_recovers_from_backup_when_main_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(&jsonl, format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display())).unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        // Two writes so the second one produces a .bak of the first, valid version.
        record_session_at_path(&store_path, "tab-1", "claude", "abc-123", &jsonl.display().to_string(), &cwd_launch.display().to_string());
        record_session_at_path(&store_path, "tab-1", "claude", "abc-123", &jsonl.display().to_string(), &cwd_launch.display().to_string());
        assert!(store_path.with_extension("json.bak").exists());

        std::fs::remove_file(&store_path).unwrap();

        let plans = load_restore_plan_from_path(&store_path);
        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].tab_id, "tab-1");
        assert_eq!(plans[0].resume_cmd, "claude --resume 'abc-123'");
    }

    #[test]
    fn load_restore_plan_from_path_returns_empty_when_neither_file_exists() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans.is_empty());
    }

    #[test]
    fn load_restore_plan_from_path_returns_empty_when_main_and_backup_both_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        std::fs::write(&store_path, "{ not valid json").unwrap();
        std::fs::write(store_path.with_extension("json.bak"), "also not valid json").unwrap();

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans.is_empty());
    }

    #[test]
    fn load_restore_plan_from_path_returns_empty_when_main_corrupt_and_no_backup() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        std::fs::write(&store_path, "{ not valid json").unwrap();

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans.is_empty());
    }

    #[test]
    fn concurrent_record_session_calls_do_not_lose_writes() {
        // Uses record_session_at_path with a store_path local to this test,
        // rather than record_session + init(), so this test never touches the
        // global DATA_DIR OnceLock. Sharing that OnceLock with other tests
        // (e.g. load_restore_plan_returns_empty_when_no_file, which calls
        // load_restore_plan() without its own init()) made the two racy: if
        // this test's init() won the OnceLock and the other test's read
        // interleaved with these writes, build_plans_from could purge entries
        // whose transcript_path doesn't exist on disk yet.
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        let handles: Vec<_> = (0..20)
            .map(|i| {
                let store_path = store_path.clone();
                std::thread::spawn(move || {
                    record_session_at_path(
                        &store_path,
                        &format!("tab-{i}"),
                        "claude",
                        &format!("session-{i}"),
                        &format!("/tmp/transcript-{i}.jsonl"),
                        "/tmp/project",
                    );
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }

        let content = std::fs::read_to_string(&store_path).unwrap();
        let store: SessionStore = serde_json::from_str(&content).unwrap();
        assert_eq!(store.tabs.len(), 20);
        for i in 0..20 {
            assert!(store.tabs.contains_key(&format!("tab-{i}")));
        }
    }

    #[test]
    fn record_session_at_path_does_not_overwrite_backup_when_main_file_is_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        let jsonl = dir.path().join("session.jsonl");
        let store_path = dir.path().join("agent-sessions.json");

        let valid_store = SessionStore { version: 1, tabs: sample_tabs(&cwd_launch, &jsonl) };
        let valid_content = serde_json::to_string_pretty(&valid_store).unwrap();
        std::fs::write(store_path.with_extension("json.bak"), &valid_content).unwrap();
        std::fs::write(&store_path, "{ not valid json").unwrap();

        record_session_at_path(&store_path, "tab-2", "claude", "def-456", "/tmp/session2.jsonl", "/tmp/project2");

        let bak_content = std::fs::read_to_string(store_path.with_extension("json.bak")).unwrap();
        assert_eq!(bak_content, valid_content, "a corrupt main file must not clobber a valid backup");

        let after: SessionStore = serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(after.tabs.contains_key("tab-2"));
    }

    fn plan(tab: &str) -> RestorePlan {
        RestorePlan {
            tab_id: tab.to_string(),
            agent: "claude".to_string(),
            resume_cmd: String::new(),
            attempted_cmd: String::new(),
            cwd_launch: String::new(),
            error_reason: String::new(),
            title: None,
            notification: None,
        }
    }

    fn read_store(path: &Path) -> SessionStore {
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn set_snapshot_stores_title_and_notification_of_a_recorded_tab() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");

        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "attention");

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.title.as_deref(), Some("fixing the build"));
        assert_eq!(rec.notification.as_deref(), Some("attention"));
    }

    #[test]
    fn set_snapshot_ignores_a_write_scoped_to_another_session_of_the_tab() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "new", "/tmp/s.jsonl", "/tmp/p");

        assert!(!set_snapshot_at_path(&path, "tab-1", "old", "stale title", "attention"));

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.title, None);
        assert_eq!(rec.notification, None);
    }

    #[test]
    fn set_snapshot_empty_title_keeps_the_stored_one_but_empty_notification_clears() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "attention");

        set_snapshot_at_path(&path, "tab-1", "abc", "", "");

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.title.as_deref(), Some("fixing the build"));
        assert_eq!(rec.notification, None);
    }

    #[test]
    fn set_snapshot_ignores_unknown_notification_kinds_and_unrecorded_tabs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");

        assert!(set_snapshot_at_path(&path, "tab-1", "abc", "x", "bogus"));
        assert!(!set_snapshot_at_path(&path, "tab-2", "abc", "y", "attention"));

        let store = read_store(&path);
        assert_eq!(store.tabs["tab-1"].notification, None);
        assert!(!store.tabs.contains_key("tab-2"));
    }

    #[test]
    fn set_snapshot_caps_the_title_by_characters_and_keeps_it_with_an_unknown_notification() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        let long: String = "\u{00e9}\u{1F600}x".repeat(300);

        set_snapshot_at_path(&path, "tab-1", "abc", &long, "bogus");

        let rec = &read_store(&path).tabs["tab-1"];
        let title = rec.title.as_deref().unwrap();
        assert_eq!(title.chars().count(), MAX_TITLE_CHARS);
        assert!(long.starts_with(title));
        assert_eq!(rec.notification, None);
    }

    #[test]
    fn restore_plan_for_a_missing_directory_still_carries_title_and_notification() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        let missing = dir.path().join("gone");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", &missing.display().to_string());
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "error");

        let plans = load_restore_plan_from_path(&path);

        assert!(plans[0].resume_cmd.is_empty());
        assert_eq!(plans[0].title.as_deref(), Some("fixing the build"));
        assert_eq!(plans[0].notification.as_deref(), Some("error"));
    }

    #[test]
    fn set_snapshot_does_not_rewrite_the_file_when_nothing_changed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_snapshot_at_path(&path, "tab-1", "abc", "t", "error");
        let bak = path.with_extension("json.bak");
        std::fs::remove_file(&bak).ok();

        set_snapshot_at_path(&path, "tab-1", "abc", "t", "error");

        assert!(!bak.exists(), "an identical snapshot must not write a backup");
    }

    #[test]
    fn recording_a_session_again_keeps_the_title_and_notification() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "finished");

        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.title.as_deref(), Some("fixing the build"));
        assert_eq!(rec.notification.as_deref(), Some("finished"));
    }

    #[test]
    fn recording_a_different_session_on_the_tab_starts_without_the_old_title_and_notification() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "finished");

        record_session_at_path(&path, "tab-1", "claude", "def", "/tmp/s2.jsonl", "/tmp/p");

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.session_id, "def");
        assert_eq!(rec.title, None);
        assert_eq!(rec.notification, None);
    }

    #[test]
    fn restore_plan_carries_the_title_and_notification() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(&jsonl, format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display())).unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", &jsonl.display().to_string(), &cwd_launch.display().to_string());
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "attention");

        let plans = load_restore_plan_from_path(&path);

        assert_eq!(plans[0].title.as_deref(), Some("fixing the build"));
        assert_eq!(plans[0].notification.as_deref(), Some("attention"));
    }

    #[test]
    fn split_orphans_keeps_plans_whose_tab_lives_in_any_window() {
        let known = std::collections::HashSet::from(["tab-a".to_string(), "tab-c".to_string()]);
        let (kept, orphans) = split_orphans(vec![plan("tab-a"), plan("tab-b"), plan("tab-c")], &known);
        assert_eq!(kept.iter().map(|p| p.tab_id.as_str()).collect::<Vec<_>>(), vec!["tab-a", "tab-c"]);
        assert_eq!(orphans.iter().map(|p| p.tab_id.as_str()).collect::<Vec<_>>(), vec!["tab-b"]);
    }

    #[test]
    fn split_orphans_with_no_known_tabs_orphans_everything() {
        let (kept, orphans) = split_orphans(vec![plan("tab-a")], &std::collections::HashSet::new());
        assert!(kept.is_empty());
        assert_eq!(orphans.len(), 1);
    }
}
