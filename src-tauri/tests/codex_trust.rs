use std::path::PathBuf;

use kex_lib::modules::agent::codex_trust::{
    read_trusted_hash, remove_hook_trust, trust_key, trusted_hash, upsert_hook_trust,
    write_atomically, CodexHookEvent, TrustEntry,
};
use serde_json::Value;

const FIXTURE_SOURCE: &str = "/home/user/.codex/hooks.json";

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/codex")
        .join(name);
    std::fs::read_to_string(path).unwrap()
}

fn entries_from_hooks_json(hooks_json: &str, source_path: &str) -> Vec<TrustEntry> {
    let root: Value = serde_json::from_str(hooks_json).unwrap();
    let mut entries = Vec::new();
    for (name, groups) in root["hooks"].as_object().unwrap() {
        let event = CodexHookEvent::from_hooks_json_name(name).unwrap();
        for (group_index, group) in groups.as_array().unwrap().iter().enumerate() {
            let matcher = group["matcher"].as_str().map(str::to_string);
            for (handler_index, handler) in group["hooks"].as_array().unwrap().iter().enumerate() {
                entries.push(TrustEntry {
                    source_path: source_path.to_string(),
                    event,
                    group_index,
                    handler_index,
                    command: handler["command"].as_str().unwrap().to_string(),
                    timeout_sec: handler["timeout"].as_u64(),
                    is_async: handler["async"].as_bool().unwrap_or(false),
                    matcher: matcher.clone(),
                    status_message: handler["statusMessage"].as_str().map(str::to_string),
                    additional_context_limit: handler["additionalContextLimit"].as_u64(),
                });
            }
        }
    }
    entries
}

fn kex_entry(event: CodexHookEvent, group_index: usize) -> TrustEntry {
    TrustEntry {
        source_path: FIXTURE_SOURCE.to_string(),
        event,
        group_index,
        handler_index: 0,
        command: r#"[ -n "$KEX_TAB_ID" ] && "$HOME/.config/kex/hooks/trigger-event.sh" || true  # kex-session-hook"#
            .to_string(),
        timeout_sec: Some(10),
        is_async: false,
        matcher: None,
        status_message: None,
        additional_context_limit: None,
    }
}

fn kex_entries() -> Vec<TrustEntry> {
    vec![
        kex_entry(CodexHookEvent::SessionStart, 3),
        kex_entry(CodexHookEvent::UserPromptSubmit, 2),
        kex_entry(CodexHookEvent::Stop, 2),
    ]
}

fn keys_of(entries: &[TrustEntry]) -> Vec<String> {
    entries
        .iter()
        .map(|e| trust_key(&e.source_path, e.event, e.group_index, e.handler_index))
        .collect()
}

#[test]
fn hash_reproduces_every_real_trusted_hash() {
    let config = fixture("config.toml");
    let entries = entries_from_hooks_json(&fixture("hooks.json"), FIXTURE_SOURCE);
    let mut verified = Vec::new();
    for entry in &entries {
        let key = trust_key(
            FIXTURE_SOURCE,
            entry.event,
            entry.group_index,
            entry.handler_index,
        );
        if let Some(expected) = read_trusted_hash(&config, &key) {
            assert_eq!(trusted_hash(entry), expected, "hash mismatch for {key}");
            verified.push(key);
        }
    }
    // Orca's nine handlers plus the dotfiles SessionStart hook, which carries additionalContextLimit.
    assert_eq!(verified.len(), 10, "verified: {verified:?}");
}

#[test]
fn read_ignores_lookalike_headers_inside_multiline_strings() {
    let config = fixture("config.toml");
    let key = trust_key(FIXTURE_SOURCE, CodexHookEvent::Stop, 0, 0);
    assert_eq!(
        read_trusted_hash(&config, &key).as_deref(),
        Some("sha256:1ae8ee19d95298f7bc4821368a7d4600b9f9d36c68695812c19419b28b5ad53e")
    );
}

#[test]
fn upsert_then_remove_restores_the_real_config_byte_for_byte() {
    let config = fixture("config.toml");
    let entries = kex_entries();
    let upserted = upsert_hook_trust(&config, &entries);
    assert_ne!(upserted, config);
    assert_eq!(remove_hook_trust(&upserted, &keys_of(&entries)), config);
}

#[test]
fn upsert_only_appends_kex_tables_and_keeps_every_other_byte() {
    let config = fixture("config.toml");
    let entries = kex_entries();
    let upserted = upsert_hook_trust(&config, &entries);
    assert!(upserted.starts_with(&config));
    let appended = &upserted[config.len()..];
    for entry in &entries {
        let key = trust_key(
            &entry.source_path,
            entry.event,
            entry.group_index,
            entry.handler_index,
        );
        assert!(appended.contains(&format!("[hooks.state.\"{key}\"]")));
        assert_eq!(
            read_trusted_hash(&upserted, &key),
            Some(trusted_hash(entry))
        );
    }
    for orca_key in ["session_start:0:0", "stop:0:0", "interrupt:0:0"] {
        let key = format!("{FIXTURE_SOURCE}:{orca_key}");
        assert_eq!(
            read_trusted_hash(&upserted, &key),
            read_trusted_hash(&config, &key)
        );
    }
}

#[test]
fn upsert_is_idempotent() {
    let config = fixture("config.toml");
    let entries = kex_entries();
    let once = upsert_hook_trust(&config, &entries);
    assert_eq!(upsert_hook_trust(&once, &entries), once);
}

#[test]
fn upsert_rewrites_a_stale_kex_hash_in_place() {
    let config = fixture("config.toml");
    let mut entries = kex_entries();
    let first = upsert_hook_trust(&config, &entries);
    entries[1].timeout_sec = Some(30);
    let second = upsert_hook_trust(&first, &entries);
    assert_eq!(first.len(), second.len());
    let key = keys_of(&entries)[1].clone();
    assert_eq!(
        read_trusted_hash(&second, &key),
        Some(trusted_hash(&entries[1]))
    );
    assert_eq!(remove_hook_trust(&second, &keys_of(&entries)), config);
}

#[test]
fn remove_only_touches_the_given_keys() {
    let config = fixture("config.toml");
    let unknown = vec![format!("{FIXTURE_SOURCE}:stop:9:0")];
    assert_eq!(remove_hook_trust(&config, &unknown), config);
}

#[test]
fn atomic_write_replaces_the_file_in_a_temp_dir() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.toml");
    std::fs::write(&path, "old = 1\n").unwrap();
    write_atomically(&path, "new = 2\n").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "new = 2\n");
    let leftovers: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .filter(|n| n != "config.toml")
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn atomic_write_creates_a_missing_file_and_its_directory() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("nested/config.toml");
    write_atomically(&path, "a = 1\n").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "a = 1\n");
}

#[cfg(unix)]
#[test]
fn atomic_write_follows_a_symlink_and_keeps_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let real = dir.path().join("real.toml");
    std::fs::write(&real, "x = 1\n").unwrap();
    std::fs::set_permissions(&real, std::fs::Permissions::from_mode(0o640)).unwrap();
    let link = dir.path().join("config.toml");
    std::os::unix::fs::symlink(&real, &link).unwrap();
    write_atomically(&link, "x = 2\n").unwrap();
    assert!(std::fs::symlink_metadata(&link)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(std::fs::read_to_string(&real).unwrap(), "x = 2\n");
    let mode = std::fs::metadata(&real).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o640);
}
