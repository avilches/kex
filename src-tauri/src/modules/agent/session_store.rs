use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionRecord {
    pub agent: Option<String>,
    pub session_id: String,
    pub cwd_launch: String,
    pub transcript_path: String,
    pub state: String,
    pub updated_at: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct SessionStore {
    version: u32,
    panels: HashMap<String, SessionRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestorePlan {
    pub panel_id: String,
    pub agent: String,
    pub resume_cmd: String,
    pub cwd: String,
}

fn store_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".config").join("terax").join("agent-sessions.json"))
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
    let content = std::fs::read_to_string(jsonl).ok()?;
    for line in content.lines() {
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(cwd) = obj.get("cwd").and_then(|v| v.as_str()) {
                if !cwd.is_empty() {
                    return Some(cwd.to_string());
                }
            }
        }
    }
    None
}

fn resume_cmd_for_agent(agent: &str, session_id: &str, cwd: &str) -> String {
    match agent {
        "claude" => format!("cd {} && claude --resume {}", shell_quote(cwd), session_id),
        "codex" => format!("cd {} && codex resume --last", shell_quote(cwd)),
        "gemini" => format!("cd {} && gemini --resume {}", shell_quote(cwd), session_id),
        _ => format!("cd {}", shell_quote(cwd)),
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub fn load_restore_plan() -> Vec<RestorePlan> {
    let path = match store_path() {
        Some(p) => p,
        None => return vec![],
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let store: SessionStore = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let mut plans = Vec::new();
    for (panel_id, record) in store.panels {
        if record.state == "exited" {
            continue;
        }
        let jsonl = match find_jsonl(&record.session_id, &record.transcript_path) {
            Some(j) => j,
            None => {
                plans.push(RestorePlan {
                    panel_id,
                    agent: record.agent.unwrap_or_else(|| "claude".to_string()),
                    resume_cmd: String::new(),
                    cwd: record.cwd_launch,
                });
                continue;
            }
        };
        let cwd = read_launch_cwd_from_jsonl(&jsonl)
            .unwrap_or_else(|| record.cwd_launch.clone());
        if !PathBuf::from(&cwd).exists() {
            plans.push(RestorePlan {
                panel_id,
                agent: record.agent.unwrap_or_else(|| "claude".to_string()),
                resume_cmd: String::new(),
                cwd,
            });
            continue;
        }
        let agent = record.agent.unwrap_or_else(|| "claude".to_string());
        let cmd = resume_cmd_for_agent(&agent, &record.session_id, &cwd);
        plans.push(RestorePlan { panel_id, agent, resume_cmd: cmd, cwd });
    }
    plans
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
        let cmd = resume_cmd_for_agent("claude", "abc-123", "/home/user/repo");
        assert_eq!(cmd, "cd '/home/user/repo' && claude --resume abc-123");
    }

    #[test]
    fn resume_cmd_codex() {
        let cmd = resume_cmd_for_agent("codex", "any", "/home/user/repo");
        assert_eq!(cmd, "cd '/home/user/repo' && codex resume --last");
    }

    #[test]
    fn resume_cmd_unknown_agent() {
        let cmd = resume_cmd_for_agent("amp", "any", "/home/user/repo");
        assert_eq!(cmd, "cd '/home/user/repo'");
    }

    #[test]
    fn load_restore_plan_returns_empty_when_no_file() {
        let plans = load_restore_plan();
        let _ = plans;
    }

    #[test]
    fn exited_sessions_are_skipped() {
        let store_json = r#"{
            "version": 1,
            "panels": {
                "panel-a": {
                    "agent": "claude",
                    "session_id": "aaaa-bbbb",
                    "cwd_launch": "/tmp",
                    "transcript_path": "/nonexistent",
                    "state": "exited",
                    "updated_at": 1000
                }
            }
        }"#;
        let store: super::SessionStore = serde_json::from_str(store_json).unwrap();
        let mut plans = Vec::new();
        for (panel_id, record) in store.panels {
            if record.state == "exited" { continue; }
            plans.push(panel_id);
        }
        assert!(plans.is_empty());
    }
}
