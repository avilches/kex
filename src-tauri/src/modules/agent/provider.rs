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
        missing_transcript: MissingTranscriptPolicy::Reattach { flag: "--session-id" },
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
        format!("{} {} {}", base.unwrap_or(self.name), flag, shell_quote(session_id))
    }
}

pub enum SessionsSource {
    ClaudeProjects,
}

impl SessionsSource {
    /// Absolute path of a session's transcript file, or `None` when it is not on disk.
    pub fn find(&self, session_id: &str, transcript_path: &str) -> Option<PathBuf> {
        match self {
            Self::ClaudeProjects => find_in_claude_projects(session_id, transcript_path),
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

pub enum CwdRead {
    /// Walk the entries: `worktreeSession.originalCwd` wins (where the command was launched
    /// from while the session is inside a Kex worktree, which is often deleted later), else
    /// the first `cwd` entry.
    ScanEntries,
    /// Never consulted: only reachable when `sessions` is `None`.
    Unused,
}

impl CwdRead {
    pub fn read_launch_cwd(&self, transcript: &Path) -> Option<String> {
        match self {
            Self::ScanEntries => scan_claude_entries(transcript),
            Self::Unused => None,
        }
    }
}

fn scan_claude_entries(jsonl: &Path) -> Option<String> {
    let file = std::fs::File::open(jsonl).ok()?;
    let reader = std::io::BufReader::new(file);
    for line in reader.lines() {
        let line = line.ok()?;
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
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
    "--allowedTools", "--allowed-tools",
    "--disallowedTools", "--disallowed-tools",
    "--name", "-n",
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
    use super::*;
    use super::super::launch_cmd::DEFAULT_AGENTS;

    #[test]
    fn default_agents_have_a_provider_row() {
        for agent in DEFAULT_AGENTS {
            let provider = Provider::of(agent);
            assert!(provider.is_some(), "{agent} has no provider row");
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
        assert_eq!(provider.resume_cmd(None, "abc-123"), "claude --resume 'abc-123'");
        assert_eq!(
            provider.resume_cmd(Some("claude --safe-mode"), "abc-123"),
            "claude --safe-mode --resume 'abc-123'"
        );
    }

    #[test]
    fn resume_cmd_codex() {
        let provider = Provider::of("codex").unwrap();
        assert_eq!(provider.resume_cmd(None, "any"), "codex resume --last");
        assert_eq!(provider.resume_cmd(Some("codex-max"), "abc-123"), "codex-max resume --last");
    }

    #[test]
    fn reattach_cmd_claude() {
        let provider = Provider::of("claude").unwrap();
        assert_eq!(provider.reattach_cmd(None, "abc-123"), "claude --session-id 'abc-123'");
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
