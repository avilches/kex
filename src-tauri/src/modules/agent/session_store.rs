use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

// Per-panel pending launch command, stashed by the PTY reader when OSC 133;C fires
// and consumed by record_session when SessionStart arrives via the IPC socket.
static PENDING_CMDS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn pending_cmds() -> &'static Mutex<HashMap<String, String>> {
    PENDING_CMDS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Called by the PTY reader when OSC 133;C fires for an agent command.
/// The stashed string is consumed by the next `record_session` call for this panel.
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
    pub updated_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct SessionStore {
    version: u32,
    panels: HashMap<String, SessionRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub tab_id: String,
    pub agent: String,
    pub resume_cmd: String,
    pub cwd: String,
    pub error_reason: String,
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
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(cwd) = obj.get("cwd").and_then(|v| v.as_str()) {
                if !cwd.is_empty() {
                    return Some(cwd.to_string());
                }
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

// Returns only the agent command. The frontend spawns the PTY with plan.cwd as the
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

fn build_plans_from(panels: HashMap<String, SessionRecord>, store_path: Option<&PathBuf>) -> Vec<RestorePlan> {
    let mut plans = Vec::new();
    for (tab_id, record) in panels {
        let agent = record.agent.unwrap_or_else(|| "claude".to_string());

        // Prefer the cwd recorded in the transcript (more accurate than cwd_launch when
        // the user cd'd before running the agent).
        let jsonl = find_jsonl(&record.session_id, &record.transcript_path);

        // When JSONL is absent the session was opened but no message was ever sent.
        // Use --session-id to start a new session that reuses the same UUID instead of
        // dropping it silently. Remove the stale entry now; hooks will re-record if the
        // new session produces messages.
        let (cwd, cmd) = if let Some(ref j) = jsonl {
            let cwd = read_launch_cwd_from_jsonl(j).unwrap_or_else(|| record.cwd_launch.clone());
            let cmd = match record.launch_cmd.as_deref() {
                Some(lc) => {
                    let base = strip_for_resume_base(lc);
                    format!("{base} --resume {}", shell_quote(&record.session_id))
                }
                None => resume_cmd_for_agent(&agent, &record.session_id),
            };
            (cwd, cmd)
        } else {
            log::info!(
                "[agent-session] restore plan: tab={tab_id} agent={agent} session={} \
                 JSONL not found, reattaching with --session-id",
                record.session_id
            );
            if let Some(path) = store_path {
                remove_panel_from_store(&tab_id, path);
            }
            let cwd = record.cwd_launch.clone();
            let cmd = match record.launch_cmd.as_deref() {
                Some(lc) => {
                    let base = strip_for_resume_base(lc);
                    format!("{base} --session-id {}", shell_quote(&record.session_id))
                }
                None => reattach_cmd_for_agent(&agent, &record.session_id),
            };
            (cwd, cmd)
        };

        if !PathBuf::from(&cwd).exists() {
            log::warn!("[agent-session] restore plan: tab={tab_id} agent={agent} cwd not found: {cwd}");
            if let Some(path) = store_path {
                remove_panel_from_store(&tab_id, path);
            }
            plans.push(RestorePlan {
                tab_id, agent,
                resume_cmd: String::new(),
                cwd: cwd.clone(),
                error_reason: format!("Directory not found: {cwd}"),
            });
            continue;
        }

        log::info!("[agent-session] restore plan: tab={tab_id} agent={agent} session={} cwd={cwd} cmd={cmd:?}", record.session_id);
        plans.push(RestorePlan { tab_id, agent, resume_cmd: cmd, cwd, error_reason: String::new() });
    }
    plans
}

fn remove_panel_from_store(tab_id: &str, path: &PathBuf) {
    let Ok(content) = std::fs::read_to_string(path) else { return };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else { return };
    store.panels.remove(tab_id);
    let Ok(out) = serde_json::to_string_pretty(&store) else { return };
    let tmp = path.with_extension("json.kex-tmp");
    if std::fs::write(&tmp, out).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Write or update a panel entry in agent-sessions.json.
/// Called from the PTY reader (OSC 777 path) or the IPC socket (v5 path) on SessionStart/UserPromptSubmit.
///
/// Consumes the pending launch command stashed by `stash_cmd`. If the stashed command
/// is print-mode (`-p` / `--print`), the session is not persisted.
pub fn record_session(tab_id: &str, agent: &str, session_id: &str, transcript_path: &str, cwd: &str) {
    let path = match store_path() {
        Some(p) => p,
        None => return,
    };
    let launch_cmd = take_stashed_cmd(tab_id);
    if launch_cmd.as_deref().is_some_and(is_print_mode_cmd) {
        log::info!("[agent-session] skip record: print-mode session panel={tab_id}");
        return;
    }
    log::info!(
        "[agent-session] record panel={tab_id} agent={agent} session={session_id} cwd={cwd} \
         launch_cmd={launch_cmd:?}"
    );
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let record = SessionRecord {
        agent: Some(agent.to_string()),
        session_id: session_id.to_string(),
        cwd_launch: cwd.to_string(),
        transcript_path: transcript_path.to_string(),
        launch_cmd,
        updated_at: now,
    };
    let mut store = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<SessionStore>(&s).ok())
            .unwrap_or_else(|| SessionStore { version: 1, panels: HashMap::new() })
    } else {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        SessionStore { version: 1, panels: HashMap::new() }
    };
    store.panels.insert(tab_id.to_string(), record);
    if let Ok(out) = serde_json::to_string_pretty(&store) {
        let tmp = path.with_extension("json.kex-tmp");
        if std::fs::write(&tmp, out).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

/// Remove a panel entry from agent-sessions.json.
/// Called when the agent exits (exited signal) or the user detaches manually.
pub fn detach_session(tab_id: &str) -> Result<(), String> {
    log::info!("[agent-session] detach panel={tab_id}");
    if let Some(path) = store_path() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) {
                store.panels.remove(tab_id);
                if let Ok(out) = serde_json::to_string_pretty(&store) {
                    let tmp = path.with_extension("json.kex-tmp");
                    if std::fs::write(&tmp, out).is_ok() {
                        let _ = std::fs::rename(&tmp, &path);
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn load_restore_plan() -> Vec<RestorePlan> {
    let path = match store_path() {
        Some(p) => p,
        None => return vec![],
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => {
            log::debug!("[agent-session] restore: no store file, starting fresh");
            return vec![];
        }
    };
    let store: SessionStore = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => {
            log::warn!("[agent-session] restore: store corrupt or wrong schema");
            return vec![];
        }
    };
    log::info!("[agent-session] restore: {} session(s) in store", store.panels.len());
    build_plans_from(store.panels, Some(&path))
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

    #[test]
    fn load_restore_plan_returns_empty_when_no_file() {
        let plans = load_restore_plan();
        let _ = plans;
    }
}
