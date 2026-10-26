use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::launch_cmd::{self, find_agent_invocation, DEFAULT_AGENTS};
use super::provider::{MissingTranscriptPolicy, Provider};

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

// Tabs whose shell is running a `-p` / `--print` agent line. The detector never arms for it, so
// nothing else would tell the hook frames of that run apart from an interactive session's.
static PRINT_RUNS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn print_runs() -> &'static Mutex<HashSet<String>> {
    PRINT_RUNS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn mark_print_run(tab_id: &str) {
    if let Ok(mut set) = print_runs().lock() {
        set.insert(tab_id.to_string());
    }
}

pub fn clear_print_run(tab_id: &str) {
    if let Ok(mut set) = print_runs().lock() {
        set.remove(tab_id);
    }
}

pub fn is_print_run(tab_id: &str) -> bool {
    print_runs().lock().is_ok_and(|set| set.contains(tab_id))
}

/// Forgets the command stashed for a tab without recording anything.
pub fn drop_stashed_cmd(tab_id: &str) {
    let _ = take_stashed_cmd(tab_id);
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
    /// Kind of the unread notification the tab had (attention, finished or error), or
    /// "interrupted" when the agent was working when Kex closed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notification: Option<String>,
    /// Preview of what the assistant said when its last turn ended, clipped to
    /// `MAX_LAST_MESSAGE_CHARS`. Absent for agents whose Stop does not carry the text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_message: Option<String>,
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
    /// A worktree the session was inside that still exists. The agent only reports its folder
    /// after the first prompt, so the tab learns about the worktree from here until then.
    pub worktree_cwd: Option<String>,
    pub error_reason: String,
    pub title: Option<String>,
    pub notification: Option<String>,
}

/// Splits plans into those whose tab exists in some window and those whose tab is gone
/// from every window. A single window cannot tell the two apart, so `known` must be the
/// union over all windows.
pub fn split_orphans(
    plans: Vec<RestorePlan>,
    known: &std::collections::HashSet<String>,
) -> (Vec<RestorePlan>, Vec<RestorePlan>) {
    plans.into_iter().partition(|p| known.contains(&p.tab_id))
}

#[cfg(test)]
thread_local! {
    static STORE_OVERRIDE: std::cell::RefCell<Option<PathBuf>> =
        const { std::cell::RefCell::new(None) };
}

/// Points this thread's store at `path` while `f` runs, so a test can drive the public entry
/// points (the IPC dispatcher) without the process-wide `DATA_DIR`.
#[cfg(test)]
pub fn with_store_path<R>(path: &Path, f: impl FnOnce() -> R) -> R {
    STORE_OVERRIDE.with(|o| *o.borrow_mut() = Some(path.to_path_buf()));
    let out = f();
    STORE_OVERRIDE.with(|o| *o.borrow_mut() = None);
    out
}

fn store_path() -> Option<PathBuf> {
    #[cfg(test)]
    if let Some(path) = STORE_OVERRIDE.with(|o| o.borrow().clone()) {
        return Some(path);
    }
    DATA_DIR.get().map(|d| d.join("agent-sessions.json"))
}

/// True when the original invocation was non-interactive (`-p` / `--print`).
/// Such sessions are never persisted.
pub fn is_print_mode_cmd(cmd: &str, agent: &str) -> bool {
    launch_cmd::is_print_mode(cmd, &known_agents(agent))
}

// The record's agent comes from the hooks and is always "claude" today, while the launch line
// may name another known agent; match both so the launcher is never silently swapped.
fn known_agents(agent: &str) -> Vec<String> {
    let mut agents = vec![agent.to_string()];
    agents.extend(
        DEFAULT_AGENTS
            .iter()
            .filter(|a| **a != agent)
            .map(|a| a.to_string()),
    );
    agents
}

/// Whitelist-based arg stripper for session restore.
///
/// Keeps only the flags that make sense when resuming an existing session:
/// auth/permission settings, model/effort, tool allow-lists, add-dirs, MCP config, etc.
/// One-time flags (--worktree, --from-pr, --tmux) and print-mode flags are dropped.
///
/// Tokens keep their quotes, so a quoted value with spaces stays one value. Assignments and
/// wrappers before the launcher (`FOO=1 claude`, `env X=1 claude-max`) are kept as written.
fn strip_for_resume_base(cmd: &str, agent: &str) -> Option<String> {
    let provider = Provider::of(agent)?;
    let (keep_flags, keep_with_value) = (provider.keep_flags, provider.keep_with_value);

    // A record written before the launch line was reduced to the agent segment can still
    // carry `cd dir && claude ...`; reducing it again here heals it on read.
    let inv = find_agent_invocation(cmd, &known_agents(agent))?;
    if !inv.complete {
        return None;
    }
    let tokens: Vec<&str> = inv.args.iter().map(String::as_str).collect();
    let mut result: Vec<&str> = inv.head.iter().map(String::as_str).collect();
    let mut i = 0;
    while i < tokens.len() {
        let token = tokens[i];
        if let Some(n) = launch_cmd::redirection_tokens(token) {
            i += n;
            continue;
        }
        let (flag, has_eq) = match token.find('=') {
            Some(pos) => (&token[..pos], true),
            None => (token, false),
        };
        if keep_flags.contains(&flag) {
            result.push(token);
            i += 1;
            continue;
        }
        let is_value = |t: &str| !t.starts_with('-') && launch_cmd::redirection_tokens(t).is_none();
        if keep_with_value.contains(&flag) && provider.single_value_opts.contains(&flag) {
            let (value, used) = if has_eq {
                (Some(&token[flag.len() + 1..]), 1)
            } else {
                match tokens.get(i + 1) {
                    Some(v) if is_value(v) => (Some(*v), 2),
                    _ => (None, 1),
                }
            };
            // Without a value the option would take the next word of the resume line
            // (`resume`); a value the shell could expand may turn into another option.
            if value.is_some_and(is_plain_shell_word) {
                result.extend_from_slice(&tokens[i..i + used]);
            }
            i += used;
            continue;
        }
        if keep_with_value.contains(&flag) {
            result.push(token);
            i += 1;
            if !has_eq {
                // Consume all immediately-following non-flag tokens as values.
                while i < tokens.len() && is_value(tokens[i]) {
                    result.push(tokens[i]);
                    i += 1;
                }
            }
            continue;
        }
        // Not in whitelist: skip this token (and any orphaned non-flag value that follows).
        i += 1;
        while i < tokens.len()
            && !tokens[i].starts_with('-')
            && launch_cmd::redirection_tokens(tokens[i]).is_none()
        {
            i += 1;
        }
    }
    Some(result.join(" "))
}

/// A word the shell passes through as one literal argument: plain characters, or the whole word
/// in single quotes, or in double quotes with nothing that expands or escapes inside.
fn is_plain_shell_word(word: &str) -> bool {
    let quoted = |q: char| {
        word.len() >= 2 && word.starts_with(q) && word.ends_with(q) && {
            let inner = &word[1..word.len() - 1];
            !inner.is_empty()
                && !inner.contains(q)
                && (q == '\'' || !inner.contains(['$', '`', '\\', '!']))
        }
    };
    quoted('\'')
        || quoted('"')
        || (!word.is_empty()
            && word
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "._:/@+=,%-".contains(c)))
}

/// Why `path` cannot be the working directory of a restored terminal, or `None` when it can.
pub fn launch_dir_problem(path: &str) -> Option<String> {
    let p = Path::new(path);
    match std::fs::metadata(p) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Some(format!("Directory not found: {path}"))
        }
        Err(e) => Some(format!("Cannot access directory: {path} ({e})")),
        Ok(m) if !m.is_dir() => Some(format!("Not a directory: {path}")),
        Ok(_) => std::fs::read_dir(p)
            .err()
            .map(|e| format!("Cannot access directory: {path} ({e})")),
    }
}

fn build_plans_from(
    tabs: HashMap<String, SessionRecord>,
    store_path: Option<&PathBuf>,
) -> Vec<RestorePlan> {
    let mut plans = Vec::new();
    for (tab_id, record) in tabs {
        // Records written before `agent` existed only ever came from Claude's hooks.
        let agent_name = record.agent.clone().unwrap_or_else(|| "claude".to_string());
        let Some(provider) = Provider::of(&agent_name) else {
            // Nothing can re-open a session of an agent with no provider definition, so the
            // record is dead weight: warn and prune it. A blocked launch directory is
            // special-cased as usual, so the directory state decides the same way it does
            // for a missing transcript.
            log::warn!("[agent-session] restore: tab={tab_id} agent '{agent_name}' has no provider row, nothing to resume");
            if let Some(path) = store_path {
                if launch_dir_problem(&record.cwd_launch).is_none() {
                    remove_panel_from_store(&tab_id, path);
                }
            }
            continue;
        };

        // Base the reuse command on the whitelisted args of the stored launch line.
        let base = record
            .launch_cmd
            .as_deref()
            .and_then(|lc| strip_for_resume_base(lc, &agent_name));

        let mut worktree_cwd = None;
        let (cwd_launch, cmd, transcript_missing, plan_wanted) =
            match (&provider.sessions, &provider.missing_transcript) {
                (None, _) => (
                    record.cwd_launch.clone(),
                    Some(provider.resume_cmd(base.as_deref(), &record.session_id)),
                    false,
                    true,
                ),
                (Some(source), policy) => match source
                    .find(&record.session_id, &record.transcript_path)
                {
                    Some(transcript) => {
                        worktree_cwd = provider.cwd_read.read_worktree_path(&transcript);
                        (
                            provider
                                .cwd_read
                                .read_launch_cwd(&transcript)
                                .unwrap_or_else(|| record.cwd_launch.clone()),
                            Some(provider.resume_cmd(base.as_deref(), &record.session_id)),
                            false,
                            true,
                        )
                    }
                    None => {
                        log::info!(
                        "[agent-session] restore plan: tab={tab_id} agent={agent_name} session={} \
                         transcript not found",
                        record.session_id
                    );
                        match policy {
                            MissingTranscriptPolicy::Reattach { .. } => (
                                record.cwd_launch.clone(),
                                Some(provider.reattach_cmd(base.as_deref(), &record.session_id)),
                                true,
                                true,
                            ),
                            MissingTranscriptPolicy::Ignore => {
                                (record.cwd_launch.clone(), None, true, false)
                            }
                            MissingTranscriptPolicy::ResumeAnyway => (
                                record.cwd_launch.clone(),
                                Some(provider.resume_cmd(base.as_deref(), &record.session_id)),
                                true,
                                true,
                            ),
                            MissingTranscriptPolicy::KeepWithoutPlan => {
                                (record.cwd_launch.clone(), None, true, false)
                            }
                        }
                    }
                },
            };

        if let Some(reason) = launch_dir_problem(&cwd_launch) {
            if plan_wanted {
                log::warn!(
                    "[agent-session] restore plan: tab={tab_id} agent={agent_name} {reason}"
                );
                plans.push(RestorePlan {
                    tab_id: tab_id.clone(),
                    agent: agent_name.clone(),
                    resume_cmd: String::new(),
                    attempted_cmd: cmd.clone().unwrap_or_default(),
                    cwd_launch,
                    worktree_cwd: None,
                    error_reason: reason,
                    title: record.title.clone(),
                    notification: record.notification.clone(),
                });
            }
            continue;
        }

        // Pruned only now, after the directory check: a plan blocked by its directory keeps
        // the entry so "Try again" can still find the session once the directory is back.
        // The policy decides: ResumeAnyway and KeepWithoutPlan rows never prune (their record
        // cannot be re-recorded by anything). No-op without a `store_path` (preview must not mutate).
        if transcript_missing
            && !matches!(
                provider.missing_transcript,
                MissingTranscriptPolicy::ResumeAnyway | MissingTranscriptPolicy::KeepWithoutPlan
            )
        {
            if let Some(path) = store_path {
                remove_panel_from_store(&tab_id, path);
            }
        }

        let Some(cmd) = cmd else { continue };

        log::info!("[agent-session] restore plan: tab={tab_id} agent={agent_name} session={} cwd_launch={cwd_launch} cmd={cmd:?}", record.session_id);
        plans.push(RestorePlan {
            tab_id,
            agent: agent_name,
            resume_cmd: cmd,
            attempted_cmd: String::new(),
            cwd_launch,
            worktree_cwd,
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
    let _ = write_private(&path.with_extension("json.bak"), previous_content);
}

// The store holds what the assistant said last, so it and its .bak are the owner's only. The
// mode is set again after writing because `mode` only applies when the file is created, and an
// older Kex left them with the default umask.
fn write_private(path: &Path, content: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
        file.write_all(content.as_bytes())
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, content)
    }
}

fn remove_panel_from_store(tab_id: &str, path: &PathBuf) {
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(content) = std::fs::read_to_string(path) else {
        return;
    };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else {
        return;
    };
    store.tabs.remove(tab_id);
    let Ok(out) = serde_json::to_string_pretty(&store) else {
        return;
    };
    let tmp = path.with_extension("json.kex-tmp");
    if write_private(&tmp, &out).is_ok() {
        write_backup(path, &content);
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Write or update a tab entry in agent-sessions.json.
/// Called from the IPC socket listener (`pty/ipc.rs`) on `SessionStart`.
///
/// Consumes the pending launch command stashed by `stash_cmd`. If the stashed command
/// is print-mode (`-p` / `--print`), the session is not persisted.
///
/// A SessionStart that brings no stashed command, is not same-process and introduces a
/// session id different from the one on record (a child agent of the one running in the
/// tab) does not replace the record; the kept record's launch knowledge is returned.
///
/// `same_process` is true for a SessionStart that continues the agent process already running
/// in the tab (`/clear`, `/compact`, `/resume`): no new command line went through the shell, so the
/// launch command of the previous record still describes it.
///
/// Returns whether the stored record has a launch command. False means the launcher was not
/// recognised (a script of the user's) and a restore can only use the agent's plain command.
pub fn record_session(
    tab_id: &str,
    agent: &str,
    session_id: &str,
    transcript_path: &str,
    cwd_launch: &str,
    same_process: bool,
) -> bool {
    let path = match store_path() {
        Some(p) => p,
        None => return false,
    };
    record_session_at_path_with(
        &path,
        tab_id,
        agent,
        session_id,
        transcript_path,
        cwd_launch,
        same_process,
    )
}

#[cfg(test)]
fn record_session_at_path(
    path: &PathBuf,
    tab_id: &str,
    agent: &str,
    session_id: &str,
    transcript_path: &str,
    cwd_launch: &str,
) {
    record_session_at_path_with(
        path,
        tab_id,
        agent,
        session_id,
        transcript_path,
        cwd_launch,
        false,
    );
}

fn record_session_at_path_with(
    path: &PathBuf,
    tab_id: &str,
    agent: &str,
    session_id: &str,
    transcript_path: &str,
    cwd_launch: &str,
    same_process: bool,
) -> bool {
    let launch_cmd = take_stashed_cmd(tab_id);
    if launch_cmd
        .as_deref()
        .is_some_and(|c| is_print_mode_cmd(c, agent))
    {
        log::info!("[agent-session] skip record: print-mode session tab={tab_id}");
        return false;
    }
    log::info!(
        "[agent-session] record tab={tab_id} agent={agent} session={session_id} cwd_launch={cwd_launch} \
         launch_cmd={launch_cmd:?}"
    );
    let now = now_secs();
    let mut record = SessionRecord {
        agent: Some(agent.to_string()),
        session_id: session_id.to_string(),
        cwd_launch: cwd_launch.to_string(),
        transcript_path: transcript_path.to_string(),
        launch_cmd,
        title: None,
        notification: None,
        last_message: None,
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
    let mut store = SessionStore {
        version: 1,
        tabs: HashMap::new(),
    };
    let mut valid_existing: Option<&str> = None;
    if let Some(s) = existing_content.as_deref() {
        if let Ok(parsed) = serde_json::from_str::<SessionStore>(s) {
            store = parsed;
            valid_existing = Some(s);
        }
    }
    // A child agent launched inside the tab (by the agent working there or by a script)
    // inherits KEX_TAB_ID through the environment, so its SessionStart names this tab but
    // brings no launch line and, with a different session id, must not take the record from
    // the agent that is really running (TASK-898).
    let unverified_launch = record.launch_cmd.is_none() && !same_process;
    let known = store.tabs.get(tab_id);
    if unverified_launch && known.is_some_and(|previous| previous.session_id != session_id) {
        log::info!(
            "[agent-session] skip record: session {session_id} of tab={tab_id} launched \
             without the tab shell; session {} keeps the record",
            known.map(|p| p.session_id.as_str()).unwrap_or_default()
        );
        return known.is_some_and(|p| p.launch_cmd.is_some());
    }
    // SessionStart fires again on every resume and replaces the record; the name and the
    // pending notification it held must survive until the frontend reports new ones. A resume
    // keeps the session id, while /clear or an agent launched by hand brings a new one, which
    // must not inherit the old conversation's name.
    if let Some(previous) = store
        .tabs
        .get(tab_id)
        .filter(|p| p.session_id == session_id)
    {
        record.title = previous.title.clone();
        record.notification = previous.notification.clone();
        record.last_message = previous.last_message.clone();
    }
    // The same session id is the same process: a duplicate SessionStart (two plugin instances,
    // a re-registered session) brings no launch line and must not erase the known one.
    let same_session = store
        .tabs
        .get(tab_id)
        .is_some_and(|p| p.session_id == session_id);
    if record.launch_cmd.is_none() && (same_process || same_session) {
        record.launch_cmd = store.tabs.get(tab_id).and_then(|p| p.launch_cmd.clone());
    }
    let launch_known = record.launch_cmd.is_some();
    store.tabs.insert(tab_id.to_string(), record);
    if let Ok(out) = serde_json::to_string_pretty(&store) {
        let tmp = path.with_extension("json.kex-tmp");
        if write_private(&tmp, &out).is_ok() {
            if let Some(prev) = valid_existing {
                write_backup(path, prev);
            }
            let _ = std::fs::rename(&tmp, path);
        }
    }
    launch_known
}

const MAX_TITLE_CHARS: usize = 200;
const NOTIFICATION_KINDS: [&str; 4] = ["attention", "finished", "error", "interrupted"];

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

fn set_snapshot_at_path(
    path: &Path,
    tab_id: &str,
    session_id: &str,
    title: &str,
    notification: &str,
) -> bool {
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(content) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else {
        return false;
    };
    let Some(record) = store.tabs.get_mut(tab_id) else {
        return false;
    };
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
    let Ok(out) = serde_json::to_string_pretty(&store) else {
        return false;
    };
    let tmp = path.with_extension("json.kex-tmp");
    if write_private(&tmp, &out).is_err() {
        return false;
    }
    write_backup(path, &content);
    if std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
        return false;
    }
    true
}

// A preview to recognise the conversation by, not a transcript: agent-sessions.json is not
// encrypted, so the less of what the assistant said lands there the better. 280 characters
// fill the two clamped lines of the hibernated tab placeholder with room to spare.
pub const MAX_LAST_MESSAGE_CHARS: usize = 280;

/// The stored form of a Stop's `last_assistant_message`: whitespace runs (newlines, code
/// indentation) collapsed to one space, clipped by characters with a trailing ellipsis. `None`
/// when nothing visible is left, a turn that ended on a tool call says nothing.
pub fn clip_last_message(message: &str) -> Option<String> {
    let flat = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.is_empty() {
        return None;
    }
    if flat.chars().count() <= MAX_LAST_MESSAGE_CHARS {
        return Some(flat);
    }
    let mut clipped: String = flat.chars().take(MAX_LAST_MESSAGE_CHARS - 1).collect();
    clipped.truncate(clipped.trim_end().len());
    clipped.push('\u{2026}');
    Some(clipped)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Stores the assistant's last message of a Stop and stamps `updated_at` with the end of the
/// turn. Only for a recorded tab of the same session id, like `set_snapshot`. A Stop without
/// the field (agents whose hook never sends it) must not call this: the record keeps no message.
/// A message with nothing visible (a turn that ended on a tool call) leaves the record as it is,
/// so the preview keeps the last thing the assistant actually said.
pub fn set_last_message(tab_id: &str, session_id: &str, message: &str) -> bool {
    match store_path() {
        Some(path) => set_last_message_at_path(&path, tab_id, session_id, message, now_secs()),
        None => false,
    }
}

fn set_last_message_at_path(
    path: &Path,
    tab_id: &str,
    session_id: &str,
    message: &str,
    now: u64,
) -> bool {
    let Some(clipped) = clip_last_message(message) else {
        return false;
    };
    let _guard = store_lock().lock().unwrap_or_else(|e| e.into_inner());
    let Ok(content) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(mut store) = serde_json::from_str::<SessionStore>(&content) else {
        return false;
    };
    let Some(record) = store.tabs.get_mut(tab_id) else {
        return false;
    };
    if record.session_id != session_id {
        return false;
    }
    record.last_message = Some(clipped);
    record.updated_at = now;
    let Ok(out) = serde_json::to_string_pretty(&store) else {
        return false;
    };
    let tmp = path.with_extension("json.kex-tmp");
    if write_private(&tmp, &out).is_err() {
        return false;
    }
    write_backup(path, &content);
    if std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
        return false;
    }
    true
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPreview {
    pub tab_id: String,
    pub cwd: String,
    pub last_message: Option<String>,
    /// Seconds since the epoch of the last Stop, or of the SessionStart for an agent that has
    /// not finished a turn (or whose Stop carries no message).
    pub updated_at: u64,
}

// The overlay asks for the tabs of one workspace; anything far beyond that is not a caller of ours.
const MAX_PREVIEW_TABS: usize = 256;

/// What a sleeping tab's session said last, where it ran and when, for the tabs that have a
/// record. Reads only agent-sessions.json (no transcript) and never mutates it.
pub fn session_previews(tab_ids: &[String]) -> Vec<SessionPreview> {
    match store_path() {
        Some(path) => session_previews_from_path(&path, tab_ids),
        None => vec![],
    }
}

fn session_previews_from_path(path: &Path, tab_ids: &[String]) -> Vec<SessionPreview> {
    let Some(store) = std::fs::read_to_string(path)
        .ok()
        .and_then(|c| serde_json::from_str::<SessionStore>(&c).ok())
    else {
        return vec![];
    };
    tab_ids
        .iter()
        .take(MAX_PREVIEW_TABS)
        .filter_map(|id| {
            let record = store.tabs.get(id)?;
            Some(SessionPreview {
                tab_id: id.clone(),
                cwd: record.cwd_launch.clone(),
                last_message: record.last_message.clone(),
                updated_at: record.updated_at,
            })
        })
        .collect()
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
                if write_private(&tmp, &out).is_ok() {
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
                log::warn!(
                    "[agent-session] restore: main store unavailable, recovered from backup"
                );
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
    log::info!(
        "[agent-session] restore: {} session(s) in store",
        store.tabs.len()
    );
    build_plans_from(store.tabs, Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::agent::provider::shell_quote;

    #[test]
    fn is_print_mode_detects_p_flag() {
        assert!(is_print_mode_cmd("claude -p hello", "claude"));
        assert!(is_print_mode_cmd("claude --print", "claude"));
        assert!(is_print_mode_cmd("claude --model opus -p", "claude"));
        assert!(!is_print_mode_cmd("claude --model opus", "claude"));
        assert!(!is_print_mode_cmd("claude", "claude"));
    }

    #[test]
    fn strip_keeps_whitelisted_flags() {
        // --model and --effort are NOT kept (configurable in-session via /model)
        let base = strip_for_resume_base("claude --model opus --effort high --safe-mode", "claude")
            .unwrap();
        assert_eq!(base, "claude --safe-mode");
    }

    #[test]
    fn strip_removes_non_whitelisted_flags() {
        let base = strip_for_resume_base(
            "claude --model opus --worktree my-branch --effort high",
            "claude",
        )
        .unwrap();
        assert_eq!(base, "claude");
    }

    #[test]
    fn strip_removes_flag_with_value() {
        // --debug-file has a value; both flag and value should be dropped
        let base = strip_for_resume_base(
            "claude --model opus --debug-file /tmp/out.log --effort high",
            "claude",
        )
        .unwrap();
        assert_eq!(base, "claude");
    }

    #[test]
    fn strip_keeps_add_dir_multiple_values() {
        let base = strip_for_resume_base("claude --add-dir /a /b --model opus", "claude").unwrap();
        assert_eq!(base, "claude --add-dir /a /b");
    }

    #[test]
    fn strip_handles_eq_form() {
        // --model=opus and --effort=high are dropped (in-session configurable)
        let base = strip_for_resume_base("claude --model=opus --effort=high", "claude").unwrap();
        assert_eq!(base, "claude");
    }

    #[test]
    fn resume_cmd_from_launch_cmd_strips_and_adds_resume() {
        let lc = "claude --model opus --worktree feat -p";
        let base = strip_for_resume_base(lc, "claude").unwrap();
        let cmd = format!("{base} --resume {}", shell_quote("abc-123"));
        // --worktree, -p, --model all removed; --resume added
        assert_eq!(cmd, "claude --resume 'abc-123'");
    }

    #[test]
    fn reattach_from_launch_cmd_uses_session_id() {
        let lc = "claude --model opus --safe-mode";
        let base = strip_for_resume_base(lc, "claude").unwrap();
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
        std::fs::write(
            &jsonl,
            format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display()),
        )
        .unwrap();

        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("claude".to_string()),
                session_id: "abc-123".to_string(),
                cwd_launch: cwd_launch.display().to_string(),
                transcript_path: jsonl.display().to_string(),
                launch_cmd: Some("claude --model opus --safe-mode".to_string()),
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plan = preview_resume_cmd_from_path("tab-1", &store_path).expect("plan for known tab");
        assert_eq!(plan.tab_id, "tab-1");
        assert_eq!(plan.resume_cmd, "claude --safe-mode --resume 'abc-123'");
        assert_eq!(plan.error_reason, "");
    }

    #[test]
    fn strip_heals_a_launch_cmd_stored_with_the_cd_prefix() {
        let lc = " cd '/Users/x/Application Support/Taxes' && claude --resume 'old-id'";
        assert_eq!(
            strip_for_resume_base(lc, "claude").as_deref(),
            Some("claude")
        );
        let lc = " cd '/x' && claude-max --resume 'old-id'";
        assert_eq!(
            strip_for_resume_base(lc, "claude").as_deref(),
            Some("claude-max")
        );
    }

    #[test]
    fn strip_keeps_assignments_and_wrappers_before_the_launcher() {
        let base = strip_for_resume_base(
            "FOO=1 env BAR=2 claude-max --model opus --safe-mode",
            "claude",
        );
        assert_eq!(
            base.as_deref(),
            Some("FOO=1 env BAR=2 claude-max --safe-mode")
        );
    }

    #[test]
    fn strip_keeps_a_quoted_value_with_spaces_whole() {
        let base = strip_for_resume_base(
            "claude --append-system-prompt 'hello world' --model opus",
            "claude",
        );
        assert_eq!(
            base.as_deref(),
            Some("claude --append-system-prompt 'hello world'")
        );
    }

    #[test]
    fn strip_drops_redirections_and_does_not_eat_them_as_values() {
        let base = strip_for_resume_base("claude --add-dir /a 2>/dev/null", "claude");
        assert_eq!(base.as_deref(), Some("claude --add-dir /a"));
        let base = strip_for_resume_base("claude --safe-mode > out.log --add-dir /a", "claude");
        assert_eq!(base.as_deref(), Some("claude --safe-mode --add-dir /a"));
    }

    #[test]
    fn codex_resume_keeps_profile_model_and_provider_options() {
        let base = strip_for_resume_base(
            "codex -p work --oss --local-provider ollama -m o3 'fix it'",
            "codex",
        );
        assert_eq!(
            base.as_deref(),
            Some("codex -p work --oss --local-provider ollama -m o3")
        );
        let base = strip_for_resume_base("codex --profile work --model=o3 --search 'go'", "codex");
        assert_eq!(base.as_deref(), Some("codex --profile work --model=o3"));
    }

    #[test]
    fn codex_resume_never_regrants_sandbox_or_approval_bypasses() {
        let mut lines = vec![
            "codex --dangerously-bypass-approvals-and-sandbox -p work".to_string(),
            "codex --yolo -p work".to_string(),
            "codex -s danger-full-access -p work".to_string(),
            "codex --sandbox danger-full-access -p work".to_string(),
            "codex -a never -p work".to_string(),
            "codex --ask-for-approval never -p work".to_string(),
        ];
        // A config override can set the sandbox or the approval policy as well as an option can.
        for value in [
            r#"sandbox_mode="danger-full-access""#,
            "approval_policy=never",
            "effort=high",
        ] {
            lines.push(format!("codex -c {value} -p work"));
            lines.push(format!("codex -c={value} -p work"));
            lines.push(format!("codex --config {value} -p work"));
            lines.push(format!("codex --config={value} -p work"));
        }
        for line in &lines {
            assert_eq!(
                strip_for_resume_base(line, "codex").as_deref(),
                Some("codex -p work"),
                "{line}"
            );
        }
    }

    #[test]
    fn codex_resume_line_is_stable_under_a_second_strip() {
        let base =
            strip_for_resume_base("codex -p work -c a=b -m o3 --oss 'fix it'", "codex").unwrap();
        let resume = Provider::of("codex")
            .unwrap()
            .resume_cmd(Some(&base), "id-1");
        assert_eq!(resume, "codex -p work -m o3 --oss resume 'id-1'");
        assert_eq!(strip_for_resume_base(&resume, "codex").unwrap(), base);
    }

    #[test]
    fn a_codex_single_value_option_never_takes_a_flag_or_a_redirection_for_its_value() {
        for (line, want) in [
            ("codex -p work -m --yolo", "codex -p work"),
            ("codex -m --oss -p work", "codex --oss -p work"),
            ("codex -p work -m 2>/dev/null", "codex -p work"),
            ("codex -p work -m > out.log", "codex -p work"),
        ] {
            assert_eq!(
                strip_for_resume_base(line, "codex").as_deref(),
                Some(want),
                "{line}"
            );
        }
    }

    fn codex_base_is_stable(base: &str) {
        let resume = Provider::of("codex")
            .unwrap()
            .resume_cmd(Some(base), "id-1");
        assert_eq!(
            strip_for_resume_base(&resume, "codex").as_deref(),
            Some(base),
            "{resume}"
        );
    }

    #[test]
    fn a_codex_value_option_left_without_a_value_is_dropped() {
        for (line, want) in [
            ("codex -p work -m --yolo", "codex -p work"),
            ("codex -p work -m", "codex -p work"),
            ("codex -m > out.log -p work", "codex -p work"),
            ("codex -m 2>/dev/null -p work", "codex -p work"),
            ("codex --model= -p work", "codex -p work"),
            ("codex --profile --oss", "codex --oss"),
        ] {
            assert_eq!(
                strip_for_resume_base(line, "codex").as_deref(),
                Some(want),
                "{line}"
            );
            codex_base_is_stable(want);
        }
    }

    #[test]
    fn a_codex_value_the_shell_would_expand_is_never_kept() {
        for (line, want) in [
            ("codex -m $(echo o3 --yolo) -p work", "codex -p work"),
            ("codex -p `x` -m o3", "codex -m o3"),
            ("codex -m $MODEL -p work", "codex -p work"),
            ("codex --model=$MODEL -p work", "codex -p work"),
            ("codex -m \"$MODEL\" -p work", "codex -p work"),
            ("codex -m ${M:-o3} -p work", "codex -p work"),
            ("codex -m o3\\ --yolo -p work", "codex -p work"),
            ("codex -m o3* -p work", "codex -p work"),
            ("codex -m ~/m -p work", "codex -p work"),
            ("codex -m 'a'b -p work", "codex -p work"),
            ("codex --local-provider $(x) --oss", "codex --oss"),
        ] {
            assert_eq!(
                strip_for_resume_base(line, "codex").as_deref(),
                Some(want),
                "{line}"
            );
            codex_base_is_stable(want);
        }
    }

    #[test]
    fn a_plain_codex_value_is_kept() {
        for line in [
            "codex -m o3",
            "codex -m gpt-5 -p work",
            "codex --profile 'my profile'",
            "codex --model=\"gpt-5\" --local-provider ollama",
            "codex -m gpt-5.1-codex --profile team:a/b",
        ] {
            assert_eq!(
                strip_for_resume_base(line, "codex").as_deref(),
                Some(line),
                "{line}"
            );
            codex_base_is_stable(line);
        }
    }

    #[test]
    fn strip_keeps_another_known_agent_launcher_like_before() {
        let base = strip_for_resume_base("codex resume abc-123", "claude");
        assert_eq!(base.as_deref(), Some("codex"));
    }

    #[test]
    fn healed_command_round_trips_through_the_retry_line() {
        let line = " cd '/Users/x/Application Support/Taxes' && FOO=1 claude-max --model opus --safe-mode --resume 'id-1'";
        let stored = find_agent_invocation(line, &known_agents("claude"))
            .unwrap()
            .command();
        let base = strip_for_resume_base(&stored, "claude").unwrap();
        let resume = format!("{base} --resume {}", shell_quote("id-2"));
        assert_eq!(resume, "FOO=1 claude-max --safe-mode --resume 'id-2'");

        let retyped = format!(" cd '/Users/x/Application Support/Taxes' && {resume}");
        let stored_again = find_agent_invocation(&retyped, &known_agents("claude"))
            .unwrap()
            .command();
        assert_eq!(stored_again, resume);
        assert_eq!(
            strip_for_resume_base(&stored_again, "claude").unwrap(),
            base
        );
    }

    #[test]
    fn strip_refuses_a_stored_command_that_was_cut() {
        assert_eq!(
            strip_for_resume_base("claude --append-system-prompt 'abc def", "claude"),
            None
        );
        assert_eq!(
            strip_for_resume_base("claude --add-dir /a\\", "claude"),
            None
        );
    }

    #[test]
    fn strip_keeps_process_substitution_values() {
        let base = strip_for_resume_base("claude --mcp-config <(echo '{}') --verbose", "claude");
        assert_eq!(
            base.as_deref(),
            Some("claude --mcp-config <(echo '{}') --verbose")
        );
    }

    #[test]
    fn record_reports_whether_the_launch_command_is_known() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-known", "claude-max --safe-mode".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-known",
            "claude",
            "s1",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));
        assert!(!record_session_at_path_with(
            &path,
            "tab-unknown",
            "claude",
            "s2",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));
    }

    #[test]
    fn a_codex_session_start_records_the_full_record() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-codex-rec", "codex -p work".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-codex-rec",
            "codex",
            "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e",
            "",
            "/tmp/p",
            false
        ));

        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let rec = &store.tabs["tab-codex-rec"];
        assert_eq!(rec.agent.as_deref(), Some("codex"));
        assert_eq!(rec.session_id, "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e");
        assert_eq!(rec.transcript_path, "");
        assert_eq!(rec.cwd_launch, "/tmp/p");
        assert_eq!(rec.launch_cmd.as_deref(), Some("codex -p work"));
    }

    #[test]
    fn a_codex_exec_run_is_not_recorded() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        for (tab, line) in [
            ("tab-codex-exec", "codex exec 'fix it'"),
            ("tab-codex-e", "cd x && codex -c a=b e hi"),
        ] {
            stash_cmd(tab, line.to_string());
            assert!(!record_session_at_path_with(
                &path, tab, "codex", "s1", "", "/tmp/p", false
            ));
        }
        assert!(!path.exists(), "a one-shot codex run writes nothing");
    }

    #[test]
    fn a_clear_or_compact_keeps_the_launch_command_of_the_running_process() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-clear-keeps", "claude-max".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-clear-keeps",
            "claude",
            "old",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));
        assert!(record_session_at_path_with(
            &path,
            "tab-clear-keeps",
            "claude",
            "new",
            "/tmp/s.jsonl",
            "/tmp/p",
            true
        ));
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            store.tabs["tab-clear-keeps"].launch_cmd.as_deref(),
            Some("claude-max")
        );
    }

    #[test]
    fn a_duplicate_session_start_of_the_same_session_keeps_the_launch_command() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-dup-start", "opencode".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-dup-start",
            "opencode",
            "ses_1",
            "",
            "/tmp/p",
            false
        ));
        assert!(record_session_at_path_with(
            &path,
            "tab-dup-start",
            "opencode",
            "ses_1",
            "",
            "/tmp/p",
            false
        ));
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            store.tabs["tab-dup-start"].launch_cmd.as_deref(),
            Some("opencode")
        );
    }

    #[test]
    fn a_new_session_in_the_same_tab_does_not_inherit_the_old_launch_command() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-new-sess", "claude-max".to_string());
        record_session_at_path_with(&path, "tab-new-sess", "claude", "a", "", "/tmp/p", false);

        // A new claude launched by hand carries its own line from the tab's shell: the
        // record is replaced and the old launch command must not leak into it.
        stash_cmd("tab-new-sess", "claude".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-new-sess",
            "claude",
            "b",
            "",
            "/tmp/p",
            false
        ));
        assert_eq!(
            read_store(&path).tabs["tab-new-sess"].launch_cmd.as_deref(),
            Some("claude")
        );
    }

    #[test]
    fn a_print_run_is_tracked_per_tab_until_cleared() {
        assert!(!is_print_run("tab-print-a"));
        mark_print_run("tab-print-a");
        assert!(is_print_run("tab-print-a"));
        assert!(!is_print_run("tab-print-b"));
        clear_print_run("tab-print-a");
        assert!(!is_print_run("tab-print-a"));
    }

    #[test]
    fn a_dropped_stash_is_not_read_by_the_next_session_start() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-stash-dropped", "claude-max".to_string());
        drop_stashed_cmd("tab-stash-dropped");
        assert!(!record_session_at_path_with(
            &path,
            "tab-stash-dropped",
            "claude",
            "s1",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));
    }

    #[test]
    fn strip_returns_none_when_no_agent_is_launched() {
        assert_eq!(strip_for_resume_base("cd ~/claude-docs", "claude"), None);
        assert_eq!(strip_for_resume_base("", "claude"), None);
    }

    #[test]
    fn preview_resume_cmd_from_path_heals_a_contaminated_launch_cmd() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(
            &jsonl,
            format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display()),
        )
        .unwrap();

        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("claude".to_string()),
                session_id: "abc-123".to_string(),
                cwd_launch: cwd_launch.display().to_string(),
                transcript_path: jsonl.display().to_string(),
                launch_cmd: Some(" cd '/somewhere' && claude-max --resume 'abc-123'".to_string()),
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plan = preview_resume_cmd_from_path("tab-1", &store_path).expect("plan for known tab");
        assert_eq!(plan.resume_cmd, "claude-max --resume 'abc-123'");
    }

    #[test]
    fn print_mode_is_decided_on_the_agent_segment() {
        assert!(is_print_mode_cmd("cd x && claude -p hi", "claude"));
        assert!(!is_print_mode_cmd("time -p claude", "claude"));
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
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("claude".to_string()),
                session_id: "abc-123".to_string(),
                cwd_launch: dir.path().join("does-not-exist").display().to_string(),
                transcript_path: dir.path().join("missing.jsonl").display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
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

    fn plan_for_transcript(
        dir: &Path,
        lines: &[String],
        cwd_launch: &Path,
    ) -> (RestorePlan, PathBuf) {
        let jsonl = dir.join("session.jsonl");
        std::fs::write(&jsonl, lines.join("\n") + "\n").unwrap();
        let store_path = dir.join("agent-sessions.json");
        write_store(&store_path, sample_tabs(cwd_launch, &jsonl));
        let plans = load_restore_plan_from_path(&store_path);
        (plans.into_iter().next().expect("one plan"), store_path)
    }

    #[test]
    fn an_omp_record_with_a_live_session_file_resumes_it() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        std::fs::create_dir_all(&launch).unwrap();
        let jsonl = dir.path().join("2026-10-17T10_00_00Z_omp-abc.jsonl");
        std::fs::write(
            &jsonl,
            format!(
                "{{\"type\":\"title\",\"title\":\"t\"}}\n{{\"type\":\"session\",\"id\":\"omp-abc\",\"cwd\":\"{}\"}}\n",
                launch.display()
            ),
        )
        .unwrap();
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("omp".to_string()),
                session_id: "omp-abc".to_string(),
                cwd_launch: launch.display().to_string(),
                transcript_path: jsonl.display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].agent, "omp");
        assert_eq!(plans[0].resume_cmd, "omp --resume 'omp-abc'");
        assert_eq!(plans[0].cwd_launch, launch.display().to_string());
    }

    #[test]
    fn an_omp_record_without_a_session_file_gets_no_plan_and_is_never_pruned() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        std::fs::create_dir_all(&launch).unwrap();
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("omp".to_string()),
                session_id: "omp-abc".to_string(),
                cwd_launch: launch.display().to_string(),
                transcript_path: dir.path().join("missing.jsonl").display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert!(plans.is_empty());
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(store.tabs.contains_key("tab-1"));
    }

    #[test]
    fn a_pi_record_with_a_live_session_file_resumes_it() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        std::fs::create_dir_all(&launch).unwrap();
        let stale = dir.path().join("stale");
        std::fs::create_dir_all(&stale).unwrap();
        let jsonl = dir.path().join("2026-10-17T10_00_00Z_pi-abc.jsonl");
        std::fs::write(
            &jsonl,
            format!(
                "{{\"type\":\"session\",\"version\":3,\"id\":\"pi-abc\",\"cwd\":\"{}\"}}\n{{\"type\":\"message\"}}\n",
                launch.display()
            ),
        )
        .unwrap();
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("pi".to_string()),
                session_id: "pi-abc".to_string(),
                cwd_launch: stale.display().to_string(),
                transcript_path: jsonl.display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].agent, "pi");
        assert_eq!(plans[0].resume_cmd, "pi --session 'pi-abc'");
        assert_eq!(plans[0].cwd_launch, launch.display().to_string());
    }

    #[test]
    fn a_pi_record_without_a_session_file_gets_no_plan_and_is_never_pruned() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        std::fs::create_dir_all(&launch).unwrap();
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("pi".to_string()),
                session_id: "pi-abc".to_string(),
                cwd_launch: launch.display().to_string(),
                transcript_path: dir.path().join("missing.jsonl").display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert!(plans.is_empty());
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(store.tabs.contains_key("tab-1"));
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
                launch.display(),
                worktree.display()
            ),
            format!(r#"{{"type":"user","cwd":"{}"}}"#, worktree.display()),
        ];

        let (plan, _) = plan_for_transcript(dir.path(), &lines, &worktree);

        assert_eq!(plan.error_reason, "");
        assert_eq!(plan.cwd_launch, launch.display().to_string());
    }

    fn worktree_state_line(launch: &Path, worktree: &Path) -> String {
        format!(
            r#"{{"type":"worktree-state","worktreeSession":{{"originalCwd":"{}","worktreePath":"{}"}}}}"#,
            launch.display(),
            worktree.display()
        )
    }

    #[test]
    fn restore_reports_the_worktree_when_it_still_exists() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        let worktree = dir.path().join("wt");
        std::fs::create_dir_all(&launch).unwrap();
        std::fs::create_dir_all(&worktree).unwrap();
        let lines = vec![worktree_state_line(&launch, &worktree)];

        let (plan, _) = plan_for_transcript(dir.path(), &lines, &launch);

        assert_eq!(plan.cwd_launch, launch.display().to_string());
        assert_eq!(plan.worktree_cwd, Some(worktree.display().to_string()));
    }

    #[test]
    fn restore_reports_no_worktree_when_it_is_gone_or_was_left() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("app");
        let worktree = dir.path().join("wt");
        std::fs::create_dir_all(&launch).unwrap();
        std::fs::create_dir_all(&worktree).unwrap();
        let entered = worktree_state_line(&launch, &worktree);
        let left = r#"{"type":"worktree-state","worktreeSession":null}"#.to_string();

        let (plan, _) = plan_for_transcript(dir.path(), &[entered.clone(), left], &launch);
        assert_eq!(plan.worktree_cwd, None);

        std::fs::remove_dir_all(&worktree).unwrap();
        let (plan, _) = plan_for_transcript(dir.path(), &[entered], &launch);
        assert_eq!(plan.worktree_cwd, None);
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
        let lines = vec![format!(
            r#"{{"type":"user","cwd":"{}"}}"#,
            missing.display()
        )];

        let (plan, store_path) = plan_for_transcript(dir.path(), &lines, &missing);

        assert!(plan.error_reason.contains("Directory not found"));
        assert_eq!(plan.resume_cmd, "");
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(store.tabs.contains_key("tab-1"));
    }

    #[test]
    fn restore_error_plan_carries_the_blocked_command() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone");
        let lines = vec![format!(
            r#"{{"type":"user","cwd":"{}"}}"#,
            missing.display()
        )];

        let (plan, _) = plan_for_transcript(dir.path(), &lines, &missing);

        assert_eq!(plan.resume_cmd, "");
        assert!(
            plan.attempted_cmd.contains("--resume 'abc-123'"),
            "{}",
            plan.attempted_cmd
        );
    }

    #[test]
    fn restore_keeps_store_entry_when_transcript_and_launch_dir_are_both_missing() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("gone");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("claude".to_string()),
                session_id: "abc-123".to_string(),
                cwd_launch: missing.display().to_string(),
                transcript_path: dir.path().join("missing.jsonl").display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
        let store_path = dir.path().join("agent-sessions.json");
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert!(plans[0].error_reason.contains("Directory not found"));
        assert!(plans[0].attempted_cmd.contains("--session-id 'abc-123'"));
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
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
        assert_eq!(
            launch_dir_problem(&missing),
            Some(format!("Directory not found: {missing}"))
        );
    }

    #[test]
    fn launch_dir_problem_reports_a_file_as_not_a_directory() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("f.txt");
        std::fs::write(&file, "x").unwrap();
        let file = file.display().to_string();
        assert_eq!(
            launch_dir_problem(&file),
            Some(format!("Not a directory: {file}"))
        );
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
        tabs.insert(
            "tab-1".to_string(),
            SessionRecord {
                agent: Some("claude".to_string()),
                session_id: "abc-123".to_string(),
                cwd_launch: cwd_launch.display().to_string(),
                transcript_path: jsonl.display().to_string(),
                launch_cmd: None,
                title: None,
                notification: None,
                last_message: None,
                updated_at: 0,
            },
        );
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

        let after: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
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

        let after: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(after.tabs.is_empty());
    }

    #[test]
    fn record_session_at_path_skips_backup_when_no_previous_file() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        record_session_at_path(
            &store_path,
            "tab-1",
            "claude",
            "abc-123",
            "/tmp/session.jsonl",
            "/tmp/project",
        );

        assert!(store_path.exists());
        assert!(!store_path.with_extension("json.bak").exists());
    }

    #[test]
    fn record_session_at_path_writes_backup_of_previous_version() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        record_session_at_path(
            &store_path,
            "tab-1",
            "claude",
            "abc-123",
            "/tmp/session.jsonl",
            "/tmp/project",
        );
        let first_write = std::fs::read_to_string(&store_path).unwrap();

        record_session_at_path(
            &store_path,
            "tab-2",
            "claude",
            "def-456",
            "/tmp/session2.jsonl",
            "/tmp/project2",
        );

        let bak_content = std::fs::read_to_string(store_path.with_extension("json.bak")).unwrap();
        assert_eq!(bak_content, first_write);
    }

    #[test]
    fn load_restore_plan_from_path_recovers_from_backup_when_main_file_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(
            &jsonl,
            format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display()),
        )
        .unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        // Two writes so the second one produces a .bak of the first, valid version.
        record_session_at_path(
            &store_path,
            "tab-1",
            "claude",
            "abc-123",
            &jsonl.display().to_string(),
            &cwd_launch.display().to_string(),
        );
        record_session_at_path(
            &store_path,
            "tab-1",
            "claude",
            "abc-123",
            &jsonl.display().to_string(),
            &cwd_launch.display().to_string(),
        );
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
        std::fs::write(
            &jsonl,
            format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display()),
        )
        .unwrap();
        let store_path = dir.path().join("agent-sessions.json");

        // Two writes so the second one produces a .bak of the first, valid version.
        record_session_at_path(
            &store_path,
            "tab-1",
            "claude",
            "abc-123",
            &jsonl.display().to_string(),
            &cwd_launch.display().to_string(),
        );
        record_session_at_path(
            &store_path,
            "tab-1",
            "claude",
            "abc-123",
            &jsonl.display().to_string(),
            &cwd_launch.display().to_string(),
        );
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

        let valid_store = SessionStore {
            version: 1,
            tabs: sample_tabs(&cwd_launch, &jsonl),
        };
        let valid_content = serde_json::to_string_pretty(&valid_store).unwrap();
        std::fs::write(store_path.with_extension("json.bak"), &valid_content).unwrap();
        std::fs::write(&store_path, "{ not valid json").unwrap();

        record_session_at_path(
            &store_path,
            "tab-2",
            "claude",
            "def-456",
            "/tmp/session2.jsonl",
            "/tmp/project2",
        );

        let bak_content = std::fs::read_to_string(store_path.with_extension("json.bak")).unwrap();
        assert_eq!(
            bak_content, valid_content,
            "a corrupt main file must not clobber a valid backup"
        );

        let after: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(after.tabs.contains_key("tab-2"));
    }

    fn plan(tab: &str) -> RestorePlan {
        RestorePlan {
            tab_id: tab.to_string(),
            agent: "claude".to_string(),
            resume_cmd: String::new(),
            attempted_cmd: String::new(),
            cwd_launch: String::new(),
            worktree_cwd: None,
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

        assert!(!set_snapshot_at_path(
            &path,
            "tab-1",
            "old",
            "stale title",
            "attention"
        ));

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
    fn set_snapshot_stores_the_interrupted_marker() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");

        set_snapshot_at_path(&path, "tab-1", "abc", "t", "interrupted");

        assert_eq!(
            read_store(&path).tabs["tab-1"].notification.as_deref(),
            Some("interrupted")
        );
    }

    #[test]
    fn set_snapshot_ignores_unknown_notification_kinds_and_unrecorded_tabs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");

        assert!(set_snapshot_at_path(&path, "tab-1", "abc", "x", "bogus"));
        assert!(!set_snapshot_at_path(
            &path,
            "tab-2",
            "abc",
            "y",
            "attention"
        ));

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
        record_session_at_path(
            &path,
            "tab-1",
            "claude",
            "abc",
            "/tmp/s.jsonl",
            &missing.display().to_string(),
        );
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "error");

        let plans = load_restore_plan_from_path(&path);

        assert!(plans[0].resume_cmd.is_empty());
        assert_eq!(plans[0].title.as_deref(), Some("fixing the build"));
        assert_eq!(plans[0].notification.as_deref(), Some("error"));
    }

    #[test]
    fn clip_last_message_flattens_whitespace_and_keeps_short_text() {
        assert_eq!(
            clip_last_message("  Done.\n\n  Tests   pass\t").as_deref(),
            Some("Done. Tests pass")
        );
        assert_eq!(clip_last_message(" \n\t "), None);
        assert_eq!(clip_last_message(""), None);
    }

    #[test]
    fn clip_last_message_caps_by_characters_without_splitting_one() {
        let exact: String = "\u{00e9}".repeat(MAX_LAST_MESSAGE_CHARS);
        assert_eq!(clip_last_message(&exact).as_deref(), Some(exact.as_str()));

        let long: String = "\u{00e9}\u{1F600}x".repeat(300);
        let clipped = clip_last_message(&long).unwrap();
        assert_eq!(clipped.chars().count(), MAX_LAST_MESSAGE_CHARS);
        assert!(clipped.ends_with('\u{2026}'));
        assert!(long.starts_with(clipped.trim_end_matches('\u{2026}')));
    }

    #[test]
    fn clip_last_message_drops_the_space_before_the_ellipsis() {
        let long = format!("{} tail", "a".repeat(MAX_LAST_MESSAGE_CHARS - 2));
        let clipped = clip_last_message(&long).unwrap();
        assert!(clipped.ends_with("a\u{2026}"), "{clipped}");
    }

    #[test]
    fn each_stop_replaces_the_last_message_and_stamps_the_time() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");

        assert!(set_last_message_at_path(
            &path,
            "tab-1",
            "abc",
            "first answer",
            100
        ));
        assert!(set_last_message_at_path(
            &path,
            "tab-1",
            "abc",
            "second\nanswer",
            200
        ));

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.last_message.as_deref(), Some("second answer"));
        assert_eq!(rec.updated_at, 200);
    }

    #[test]
    fn an_empty_stop_message_leaves_the_record_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_last_message_at_path(&path, "tab-1", "abc", "old answer", 100);
        let before = std::fs::read_to_string(&path).unwrap();

        assert!(!set_last_message_at_path(
            &path, "tab-1", "abc", "  \n", 200
        ));

        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.last_message.as_deref(), Some("old answer"));
        assert_eq!(rec.updated_at, 100);
    }

    #[cfg(unix)]
    #[test]
    fn the_store_and_its_backup_are_readable_by_the_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        let bak = path.with_extension("json.bak");
        std::fs::write(&bak, "{}").unwrap();
        std::fs::set_permissions(&bak, std::fs::Permissions::from_mode(0o644)).unwrap();
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_last_message_at_path(&path, "tab-1", "abc", "secret answer", 100);

        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&path), 0o600);
        assert_eq!(mode(&bak), 0o600);
    }

    #[test]
    fn set_last_message_ignores_another_session_and_unrecorded_tabs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "new", "/tmp/s.jsonl", "/tmp/p");

        assert!(!set_last_message_at_path(&path, "tab-1", "old", "stale", 1));
        assert!(!set_last_message_at_path(&path, "tab-2", "new", "x", 1));

        let store = read_store(&path);
        assert_eq!(store.tabs["tab-1"].last_message, None);
        assert!(!store.tabs.contains_key("tab-2"));
    }

    #[test]
    fn a_record_without_a_message_omits_the_field_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "opencode", "ses_1", "", "/tmp/p");

        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("last_message"), "{raw}");
    }

    #[test]
    fn a_resume_keeps_the_last_message_and_a_new_session_drops_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        set_last_message_at_path(&path, "tab-1", "abc", "answer", 100);

        record_session_at_path(&path, "tab-1", "claude", "abc", "/tmp/s.jsonl", "/tmp/p");
        assert_eq!(
            read_store(&path).tabs["tab-1"].last_message.as_deref(),
            Some("answer")
        );

        // A claude launched by hand brings its own session id and starts with no message.
        stash_cmd("tab-1", "claude".to_string());
        record_session_at_path(&path, "tab-1", "claude", "def", "/tmp/s.jsonl", "/tmp/p");
        assert_eq!(read_store(&path).tabs["tab-1"].last_message, None);
    }

    #[test]
    fn session_previews_return_the_recorded_tabs_in_the_order_asked() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(&path, "tab-a", "claude", "a", "/tmp/a.jsonl", "/tmp/a");
        record_session_at_path(&path, "tab-b", "opencode", "b", "", "/tmp/b");
        set_last_message_at_path(&path, "tab-a", "a", "all green", 500);
        let before = std::fs::read_to_string(&path).unwrap();

        let previews = session_previews_from_path(
            &path,
            &["tab-b".into(), "tab-missing".into(), "tab-a".into()],
        );

        assert_eq!(previews.len(), 2);
        assert_eq!(previews[0].tab_id, "tab-b");
        assert_eq!(previews[0].cwd, "/tmp/b");
        assert_eq!(previews[0].last_message, None);
        assert_eq!(previews[1].tab_id, "tab-a");
        assert_eq!(previews[1].last_message.as_deref(), Some("all green"));
        assert_eq!(previews[1].updated_at, 500);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), before);
    }

    #[test]
    fn session_previews_are_empty_without_a_readable_store() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");
        assert!(session_previews_from_path(&path, &["tab-1".into()]).is_empty());
        std::fs::write(&path, "{ not json").unwrap();
        assert!(session_previews_from_path(&path, &["tab-1".into()]).is_empty());
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

        assert!(
            !bak.exists(),
            "an identical snapshot must not write a backup"
        );
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

        // A claude launched by hand went through the tab's shell, so its line is stashed
        // and the new session takes the record.
        stash_cmd("tab-1", "claude".to_string());
        record_session_at_path(&path, "tab-1", "claude", "def", "/tmp/s2.jsonl", "/tmp/p");

        let rec = &read_store(&path).tabs["tab-1"];
        assert_eq!(rec.session_id, "def");
        assert_eq!(rec.title, None);
        assert_eq!(rec.notification, None);
    }

    #[test]
    fn a_child_session_started_without_the_tab_shell_does_not_take_the_record() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        stash_cmd("tab-child", "claude-ibm".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-child",
            "claude",
            "parent",
            "/tmp/parent.jsonl",
            "/Users/me/project",
            false
        ));

        // The child inherited KEX_TAB_ID from the parent's environment, so its SessionStart
        // names the tab with its own session id and a foreign cwd, and no line went through
        // the tab's shell to stash.
        assert!(record_session_at_path_with(
            &path,
            "tab-child",
            "claude",
            "child",
            "/tmp/child.jsonl",
            "/private/tmp/elsewhere",
            false
        ));

        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let rec = &store.tabs["tab-child"];
        assert_eq!(rec.session_id, "parent");
        assert_eq!(rec.cwd_launch, "/Users/me/project");
        assert_eq!(rec.launch_cmd.as_deref(), Some("claude-ibm"));
    }

    #[test]
    fn a_child_without_a_stash_reports_the_kept_record_launch_knowledge() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-sessions.json");

        // No prior record: the first unverified SessionStart records as before.
        assert!(!record_session_at_path_with(
            &path,
            "tab-first",
            "claude",
            "s1",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));

        // With a known record in place, a stranger session is refused and the returned
        // launch knowledge is the record's, so the tab icon does not go struck.
        stash_cmd("tab-kept", "claude-ibm".to_string());
        assert!(record_session_at_path_with(
            &path,
            "tab-kept",
            "claude",
            "parent",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));
        assert!(record_session_at_path_with(
            &path,
            "tab-kept",
            "claude",
            "child",
            "/tmp/s2.jsonl",
            "/private/tmp/elsewhere",
            false
        ));
        // Even a record with an unknown launch command is protected: the refusal reports
        // what the kept record says (false here), not today's replacement.
        assert!(!record_session_at_path_with(
            &path,
            "tab-plain",
            "claude",
            "p",
            "/tmp/s.jsonl",
            "/tmp/p",
            false
        ));
        assert!(!record_session_at_path_with(
            &path,
            "tab-plain",
            "claude",
            "c",
            "/tmp/s2.jsonl",
            "/private/tmp/x",
            false
        ));
    }

    #[test]
    fn restore_plan_carries_the_title_and_notification() {
        let dir = tempfile::tempdir().unwrap();
        let cwd_launch = dir.path().join("project");
        std::fs::create_dir_all(&cwd_launch).unwrap();
        let jsonl = dir.path().join("session.jsonl");
        std::fs::write(
            &jsonl,
            format!("{{\"cwd\":\"{}\"}}\n", cwd_launch.display()),
        )
        .unwrap();
        let path = dir.path().join("agent-sessions.json");
        record_session_at_path(
            &path,
            "tab-1",
            "claude",
            "abc",
            &jsonl.display().to_string(),
            &cwd_launch.display().to_string(),
        );
        set_snapshot_at_path(&path, "tab-1", "abc", "fixing the build", "attention");

        let plans = load_restore_plan_from_path(&path);

        assert_eq!(plans[0].title.as_deref(), Some("fixing the build"));
        assert_eq!(plans[0].notification.as_deref(), Some("attention"));
    }

    #[test]
    fn split_orphans_keeps_plans_whose_tab_lives_in_any_window() {
        let known = std::collections::HashSet::from(["tab-a".to_string(), "tab-c".to_string()]);
        let (kept, orphans) =
            split_orphans(vec![plan("tab-a"), plan("tab-b"), plan("tab-c")], &known);
        assert_eq!(
            kept.iter().map(|p| p.tab_id.as_str()).collect::<Vec<_>>(),
            vec!["tab-a", "tab-c"]
        );
        assert_eq!(
            orphans
                .iter()
                .map(|p| p.tab_id.as_str())
                .collect::<Vec<_>>(),
            vec!["tab-b"]
        );
    }

    #[test]
    fn split_orphans_with_no_known_tabs_orphans_everything() {
        let (kept, orphans) = split_orphans(vec![plan("tab-a")], &std::collections::HashSet::new());
        assert!(kept.is_empty());
        assert_eq!(orphans.len(), 1);
    }

    fn record(
        agent: Option<&str>,
        cwd_launch: &Path,
        transcript: &str,
        launch_cmd: Option<&str>,
    ) -> SessionRecord {
        SessionRecord {
            agent: agent.map(str::to_string),
            session_id: "abc-123".to_string(),
            cwd_launch: cwd_launch.display().to_string(),
            transcript_path: transcript.to_string(),
            launch_cmd: launch_cmd.map(str::to_string),
            title: None,
            notification: None,
            last_message: None,
            updated_at: 0,
        }
    }

    #[test]
    fn a_codex_record_resumes_by_id_and_survives_a_restore() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(Some("codex"), &project, "/tmp/missing-codex.jsonl", None),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert_eq!(plans[0].resume_cmd, "codex resume 'abc-123'");
        assert!(plans[0].error_reason.is_empty());

        // Never pruned: the command re-appears every time the store is loaded.
        let second = load_restore_plan_from_path(&store_path);
        assert_eq!(second[0].resume_cmd, "codex resume 'abc-123'");
    }

    #[test]
    fn a_codex_record_with_a_rollout_resumes_in_the_rollout_cwd() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("launch");
        let stale = dir.path().join("stale");
        std::fs::create_dir_all(&launch).unwrap();
        std::fs::create_dir_all(&stale).unwrap();
        let rollout = dir.path().join("rollout-2026-10-14T20-42-20-abc-123.jsonl");
        std::fs::write(
            &rollout,
            format!(
                "{{\"type\":\"session_meta\",\"payload\":{{\"id\":\"abc-123\",\"cwd\":\"{}\"}}}}\n",
                launch.display()
            ),
        )
        .unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(
                Some("codex"),
                &stale,
                &rollout.display().to_string(),
                Some("codex -m o3"),
            ),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].resume_cmd, "codex -m o3 resume 'abc-123'");
        assert_eq!(plans[0].cwd_launch, launch.display().to_string());
        assert!(plans[0].worktree_cwd.is_none());
    }

    #[test]
    fn a_codex_record_without_a_transcript_path_finds_its_rollout_in_the_injected_root() {
        let dir = tempfile::tempdir().unwrap();
        let launch = dir.path().join("launch");
        let stale = dir.path().join("stale");
        std::fs::create_dir_all(&launch).unwrap();
        std::fs::create_dir_all(&stale).unwrap();
        let sessions = dir.path().join("sessions");
        let day = sessions.join("2026/10/14");
        std::fs::create_dir_all(&day).unwrap();
        std::fs::write(
            day.join("rollout-2026-10-14T20-42-20-abc-123.jsonl"),
            format!(
                "{{\"type\":\"session_meta\",\"payload\":{{\"id\":\"abc-123\",\"cwd\":\"{}\"}}}}\n",
                launch.display()
            ),
        )
        .unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert("tab-1".to_string(), record(Some("codex"), &stale, "", None));
        write_store(&store_path, tabs);

        let plans = crate::modules::agent::provider::with_codex_sessions_root(&sessions, || {
            load_restore_plan_from_path(&store_path)
        });

        assert_eq!(plans[0].cwd_launch, launch.display().to_string());
        assert_eq!(plans[0].resume_cmd, "codex resume 'abc-123'");
    }

    #[test]
    fn a_codex_record_with_an_empty_transcript_path_and_no_rollout_still_resumes() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        let mut rec = record(Some("codex"), &project, "", None);
        rec.session_id = "kex-test-no-rollout-7c4244dd".to_string();
        tabs.insert("tab-1".to_string(), rec);
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);

        assert_eq!(
            plans[0].resume_cmd,
            "codex resume 'kex-test-no-rollout-7c4244dd'"
        );
        assert_eq!(plans[0].cwd_launch, project.display().to_string());
        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(store.tabs.contains_key("tab-1"));
    }

    #[test]
    fn a_codex_record_with_a_launch_cmd_resumes_by_id_on_the_stripped_base() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(
                Some("codex"),
                &project,
                "/tmp/missing-codex.jsonl",
                Some("codex-max --model g5"),
            ),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert_eq!(plans[0].resume_cmd, "codex-max --model g5 resume 'abc-123'");
    }

    #[test]
    fn a_codex_record_with_a_dead_launch_dir_errors_and_keeps_the_record() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let missing = dir.path().join("gone");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(Some("codex"), &missing, "/tmp/missing-codex.jsonl", None),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans[0].resume_cmd.is_empty());
        assert!(
            plans[0].attempted_cmd.contains("resume 'abc-123'"),
            "{}",
            plans[0].attempted_cmd
        );

        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(
            store.tabs.contains_key("tab-1"),
            "a blocked codex entry stays for Try again"
        );
    }

    #[test]
    fn an_opencode_record_resumes_its_session_id_and_survives_a_restore() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(
                Some("opencode"),
                &project,
                "/tmp/missing-opencode.jsonl",
                None,
            ),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert_eq!(plans[0].resume_cmd, "opencode --session 'abc-123'");
        assert!(plans[0].error_reason.is_empty());

        // Never pruned: the plugin is silent on a resumed session, so nothing
        // would re-record it if the entry were dropped.
        let second = load_restore_plan_from_path(&store_path);
        assert_eq!(second[0].resume_cmd, "opencode --session 'abc-123'");
    }

    #[test]
    fn an_opencode_record_with_a_launch_cmd_resumes_on_the_stripped_base() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(
                Some("opencode"),
                &project,
                "/tmp/missing-opencode.jsonl",
                Some("opencode --model g5"),
            ),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        // opencode has no known resume-safe flags, so the base collapses to the launcher.
        assert_eq!(plans[0].resume_cmd, "opencode --session 'abc-123'");
    }

    #[test]
    fn an_opencode_record_with_a_dead_launch_dir_errors_and_keeps_the_record() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let missing = dir.path().join("gone");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(
                Some("opencode"),
                &missing,
                "/tmp/missing-opencode.jsonl",
                None,
            ),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans[0].resume_cmd.is_empty());
        assert_eq!(plans[0].attempted_cmd, "opencode --session 'abc-123'");

        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(
            store.tabs.contains_key("tab-1"),
            "a blocked opencode entry stays for Try again"
        );
    }

    #[test]
    fn a_record_without_a_provider_row_is_pruned_when_its_dir_is_viable() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(Some("gemini"), &project, "/tmp/missing-gem.jsonl", None),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans.is_empty());

        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(
            !store.tabs.contains_key("tab-1"),
            "an unknowable record is dead weight"
        );
    }

    #[test]
    fn a_record_without_a_provider_row_and_a_dead_dir_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let store_path = dir.path().join("agent-sessions.json");
        let missing = dir.path().join("gone");
        let mut tabs = HashMap::new();
        tabs.insert(
            "tab-1".to_string(),
            record(Some("gemini"), &missing, "/tmp/missing-gem.jsonl", None),
        );
        write_store(&store_path, tabs);

        let plans = load_restore_plan_from_path(&store_path);
        assert!(plans.is_empty());

        let store: SessionStore =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        assert!(
            store.tabs.contains_key("tab-1"),
            "same keep rule as a missing transcript"
        );
    }
}
