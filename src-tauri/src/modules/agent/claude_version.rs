use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

type Version = (u32, u32, u32);

// First Claude Code release that accepts each event as a key of `hooks`. Releases from 1.0.23
// to 2.1.100 discard the whole settings.json when it holds a key they do not know, and later
// ones print a warning on every start, so an event is only written for a release that has it.
// MessageDisplay is not in Orca's extracted fixture; its release comes from Claude's CHANGELOG.
// The order is the order the events are written in.
const EVENT_SINCE: [(&str, Version); 11] = [
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
    ("PostCompact", (2, 1, 76)),
];

// What an unknown version gets: the events that exist since 1.0.x.
const BASELINE: Version = (1, 0, 85);

/// Reads `2.1.310` out of the text `claude --version` prints (`2.1.310 (Claude Code)`); a
/// suffix on the patch number (`2.1.310-beta`) is ignored.
pub fn parse_version(output: &str) -> Option<Version> {
    let token = output.split_whitespace().next()?;
    let mut parts = token.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch_text = parts.next()?;
    let digits = patch_text
        .find(|c: char| !c.is_ascii_digit())
        .map_or(patch_text, |end| &patch_text[..end]);
    let patch = digits.parse().ok()?;
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

// A GUI app has a minimal PATH, so the usual install folders are tried too. Whatever is not
// found here (nvm, fnm, asdf) leaves the version unknown and falls back to the 6 events of 1.0.x.
fn candidates_for(home: Option<&std::path::Path>, windows: bool) -> Vec<std::path::PathBuf> {
    let names: &[&str] = if windows {
        &["claude.cmd", "claude.exe"]
    } else {
        &["claude"]
    };
    let mut list: Vec<std::path::PathBuf> = names.iter().map(std::path::PathBuf::from).collect();
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(home) = home {
        for sub in [
            ".local/bin",
            ".claude/local",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
            ".local/share/pnpm",
        ] {
            dirs.push(home.join(sub));
        }
        if windows {
            dirs.push(home.join("AppData/Roaming/npm"));
            dirs.push(home.join(".local/bin"));
        }
    }
    if !windows {
        dirs.push("/opt/homebrew/bin".into());
        dirs.push("/usr/local/bin".into());
    }
    for dir in dirs {
        for name in names {
            list.push(dir.join(name));
        }
    }
    list
}

fn candidates() -> Vec<std::path::PathBuf> {
    candidates_for(dirs::home_dir().as_deref(), cfg!(windows))
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

const CACHE_TTL: Duration = Duration::from_secs(60);

/// Whether an answer taken `age` ago can still be used.
pub fn cache_is_fresh(age: Duration, ttl: Duration) -> bool {
    age < ttl
}

static CACHE: std::sync::Mutex<Option<(Instant, Option<String>)>> = std::sync::Mutex::new(None);

/// Like `detect_claude_version`, but remembers the answer for a minute so frequent status
/// polls do not spawn a process each time. `refresh` skips the cache and renews it.
pub fn detect_claude_version_cached(refresh: bool) -> Option<String> {
    if !refresh {
        if let Some((at, value)) = CACHE.lock().ok().and_then(|g| g.clone()) {
            if cache_is_fresh(at.elapsed(), CACHE_TTL) {
                return value;
            }
        }
    }
    let value = detect_claude_version();
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some((Instant::now(), value.clone()));
    }
    value
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
    fn post_compact_edge() {
        edge("PostCompact", "2.1.75", "2.1.76");
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
        assert_eq!(parse_version("2.1.310-beta"), Some((2, 1, 310)));
        assert_eq!(
            parse_version("2.1.310-beta (Claude Code)"),
            Some((2, 1, 310))
        );
        assert_eq!(parse_version("2.1.-beta"), None);
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

    #[test]
    fn the_cache_expires_at_the_ttl() {
        let ttl = Duration::from_secs(60);
        assert!(cache_is_fresh(Duration::from_secs(59), ttl));
        assert!(!cache_is_fresh(ttl, ttl));
        assert!(!cache_is_fresh(Duration::from_secs(61), ttl));
    }

    #[test]
    fn unix_candidates_cover_node_managers_and_system_folders() {
        let home = std::path::Path::new("/h");
        let list = candidates_for(Some(home), false);
        for want in [
            "claude",
            "/h/.npm-global/bin/claude",
            "/h/.bun/bin/claude",
            "/h/.volta/bin/claude",
            "/h/.local/share/pnpm/claude",
            "/h/.local/bin/claude",
            "/opt/homebrew/bin/claude",
        ] {
            assert!(list.contains(&std::path::PathBuf::from(want)), "{want}");
        }
    }

    #[test]
    fn windows_candidates_use_cmd_and_exe() {
        let list = candidates_for(Some(std::path::Path::new("/h")), true);
        assert!(list.contains(&std::path::PathBuf::from("claude.cmd")));
        assert!(list.contains(&std::path::PathBuf::from("claude.exe")));
        assert!(list.contains(
            &std::path::Path::new("/h")
                .join("AppData/Roaming/npm")
                .join("claude.cmd")
        ));
        assert!(!list.iter().any(|p| p.ends_with("claude")));
    }
}
