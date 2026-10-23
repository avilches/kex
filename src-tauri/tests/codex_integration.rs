use std::path::{Path, PathBuf};
use std::sync::Mutex;

use kex_lib::modules::agent::codex_hooks::{self, DEFAULT_SCRIPT_PATH, SESSION_HOOK_MARKER};
use kex_lib::modules::agent::codex_integration::{self, CodexPaths, CodexStatus};
use kex_lib::modules::agent::codex_trust::{
    hook_state_tables, read_trusted_hash, trusted_hash, upsert_hook_trust,
};
use kex_lib::modules::agent::{
    agent_codex_status, agent_remove_integration, agent_setup_codex, agent_sync_integrations,
    SyncOutcome,
};
use serde_json::Value;
use tempfile::TempDir;

const FIXTURE_SOURCE_DIR: &str = "/home/user/.codex";

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/codex")
        .join(name);
    std::fs::read_to_string(path).unwrap()
}

struct Env {
    _tmp: TempDir,
    paths: CodexPaths,
}

// The fixture's trust keys point at the Codex dir of the machine it came from; pointing them at
// the temp dir puts Orca's and Kaji's tables on the same source path as Kex's.
fn codex_env() -> Env {
    let tmp = TempDir::new().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    let dir = root.join(".codex");
    std::fs::create_dir_all(&dir).unwrap();
    let paths = CodexPaths::new(dir.clone(), root.join("kex-hooks").join("trigger-event.sh"));
    std::fs::write(&paths.hooks, fixture("hooks.json")).unwrap();
    let config = fixture("config.toml").replace(FIXTURE_SOURCE_DIR, &dir.to_string_lossy());
    std::fs::write(&paths.config, config).unwrap();
    Env { _tmp: tmp, paths }
}

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap()
}

fn json(s: &str) -> Value {
    serde_json::from_str(s).unwrap()
}

fn foreign_handlers(hooks: &str) -> Vec<(String, usize, usize, Value)> {
    let root = json(hooks);
    let mut out = Vec::new();
    for (event, groups) in root["hooks"].as_object().unwrap() {
        for (gi, group) in groups.as_array().unwrap().iter().enumerate() {
            for (hi, h) in group["hooks"].as_array().unwrap().iter().enumerate() {
                if !h["command"].as_str().unwrap().contains(SESSION_HOOK_MARKER) {
                    out.push((event.clone(), gi, hi, h.clone()));
                }
            }
        }
    }
    out
}

fn tables_without(config: &str, source: &str) -> Vec<(String, Option<String>)> {
    hook_state_tables(config)
        .into_iter()
        .filter(|(key, _)| !is_kex_table(config, key, source))
        .collect()
}

fn is_kex_table(config: &str, key: &str, source: &str) -> bool {
    kex_keys(config, source).iter().any(|k| k == key)
}

fn kex_keys(config: &str, source: &str) -> Vec<String> {
    let hooks_entries = |event, group| {
        codex_hooks::kex_trust_entry(source, event, group, 0, None, DEFAULT_SCRIPT_PATH)
    };
    hook_state_tables(config)
        .into_iter()
        .filter(|(key, hash)| {
            kex_lib::modules::agent::codex_trust::parse_trust_key(key).is_some_and(
                |(_, event, group, handler)| {
                    handler == 0
                        && hash.as_deref() == Some(&trusted_hash(&hooks_entries(event, group)))
                },
            )
        })
        .map(|(key, _)| key)
        .collect()
}

fn source(env: &Env) -> String {
    env.paths.hooks.to_string_lossy().into_owned()
}

#[test]
fn setup_leaves_orca_and_kaji_handlers_and_tables_intact() {
    let env = codex_env();
    let hooks_before = read(&env.paths.hooks);
    let config_before = read(&env.paths.config);

    codex_integration::setup(&env.paths).unwrap();

    let hooks_after = read(&env.paths.hooks);
    let config_after = read(&env.paths.config);
    assert_eq!(
        foreign_handlers(&hooks_before),
        foreign_handlers(&hooks_after)
    );
    assert_eq!(
        hook_state_tables(&config_before),
        tables_without(&config_after, &source(&env))
    );
    assert!(config_after.starts_with(&config_before));
    assert_eq!(kex_keys(&config_after, &source(&env)).len(), 6);
    assert_eq!(codex_integration::status(&env.paths), CodexStatus::UpToDate);
    assert!(read(&env.paths.script).contains("kex-session-v8"));
}

#[test]
fn every_installed_handler_is_trusted_at_its_real_position() {
    let env = codex_env();
    codex_integration::setup(&env.paths).unwrap();
    let hooks = read(&env.paths.hooks);
    let config = read(&env.paths.config);
    let (_, entries) = codex_hooks::install(&hooks, DEFAULT_SCRIPT_PATH, &source(&env)).unwrap();
    for e in &entries {
        assert_eq!(read_trusted_hash(&config, &e.key()), Some(trusted_hash(e)));
    }
}

#[test]
fn setup_and_sync_are_idempotent_and_sync_never_creates_files() {
    let env = codex_env();
    codex_integration::setup(&env.paths).unwrap();
    let hooks = read(&env.paths.hooks);
    let config = read(&env.paths.config);
    codex_integration::setup(&env.paths).unwrap();
    assert_eq!(read(&env.paths.hooks), hooks);
    assert_eq!(read(&env.paths.config), config);
    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Updated
    );
    assert_eq!(read(&env.paths.hooks), hooks);
    assert_eq!(read(&env.paths.config), config);

    std::fs::remove_file(&env.paths.config).unwrap();
    codex_integration::sync(&env.paths).unwrap();
    assert!(!env.paths.config.exists());

    std::fs::remove_file(&env.paths.hooks).unwrap();
    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Gone
    );
    assert!(!env.paths.hooks.exists());
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

// The style the real hooks.json has once Kaji (Swift) rewrites it.
fn swift_style(text: &str) -> String {
    serde_json::to_string_pretty(&sorted(&json(text)))
        .unwrap()
        .lines()
        .map(|line| line.replacen("\": ", "\" : ", 1))
        .collect::<Vec<_>>()
        .join("\n")
        .replace('/', "\\/")
}

#[cfg(unix)]
fn stamp(path: &Path) -> (std::time::SystemTime, u64) {
    use std::os::unix::fs::MetadataExt;
    let meta = std::fs::metadata(path).unwrap();
    (meta.modified().unwrap(), meta.ino())
}

#[cfg(unix)]
#[test]
fn a_reformatted_hooks_json_is_never_rewritten_for_formatting_alone() {
    let env = codex_env();
    codex_integration::setup(&env.paths).unwrap();
    let swift = swift_style(&read(&env.paths.hooks));
    assert_eq!(json(&swift), json(&read(&env.paths.hooks)));
    std::fs::write(&env.paths.hooks, &swift).unwrap();
    let before = stamp(&env.paths.hooks);

    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Updated
    );
    codex_integration::setup(&env.paths).unwrap();

    assert_eq!(read(&env.paths.hooks), swift);
    assert_eq!(stamp(&env.paths.hooks), before);
    assert!(codex_integration::preview(&env.paths, true)
        .unwrap()
        .is_empty());
    assert_eq!(codex_integration::status(&env.paths), CodexStatus::UpToDate);
}

#[test]
fn a_reformatted_hooks_json_with_a_real_change_is_still_rewritten() {
    let env = codex_env();
    let src = source(&env);
    let (old_hooks, old_entries) =
        codex_hooks::install(&read(&env.paths.hooks), "/old/trigger.sh", &src).unwrap();
    let swift = swift_style(&old_hooks);
    std::fs::write(&env.paths.hooks, &swift).unwrap();
    let config = upsert_hook_trust(&read(&env.paths.config), &old_entries);
    std::fs::write(&env.paths.config, &config).unwrap();

    codex_integration::sync(&env.paths).unwrap();

    assert_ne!(read(&env.paths.hooks), swift);
    assert_eq!(codex_integration::status(&env.paths), CodexStatus::UpToDate);
}

#[test]
fn sync_drops_codex_when_its_handlers_are_gone() {
    let env = codex_env();
    let hooks = read(&env.paths.hooks);
    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Foreign
    );
    assert_eq!(read(&env.paths.hooks), hooks);
}

#[test]
fn sync_rewrites_an_outdated_install() {
    let env = codex_env();
    let src = source(&env);
    let (old_hooks, old_entries) =
        codex_hooks::install(&read(&env.paths.hooks), "/old/trigger.sh", &src).unwrap();
    std::fs::write(&env.paths.hooks, &old_hooks).unwrap();
    let old_config = upsert_hook_trust(&read(&env.paths.config), &old_entries);
    std::fs::write(&env.paths.config, &old_config).unwrap();
    assert_eq!(codex_integration::status(&env.paths), CodexStatus::Outdated);

    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Updated
    );

    assert_eq!(codex_integration::status(&env.paths), CodexStatus::UpToDate);
    let hooks = read(&env.paths.hooks);
    assert!(!hooks.contains("/old/trigger.sh"));
    let config = read(&env.paths.config);
    for e in &old_entries {
        assert_ne!(read_trusted_hash(&config, &e.key()), Some(trusted_hash(e)));
    }
}

#[test]
fn remove_deletes_only_kex_handlers_and_kex_tables() {
    let env = codex_env();
    let hooks_before = read(&env.paths.hooks);
    let config_before = read(&env.paths.config);
    codex_integration::setup(&env.paths).unwrap();

    codex_integration::remove(&env.paths).unwrap();

    let hooks_after = read(&env.paths.hooks);
    assert!(!hooks_after.contains(SESSION_HOOK_MARKER));
    assert_eq!(json(&hooks_after), json(&hooks_before));
    assert_eq!(read(&env.paths.config), config_before);
    assert_eq!(
        codex_integration::status(&env.paths),
        CodexStatus::NotInstalled
    );
}

#[test]
fn a_stale_kex_table_is_removed_on_reinstall_and_on_remove() {
    let env = codex_env();
    let src = source(&env);
    let orphan = codex_hooks::kex_trust_entry(
        &src,
        kex_lib::modules::agent::codex_trust::CodexHookEvent::Stop,
        7,
        0,
        None,
        DEFAULT_SCRIPT_PATH,
    );
    let config = upsert_hook_trust(&read(&env.paths.config), std::slice::from_ref(&orphan));
    std::fs::write(&env.paths.config, &config).unwrap();

    codex_integration::setup(&env.paths).unwrap();
    assert_eq!(
        read_trusted_hash(&read(&env.paths.config), &orphan.key()),
        None
    );

    let config = upsert_hook_trust(&read(&env.paths.config), std::slice::from_ref(&orphan));
    std::fs::write(&env.paths.config, &config).unwrap();
    codex_integration::remove(&env.paths).unwrap();
    assert_eq!(
        read(&env.paths.config),
        fixture("config.toml").replace(FIXTURE_SOURCE_DIR, &env.paths.dir.to_string_lossy())
    );
}

#[test]
fn a_user_disabled_kex_table_stays_disabled() {
    let env = codex_env();
    let src = source(&env);
    let (old_hooks, old_entries) =
        codex_hooks::install(&read(&env.paths.hooks), "/old/trigger.sh", &src).unwrap();
    std::fs::write(&env.paths.hooks, &old_hooks).unwrap();
    let mut config = upsert_hook_trust(&read(&env.paths.config), &old_entries);
    let stop = old_entries
        .iter()
        .find(|e| e.event.label() == "stop")
        .unwrap()
        .key();
    let header = format!("[hooks.state.\"{stop}\"]\nenabled = true");
    assert!(config.contains(&header));
    config = config.replace(
        &header,
        &format!("[hooks.state.\"{stop}\"]\nenabled = false"),
    );
    std::fs::write(&env.paths.config, &config).unwrap();

    codex_integration::sync(&env.paths).unwrap();
    codex_integration::setup(&env.paths).unwrap();

    let config = read(&env.paths.config);
    assert!(config.contains(&format!("[hooks.state.\"{stop}\"]\nenabled = false")));
}

#[test]
fn malformed_hooks_json_is_left_intact() {
    let env = codex_env();
    std::fs::write(&env.paths.hooks, "{ not json").unwrap();
    let config = read(&env.paths.config);
    assert!(codex_integration::setup(&env.paths).is_err());
    assert!(codex_integration::remove(&env.paths).is_err());
    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Malformed
    );
    assert_eq!(
        codex_integration::status(&env.paths),
        CodexStatus::Malformed
    );
    assert_eq!(read(&env.paths.hooks), "{ not json");
    assert_eq!(read(&env.paths.config), config);
}

#[test]
fn malformed_config_toml_is_left_intact() {
    let env = codex_env();
    codex_integration::setup(&env.paths).unwrap();
    let hooks = read(&env.paths.hooks);
    std::fs::write(&env.paths.config, "model = \n[[broken").unwrap();
    assert!(codex_integration::setup(&env.paths).is_err());
    assert!(codex_integration::remove(&env.paths).is_err());
    assert_eq!(
        codex_integration::sync(&env.paths).unwrap(),
        SyncOutcome::Malformed
    );
    assert_eq!(
        codex_integration::status(&env.paths),
        CodexStatus::Malformed
    );
    assert_eq!(read(&env.paths.hooks), hooks);
    assert_eq!(read(&env.paths.config), "model = \n[[broken");
}

// Forms of a trust table that are valid TOML but that Kex's textual editor does not see as
// the table of that key, so editing around them would duplicate it.
fn unseen_trust_forms(config: &str, key: &str, hash: &str) -> Vec<String> {
    let inline = config.replacen(
        "[hooks.state]\n",
        &format!("[hooks.state]\n\"{key}\" = {{ enabled = true, trusted_hash = \"{hash}\" }}\n"),
        1,
    );
    assert_ne!(inline, config);
    let quoted = format!(
        "{config}\n[\"hooks\".state.\"{key}\"]\nenabled = true\ntrusted_hash = \"{hash}\"\n"
    );
    vec![inline, quoted]
}

#[test]
fn a_trust_table_kex_cannot_see_is_never_duplicated() {
    for form in 0..2 {
        let env = codex_env();
        let src = source(&env);
        let (hooks, entries) =
            codex_hooks::install(&read(&env.paths.hooks), DEFAULT_SCRIPT_PATH, &src).unwrap();
        let stop = entries.iter().find(|e| e.event.label() == "stop").unwrap();
        let config = unseen_trust_forms(&read(&env.paths.config), &stop.key(), &trusted_hash(stop))
            .swap_remove(form);
        assert!(config.parse::<toml::Table>().is_ok());
        std::fs::write(&env.paths.config, &config).unwrap();
        std::fs::write(&env.paths.hooks, &hooks).unwrap();

        let err = codex_integration::setup(&env.paths).unwrap_err();
        assert!(err.contains("leaving it alone"), "{err}");
        assert!(codex_integration::preview(&env.paths, true).is_err());
        assert_eq!(
            codex_integration::sync(&env.paths).unwrap(),
            SyncOutcome::Malformed
        );
        assert_eq!(
            codex_integration::status(&env.paths),
            CodexStatus::Malformed
        );
        assert_eq!(read(&env.paths.config), config);
        assert_eq!(read(&env.paths.hooks), hooks);
    }
}

#[test]
fn a_missing_codex_dir_is_never_created() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".codex");
    let paths = CodexPaths::new(dir.clone(), tmp.path().join("trigger-event.sh"));
    assert!(codex_integration::setup(&paths).is_err());
    assert_eq!(codex_integration::sync(&paths).unwrap(), SyncOutcome::Gone);
    assert!(codex_integration::remove(&paths).is_ok());
    assert_eq!(codex_integration::status(&paths), CodexStatus::Unavailable);
    assert!(!dir.exists());
}

#[test]
fn setup_reinstalls_a_missing_trigger_script() {
    let env = codex_env();
    codex_integration::setup(&env.paths).unwrap();
    std::fs::remove_file(&env.paths.script).unwrap();
    assert_eq!(codex_integration::status(&env.paths), CodexStatus::Outdated);
    codex_integration::sync(&env.paths).unwrap();
    assert!(env.paths.script.exists());
    assert_eq!(codex_integration::status(&env.paths), CodexStatus::UpToDate);
}

#[test]
fn codex_home_wins_over_home() {
    let tmp = TempDir::new().unwrap();
    let custom = tmp.path().join("custom");
    std::fs::create_dir_all(&custom).unwrap();
    let resolved = codex_integration::resolve_codex_dir(
        Some(custom.clone().into_os_string()),
        Some(tmp.path().join("home")),
    )
    .unwrap();
    assert_eq!(resolved, std::fs::canonicalize(&custom).unwrap());
    let resolved =
        codex_integration::resolve_codex_dir(Some("".into()), Some(tmp.path().join("home")))
            .unwrap();
    assert_eq!(resolved, tmp.path().join("home").join(".codex"));
    let resolved =
        codex_integration::resolve_codex_dir(None, Some(tmp.path().join("home"))).unwrap();
    assert_eq!(resolved, tmp.path().join("home").join(".codex"));
}

// The commands read HOME and CODEX_HOME, which are process-wide.
static ENV_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn the_commands_follow_home_and_codex_home() {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let tmp = TempDir::new().unwrap();
    let home = std::fs::canonicalize(tmp.path()).unwrap();
    std::env::set_var("HOME", &home);
    std::env::remove_var("CODEX_HOME");

    assert!(agent_setup_codex().is_err());
    assert!(!home.join(".codex").exists());
    assert_eq!(agent_codex_status(), CodexStatus::Unavailable);

    let codex_home = home.join("elsewhere");
    std::fs::create_dir_all(&codex_home).unwrap();
    std::fs::write(codex_home.join("hooks.json"), fixture("hooks.json")).unwrap();
    std::env::set_var("CODEX_HOME", &codex_home);

    agent_setup_codex().unwrap();
    assert_eq!(agent_codex_status(), CodexStatus::UpToDate);
    assert!(home.join(".config/kex/hooks/trigger-event.sh").exists());
    assert!(!home.join(".codex").exists());
    let config = read(&codex_home.join("config.toml"));
    assert!(config.contains(&format!("{}/hooks.json:stop:", codex_home.display())));

    assert!(agent_sync_integrations(vec!["codex".into()]).is_empty());
    agent_remove_integration("codex".into()).unwrap();
    assert_eq!(agent_codex_status(), CodexStatus::NotInstalled);
    assert!(!read(&codex_home.join("hooks.json")).contains(SESSION_HOOK_MARKER));

    std::fs::write(codex_home.join("hooks.json"), "{ nope").unwrap();
    assert_eq!(
        agent_sync_integrations(vec!["codex".into(), "omp".into()]),
        vec!["codex".to_string()]
    );
    std::env::remove_var("CODEX_HOME");
}

#[test]
fn remove_integration_still_rejects_unknown_names() {
    for name in ["", "claude", "codex2", "../codex", "gemini"] {
        assert!(agent_remove_integration(name.into()).is_err(), "{name}");
    }
}
