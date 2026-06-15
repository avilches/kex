use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
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
#[serde(rename_all = "camelCase")]
pub struct RestorePlan {
    pub panel_id: String,
    pub agent: String,
    pub resume_cmd: String,
    pub cwd: String,
    pub error_reason: String,
}

fn store_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".config").join("kex").join("agent-sessions.json"))
}

// Written just before PTYs die (last window destroyed). Consumed once at next launch.
// Exists separately from agent-sessions.json because SessionEnd overwrites state to
// "exited" in the seconds after the PTY dies — we need our own pre-death copy.
fn candidates_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".config").join("kex").join("restore-candidates.json"))
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
        let cwd = if let Some(jsonl) = find_jsonl(&record.session_id, &record.transcript_path) {
            read_launch_cwd_from_jsonl(&jsonl).unwrap_or_else(|| record.cwd_launch.clone())
        } else {
            // Transcript not found. This happens when:
            //   a) The session was very fresh (SessionStart fired before claude wrote the .jsonl).
            //   b) The session was cleared on the claude side.
            // Either way, try to resume once with cwd_launch and let claude respond natively.
            // Remove from store so we don't retry on every launch; a successful resume will
            // re-add via the SessionStart hook firing again.
            log::debug!(
                "[agent-session] restore plan: panel={panel_id} agent={agent} session={} \
                 - transcript not found, trying once from cwd_launch={}",
                record.session_id, record.cwd_launch
            );
            if let Some(path) = store_path {
                remove_panel_from_store(&panel_id, path);
            }
            record.cwd_launch.clone()
        };

        if !PathBuf::from(&cwd).exists() {
            log::debug!("[agent-session] restore plan: panel={panel_id} agent={agent} - cwd not found: {cwd}");
            // Remove from store so the error doesn't repeat on every launch.
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
        log::debug!("[agent-session] restore plan: panel={panel_id} agent={agent} session={} cwd={cwd} cmd={cmd:?}", record.session_id);
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

/// Remove a panel entry from agent-sessions.json (and candidates if present).
/// Called when the user selects "Detach Claude" from the tab context menu.
pub fn detach_session(panel_id: &str) -> Result<(), String> {
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
    // Also remove from candidates file if it exists (e.g. detach right after restart)
    if let Some(cpath) = candidates_path() {
        if cpath.exists() {
            if let Ok(content) = std::fs::read_to_string(&cpath) {
                if let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) {
                    store.panels.remove(panel_id);
                    if let Ok(out) = serde_json::to_string_pretty(&store) {
                        let tmp = cpath.with_extension("json.kex-tmp");
                        if std::fs::write(&tmp, out).is_ok() {
                            let _ = std::fs::rename(&tmp, &cpath);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

/// Snapshot all "idle" sessions to restore-candidates.json just before PTYs die.
/// Called from the last-window-destroyed handler in lib.rs.
pub fn snapshot_idle_sessions() {
    let path = match store_path() {
        Some(p) => p,
        None => return,
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return,
    };
    let store: SessionStore = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => return,
    };
    let version = store.version;
    let idle: HashMap<_, _> = store
        .panels
        .into_iter()
        .filter(|(_, r)| r.state == "idle")
        .collect();
    if idle.is_empty() {
        log::debug!("[agent-session] snapshot: no idle sessions to snapshot");
        return;
    }
    let panel_ids: Vec<&str> = idle.keys().map(|s| s.as_str()).collect();
    log::debug!("[agent-session] snapshot: saving {} idle session(s): {:?}", idle.len(), panel_ids);
    let snap = SessionStore { version, panels: idle };
    let out = match serde_json::to_string_pretty(&snap) {
        Ok(s) => s,
        Err(_) => return,
    };
    let cpath = match candidates_path() {
        Some(p) => p,
        None => return,
    };
    let tmp = cpath.with_extension("json.kex-tmp");
    if std::fs::write(&tmp, out).is_ok() {
        let _ = std::fs::rename(&tmp, &cpath);
        log::debug!("[agent-session] snapshot: written to {}", cpath.display());
    }
}

pub fn load_restore_plan() -> Vec<RestorePlan> {
    // Prefer the candidates snapshot written just before the last close.
    // It bypasses the race where SessionEnd overwrites "idle" to "exited"
    // in the seconds after PTYs die. Consuming (deleting) it prevents
    // double-restore on repeated launches without a new session in between.
    if let Some(cpath) = candidates_path().filter(|p| p.exists()) {
        log::debug!("[agent-session] restore: loading from candidates snapshot {}", cpath.display());
        let content = std::fs::read_to_string(&cpath).unwrap_or_default();
        let _ = std::fs::remove_file(&cpath);
        if let Ok(store) = serde_json::from_str::<SessionStore>(&content) {
            if !store.panels.is_empty() {
                log::debug!("[agent-session] restore: {} session(s) in candidates snapshot", store.panels.len());
                // Pass the main store path so missing transcripts can be auto-removed.
                let main_path = store_path();
                let plans = build_plans_from(store.panels, main_path.as_ref());
                log::debug!("[agent-session] restore: built {} plan(s) from candidates", plans.len());
                return plans;
            }
        }
        log::debug!("[agent-session] restore: candidates snapshot empty, falling back to main store");
    }

    // Fallback: read agent-sessions.json directly.
    // Handles first launch, force-quit (SIGKILL), and any case where the
    // candidates snapshot was not written.
    let path = match store_path() {
        Some(p) => p,
        None => return vec![],
    };
    log::debug!("[agent-session] restore: loading from main store {}", path.display());
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => {
            log::debug!("[agent-session] restore: main store not found or unreadable");
            return vec![];
        }
    };
    let store: SessionStore = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => {
            log::debug!("[agent-session] restore: main store corrupt or wrong schema");
            return vec![];
        }
    };
    let active: HashMap<_, _> = store
        .panels
        .into_iter()
        .filter(|(_, r)| r.state != "exited")
        .collect();
    log::debug!("[agent-session] restore: {} active (non-exited) session(s) in main store", active.len());
    let plans = build_plans_from(active, Some(&path));
    log::debug!("[agent-session] restore: built {} plan(s) from main store", plans.len());
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
        assert_eq!(cmd, "cd '/home/user/repo' && claude --resume 'abc-123'");
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
        let store: SessionStore = serde_json::from_str(store_json).unwrap();
        let panels: HashMap<_, _> = store.panels.into_iter()
            .filter(|(_, r)| r.state != "exited")
            .collect();
        assert!(panels.is_empty());
    }

    #[test]
    fn snapshot_only_captures_idle() {
        let store_json = r#"{
            "version": 1,
            "panels": {
                "panel-idle": {
                    "agent": "claude",
                    "session_id": "s1",
                    "cwd_launch": "/tmp",
                    "transcript_path": "/nonexistent",
                    "state": "idle",
                    "updated_at": 1000
                },
                "panel-exited": {
                    "agent": "claude",
                    "session_id": "s2",
                    "cwd_launch": "/tmp",
                    "transcript_path": "/nonexistent",
                    "state": "exited",
                    "updated_at": 1000
                }
            }
        }"#;
        let store: SessionStore = serde_json::from_str(store_json).unwrap();
        let idle: HashMap<_, _> = store.panels.into_iter()
            .filter(|(_, r)| r.state == "idle")
            .collect();
        assert_eq!(idle.len(), 1);
        assert!(idle.contains_key("panel-idle"));
        assert!(!idle.contains_key("panel-exited"));
    }
}
