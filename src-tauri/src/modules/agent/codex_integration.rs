//! The Codex integration: Kex's handlers in `hooks.json`, their trust tables in `config.toml`
//! and the trigger-event.sh they run, the same script the Claude Code hooks use.
//!
//! Both Codex files belong to the user and to other tools (Orca, Kaji): Kex edits only what it
//! recognises as its own, never writes a file it cannot parse, and never creates the Codex folder.

use std::ffi::OsString;
use std::path::PathBuf;

use super::codex_hooks::{self, Status as HooksStatus, DEFAULT_SCRIPT_PATH};
use super::codex_trust::{self, TrustEntry};
use super::{changed, read_optional, FilePreview, SyncOutcome};
use super::{SESSION_HOOK_SCRIPT, SESSION_HOOK_SCRIPT_VERSION};

const REFORMAT_NOTE: &str = "Kex rewrites hooks.json as formatted JSON: indentation and escapes such as \\/ change, the handlers of other tools stay the same.";

const WRITE_ATTEMPTS: usize = 3;

/// The handler command is POSIX shell (`[ ]`, `$HOME`, `||`) and how Codex runs a hook on
/// Windows has not been measured, so there Codex is reported unavailable and never written.
pub const HOOKS_SUPPORTED: bool = cfg!(unix);

const UNSUPPORTED: &str = "the Codex integration is not supported on this platform yet";

pub struct CodexPaths {
    pub dir: PathBuf,
    pub hooks: PathBuf,
    pub config: PathBuf,
    pub script: PathBuf,
    /// `HOOKS_SUPPORTED` for the commands; a field so tests on any platform can turn it off.
    pub hooks_supported: bool,
}

impl CodexPaths {
    pub fn new(dir: PathBuf, script: PathBuf) -> Self {
        Self {
            hooks: dir.join("hooks.json"),
            config: dir.join("config.toml"),
            dir,
            script,
            hooks_supported: true,
        }
    }

    pub fn from_env() -> Result<Self, String> {
        let dir = resolve_codex_dir(std::env::var_os("CODEX_HOME"), dirs::home_dir())?;
        Ok(Self {
            hooks_supported: HOOKS_SUPPORTED,
            ..Self::new(dir, super::session_hook_script_path()?)
        })
    }

    // Codex puts the hooks.json path it loaded, built the same way, in every trust key.
    fn source(&self) -> String {
        self.hooks.to_string_lossy().into_owned()
    }
}

/// `CODEX_HOME` when set and not empty, canonicalized as Codex does; `~/.codex` otherwise. A
/// `CODEX_HOME` that does not exist comes back as is, so the caller sees a missing folder.
pub fn resolve_codex_dir(
    codex_home: Option<OsString>,
    home: Option<PathBuf>,
) -> Result<PathBuf, String> {
    match codex_home.filter(|v| !v.is_empty()) {
        Some(value) => {
            let path = PathBuf::from(value);
            Ok(std::fs::canonicalize(&path).unwrap_or(path))
        }
        None => home
            .map(|h| h.join(".codex"))
            .ok_or_else(|| "could not resolve home dir".to_string()),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CodexStatus {
    /// The Codex folder does not exist, or the platform is not supported (`HOOKS_SUPPORTED`).
    Unavailable,
    NotInstalled,
    UpToDate,
    /// Kex's handlers are there but a handler, a trust table or the script is not current.
    Outdated,
    /// `hooks.json` or `config.toml` cannot be parsed, so Kex will not touch them.
    Malformed,
}

fn missing_dir(paths: &CodexPaths) -> String {
    format!(
        "Codex folder {} not found: install Codex and run it once first",
        paths.dir.display()
    )
}

fn left_alone(error: String) -> String {
    format!("{error}; leaving it alone")
}

fn check_config(config: &str) -> Result<(), String> {
    config
        .parse::<toml::Table>()
        .map(|_| ())
        .map_err(|e| left_alone(format!("config.toml is not valid TOML: {e}")))
}

struct HooksPlan {
    text: String,
    entries: Vec<TrustEntry>,
    /// Keys of the positions Kex's handlers held before the change; their tables may be stale.
    previous_keys: Vec<String>,
}

fn plan_hooks(hooks: &str, source: &str, install: bool) -> Result<HooksPlan, String> {
    let previous_keys = codex_hooks::kex_positions(hooks)
        .map_err(left_alone)?
        .into_iter()
        .map(|(event, group, handler)| codex_trust::trust_key(source, event, group, handler))
        .collect();
    let (text, entries) = if install {
        codex_hooks::install(hooks, DEFAULT_SCRIPT_PATH, source)
    } else {
        codex_hooks::remove(hooks).map(|text| (text, Vec::new()))
    }
    .map_err(left_alone)?;
    Ok(HooksPlan {
        text,
        entries,
        previous_keys,
    })
}

/// Tables that are Kex's: the keys its handlers held, plus any table on this hooks.json that
/// holds the exact hash of a Kex handler at its position (left behind when positions moved).
fn kex_table_keys(config: &str, previous: &[String], source: &str) -> Vec<String> {
    let own = codex_trust::normalize_source_path(source);
    let mut keys = previous.to_vec();
    for (key, hash) in codex_trust::hook_state_tables(config) {
        let Some((path, event, group, handler)) = codex_trust::parse_trust_key(&key) else {
            continue;
        };
        if codex_trust::normalize_source_path(&path) != own {
            continue;
        }
        let kex =
            codex_hooks::kex_trust_entry(source, event, group, handler, None, DEFAULT_SCRIPT_PATH);
        if hash.as_deref() == Some(codex_trust::trusted_hash(&kex).as_str()) {
            keys.push(kex.key());
        }
    }
    keys
}

fn plan_config(config: &str, plan: &HooksPlan, source: &str) -> Result<String, String> {
    check_config(config)?;
    let current: Vec<String> = plan.entries.iter().map(TrustEntry::key).collect();
    let stale: Vec<String> = kex_table_keys(config, &plan.previous_keys, source)
        .into_iter()
        .filter(|k| !current.contains(k))
        .collect();
    // A handler another tool moved gets a table at its new key; the user's `enabled = false` on
    // the old one goes with it.
    let disabled_events: Vec<_> = stale
        .iter()
        .filter(|k| codex_trust::hook_trust_disabled(config, k))
        .filter_map(|k| codex_trust::parse_trust_key(k).map(|(_, event, _, _)| event))
        .collect();
    let disabled: Vec<String> = plan
        .entries
        .iter()
        .filter(|e| disabled_events.contains(&e.event))
        .map(TrustEntry::key)
        .collect();
    let cleaned = codex_trust::remove_hook_trust(config, &stale);
    let after = codex_trust::upsert_hook_trust_disabling(&cleaned, &plan.entries, &disabled);
    codex_trust::verify_hook_trust(&after, &plan.entries).map_err(left_alone)?;
    Ok(after)
}

// The whole install planned against the current text: an error means Kex leaves both alone.
fn plan_install(hooks: &str, config: &str, source: &str) -> Result<(), String> {
    let plan = plan_hooks(hooks, source, true)?;
    plan_config(config, &plan, source).map(|_| ())
}

// Uninstalling a missing file leaves it missing instead of creating an empty one.
fn after_text(current: Option<&str>, next: String, create: bool) -> Option<String> {
    if current.is_none() && !create {
        None
    } else {
        Some(next)
    }
}

fn write(path: &std::path::Path, text: &str) -> Result<(), String> {
    codex_trust::write_atomically(path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Brings both files to their installed or removed state. Nothing is written unless both parse.
/// With `create` false a missing file stays missing.
fn apply(paths: &CodexPaths, install: bool, create: bool) -> Result<(), String> {
    let source = paths.source();
    for _ in 0..WRITE_ATTEMPTS {
        let hooks = read_optional(&paths.hooks)?;
        let config = read_optional(&paths.config)?;
        let plan = plan_hooks(hooks.as_deref().unwrap_or(""), &source, install)?;
        let config_after = plan_config(config.as_deref().unwrap_or(""), &plan, &source)?;
        let hooks_after = after_text(hooks.as_deref(), plan.text, create);
        let config_after = after_text(config.as_deref(), config_after, create);

        // Codex, Orca or Kaji may have written in between: start over from what is there now.
        if read_optional(&paths.hooks)? != hooks || read_optional(&paths.config)? != config {
            continue;
        }
        let hooks_write = hooks_after.filter(|t| hooks.as_deref() != Some(t.as_str()));
        let config_write = config_after.filter(|t| config.as_deref() != Some(t.as_str()));
        // A handler with no trust yet makes Codex ask for a review, a table with no handler is
        // inert: trust goes in before the handlers and comes out after them.
        if install {
            if let Some(t) = &config_write {
                write(&paths.config, t)?;
            }
            if let Some(t) = &hooks_write {
                write(&paths.hooks, t)?;
            }
        } else {
            if let Some(t) = &hooks_write {
                write(&paths.hooks, t)?;
            }
            if let Some(t) = &config_write {
                write(&paths.config, t)?;
            }
        }
        return Ok(());
    }
    Err("the Codex files kept changing while Kex was updating them; try again".into())
}

/// Installs or refreshes Kex's handlers and trusts them. The Codex folder must already exist.
pub fn setup(paths: &CodexPaths) -> Result<(), String> {
    if !paths.hooks_supported {
        return Err(UNSUPPORTED.into());
    }
    if !paths.dir.is_dir() {
        return Err(missing_dir(paths));
    }
    super::install_session_hook_script(&paths.script)?;
    apply(paths, true, true)
}

/// Removes Kex's handlers and Kex's trust tables, and nothing else.
pub fn remove(paths: &CodexPaths) -> Result<(), String> {
    if !paths.dir.is_dir() {
        return Ok(());
    }
    apply(paths, false, false)
}

/// The startup sync: refreshes an install that is still there, never creates a Codex file.
pub fn sync(paths: &CodexPaths) -> Result<SyncOutcome, String> {
    if !paths.hooks_supported {
        return Ok(SyncOutcome::Unsupported);
    }
    if !paths.dir.is_dir() {
        return Ok(SyncOutcome::Gone);
    }
    let Some(hooks) = read_optional(&paths.hooks)? else {
        return Ok(SyncOutcome::Gone);
    };
    match codex_hooks::status(&hooks, DEFAULT_SCRIPT_PATH) {
        HooksStatus::Malformed => return Ok(SyncOutcome::Malformed),
        HooksStatus::NotInstalled => return Ok(SyncOutcome::Foreign),
        HooksStatus::UpToDate | HooksStatus::Outdated => {}
    }
    let config = read_optional(&paths.config)?;
    if plan_install(&hooks, config.as_deref().unwrap_or(""), &paths.source()).is_err() {
        return Ok(SyncOutcome::Malformed);
    }
    super::install_session_hook_script(&paths.script)?;
    apply(paths, true, false)?;
    Ok(SyncOutcome::Updated)
}

pub fn status(paths: &CodexPaths) -> CodexStatus {
    if !paths.hooks_supported || !paths.dir.is_dir() {
        return CodexStatus::Unavailable;
    }
    let (Ok(hooks), Ok(config)) = (read_optional(&paths.hooks), read_optional(&paths.config))
    else {
        return CodexStatus::Malformed;
    };
    let script = std::fs::read_to_string(&paths.script).ok();
    status_of(
        hooks.as_deref().unwrap_or(""),
        config.as_deref().unwrap_or(""),
        script.as_deref(),
        &paths.source(),
    )
}

fn status_of(hooks: &str, config: &str, script: Option<&str>, source: &str) -> CodexStatus {
    if plan_install(hooks, config, source).is_err() {
        return CodexStatus::Malformed;
    }
    match codex_hooks::status(hooks, DEFAULT_SCRIPT_PATH) {
        HooksStatus::Malformed => CodexStatus::Malformed,
        HooksStatus::NotInstalled => CodexStatus::NotInstalled,
        HooksStatus::Outdated => CodexStatus::Outdated,
        HooksStatus::UpToDate => {
            let trusted = codex_hooks::install(hooks, DEFAULT_SCRIPT_PATH, source).is_ok_and(
                |(_, entries)| {
                    entries.iter().all(|e| {
                        codex_trust::read_trusted_hash(config, &e.key())
                            == Some(codex_trust::trusted_hash(e))
                    })
                },
            );
            let script_current = script.is_some_and(|s| s.contains(SESSION_HOOK_SCRIPT_VERSION));
            if trusted && script_current {
                CodexStatus::UpToDate
            } else {
                CodexStatus::Outdated
            }
        }
    }
}

/// Dry run of `setup` (install) or `remove`: the same plan, nothing written.
pub fn preview(paths: &CodexPaths, install: bool) -> Result<Vec<FilePreview>, String> {
    if install && !paths.hooks_supported {
        return Err(UNSUPPORTED.into());
    }
    if !paths.dir.is_dir() {
        return if install {
            Err(missing_dir(paths))
        } else {
            Ok(Vec::new())
        };
    }
    let source = paths.source();
    let hooks = read_optional(&paths.hooks)?;
    let config = read_optional(&paths.config)?;
    let plan = plan_hooks(hooks.as_deref().unwrap_or(""), &source, install)?;
    let config_after = plan_config(config.as_deref().unwrap_or(""), &plan, &source)?;

    let mut files = changed(
        &paths.config,
        config.as_deref(),
        after_text(config.as_deref(), config_after, install),
    );
    let mut hooks_files = changed(
        &paths.hooks,
        hooks.as_deref(),
        after_text(hooks.as_deref(), plan.text, install),
    );
    for file in &mut hooks_files {
        file.note = Some(REFORMAT_NOTE.to_string());
    }
    files.splice(0..0, hooks_files);
    if install {
        let script = read_optional(&paths.script)?;
        files.extend(changed(
            &paths.script,
            script.as_deref(),
            Some(SESSION_HOOK_SCRIPT.to_string()),
        ));
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOOKS: &str = include_str!("../../../tests/fixtures/codex/hooks.json");
    const CONFIG: &str = include_str!("../../../tests/fixtures/codex/config.toml");

    fn env() -> (tempfile::TempDir, CodexPaths) {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".codex");
        std::fs::create_dir_all(&dir).unwrap();
        let paths = CodexPaths::new(dir, tmp.path().join("hooks").join("trigger-event.sh"));
        std::fs::write(&paths.hooks, HOOKS).unwrap();
        std::fs::write(&paths.config, CONFIG).unwrap();
        (tmp, paths)
    }

    fn text(path: &std::path::Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }

    #[test]
    fn install_preview_is_what_setup_writes_and_writes_nothing() {
        let (_tmp, paths) = env();
        let files = preview(&paths, true).unwrap();
        assert_eq!(text(&paths.hooks), HOOKS);
        assert_eq!(text(&paths.config), CONFIG);
        assert!(!paths.script.exists());
        assert_eq!(files.len(), 3);
        assert!(files[0].path.ends_with("hooks.json"));
        assert_eq!(files[0].note.as_deref(), Some(REFORMAT_NOTE));
        assert!(files[1].path.ends_with("config.toml"));
        assert_eq!(files[1].note, None);
        assert_eq!(files[2].after.as_deref(), Some(SESSION_HOOK_SCRIPT));

        setup(&paths).unwrap();
        assert_eq!(files[0].after.as_deref(), Some(text(&paths.hooks).as_str()));
        assert_eq!(
            files[1].after.as_deref(),
            Some(text(&paths.config).as_str())
        );
        assert!(preview(&paths, true).unwrap().is_empty());
    }

    #[test]
    fn remove_preview_is_what_remove_writes() {
        let (_tmp, paths) = env();
        setup(&paths).unwrap();
        let files = preview(&paths, false).unwrap();
        assert_eq!(files.len(), 2);
        remove(&paths).unwrap();
        assert_eq!(files[0].after.as_deref(), Some(text(&paths.hooks).as_str()));
        assert_eq!(files[1].after.as_deref(), Some(CONFIG));
        assert!(preview(&paths, false).unwrap().is_empty());
    }

    #[test]
    fn preview_refuses_malformed_files_and_a_missing_folder() {
        let (_tmp, paths) = env();
        std::fs::write(&paths.config, "[[broken").unwrap();
        assert!(preview(&paths, true)
            .unwrap_err()
            .contains("not valid TOML"));
        std::fs::write(&paths.config, CONFIG).unwrap();
        std::fs::write(&paths.hooks, "{").unwrap();
        assert!(preview(&paths, false)
            .unwrap_err()
            .contains("leaving it alone"));

        let missing = CodexPaths::new(paths.dir.join("nope"), paths.script.clone());
        assert!(preview(&missing, true).is_err());
        assert!(preview(&missing, false).unwrap().is_empty());
    }

    #[test]
    fn uninstall_preview_never_invents_missing_files() {
        let (_tmp, paths) = env();
        std::fs::remove_file(&paths.hooks).unwrap();
        std::fs::remove_file(&paths.config).unwrap();
        assert!(preview(&paths, false).unwrap().is_empty());
    }

    #[test]
    fn status_reports_untrusted_handlers_as_outdated() {
        let source = "/home/user/.codex/hooks.json";
        let (hooks, entries) = codex_hooks::install(HOOKS, DEFAULT_SCRIPT_PATH, source).unwrap();
        let config = codex_trust::upsert_hook_trust(CONFIG, &entries);
        let script = Some(SESSION_HOOK_SCRIPT);
        assert_eq!(
            status_of(&hooks, &config, script, source),
            CodexStatus::UpToDate
        );
        assert_eq!(
            status_of(&hooks, CONFIG, script, source),
            CodexStatus::Outdated
        );
        assert_eq!(
            status_of(&hooks, &config, None, source),
            CodexStatus::Outdated
        );
        assert_eq!(
            status_of(HOOKS, CONFIG, script, source),
            CodexStatus::NotInstalled
        );
        assert_eq!(
            status_of(&hooks, "x = ", script, source),
            CodexStatus::Malformed
        );
    }
}
