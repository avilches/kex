//! Kex's handlers inside Codex's `hooks.json`, as pure text-to-text functions.
//!
//! The file is shared with other tools, so a handler is Kex's only if its command carries
//! `# kex-session-hook`; everything else is never modified. A file that already holds Kex's
//! current handlers comes back byte for byte. Otherwise only the changed values are patched in
//! the text (`json_patch`), so whitespace, `\/` escapes and key order of everything else stay.

use serde_json::{json, Map, Value};

use super::codex_trust::{CodexHookEvent, TrustEntry};

pub const SESSION_HOOK_MARKER: &str = "kex-session-hook";
pub const DEFAULT_SCRIPT_PATH: &str = "$HOME/.config/kex/hooks/trigger-event.sh";
const HOOK_TIMEOUT_SEC: u64 = 10;

pub const KEX_EVENTS: [CodexHookEvent; 6] = [
    CodexHookEvent::SessionStart,
    CodexHookEvent::UserPromptSubmit,
    CodexHookEvent::Stop,
    CodexHookEvent::PermissionRequest,
    CodexHookEvent::SubagentStart,
    CodexHookEvent::SubagentStop,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    NotInstalled,
    UpToDate,
    Outdated,
    Malformed,
}

// The "codex" argument is how trigger-event.sh tags the frame's agent.
fn hook_command(script_path: &str) -> String {
    format!(r#"[ -n "$KEX_TAB_ID" ] && "{script_path}" codex || true  # {SESSION_HOOK_MARKER}"#)
}

fn kex_handler(script_path: &str) -> Value {
    json!({ "type": "command", "command": hook_command(script_path), "timeout": HOOK_TIMEOUT_SEC })
}

fn is_kex_handler(handler: &Value) -> bool {
    handler
        .get("command")
        .and_then(Value::as_str)
        .is_some_and(|c| c.contains(SESSION_HOOK_MARKER))
}

fn parse(hooks_json: &str) -> Result<Value, String> {
    if hooks_json.trim().is_empty() {
        return Ok(json!({}));
    }
    let root: Value = serde_json::from_str(hooks_json)
        .map_err(|e| format!("hooks.json is not valid JSON: {e}"))?;
    if !root.is_object() {
        return Err("hooks.json is not a JSON object".into());
    }
    Ok(root)
}

fn render(original: &str, root: &Value) -> String {
    super::json_patch::patch(original, root)
}

fn events_map(root: &mut Value) -> Result<&mut Map<String, Value>, String> {
    let hooks = root
        .as_object_mut()
        .ok_or("hooks.json is not a JSON object")?
        .entry("hooks")
        .or_insert_with(|| json!({}));
    hooks
        .as_object_mut()
        .ok_or_else(|| "\"hooks\" is not an object".to_string())
}

/// `source_path` is the `hooks.json` path recorded in the returned trust entries.
pub fn install(
    hooks_json: &str,
    script_path: &str,
    source_path: &str,
) -> Result<(String, Vec<TrustEntry>), String> {
    let original = parse(hooks_json)?;
    let mut root = original.clone();
    let events = events_map(&mut root)?;
    let mut entries = Vec::new();
    for event in KEX_EVENTS {
        let name = event.hooks_json_name();
        let groups = events
            .entry(name)
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .ok_or_else(|| format!("\"{name}\" is not an array"))?;
        let (group_index, handler_index) = place(groups, script_path);
        let matcher = groups[group_index]
            .get("matcher")
            .and_then(Value::as_str)
            .map(str::to_string);
        entries.push(kex_trust_entry(
            source_path,
            event,
            group_index,
            handler_index,
            matcher,
            script_path,
        ));
    }
    // Map equality ignores key order, so a file another tool wrote in its own style
    // (Kaji sorts keys and escapes slashes) is only rewritten for a real change.
    let text = if root == original {
        hooks_json.to_string()
    } else {
        render(hooks_json, &root)
    };
    Ok((text, entries))
}

/// The trust identity of a Kex handler at the given position.
pub fn kex_trust_entry(
    source_path: &str,
    event: CodexHookEvent,
    group_index: usize,
    handler_index: usize,
    matcher: Option<String>,
    script_path: &str,
) -> TrustEntry {
    TrustEntry {
        source_path: source_path.to_string(),
        event,
        group_index,
        handler_index,
        command: hook_command(script_path),
        timeout_sec: Some(HOOK_TIMEOUT_SEC),
        is_async: false,
        matcher,
        status_message: None,
        additional_context_limit: None,
    }
}

/// Where every Kex handler sits now, in any event, as `(event, group, handler)`.
pub fn kex_positions(hooks_json: &str) -> Result<Vec<(CodexHookEvent, usize, usize)>, String> {
    let root = parse(hooks_json)?;
    let mut out = Vec::new();
    let Some(events) = root.get("hooks").and_then(Value::as_object) else {
        return Ok(out);
    };
    for (name, groups) in events {
        let Some(event) = CodexHookEvent::from_hooks_json_name(name) else {
            continue;
        };
        for (gi, group) in groups.as_array().into_iter().flatten().enumerate() {
            let handlers = group.get("hooks").and_then(Value::as_array);
            for (hi, handler) in handlers.into_iter().flatten().enumerate() {
                if is_kex_handler(handler) {
                    out.push((event, gi, hi));
                }
            }
        }
    }
    Ok(out)
}

// Refreshes the first Kex handler in place (dropping duplicates) or appends a new group.
fn place(groups: &mut Vec<Value>, script_path: &str) -> (usize, usize) {
    let mut found: Option<(usize, usize)> = None;
    for (gi, group) in groups.iter_mut().enumerate() {
        let Some(handlers) = group.get_mut("hooks").and_then(Value::as_array_mut) else {
            continue;
        };
        let mut hi = 0;
        while hi < handlers.len() {
            if !is_kex_handler(&handlers[hi]) {
                hi += 1;
            } else if found.is_none() {
                handlers[hi] = kex_handler(script_path);
                found = Some((gi, hi));
                hi += 1;
            } else {
                handlers.remove(hi);
            }
        }
    }
    found.unwrap_or_else(|| {
        groups.push(json!({ "hooks": [kex_handler(script_path)] }));
        (groups.len() - 1, 0)
    })
}

/// Returns the input untouched when nothing of Kex's is present; malformed JSON is an error.
pub fn remove(hooks_json: &str) -> Result<String, String> {
    let mut root = parse(hooks_json)?;
    let Some(events) = root.get_mut("hooks").and_then(Value::as_object_mut) else {
        return Ok(hooks_json.to_string());
    };
    let mut changed = false;
    for event in KEX_EVENTS {
        let name = event.hooks_json_name();
        let Some(groups) = events.get_mut(name).and_then(Value::as_array_mut) else {
            continue;
        };
        let mut emptied = Vec::new();
        for (gi, group) in groups.iter_mut().enumerate() {
            if let Some(handlers) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                let n = handlers.len();
                handlers.retain(|h| !is_kex_handler(h));
                if handlers.len() != n {
                    changed = true;
                    if handlers.is_empty() {
                        emptied.push(gi);
                    }
                }
            }
        }
        // Group indexes are part of Codex trust keys, so only trailing groups Kex emptied can
        // go; one followed by another group stays as an inert empty group to keep it in place.
        while groups
            .len()
            .checked_sub(1)
            .is_some_and(|last| emptied.contains(&last))
        {
            groups.pop();
        }
        if groups.is_empty() && !emptied.is_empty() {
            events.remove(name);
        }
    }
    Ok(if changed {
        render(hooks_json, &root)
    } else {
        hooks_json.to_string()
    })
}

pub fn status(hooks_json: &str, script_path: &str) -> Status {
    let Ok(root) = parse(hooks_json) else {
        return Status::Malformed;
    };
    let expected = kex_handler(script_path);
    let mut present = 0;
    let mut current = 0;
    for event in KEX_EVENTS {
        let ours: Vec<&Value> = root
            .get("hooks")
            .and_then(|h| h.get(event.hooks_json_name()))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|g| g.get("hooks").and_then(Value::as_array))
            .flatten()
            .filter(|h| is_kex_handler(h))
            .collect();
        if !ours.is_empty() {
            present += 1;
        }
        if ours.len() == 1 && *ours[0] == expected {
            current += 1;
        }
    }
    if present == 0 {
        Status::NotInstalled
    } else if current == KEX_EVENTS.len() {
        Status::UpToDate
    } else {
        Status::Outdated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/codex/hooks.json");
    const SRC: &str = "/home/u/.codex/hooks.json";

    fn value(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    fn foreign_handlers(root: &Value) -> Vec<(String, usize, Value)> {
        let mut out = Vec::new();
        for (event, groups) in root["hooks"].as_object().unwrap() {
            for (gi, group) in groups.as_array().unwrap().iter().enumerate() {
                for h in group["hooks"].as_array().unwrap() {
                    if !is_kex_handler(h) {
                        out.push((event.clone(), gi, h.clone()));
                    }
                }
            }
        }
        out
    }

    #[test]
    fn install_leaves_foreign_handlers_identical() {
        let (out, _) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(
            foreign_handlers(&value(FIXTURE)),
            foreign_handlers(&value(&out))
        );
        assert!(out.contains("orca-agent-hook-form"));
        assert!(out.contains("kaji-activity-hook"));
    }

    #[test]
    fn install_reports_real_positions() {
        let before = value(FIXTURE);
        let (out, entries) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        let after = value(&out);
        assert_eq!(entries.len(), 6);
        for e in entries {
            let name = e.event.hooks_json_name();
            let h = &after["hooks"][name][e.group_index]["hooks"][e.handler_index];
            assert_eq!(h["command"], e.command.as_str());
            assert_eq!(h["timeout"], 10);
            let old = before["hooks"][name].as_array().map_or(0, |a| a.len());
            assert_eq!(e.group_index, old);
        }
    }

    #[test]
    fn install_is_idempotent() {
        let (once, e1) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        let (twice, e2) = install(&once, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(once, twice);
        assert_eq!(e1, e2);
    }

    fn sorted(v: &Value) -> Value {
        match v {
            Value::Object(map) => {
                let mut keys: Vec<&String> = map.keys().collect();
                keys.sort();
                Value::Object(
                    keys.into_iter()
                        .map(|k| (k.clone(), sorted(&map[k])))
                        .collect(),
                )
            }
            Value::Array(items) => Value::Array(items.iter().map(sorted).collect()),
            other => other.clone(),
        }
    }

    // How Kaji (Swift's JSONSerialization) writes the file: sorted keys, " : " and \/ escapes.
    fn swift_style(v: &Value) -> String {
        serde_json::to_string_pretty(&sorted(v))
            .unwrap()
            .lines()
            .map(|line| line.replacen("\": ", "\" : ", 1))
            .collect::<Vec<_>>()
            .join("\n")
            .replace('/', "\\/")
    }

    #[test]
    fn install_keeps_the_bytes_when_only_formatting_differs() {
        let (installed, entries) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        let swift = swift_style(&value(&installed));
        assert_eq!(value(&swift), value(&installed));
        assert_ne!(swift, installed);
        let (out, again) = install(&swift, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(out, swift);
        assert_eq!(again, entries);
    }

    #[test]
    fn install_still_rewrites_a_swift_style_file_with_a_real_change() {
        let (stale, _) = install(FIXTURE, "/old/trigger.sh", SRC).unwrap();
        let swift = swift_style(&value(&stale));
        let (out, _) = install(&swift, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_ne!(out, swift);
        assert_eq!(status(&out, DEFAULT_SCRIPT_PATH), Status::UpToDate);
    }

    #[test]
    fn install_handles_missing_and_empty_events() {
        let (out, entries) = install("", DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(entries.len(), 6);
        assert!(entries
            .iter()
            .all(|e| e.group_index == 0 && e.handler_index == 0));
        assert_eq!(status(&out, DEFAULT_SCRIPT_PATH), Status::UpToDate);
        let (out2, _) = install(r#"{"hooks":{"Stop":[]}}"#, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(value(&out2)["hooks"]["Stop"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn install_refreshes_a_stale_handler_in_place() {
        let (once, _) = install(FIXTURE, "/old/trigger.sh", SRC).unwrap();
        let (again, entries) = install(&once, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(status(&again, DEFAULT_SCRIPT_PATH), Status::UpToDate);
        assert!(!again.contains("/old/trigger.sh"));
        assert_eq!(entries.len(), 6);
    }

    #[test]
    fn remove_only_removes_kex() {
        let (installed, _) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        let removed = remove(&installed).unwrap();
        assert!(!removed.contains(SESSION_HOOK_MARKER));
        assert_eq!(value(&removed), value(FIXTURE));
        assert_eq!(status(&removed, DEFAULT_SCRIPT_PATH), Status::NotInstalled);
    }

    #[test]
    fn remove_without_kex_returns_input_unchanged() {
        assert_eq!(remove(FIXTURE).unwrap(), FIXTURE);
    }

    fn kex_group() -> Value {
        json!({ "hooks": [kex_handler(DEFAULT_SCRIPT_PATH)] })
    }

    fn orca_group() -> Value {
        json!({ "hooks": [{ "type": "command", "command": "orca", "timeout": 3 }] })
    }

    #[test]
    fn remove_keeps_foreign_group_positions_after_a_kex_group() {
        let src = json!({ "hooks": { "Stop": [kex_group(), orca_group()] } }).to_string();
        let removed = value(&remove(&src).unwrap());
        let groups = removed["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[1], orca_group());

        let base = json!({ "hooks": { "Stop": [orca_group()] } }).to_string();
        let (installed, _) = install(&base, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        let back = value(&remove(&installed).unwrap());
        assert_eq!(back["hooks"]["Stop"], json!([orca_group()]));
    }

    #[test]
    fn remove_never_drops_preexisting_empty_foreign_groups() {
        let src = json!({ "hooks": { "Stop": [json!({ "hooks": [] }), kex_group()] } }).to_string();
        let removed = value(&remove(&src).unwrap());
        assert_eq!(removed["hooks"]["Stop"], json!([{ "hooks": [] }]));
    }

    #[test]
    fn remove_drops_events_that_only_held_kex() {
        let (installed, _) = install("", DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(value(&remove(&installed).unwrap()), json!({ "hooks": {} }));
    }

    #[test]
    fn the_handler_command_tags_the_agent_as_codex() {
        assert!(
            hook_command(DEFAULT_SCRIPT_PATH).contains(&format!("{DEFAULT_SCRIPT_PATH}\" codex"))
        );
    }

    #[test]
    fn status_distinguishes_the_three_states() {
        assert_eq!(status(FIXTURE, DEFAULT_SCRIPT_PATH), Status::NotInstalled);
        let (installed, _) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        assert_eq!(status(&installed, DEFAULT_SCRIPT_PATH), Status::UpToDate);
        assert_eq!(status(&installed, "/new/trigger.sh"), Status::Outdated);
        let mut v = value(&installed);
        v["hooks"].as_object_mut().unwrap().remove("Stop");
        assert_eq!(
            status(&v.to_string(), DEFAULT_SCRIPT_PATH),
            Status::Outdated
        );
    }

    #[test]
    fn malformed_input_is_an_error_not_a_partial_result() {
        assert!(install("{not json", DEFAULT_SCRIPT_PATH, SRC).is_err());
        assert!(install("[]", DEFAULT_SCRIPT_PATH, SRC).is_err());
        assert!(install(r#"{"hooks":[]}"#, DEFAULT_SCRIPT_PATH, SRC).is_err());
        assert!(install(r#"{"hooks":{"Stop":{}}}"#, DEFAULT_SCRIPT_PATH, SRC).is_err());
        assert!(remove("{not json").is_err());
        assert_eq!(status("{not json", DEFAULT_SCRIPT_PATH), Status::Malformed);
    }

    #[test]
    fn entries_feed_the_trust_module() {
        use crate::modules::agent::codex_trust::{
            read_trusted_hash, trusted_hash, upsert_hook_trust,
        };
        let (_, entries) = install(FIXTURE, DEFAULT_SCRIPT_PATH, SRC).unwrap();
        let trust = upsert_hook_trust("", &entries);
        for e in &entries {
            assert_eq!(read_trusted_hash(&trust, &e.key()), Some(trusted_hash(e)));
        }
    }
}
