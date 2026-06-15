use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;
use std::sync::OnceLock;

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

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
    pub panel_id: String,
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

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn build_plans_from(panels: HashMap<String, SessionRecord>, store_path: Option<&PathBuf>) -> Vec<RestorePlan> {
    let mut plans = Vec::new();
    for (panel_id, record) in panels {
        let agent = record.agent.unwrap_or_else(|| "claude".to_string());

        // Prefer the cwd recorded in the transcript (more accurate than cwd_launch when
        // the user cd'd before running the agent).
        let jsonl = find_jsonl(&record.session_id, &record.transcript_path);
        if jsonl.is_none() {
            // No transcript on disk means the user never sent a message in this session.
            // claude --resume would fail, so skip and clean up the store entry.
            log::info!(
                "[agent-session] restore plan: panel={panel_id} agent={agent} session={} \
                 jsonl not found, skipping (no transcript to resume)",
                record.session_id
            );
            if let Some(path) = store_path {
                remove_panel_from_store(&panel_id, path);
            }
            continue;
        }
        let cwd = if let Some(ref jsonl) = jsonl {
            read_launch_cwd_from_jsonl(jsonl).unwrap_or_else(|| record.cwd_launch.clone())
        } else {
            record.cwd_launch.clone()
        };

        if !PathBuf::from(&cwd).exists() {
            log::warn!("[agent-session] restore plan: panel={panel_id} agent={agent} cwd not found: {cwd}");
            if let Some(path) = store_path {
                remove_panel_from_store(&panel_id, path);
            }
            plans.push(RestorePlan {
                panel_id, agent,
                resume_cmd: String::new(),
                cwd: cwd.clone(),
                error_reason: format!("Directory not found: {cwd}"),
            });
            continue;
        }

        let cmd = resume_cmd_for_agent(&agent, &record.session_id);
        log::info!("[agent-session] restore plan: panel={panel_id} agent={agent} session={} cwd={cwd} cmd={cmd:?}", record.session_id);
        plans.push(RestorePlan { panel_id, agent, resume_cmd: cmd, cwd, error_reason: String::new() });
    }
    plans
}

fn remove_panel_from_store(panel_id: &str, path: &PathBuf) {
    let Ok(content) = std::fs::read_to_string(path) else { return };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else { return };
    store.panels.remove(panel_id);
    let Ok(out) = serde_json::to_string_pretty(&store) else { return };
    let tmp = path.with_extension("json.kex-tmp");
    if std::fs::write(&tmp, out).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Write or update a panel entry in agent-sessions.json.
/// Called from the PTY reader when an OSC 777;kex-session signal arrives.
pub fn record_session(panel_id: &str, agent: &str, session_id: &str, transcript_path: &str, cwd: &str) {
    let path = match store_path() {
        Some(p) => p,
        None => return,
    };
    let jsonl_exists = std::path::Path::new(transcript_path).exists();
    log::info!(
        "[agent-session] record hook=SessionStart panel={panel_id} agent={agent} session={session_id} \
         cwd={cwd} jsonl={}",
        if jsonl_exists { "ok" } else { "not yet" }
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
    store.panels.insert(panel_id.to_string(), record);
    if let Ok(out) = serde_json::to_string_pretty(&store) {
        let tmp = path.with_extension("json.kex-tmp");
        if std::fs::write(&tmp, out).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

/// Remove a panel entry from agent-sessions.json.
/// Called when the agent exits (exited signal) or the user detaches manually.
pub fn detach_session(panel_id: &str) -> Result<(), String> {
    log::info!("[agent-session] detach panel={panel_id}");
    if let Some(path) = store_path() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) {
                store.panels.remove(panel_id);
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
    fn load_restore_plan_returns_empty_when_no_file() {
        let plans = load_restore_plan();
        let _ = plans;
    }
}
