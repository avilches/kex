use std::io::BufRead;
use std::path::{Path, PathBuf};

/// Everything an agent CLI must tell the session store: where its transcripts live, how to
/// read the launch directory back from one, how a recorded session is reopened, and what to
/// do when the transcript has vanished. `session_store` stays agent-agnostic and only
/// consults this table; adding a provider means adding a row here.
pub struct Provider {
    pub name: &'static str,
    /// Where the provider keeps its transcripts, or `None` when it manages its own session
    /// state and resume does not consult any file (codex).
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
    },
    Provider {
        name: "codex",
        // codex keeps its sessions in its own store and only `resume --last` is defined, so
        // Kex never consults a transcript: the record is always resumable and never pruned.
        sessions: None,
        cwd_read: CwdRead::Unused,
        resume: ResumeSpec::Last,
        missing_transcript: MissingTranscriptPolicy::ResumeAnyway,
        keep_flags: &[],
        keep_with_value: &[],
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
        missing_transcript: MissingTranscriptPolicy::ResumeAnyway,
        keep_flags: &[],
        keep_with_value: &[],
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
        missing_transcript: MissingTranscriptPolicy::ResumeAnyway,
        keep_flags: &[],
        keep_with_value: &[],
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
            ResumeSpec::Last => format!("{launcher} resume --last"),
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

pub enum CwdRead {
    /// Walk the entries: `worktreeSession.originalCwd` wins (where the command was launched
    /// from while the session is inside a Kex worktree, which is often deleted later), else
    /// the first `cwd` entry.
    ScanEntries,
    /// Read the `cwd` of the `session` header entry (`HeaderLine(n)`, n is the 1-based JSONL
    /// line: OMP 2 after an intro `title`, Pi 1). The file is written when the session is
    /// created and the header never changes.
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

fn scan_header_line(jsonl: &Path, line_no: usize) -> Option<String> {
    let file = std::fs::File::open(jsonl).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let mut line = String::new();
    for _ in 0..line_no {
        line.clear();
        if reader.read_line(&mut line).ok()? == 0 {
            return None;
        }
    }
    serde_json::from_str::<serde_json::Value>(&line)
        .ok()
        .filter(|obj| obj.get("type").and_then(|t| t.as_str()) == Some("session"))
        .and_then(|obj| {
            obj.get("cwd")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .filter(|c| !c.is_empty())
}

pub enum ResumeSpec {
    /// `<stripped launch line> <flag> '<session id>'`
    Flag { flag: &'static str },
    /// The provider only offers resuming its most recent session (`<stripped launch line>
    /// resume --last`), so the record's session id is not part of the command.
    Last,
}

pub enum MissingTranscriptPolicy {
    /// The session was recorded but the transcript is gone: reopen it with the recorded id
    /// (`<stripped launch line> <flag> '<session id>'`) and prune the record once its launch
    /// directory is usable; the repo's hooks re-record if the new session produces anything.
    Reattach { flag: &'static str },
    /// Nothing can bring the session back: no plan is emitted, and the record is pruned as
    /// soon as its launch directory is usable.
    Ignore,
    /// Resume does not consult a transcript, so its absence is not an error to recover from
    /// and the record is never pruned.
    ResumeAnyway,
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
        assert_eq!(provider.resume_cmd(None, "any"), "codex resume --last");
        assert_eq!(
            provider.resume_cmd(Some("codex-max"), "abc-123"),
            "codex-max resume --last"
        );
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
