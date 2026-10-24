use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

type Version = (u32, u32, u32);

// First Claude Code release that accepts each event as a key of `hooks`. Releases from 1.0.23
// to 2.1.100 discard the whole settings.json when it holds a key they do not know, and later
// ones print a warning on every start, so an event is only written for a release that has it.
// MessageDisplay is not in Orca's extracted fixture; its release comes from Claude's CHANGELOG.
// The order is the order the events are written in.
const EVENT_SINCE: [(&str, Version); 10] = [
    ("SessionStart", (1, 0, 62)),
    ("UserPromptSubmit", (1, 0, 53)),
    ("Notification", (1, 0, 23)),
    ("Stop", (1, 0, 31)),
    ("StopFailure", (2, 1, 78)),
    ("SessionEnd", (1, 0, 85)),
    ("PermissionRequest", (2, 0, 45)),
    ("MessageDisplay", (2, 1, 152)),
    ("SubagentStart", (2, 0, 43)),
    ("SubagentStop", (1, 0, 41)),
];

// What an unknown version gets: the events that exist since 1.0.x.
const BASELINE: Version = (1, 0, 85);

/// Reads `2.1.310` out of the text `claude --version` prints (`2.1.310 (Claude Code)`).
pub fn parse_version(output: &str) -> Option<Version> {
    let token = output.split_whitespace().next()?;
    let mut parts = token.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

/// The events to register for a Claude Code version. With no version, or one that does not
/// parse, only the events present since 1.0.x.
pub fn hook_events_for(version: Option<&str>) -> Vec<&'static str> {
    let at = version.and_then(parse_version).unwrap_or(BASELINE);
    EVENT_SINCE
        .iter()
        .filter(|(_, since)| *since <= at)
        .map(|(event, _)| *event)
        .collect()
}

/// Every event Kex knows, whatever the installed version: what an uninstall cleans.
pub fn known_events() -> impl Iterator<Item = &'static str> {
    EVENT_SINCE.iter().map(|(event, _)| *event)
}

const VERSION_TIMEOUT: Duration = Duration::from_millis(2000);

fn candidates() -> Vec<std::path::PathBuf> {
    let mut list = vec![std::path::PathBuf::from("claude")];
    if let Some(home) = dirs::home_dir() {
        list.push(home.join(".local/bin/claude"));
        list.push(home.join(".claude/local/claude"));
    }
    list.push("/opt/homebrew/bin/claude".into());
    list.push("/usr/local/bin/claude".into());
    list
}

fn run_with_timeout(program: &std::path::Path, timeout: Duration) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::modules::proc::hide_console(&mut cmd);
    let mut child = cmd.spawn().ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut out = String::new();
                child.stdout.take()?.read_to_string(&mut out).ok()?;
                return Some(out);
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(20));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

/// Blocking: runs `claude --version` with a short timeout. Call it off the UI thread. `None`
/// when Claude is not found, does not answer in time, or prints something unrecognised.
pub fn detect_claude_version() -> Option<String> {
    candidates().iter().find_map(|path| {
        let out = run_with_timeout(path, VERSION_TIMEOUT)?;
        let (a, b, c) = parse_version(&out)?;
        Some(format!("{a}.{b}.{c}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: [&str; 6] = [
        "SessionStart",
        "UserPromptSubmit",
        "Notification",
        "Stop",
        "SessionEnd",
        "SubagentStop",
    ];

    fn has(version: &str, event: &str) -> bool {
        hook_events_for(Some(version)).contains(&event)
    }

    fn edge(event: &str, below: &str, at: &str) {
        assert!(!has(below, event), "{event} must not exist in {below}");
        assert!(has(at, event), "{event} must exist in {at}");
    }

    #[test]
    fn notification_edge() {
        edge("Notification", "1.0.22", "1.0.23");
    }

    #[test]
    fn stop_edge() {
        edge("Stop", "1.0.30", "1.0.31");
    }

    #[test]
    fn subagent_stop_edge() {
        edge("SubagentStop", "1.0.40", "1.0.41");
    }

    #[test]
    fn user_prompt_submit_edge() {
        edge("UserPromptSubmit", "1.0.52", "1.0.53");
    }

    #[test]
    fn session_start_edge() {
        edge("SessionStart", "1.0.61", "1.0.62");
    }

    #[test]
    fn session_end_edge() {
        edge("SessionEnd", "1.0.84", "1.0.85");
    }

    #[test]
    fn subagent_start_edge() {
        edge("SubagentStart", "2.0.42", "2.0.43");
    }

    #[test]
    fn permission_request_edge() {
        edge("PermissionRequest", "2.0.44", "2.0.45");
    }

    #[test]
    fn stop_failure_edge() {
        edge("StopFailure", "2.1.77", "2.1.78");
    }

    #[test]
    fn message_display_edge() {
        edge("MessageDisplay", "2.1.151", "2.1.152");
    }

    #[test]
    fn versions_compare_numerically_not_as_text() {
        assert!(has("2.1.310", "MessageDisplay"));
        assert!(has("10.0.0", "MessageDisplay"));
        assert!(!has("1.0.9", "SessionEnd"));
    }

    #[test]
    fn a_recent_version_gets_every_event() {
        assert_eq!(
            hook_events_for(Some("2.1.310")),
            known_events().collect::<Vec<_>>()
        );
    }

    #[test]
    fn an_unknown_version_gets_only_the_1_0_events() {
        for version in [
            None,
            Some(""),
            Some("garbage"),
            Some("2.1"),
            Some("v2.1.310"),
        ] {
            let mut got = hook_events_for(version);
            got.sort();
            let mut want = BASE.to_vec();
            want.sort();
            assert_eq!(got, want, "{version:?}");
        }
    }

    #[test]
    fn parses_what_claude_prints() {
        assert_eq!(parse_version("2.1.310 (Claude Code)\n"), Some((2, 1, 310)));
        assert_eq!(parse_version("1.0.23"), Some((1, 0, 23)));
        assert_eq!(parse_version("2.1.310.4"), None);
        assert_eq!(parse_version("command not found"), None);
        assert_eq!(parse_version(""), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_program_that_does_not_answer_in_time_is_given_up_on() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("claude");
        std::fs::write(&script, "#!/bin/sh\nsleep 5\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let start = Instant::now();
        assert_eq!(run_with_timeout(&script, Duration::from_millis(200)), None);
        assert!(start.elapsed() < Duration::from_secs(3));
    }

    #[cfg(unix)]
    #[test]
    fn a_program_that_answers_gives_its_output() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("claude");
        std::fs::write(&script, "#!/bin/sh\necho '2.1.310 (Claude Code)'\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let out = run_with_timeout(&script, Duration::from_secs(2)).unwrap();
        assert_eq!(parse_version(&out), Some((2, 1, 310)));
    }
}
