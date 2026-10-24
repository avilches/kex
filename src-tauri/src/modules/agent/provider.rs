use std::io::BufRead;
use std::path::{Path, PathBuf};

use super::launch_cmd::CODEX_VALUE_OPTS;

/// Everything an agent CLI must tell the session store: where its transcripts live, how to
/// read the launch directory back from one, how a recorded session is reopened, and what to
/// do when the transcript has vanished. `session_store` stays agent-agnostic and only
/// consults this table; adding a provider means adding a row here.
pub struct Provider {
    pub name: &'static str,
    /// Where the provider keeps its transcripts, or `None` when it manages its own session
    /// state and resume does not consult any file (opencode).
    pub sessions: Option<SessionsSource>,
    /// How the launch directory is read back from a transcript. Only consulted when
    /// `sessions` is `Some`.
    pub cwd_read: CwdRead,
    pub resume: ResumeSpec,
    /// What happens when the transcript was looked for and is missing. It drives both the
    /// fallback command and whether the record is pruned from the store.
    pub missing_transcript: MissingTranscriptPolicy,
    /// Launch-line flags that still make sense when the session is reopened.
    pub keep_flags: &'static [&'static str],
    /// Same, but the flag consumes the non-flag tokens that follow it.
    pub keep_with_value: &'static [&'static str],
    /// Options that take exactly one value: a kept one consumes a single token, so a prompt or
    /// a subcommand after it (`codex -m o3 resume <id>`) is never taken for a value.
    pub single_value_opts: &'static [&'static str],
}

pub static PROVIDERS: &[Provider] = &[
    Provider {
        name: "claude",
        sessions: Some(SessionsSource::ClaudeProjects),
        cwd_read: CwdRead::ScanEntries,
        resume: ResumeSpec::Flag { flag: "--resume" },
        missing_transcript: MissingTranscriptPolicy::Reattach {
            flag: "--session-id",
        },
        keep_flags: CLAUDE_KEEP_FLAGS,
        keep_with_value: CLAUDE_KEEP_WITH_VALUE,
        single_value_opts: &[],
    },
    Provider {
        name: "codex",
        // Rollouts live at `<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-<stamp>-<id>.jsonl` with
        // `{type:"session_meta", payload:{id, cwd}}` on line 1. A session may have no rollout
        // yet, and `codex resume <id>` is the only way back, so it resumes anyway and the
        // record is never pruned.
        sessions: Some(SessionsSource::CodexSessions),
        cwd_read: CwdRead::HeaderLine(1),
        resume: ResumeSpec::Subcommand { name: "resume" },
        missing_transcript: MissingTranscriptPolicy::ResumeAnyway,
        // Profile, model and local provider describe the session. The sandbox and approval
        // options, and `-c` which can set either, are dropped so a restore never re-grants them.
        keep_flags: &["--oss"],
        keep_with_value: &["-p", "--profile", "-m", "--model", "--local-provider"],
        single_value_opts: CODEX_VALUE_OPTS,
    },
    Provider {
        name: "opencode",
        // opencode keeps its sessions in a SQLite database, so there is nothing to seek on
        // disk; resume targets the recorded id directly (`--session <id>`). Sessions of an
        // resumed TUI (`--session`) fire no plugin events (anomalyco/opencode#39711), so the
        // plugin never re-records them and the record must never be pruned.
        sessions: None,
        cwd_read: CwdRead::Unused,
        resume: ResumeSpec::Flag { flag: "--session" },
        missing_transcript: MissingTranscriptPolicy::ResumeAnyway,
        keep_flags: &[],
        keep_with_value: &[],
        single_value_opts: &[],
    },
    Provider {
        name: "omp",
        // OMP writes one JSONL per session under `~/.omp/agent/sessions/<cwd-encoded>/`; the
        // file name is `<timestamp>_<id>.jsonl` and line 2 carries `{type:"session", id, cwd}`.
        // The extension frame already records id and cwd, so the lookup only backs the plan:
        // with the file gone there is nothing reliable to resume and the record is kept but
        // never planned.
        sessions: Some(SessionsSource::OmpSessions),
        cwd_read: CwdRead::HeaderLine(2),
        resume: ResumeSpec::Flag { flag: "--resume" },
        missing_transcript: MissingTranscriptPolicy::KeepWithoutPlan,
        keep_flags: &[],
        keep_with_value: &[],
        single_value_opts: &[],
    },
    Provider {
        name: "pi",
        // Pi shares the session layout with OMP but its header is line 1 (no intro `title`
        // entry) and the file only appears once the session has a first turn, so sessions
        // without any turn are naturally invisible to the lookup. Resume is `--session`
        // (path or id); `--resume` there only opens a picker.
        sessions: Some(SessionsSource::PiSessions),
        cwd_read: CwdRead::HeaderLine(1),
        resume: ResumeSpec::Flag { flag: "--session" },
        missing_transcript: MissingTranscriptPolicy::KeepWithoutPlan,
        keep_flags: &[],
        keep_with_value: &[],
        single_value_opts: &[],
    },
];

impl Provider {
    pub fn of(agent: &str) -> Option<&'static Provider> {
        PROVIDERS.iter().find(|p| p.name == agent)
    }

    /// Resume command from the (already stripped) launch `base`; the plain launcher is used
    /// when the launch command was never recognized.
    pub fn resume_cmd(&self, base: Option<&str>, session_id: &str) -> String {
        let launcher = base.unwrap_or(self.name);
        match self.resume {
            ResumeSpec::Flag { flag } => format!("{launcher} {flag} {}", shell_quote(session_id)),
            ResumeSpec::Subcommand { name } => {
                format!("{launcher} {name} {}", shell_quote(session_id))
            }
        }
    }

    /// Command to start a session reusing `session_id` after the transcript vanished, so the
    /// session identity survives. Only meaningful under the Reattach policy.
    pub fn reattach_cmd(&self, base: Option<&str>, session_id: &str) -> String {
        let MissingTranscriptPolicy::Reattach { flag } = self.missing_transcript else {
            unreachable!("reattach_cmd is only reachable when the policy reattaches")
        };
        format!(
            "{} {} {}",
            base.unwrap_or(self.name),
            flag,
            shell_quote(session_id)
        )
    }
}

pub enum SessionsSource {
    ClaudeProjects,
    OmpSessions,
    PiSessions,
    CodexSessions,
}

impl SessionsSource {
    /// Absolute path of a session's transcript file, or `None` when it is not on disk.
    pub fn find(&self, session_id: &str, transcript_path: &str) -> Option<PathBuf> {
        match self {
            Self::ClaudeProjects => find_in_claude_projects(session_id, transcript_path),
            Self::OmpSessions => {
                find_in_agent_sessions(&omp_sessions_root(), session_id, transcript_path)
            }
            Self::PiSessions => {
                find_in_agent_sessions(&pi_sessions_root(), session_id, transcript_path)
            }
            Self::CodexSessions => find_in_codex_sessions(
                codex_sessions_root().as_deref(),
                session_id,
                transcript_path,
            ),
        }
    }
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

fn find_in_claude_projects(session_id: &str, transcript_path: &str) -> Option<PathBuf> {
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

fn find_in_agent_sessions(root: &Path, session_id: &str, transcript_path: &str) -> Option<PathBuf> {
    if !transcript_path.is_empty() && Path::new(transcript_path).exists() {
        return Some(PathBuf::from(transcript_path));
    }
    find_in_sessions_root(root, session_id)
}

fn find_in_sessions_root(root: &Path, session_id: &str) -> Option<PathBuf> {
    // File names start with a timestamp (`<date>_<id>.jsonl`), so the lexicographic
    // maximum is the most recent session file; no mtime comparisons needed.
    let mut best_name: Option<String> = None;
    let mut best_path: Option<PathBuf> = None;
    if let Ok(groups) = std::fs::read_dir(root) {
        for group in groups.flatten() {
            let Ok(files) = std::fs::read_dir(group.path()) else {
                continue;
            };
            for file in files.flatten() {
                let name = file.file_name();
                // Session files are `<timestamp>_<id>.jsonl`; the suffix match is exact
                // because ids are UUID-like. Lock sidecars share the name's head but end
                // differently and are filtered by the `.jsonl` ending.
                if !file.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                let Some(name_str) = name.to_str() else {
                    continue;
                };
                let ok = name_str == format!("{session_id}.jsonl")
                    || name_str.ends_with(&format!("_{session_id}.jsonl"));
                if !ok {
                    continue;
                }
                if best_name.as_ref().is_none_or(|b| name_str > b.as_str()) {
                    best_name = Some(name_str.to_string());
                    best_path = Some(file.path());
                }
            }
        }
    }
    best_path
}

fn omp_sessions_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".omp")
        .join("agent")
        .join("sessions")
}

fn pi_sessions_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .join(".pi")
        .join("agent")
        .join("sessions")
}

#[cfg(not(test))]
fn codex_sessions_root() -> Option<PathBuf> {
    codex_sessions_root_from(std::env::var_os("CODEX_HOME"), dirs::home_dir())
}

// Tests never resolve the real CODEX_HOME or ~/.codex: the root is per test thread and unset
// unless a test injects one with `with_codex_sessions_root`.
#[cfg(test)]
thread_local! {
    static TEST_CODEX_ROOT: std::cell::RefCell<Option<PathBuf>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
fn codex_sessions_root() -> Option<PathBuf> {
    TEST_CODEX_ROOT.with(|r| r.borrow().clone())
}

#[cfg(test)]
pub fn with_codex_sessions_root<T>(root: &Path, f: impl FnOnce() -> T) -> T {
    let previous = TEST_CODEX_ROOT.with(|r| r.replace(Some(root.to_path_buf())));
    let out = f();
    TEST_CODEX_ROOT.with(|r| *r.borrow_mut() = previous);
    out
}

fn codex_sessions_root_from(
    codex_home: Option<std::ffi::OsString>,
    home: Option<PathBuf>,
) -> Option<PathBuf> {
    super::codex_integration::resolve_codex_dir(codex_home, home)
        .ok()
        .map(|dir| dir.join("sessions"))
}

/// The rollout of `session_id` under `<root>/YYYY/MM/DD/`. A UUIDv7 id names its day, so only
/// the three folders around it are read; any other id walks the days newest first, stopping
/// at the first one that holds it.
fn find_in_codex_sessions(
    root: Option<&Path>,
    session_id: &str,
    transcript_path: &str,
) -> Option<PathBuf> {
    let recorded = Path::new(transcript_path);
    if is_rollout_name(recorded) && recorded.is_file() {
        return Some(recorded.to_path_buf());
    }
    let root = root?;
    if session_id.is_empty() {
        return None;
    }
    let suffix = format!("-{session_id}.jsonl");
    match codex_day_dirs(root, session_id) {
        Some(days) => days.iter().find_map(|d| rollout_in_day(d, &suffix)),
        None => all_codex_day_dirs(root).find_map(|d| rollout_in_day(&d, &suffix)),
    }
}

const MS_PER_DAY: i64 = 86_400_000;

/// Days since the Unix epoch (UTC) of the timestamp a UUIDv7 carries in its first 48 bits.
fn uuid_v7_unix_day(id: &str) -> Option<i64> {
    let b = id.as_bytes();
    let dash = |i: usize| [8, 13, 18, 23].contains(&i);
    let shaped = b.len() == 36
        && b.iter().enumerate().all(|(i, c)| {
            if dash(i) {
                *c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        });
    if !shaped || b[14] != b'7' {
        return None;
    }
    let ms = i64::from_str_radix(&format!("{}{}", &id[..8], &id[9..13]), 16).ok()?;
    Some(ms.div_euclid(MS_PER_DAY))
}

/// `(year, month, day)` of a day count since 1970-01-01 (Howard Hinnant's civil_from_days).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

// The date folders are the local date the session started, which is within a day of the
// UTC date in the id; no other folder can hold it.
fn codex_day_dirs(root: &Path, session_id: &str) -> Option<Vec<PathBuf>> {
    let day = uuid_v7_unix_day(session_id)?;
    Some(
        [day + 1, day, day - 1]
            .into_iter()
            .map(|n| {
                let (y, m, d) = civil_from_days(n);
                root.join(format!("{y:04}"))
                    .join(format!("{m:02}"))
                    .join(format!("{d:02}"))
            })
            .collect(),
    )
}

fn all_codex_day_dirs(root: &Path) -> impl Iterator<Item = PathBuf> {
    subdirs_newest_first(root)
        .into_iter()
        .flat_map(|year| subdirs_newest_first(&year))
        .flat_map(|month| subdirs_newest_first(&month))
}

fn rollout_in_day(day: &Path, suffix: &str) -> Option<PathBuf> {
    std::fs::read_dir(day)
        .ok()?
        .flatten()
        .filter(|f| f.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|f| {
            let name = f.file_name().into_string().ok()?;
            (name.starts_with("rollout-") && name.ends_with(suffix)).then(|| (name, f.path()))
        })
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, path)| path)
}

// The recorded path comes from a hook frame; only a file that looks like a rollout is read.
fn is_rollout_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("rollout-") && n.ends_with(".jsonl"))
}

fn subdirs_newest_first(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .collect();
    dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    dirs
}

pub enum CwdRead {
    /// Walk the entries: `worktreeSession.originalCwd` wins (where the command was launched
    /// from while the session is inside a Kex worktree, which is often deleted later), else
    /// the first `cwd` entry.
    ScanEntries,
    /// Read the `cwd` of the header entry (`HeaderLine(n)`, n is the 1-based JSONL line: OMP 2
    /// after an intro `title`, Pi 1, Codex 1). OMP and Pi write `{type:"session", cwd}`, Codex
    /// `{type:"session_meta", payload:{cwd}}`. The header never changes once written.
    HeaderLine(usize),
    /// Never consulted: only reachable when `sessions` is `None`.
    Unused,
}

impl CwdRead {
    pub fn read_launch_cwd(&self, transcript: &Path) -> Option<String> {
        match self {
            Self::ScanEntries => scan_claude_entries(transcript),
            Self::HeaderLine(n) => scan_header_line(transcript, *n),
            Self::Unused => None,
        }
    }
}

impl CwdRead {
    /// The worktree the session was last inside, when it still exists. The launch cwd is
    /// deliberately not the worktree (it may be gone), so this is what lets the tab know
    /// about a live one before the resumed agent reports its own folder.
    pub fn read_worktree_path(&self, transcript: &Path) -> Option<String> {
        match self {
            Self::ScanEntries => scan_last_worktree(transcript),
            Self::HeaderLine(_) | Self::Unused => None,
        }
    }
}

fn scan_last_worktree(jsonl: &Path) -> Option<String> {
    let file = std::fs::File::open(jsonl).ok()?;
    let mut last = None;
    for line in std::io::BufReader::new(file).lines() {
        let line = line.ok()?;
        if !line.contains("\"worktree-state\"") {
            continue;
        }
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if obj.get("type").and_then(|t| t.as_str()) != Some("worktree-state") {
            continue;
        }
        last = obj
            .get("worktreeSession")
            .and_then(|w| w.get("worktreePath"))
            .and_then(|v| v.as_str())
            .filter(|c| !c.is_empty())
            .map(str::to_string);
    }
    last.filter(|p| Path::new(p).is_dir())
}

fn scan_claude_entries(jsonl: &Path) -> Option<String> {
    let file = std::fs::File::open(jsonl).ok()?;
    let reader = std::io::BufReader::new(file);
    for line in reader.lines() {
        let line = line.ok()?;
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        // Claude Code writes `worktree-state` before the first user message whenever the
        // session is inside a worktree; the entries' own `cwd` is the worktree, which is the
        // one the restore may not survive if the worktree folder is gone. `originalCwd` is
        // the launch directory that still exists.
        if let Some(original) = obj
            .get("worktreeSession")
            .and_then(|w| w.get("originalCwd"))
            .and_then(|v| v.as_str())
            .filter(|c| !c.is_empty())
        {
            return Some(original.to_string());
        }
        if let Some(cwd) = obj.get("cwd").and_then(|v| v.as_str()) {
            if !cwd.is_empty() {
                return Some(cwd.to_string());
            }
        }
    }
    None
}

// Codex's session_meta embeds the instructions and can be tens of KB; the cap bounds what a
// corrupt rollout with no newline could make Kex read.
const HEADER_LINE_CAP: usize = 1024 * 1024;

fn scan_header_line(jsonl: &Path, line_no: usize) -> Option<String> {
    let file = std::fs::File::open(jsonl).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let mut line = Vec::new();
    for _ in 0..line_no {
        line.clear();
        let read = std::io::Read::take(&mut reader, HEADER_LINE_CAP as u64 + 1)
            .read_until(b'\n', &mut line)
            .ok()?;
        if read == 0 || line.len() > HEADER_LINE_CAP {
            return None;
        }
    }
    let obj = serde_json::from_slice::<serde_json::Value>(&line).ok()?;
    let header = match obj.get("type").and_then(|t| t.as_str()) {
        Some("session") => &obj,
        Some("session_meta") => obj.get("payload")?,
        _ => return None,
    };
    header
        .get("cwd")
        .and_then(|v| v.as_str())
        .filter(|c| !c.is_empty())
        .map(str::to_string)
}

pub enum ResumeSpec {
    /// `<stripped launch line> <flag> '<session id>'`
    Flag { flag: &'static str },
    /// `<stripped launch line> <name> '<session id>'`: the id is a positional argument of a
    /// subcommand (`codex resume <id>`).
    Subcommand { name: &'static str },
}

pub enum MissingTranscriptPolicy {
    /// The session was recorded but the transcript is gone: reopen it with the recorded id
    /// (`<stripped launch line> <flag> '<session id>'`) and prune the record once its launch
    /// directory is usable; the repo's hooks re-record if the new session produces anything.
    Reattach { flag: &'static str },
    /// Nothing can bring the session back: no plan is emitted, and the record is pruned as
    /// soon as its launch directory is usable.
    Ignore,
    /// The resume command works by id whether or not the transcript was found, so the plan
    /// still runs (in the recorded launch directory) and the record is never pruned.
    ResumeAnyway,
    /// The transcript is the only proof that the session can be reopened: no plan runs while
    /// it is missing, and the record is never pruned because the file may still appear.
    KeepWithoutPlan,
}

pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

const CLAUDE_KEEP_FLAGS: &[&str] = &[
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

const CLAUDE_KEEP_WITH_VALUE: &[&str] = &[
    "--add-dir",
    "--agent",
    "--agents",
    "--allowedTools",
    "--allowed-tools",
    "--disallowedTools",
    "--disallowed-tools",
    "--name",
    "-n",
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

#[cfg(test)]
mod tests {
    use super::super::launch_cmd::DEFAULT_AGENTS;
    use super::*;

    #[test]
    fn default_agents_have_a_provider_row() {
        for agent in DEFAULT_AGENTS {
            let provider = Provider::of(agent);
            assert!(provider.is_some(), "{agent} has no provider row");
        }
    }

    #[test]
    fn every_provider_row_is_a_default_agent() {
        for provider in PROVIDERS {
            assert!(
                DEFAULT_AGENTS.contains(&provider.name),
                "{} is not detected: add it to DEFAULT_AGENTS",
                provider.name
            );
        }
    }

    #[test]
    fn id_templates_shell_quote_the_session_id() {
        let provider = Provider::of("claude").unwrap();
        let cmd = provider.resume_cmd(Some("claude --safe-mode"), "id'q");
        assert_eq!(cmd, "claude --safe-mode --resume 'id'\\''q'");
        let cmd = provider.reattach_cmd(None, "id'q");
        assert_eq!(cmd, "claude --session-id 'id'\\''q'");
    }

    #[test]
    fn resume_cmd_claude() {
        let provider = Provider::of("claude").unwrap();
        assert_eq!(
            provider.resume_cmd(None, "abc-123"),
            "claude --resume 'abc-123'"
        );
        assert_eq!(
            provider.resume_cmd(Some("claude --safe-mode"), "abc-123"),
            "claude --safe-mode --resume 'abc-123'"
        );
    }

    #[test]
    fn resume_cmd_codex() {
        let provider = Provider::of("codex").unwrap();
        assert_eq!(
            provider.resume_cmd(None, "abc-123"),
            "codex resume 'abc-123'"
        );
        assert_eq!(
            provider.resume_cmd(Some("codex-max"), "abc-123"),
            "codex-max resume 'abc-123'"
        );
    }

    #[test]
    fn codex_keeps_only_options_known_to_take_one_value() {
        let provider = Provider::of("codex").unwrap();
        for flag in provider.keep_with_value {
            assert!(provider.single_value_opts.contains(flag), "{flag}");
        }
        for dangerous in [
            "-s",
            "--sandbox",
            "-a",
            "--ask-for-approval",
            "-c",
            "--config",
        ] {
            assert!(
                !provider.keep_with_value.contains(&dangerous),
                "{dangerous}"
            );
        }
        for dangerous in ["--yolo", "--dangerously-bypass-approvals-and-sandbox"] {
            assert!(!provider.keep_flags.contains(&dangerous), "{dangerous}");
        }
    }

    #[test]
    fn resume_cmd_opencode() {
        let provider = Provider::of("opencode").unwrap();
        assert_eq!(
            provider.resume_cmd(None, "ses_abc"),
            "opencode --session 'ses_abc'"
        );
        assert_eq!(
            provider.resume_cmd(Some("opencode --model g5"), "ses_abc"),
            "opencode --model g5 --session 'ses_abc'"
        );
    }

    #[test]
    fn resume_cmd_omp() {
        let provider = Provider::of("omp").unwrap();
        assert_eq!(
            provider.resume_cmd(None, "01a1-abc"),
            "omp --resume '01a1-abc'"
        );
        assert_eq!(
            provider.resume_cmd(Some("omp --slow m5"), "01a1-abc"),
            "omp --slow m5 --resume '01a1-abc'"
        );
    }

    #[test]
    fn an_omp_record_finds_its_session_file_by_id_suffix() {
        let root = tempfile::tempdir().unwrap();
        let group = root.path().join("-Users-avilches-proj");
        std::fs::create_dir_all(&group).unwrap();
        std::fs::write(
            group.join("2026-10-17T10_00_00Z_omp-test-id.jsonl"),
            "{}\n{}\n",
        )
        .unwrap();

        let found = find_in_sessions_root(root.path(), "omp-test-id");

        assert_eq!(
            found,
            Some(group.join("2026-10-17T10_00_00Z_omp-test-id.jsonl"))
        );
    }

    #[test]
    fn an_omp_find_prefers_the_most_recent_session_file() {
        let root = tempfile::tempdir().unwrap();
        let group = root.path().join("-Users-avilches-proj");
        std::fs::create_dir_all(&group).unwrap();
        // Names sort by the embedded timestamp, so no mtime foolery is needed.
        std::fs::write(group.join("2026-01-01T10_00_00Z_omp-test-id.jsonl"), "{}\n").unwrap();
        std::fs::write(group.join("2026-10-17T10_00_00Z_omp-test-id.jsonl"), "{}\n").unwrap();

        let found = find_in_sessions_root(root.path(), "omp-test-id");

        assert_eq!(
            found,
            Some(group.join("2026-10-17T10_00_00Z_omp-test-id.jsonl"))
        );
    }

    #[test]
    fn an_omp_record_reads_the_cwd_of_the_session_header() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().join("proj");
        std::fs::create_dir_all(&cwd).unwrap();
        let jsonl = dir.path().join("x.jsonl");
        std::fs::write(
            &jsonl,
            format!(
                "{{\"type\":\"title\",\"title\":\"t\"}}\n{{\"type\":\"session\",\"version\":3,\"id\":\"s1\",\"cwd\":\"{}\"}}\n",
                cwd.display()
            ),
        )
        .unwrap();

        assert_eq!(scan_header_line(&jsonl, 2), Some(cwd.display().to_string()));
    }

    #[test]
    fn an_omp_record_ignores_a_session_file_without_the_header_line() {
        let dir = tempfile::tempdir().unwrap();
        let jsonl = dir.path().join("x.jsonl");
        std::fs::write(&jsonl, "{\"type\":\"title\"}\n").unwrap();
        assert_eq!(scan_header_line(&jsonl, 2), None);
    }

    #[test]
    fn resume_cmd_pi() {
        let provider = Provider::of("pi").unwrap();
        assert_eq!(
            provider.resume_cmd(None, "01a2-abc"),
            "pi --session '01a2-abc'"
        );
        assert_eq!(
            provider.resume_cmd(Some("pi --slow m5"), "01a2-abc"),
            "pi --slow m5 --session '01a2-abc'"
        );
    }

    #[test]
    fn a_pi_record_finds_its_session_file_in_a_group_dir() {
        let root = tempfile::tempdir().unwrap();
        let group = root.path().join("--Users-avilches-Hub-Projects-Kex--");
        std::fs::create_dir_all(&group).unwrap();
        let name = "2026-10-17T14-56-17-163Z_01a14a5d-170a-746e-98f4-7498ceccd31b.jsonl";
        std::fs::write(group.join(name), "{}\n").unwrap();

        let found = find_in_agent_sessions(root.path(), "01a14a5d-170a-746e-98f4-7498ceccd31b", "");

        assert_eq!(found, Some(group.join(name)));
    }

    #[test]
    fn a_pi_record_reads_the_cwd_of_the_first_jsonl_line() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().join("proj");
        std::fs::create_dir_all(&cwd).unwrap();
        let jsonl = dir.path().join("x.jsonl");
        std::fs::write(
            &jsonl,
            format!(
                "{{\"type\":\"session\",\"version\":3,\"id\":\"s1\",\"cwd\":\"{}\"}}\n{{\"type\":\"message\"}}\n",
                cwd.display()
            ),
        )
        .unwrap();

        assert_eq!(scan_header_line(&jsonl, 1), Some(cwd.display().to_string()));
    }

    #[test]
    fn a_pi_record_ignores_a_title_first_file() {
        let dir = tempfile::tempdir().unwrap();
        let jsonl = dir.path().join("x.jsonl");
        std::fs::write(
            &jsonl,
            "{\"type\":\"title\"}\n{\"type\":\"session\",\"cwd\":\"/tmp/p\"}\n",
        )
        .unwrap();
        assert_eq!(scan_header_line(&jsonl, 1), None);
    }

    const CODEX_ID: &str = "01a13d02-8fbe-7d52-81ec-73ccfdbc1f1e";

    fn write_rollout(root: &Path, day: &str, stamp: &str, id: &str) -> PathBuf {
        let dir = root.join(day);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(format!("rollout-{stamp}-{id}.jsonl"));
        std::fs::write(&file, "{}\n").unwrap();
        file
    }

    // Version 4, so its id carries no timestamp and the lookup walks every day.
    const V4_ID: &str = "4f1c2a00-8fbe-4d52-81ec-73ccfdbc1f1e";

    #[test]
    fn a_codex_record_finds_its_rollout_by_id_across_date_dirs() {
        let root = tempfile::tempdir().unwrap();
        write_rollout(
            root.path(),
            "2026/10/20",
            "2026-10-20T09-00-00",
            "4f1c2a00-0000-4000-8000-000000000000",
        );
        let want = write_rollout(root.path(), "2024/09/14", "2024-09-14T20-42-20", V4_ID);
        write_rollout(
            root.path(),
            "2023/12/31",
            "2023-12-31T23-59-59",
            "4f1c2a00-1111-4000-8000-000000000000",
        );

        assert_eq!(
            find_in_codex_sessions(Some(root.path()), V4_ID, ""),
            Some(want)
        );
    }

    #[test]
    fn a_uuid_v7_id_names_the_utc_day_it_was_created() {
        // 0x01a13d028fbe ms is 2026-10-15T00:42:20.478Z.
        let day = uuid_v7_unix_day(CODEX_ID).unwrap();
        assert_eq!(civil_from_days(day), (2026, 10, 15));
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        for id in [
            V4_ID,
            "abc-123",
            "",
            "01a13d02-8fbe-7d52-81ec",
            "01a13d0z-8fbe-7d52-81ec-73ccfdbc1f1e",
        ] {
            assert_eq!(uuid_v7_unix_day(id), None, "{id}");
        }
    }

    #[test]
    fn a_uuid_v7_rollout_is_looked_up_only_within_a_day_of_its_timestamp() {
        for (day, found) in [
            ("2026/10/14", true),
            ("2026/10/15", true),
            ("2026/10/16", true),
            ("2026/10/13", false),
            ("2026/10/17", false),
            ("2026/09/14", false),
        ] {
            let root = tempfile::tempdir().unwrap();
            let stamp = format!("{}T12-00-00", day.replace('/', "-"));
            let file = write_rollout(root.path(), day, &stamp, CODEX_ID);
            assert_eq!(
                find_in_codex_sessions(Some(root.path()), CODEX_ID, ""),
                found.then_some(file),
                "{day}"
            );
        }
    }

    #[test]
    fn a_codex_find_prefers_the_recorded_transcript_path() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let recorded = other.path().join("rollout-x.jsonl");
        std::fs::write(&recorded, "{}\n").unwrap();
        write_rollout(root.path(), "2026/10/14", "2026-10-14T20-42-20", CODEX_ID);

        let found =
            find_in_codex_sessions(Some(root.path()), CODEX_ID, &recorded.display().to_string());

        assert_eq!(found, Some(recorded));
    }

    #[test]
    fn a_recorded_transcript_path_that_is_not_a_rollout_falls_back_to_the_id_lookup() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let want = write_rollout(root.path(), "2026/10/14", "2026-10-14T20-42-20", CODEX_ID);
        for name in [
            "notes.jsonl",
            "rollout-x.json",
            "x-rollout-1.jsonl",
            "rollout-x.jsonl.bak",
        ] {
            let recorded = other.path().join(name);
            std::fs::write(&recorded, "{}\n").unwrap();
            assert_eq!(
                find_in_codex_sessions(
                    Some(root.path()),
                    CODEX_ID,
                    &recorded.display().to_string()
                ),
                Some(want.clone()),
                "{name}"
            );
        }
    }

    #[test]
    fn a_codex_find_ignores_unrelated_files() {
        let root = tempfile::tempdir().unwrap();
        let day = root.path().join("2026/10/14");
        std::fs::create_dir_all(&day).unwrap();
        std::fs::write(day.join(format!("{CODEX_ID}.jsonl")), "{}\n").unwrap();
        std::fs::write(
            day.join(format!("rollout-2026-10-14T20-42-20-{CODEX_ID}.json")),
            "{}\n",
        )
        .unwrap();
        std::fs::write(
            day.join(format!("rollout-2026-10-14T20-42-20-x{CODEX_ID}.jsonl")),
            "{}\n",
        )
        .unwrap();
        std::fs::create_dir_all(day.join(format!("rollout-2026-10-14T20-42-20-{CODEX_ID}.jsonl")))
            .unwrap();
        std::fs::write(root.path().join("2026/notes.txt"), "x").unwrap();
        std::fs::write(
            root.path()
                .join(format!("rollout-2026-10-14T20-42-20-{CODEX_ID}.jsonl")),
            "{}\n",
        )
        .unwrap();

        assert_eq!(
            find_in_codex_sessions(Some(root.path()), CODEX_ID, ""),
            None
        );
    }

    #[test]
    fn a_codex_find_without_a_sessions_tree_finds_nothing() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(
            find_in_codex_sessions(Some(&root.path().join("missing")), CODEX_ID, ""),
            None
        );
    }

    #[test]
    fn the_codex_sessions_root_follows_codex_home() {
        let home = tempfile::tempdir().unwrap();
        let custom = tempfile::tempdir().unwrap();

        let root = codex_sessions_root_from(
            Some(custom.path().as_os_str().to_owned()),
            Some(home.path().to_path_buf()),
        );
        assert_eq!(
            root,
            Some(
                std::fs::canonicalize(custom.path())
                    .unwrap()
                    .join("sessions")
            )
        );

        let root = codex_sessions_root_from(None, Some(home.path().to_path_buf()));
        assert_eq!(root, Some(home.path().join(".codex").join("sessions")));
    }

    #[test]
    fn tests_never_resolve_a_real_codex_root() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(codex_sessions_root(), None);
        let inside = with_codex_sessions_root(root.path(), codex_sessions_root);
        assert_eq!(inside, Some(root.path().to_path_buf()));
        assert_eq!(codex_sessions_root(), None);
        assert_eq!(
            Provider::of("codex")
                .unwrap()
                .sessions
                .as_ref()
                .unwrap()
                .find(CODEX_ID, ""),
            None
        );
    }

    #[test]
    fn a_codex_record_reads_the_cwd_of_the_session_meta_line() {
        let dir = tempfile::tempdir().unwrap();
        let jsonl = dir.path().join("x.jsonl");
        std::fs::write(
            &jsonl,
            format!(
                "{{\"timestamp\":\"t\",\"type\":\"session_meta\",\"payload\":{{\"id\":\"{CODEX_ID}\",\"cwd\":\"/tmp/proj\",\"originator\":\"codex_cli_rs\"}}}}\n{{\"type\":\"response_item\"}}\n"
            ),
        )
        .unwrap();

        let provider = Provider::of("codex").unwrap();
        assert_eq!(
            provider.cwd_read.read_launch_cwd(&jsonl),
            Some("/tmp/proj".to_string())
        );
    }

    fn session_meta_line(padding: usize) -> String {
        format!(
            "{{\"type\":\"session_meta\",\"payload\":{{\"id\":\"{CODEX_ID}\",\"cwd\":\"/tmp/proj\",\"instructions\":\"{}\"}}}}\n",
            "x".repeat(padding)
        )
    }

    #[test]
    fn a_long_session_meta_line_is_read_up_to_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        let jsonl = dir.path().join("x.jsonl");
        let line = session_meta_line(64 * 1024);
        std::fs::write(&jsonl, format!("{line}{{\"type\":\"response_item\"}}\n")).unwrap();
        assert_eq!(scan_header_line(&jsonl, 1), Some("/tmp/proj".to_string()));

        let at_cap = session_meta_line(0);
        let at_cap = session_meta_line(HEADER_LINE_CAP - at_cap.len());
        assert_eq!(at_cap.len(), HEADER_LINE_CAP);
        std::fs::write(&jsonl, &at_cap).unwrap();
        assert_eq!(scan_header_line(&jsonl, 1), Some("/tmp/proj".to_string()));
    }

    #[test]
    fn a_header_line_longer_than_the_cap_is_unreadable() {
        let dir = tempfile::tempdir().unwrap();
        let jsonl = dir.path().join("x.jsonl");
        let line = session_meta_line(HEADER_LINE_CAP);
        std::fs::write(&jsonl, format!("{line}{{\"type\":\"response_item\"}}\n")).unwrap();
        assert_eq!(scan_header_line(&jsonl, 1), None);
        std::fs::write(&jsonl, line.trim_end()).unwrap();
        assert_eq!(scan_header_line(&jsonl, 1), None);
    }

    #[test]
    fn a_codex_record_ignores_a_rollout_without_session_meta_first() {
        let dir = tempfile::tempdir().unwrap();
        let jsonl = dir.path().join("x.jsonl");
        std::fs::write(
            &jsonl,
            "{\"type\":\"response_item\",\"payload\":{\"cwd\":\"/tmp/p\"}}\n",
        )
        .unwrap();
        assert_eq!(scan_header_line(&jsonl, 1), None);
    }

    #[test]
    fn reattach_cmd_claude() {
        let provider = Provider::of("claude").unwrap();
        assert_eq!(
            provider.reattach_cmd(None, "abc-123"),
            "claude --session-id 'abc-123'"
        );
        assert_eq!(
            provider.reattach_cmd(Some("claude --safe-mode"), "abc-123"),
            "claude --safe-mode --session-id 'abc-123'"
        );
    }

    #[test]
    fn shell_quote_escapes_single_quotes() {
        assert_eq!(shell_quote("/home/user/my repo"), "'/home/user/my repo'");
        assert_eq!(shell_quote("/path/with'quote"), "'/path/with'\\''quote'");
    }

    #[test]
    fn finds_the_transcript_in_a_claude_config_dir_override() {
        let root = tempfile::tempdir().unwrap();
        let group = root.path().join("projects").join("project-dir");
        std::fs::create_dir_all(&group).unwrap();
        std::fs::write(group.join("scan-test-id.jsonl"), "{}\n").unwrap();

        std::env::set_var("CLAUDE_CONFIG_DIR", root.path());
        let found = Provider::of("claude")
            .unwrap()
            .sessions
            .as_ref()
            .unwrap()
            .find("scan-test-id", "/nonexistent/nowhere.jsonl");
        std::env::remove_var("CLAUDE_CONFIG_DIR");

        assert_eq!(found, Some(group.join("scan-test-id.jsonl")));
    }
}
