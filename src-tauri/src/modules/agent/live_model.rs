use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use tauri::{AppHandle, Emitter};

pub const AGENT_MODEL_EVENT: &str = "kex:agent-model";

// The newest assistant entry is always within the last few turns, so reading the tail keeps a
// multi-megabyte transcript from being loaded at every Stop.
const TAIL_BYTES: u64 = 256 * 1024;

/// Model of the newest main-thread assistant message in a JSONL transcript. Subagent turns
/// (`isSidechain`) and Claude Code's own placeholder messages do not say what the user runs.
pub fn last_assistant_model(jsonl: &str) -> Option<String> {
    jsonl.lines().rev().find_map(|line| {
        let v: serde_json::Value = serde_json::from_str(line).ok()?;
        if v["type"] != "assistant" || v["isSidechain"] == true {
            return None;
        }
        let model = v["message"]["model"].as_str()?;
        (!model.is_empty() && model != "<synthetic>").then(|| model.to_string())
    })
}

fn model_from_transcript(path: &str) -> Option<String> {
    let path = Path::new(path);
    if !path.is_absolute() || path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return None;
    }
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(TAIL_BYTES))).ok()?;
    let mut tail = Vec::with_capacity(TAIL_BYTES as usize);
    file.take(TAIL_BYTES).read_to_end(&mut tail).ok()?;
    last_assistant_model(&String::from_utf8_lossy(&tail))
}

/// Reads the model off the transcript without blocking the caller and tells the frontend.
/// Nothing is emitted when no model can be found, so the last known one stays.
pub fn emit_live_model(app: &AppHandle, tab_id: &str, transcript_path: &str) {
    if tab_id.is_empty() || transcript_path.is_empty() {
        return;
    }
    let app = app.clone();
    let tab_id = tab_id.to_string();
    let path = transcript_path.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(model) = model_from_transcript(&path) {
            let _ = app.emit(
                AGENT_MODEL_EVENT,
                serde_json::json!({ "tabId": tab_id, "model": model }),
            );
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assistant(model: &str, extra: &str) -> String {
        format!(r#"{{"type":"assistant"{extra},"message":{{"model":"{model}","role":"assistant"}}}}"#)
    }

    #[test]
    fn takes_the_newest_assistant_message() {
        let t = [assistant("claude-opus-4-1", ""), r#"{"type":"user"}"#.into(), assistant("claude-sonnet-4-6", "")].join("\n");
        assert_eq!(last_assistant_model(&t).as_deref(), Some("claude-sonnet-4-6"));
    }

    #[test]
    fn skips_subagent_and_synthetic_messages() {
        let t = [
            assistant("claude-opus-4-1", ""),
            assistant("claude-haiku-4-5", r#","isSidechain":true"#),
            assistant("<synthetic>", ""),
        ]
        .join("\n");
        assert_eq!(last_assistant_model(&t).as_deref(), Some("claude-opus-4-1"));
    }

    #[test]
    fn tolerates_a_cut_first_line_and_garbage() {
        let t = format!("ode\":\"x\"}}}}\nnot json\n{}\n", assistant("claude-opus-4-1", ""));
        assert_eq!(last_assistant_model(&t).as_deref(), Some("claude-opus-4-1"));
        assert_eq!(last_assistant_model("{\"type\":\"user\"}\n"), None);
    }

    #[test]
    fn reads_only_absolute_jsonl_paths_and_the_tail_of_big_files() {
        assert_eq!(model_from_transcript("relative.jsonl"), None);
        assert_eq!(model_from_transcript("/etc/passwd"), None);
        let dir = std::env::temp_dir().join(format!("kex-live-model-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("t.jsonl");
        let filler = format!("{}\n", assistant("claude-opus-4-1", "")).repeat(10_000);
        std::fs::write(&file, format!("{filler}{}\n", assistant("claude-sonnet-4-6", ""))).unwrap();
        assert!(std::fs::metadata(&file).unwrap().len() > TAIL_BYTES);
        assert_eq!(model_from_transcript(file.to_str().unwrap()).as_deref(), Some("claude-sonnet-4-6"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
