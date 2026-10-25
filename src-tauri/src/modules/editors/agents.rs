use crate::modules::agent::launch_cmd::DEFAULT_AGENTS;
use crate::modules::editors::detect::{DetectedEditor, DetectedKind};

/// Agents Kex only finds on disk, so they can be offered as Actions; they have no session
/// integration and must stay out of `DEFAULT_AGENTS`, which drives detection inside a PTY.
const DETECT_ONLY_AGENTS: &[&str] = &[
    "agy",
    "openclaude",
    "grok",
    "aider",
    "goose",
    "cursor-agent",
];

fn display_name(agent: &str) -> Option<&'static str> {
    Some(match agent {
        "claude" => "Claude Code",
        "codex" => "Codex",
        "opencode" => "OpenCode",
        "omp" => "OMP",
        "pi" => "Pi",
        "agy" => "Antigravity",
        "openclaude" => "OpenClaude",
        "grok" => "Grok",
        "aider" => "Aider",
        "goose" => "Goose",
        "cursor-agent" => "Cursor Agent",
        _ => return None,
    })
}

fn is_plain_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn detect_agents() -> Vec<DetectedEditor> {
    #[cfg(unix)]
    {
        let path = unix_lookup::login_path();
        let fallback = dirs::home_dir()
            .map(|home| unix_lookup::install_dirs(&home, cfg!(target_os = "macos")))
            .unwrap_or_default();
        detect_agents_with(|name| {
            unix_lookup::find_in_path(&path, name)
                .or_else(|| unix_lookup::find_in_dirs(&fallback, name))
        })
    }
    #[cfg(windows)]
    {
        detect_agents_with(crate::modules::editors::detect::where_binary)
    }
    #[cfg(not(any(unix, windows)))]
    {
        Vec::new()
    }
}

fn detect_agents_with(lookup: impl Fn(&str) -> Option<String>) -> Vec<DetectedEditor> {
    DEFAULT_AGENTS
        .iter()
        .chain(DETECT_ONLY_AGENTS)
        .filter(|name| is_plain_name(name))
        .filter_map(|name| {
            let binary = lookup(name)?;
            Some(DetectedEditor {
                id: name.to_string(),
                name: display_name(name).unwrap_or(name).to_string(),
                binary,
                args_before_path: Vec::new(),
                kind: DetectedKind::Agent,
            })
        })
        .collect()
}

#[cfg(unix)]
mod unix_lookup {
    use std::ffi::{OsStr, OsString};
    use std::io::Read;
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    const LOGIN_SHELL_TIMEOUT: Duration = Duration::from_secs(3);

    // A Dock-launched app inherits launchd's minimal PATH, so the user's PATH is read once from
    // the login shell the PTY spawns; printenv keeps it shell-agnostic and no name reaches it.
    pub fn login_path() -> OsString {
        let own = std::env::var_os("PATH").unwrap_or_default();
        let shell = crate::modules::pty::shell_init::login_shell_path();
        match read_login_path(&shell, LOGIN_SHELL_TIMEOUT) {
            Some(login) => merge_paths(&login, &own),
            None => own,
        }
    }

    const PATH_BEGIN: &str = "__KEX_PATH_BEGIN__";
    const PATH_END: &str = "__KEX_PATH_END__";
    // A fixed string, never built from user text; the markers keep rc-file noise out of the parse.
    const PROBE: &str = "echo __KEX_PATH_BEGIN__; /usr/bin/printenv PATH; echo __KEX_PATH_END__";

    pub(super) fn read_login_path(shell: &str, timeout: Duration) -> Option<OsString> {
        let mut cmd = Command::new(shell);
        cmd.args(["-l", "-i", "-c", PROBE])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        for (key, value) in crate::modules::workspace::appimage_env_overrides() {
            match value {
                Some(v) => cmd.env(key, v),
                None => cmd.env_remove(key),
            };
        }
        // A new session has no controlling tty, so an interactive shell cannot stop on it, and
        // the whole group (rc-file background jobs included) can be killed at once.
        unsafe {
            cmd.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let out = run_bounded(cmd, timeout)?;
        parse_marked_path(&String::from_utf8_lossy(&out)).map(OsString::from)
    }

    // One deadline bounds the whole probe: a background job that inherits stdout keeps the pipe
    // open after the shell exits, so the read stops at the end marker or the deadline, not EOF.
    pub(super) fn run_bounded(mut cmd: Command, timeout: Duration) -> Option<Vec<u8>> {
        let deadline = Instant::now() + timeout;
        let mut child = cmd.spawn().ok()?;
        let mut stdout = child.stdout.take()?;
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut chunk = [0u8; 4096];
            while let Ok(n) = stdout.read(&mut chunk) {
                if n == 0 || tx.send(chunk[..n].to_vec()).is_err() {
                    break;
                }
            }
        });
        let mut buf = Vec::new();
        let complete = loop {
            if marked_section(&String::from_utf8_lossy(&buf)).is_some() {
                break true;
            }
            let left = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(left) {
                Ok(chunk) => buf.extend_from_slice(&chunk),
                Err(mpsc::RecvTimeoutError::Disconnected) => break true,
                Err(mpsc::RecvTimeoutError::Timeout) => break false,
            }
        };
        // Everything left in the group was started by the probe; killing it before reaping the
        // leader keeps the group id from being reused and frees the reader thread.
        kill_group(&child);
        let _ = child.kill();
        let _ = child.wait();
        if !complete {
            log::warn!("login shell PATH lookup did not finish in time");
            return None;
        }
        Some(buf)
    }

    fn kill_group(child: &std::process::Child) {
        if let Ok(pid) = libc::pid_t::try_from(child.id()) {
            unsafe {
                libc::kill(-pid, libc::SIGKILL);
            }
        }
    }

    fn marked_section(out: &str) -> Option<&str> {
        let begin = out.find(PATH_BEGIN)? + PATH_BEGIN.len();
        let len = out[begin..].find(PATH_END)?;
        Some(&out[begin..begin + len])
    }

    pub(super) fn parse_marked_path(out: &str) -> Option<String> {
        Some(marked_section(out)?.trim())
            .filter(|p| !p.is_empty())
            .map(str::to_string)
    }

    pub(super) fn merge_paths(first: &OsStr, second: &OsStr) -> OsString {
        let mut seen = std::collections::HashSet::new();
        let dirs: Vec<_> = std::env::split_paths(first)
            .chain(std::env::split_paths(second))
            .filter(|d| !d.as_os_str().is_empty() && seen.insert(d.clone()))
            .collect();
        std::env::join_paths(dirs).unwrap_or_else(|_| first.to_os_string())
    }

    pub fn find_in_path(path: &OsStr, name: &str) -> Option<String> {
        std::env::split_paths(path)
            .map(|dir| dir.join(name))
            .find(|candidate| is_executable(candidate))
            .and_then(|p| p.to_str().map(str::to_string))
    }

    // Where an agent CLI lands when the login shell does not export it: version-manager shims,
    // the per-user bins of npm, pnpm and bun, Homebrew, and the installers' own directories.
    pub fn install_dirs(home: &Path, macos: bool) -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = [
            ".volta/bin",
            ".asdf/shims",
            ".local/share/mise/shims",
            ".local/bin",
            ".yarn/bin",
            ".bun/bin",
            ".opencode/bin",
            ".nix-profile/bin",
        ]
        .iter()
        .map(|d| home.join(d))
        .collect();
        dirs.push(home.join(if macos {
            "Library/pnpm"
        } else {
            ".local/share/pnpm"
        }));
        if macos {
            dirs.push(PathBuf::from("/opt/homebrew/bin"));
        }
        dirs.extend(
            [
                "/usr/local/bin",
                "/snap/bin",
                "/home/linuxbrew/.linuxbrew/bin",
                "/nix/var/nix/profiles/default/bin",
            ]
            .iter()
            .map(PathBuf::from),
        );
        dirs
    }

    pub fn find_in_dirs(dirs: &[PathBuf], name: &str) -> Option<String> {
        dirs.iter()
            .map(|dir| dir.join(name))
            .find(|candidate| is_executable(candidate))
            .and_then(|p| p.to_str().map(str::to_string))
    }

    fn is_executable(p: &Path) -> bool {
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_only_resolved_agents() {
        let found = detect_agents_with(|n| match n {
            "claude" | "pi" => Some(format!("/bin/{n}")),
            _ => None,
        });
        let ids: Vec<_> = found.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, ["claude", "pi"]);
        assert_eq!(found[0].binary, "/bin/claude");
        assert!(found.iter().all(|d| d.kind == DetectedKind::Agent));
        assert!(found.iter().all(|d| d.args_before_path.is_empty()));
    }

    #[test]
    fn display_names() {
        let found = detect_agents_with(|n| Some(n.to_string()));
        let names: Vec<_> = found.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "Claude Code",
                "Codex",
                "OpenCode",
                "OMP",
                "Pi",
                "Antigravity",
                "OpenClaude",
                "Grok",
                "Aider",
                "Goose",
                "Cursor Agent"
            ]
        );
    }

    #[test]
    fn every_default_agent_has_a_display_name() {
        for agent in DEFAULT_AGENTS.iter().chain(DETECT_ONLY_AGENTS) {
            assert!(
                display_name(agent).is_some(),
                "{agent} has no display name: add it to display_name"
            );
        }
        assert_eq!(display_name("unknown"), None);
    }

    #[test]
    fn serializes_kind_lowercase() {
        let found = detect_agents_with(|n| Some(n.to_string()));
        let v = serde_json::to_value(&found[0]).unwrap();
        assert_eq!(v["kind"], "agent");
    }

    #[test]
    fn only_plain_names_are_looked_up() {
        assert!(DEFAULT_AGENTS
            .iter()
            .chain(DETECT_ONLY_AGENTS)
            .all(|n| is_plain_name(n)));
        assert!(DETECT_ONLY_AGENTS
            .iter()
            .all(|n| !DEFAULT_AGENTS.contains(n)));
        assert!(!is_plain_name("a;b"));
        assert!(!is_plain_name("../x"));
        assert!(!is_plain_name("a b"));
        assert!(!is_plain_name(""));
    }

    #[cfg(unix)]
    mod unix {
        use super::super::unix_lookup::*;
        use std::ffi::OsStr;
        use std::os::unix::fs::PermissionsExt;
        use std::os::unix::process::CommandExt;
        use std::path::Path;
        use std::time::{Duration, Instant};

        fn script(dir: &Path, name: &str, body: &str, mode: u32) -> String {
            let p = dir.join(name);
            std::fs::write(&p, format!("#!/bin/sh\n{body}")).unwrap();
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(mode)).unwrap();
            p.to_str().unwrap().to_string()
        }

        #[test]
        fn finds_the_first_executable_in_path_order() {
            let a = tempfile::tempdir().unwrap();
            let b = tempfile::tempdir().unwrap();
            script(a.path(), "claude", "", 0o644);
            let claude = script(b.path(), "claude", "", 0o755);
            let pi = script(a.path(), "pi", "", 0o755);
            let path = std::env::join_paths([a.path(), b.path()]).unwrap();
            assert_eq!(find_in_path(&path, "claude"), Some(claude));
            assert_eq!(find_in_path(&path, "pi"), Some(pi));
            assert_eq!(find_in_path(&path, "codex"), None);
        }

        #[test]
        fn falls_back_to_install_dirs_in_order() {
            let home = tempfile::tempdir().unwrap();
            let local = home.path().join(".local/bin");
            let bun = home.path().join(".bun/bin");
            std::fs::create_dir_all(&local).unwrap();
            std::fs::create_dir_all(&bun).unwrap();
            script(&bun, "goose", "", 0o755);
            let agy = script(&local, "agy", "", 0o755);
            let goose_local = script(&local, "goose", "", 0o755);
            let dirs = install_dirs(home.path(), false);
            assert_eq!(find_in_dirs(&dirs, "agy"), Some(agy));
            assert_eq!(find_in_dirs(&dirs, "goose"), Some(goose_local));
            assert_eq!(find_in_dirs(&dirs, "aider"), None);
            assert!(install_dirs(home.path(), true).contains(&"/opt/homebrew/bin".into()));
        }

        #[test]
        fn takes_only_the_text_between_the_markers() {
            let out = "welcome /bin/banner\n__KEX_PATH_BEGIN__\n/opt/homebrew/bin:/usr/bin\n__KEX_PATH_END__\nbye /logout\n";
            assert_eq!(
                parse_marked_path(out).as_deref(),
                Some("/opt/homebrew/bin:/usr/bin")
            );
        }

        #[test]
        fn missing_markers_or_an_empty_path_give_nothing() {
            assert_eq!(parse_marked_path(""), None);
            assert_eq!(parse_marked_path("/usr/bin:/bin\n"), None);
            assert_eq!(parse_marked_path("__KEX_PATH_BEGIN__\n/usr/bin"), None);
            assert_eq!(parse_marked_path("/usr/bin __KEX_PATH_END__"), None);
            assert_eq!(
                parse_marked_path("__KEX_PATH_BEGIN__\n\n__KEX_PATH_END__"),
                None
            );
        }

        #[test]
        fn login_path_comes_first_and_duplicates_are_dropped() {
            let merged = merge_paths(
                OsStr::new("/home/u/.local/bin:/usr/bin"),
                OsStr::new("/usr/bin:/bin"),
            );
            assert_eq!(merged, "/home/u/.local/bin:/usr/bin:/bin");
        }

        // The fake "shell" ignores its arguments, so each script stands in for a login shell.
        #[test]
        fn reads_path_from_a_shell_and_gives_up_on_a_hung_one() {
            let dir = tempfile::tempdir().unwrap();
            let ok = script(
                dir.path(),
                "ok.sh",
                "echo noise\necho __KEX_PATH_BEGIN__\necho /x/bin:/y/bin\necho __KEX_PATH_END__\necho logout\n",
                0o755,
            );
            let hung = script(dir.path(), "hung.sh", "sleep 5\n", 0o755);
            let unmarked = script(dir.path(), "plain.sh", "echo /x/bin\n", 0o755);
            assert_eq!(
                read_login_path(&ok, Duration::from_secs(5)).unwrap(),
                "/x/bin:/y/bin"
            );
            assert_eq!(read_login_path(&hung, Duration::from_millis(200)), None);
            assert_eq!(read_login_path(&unmarked, Duration::from_secs(5)), None);
        }

        #[test]
        fn a_background_job_holding_stdout_does_not_hang_the_probe() {
            let dir = tempfile::tempdir().unwrap();
            let done = script(
                dir.path(),
                "bg-done.sh",
                "sleep 30 &\necho __KEX_PATH_BEGIN__\necho /x/bin\necho __KEX_PATH_END__\n",
                0o755,
            );
            let silent = script(dir.path(), "bg-silent.sh", "sleep 30 &\n", 0o755);
            let start = Instant::now();
            assert_eq!(
                read_login_path(&done, Duration::from_secs(5)).unwrap(),
                "/x/bin"
            );
            assert!(start.elapsed() < Duration::from_secs(2));
            let start = Instant::now();
            assert_eq!(read_login_path(&silent, Duration::from_millis(300)), None);
            assert!(start.elapsed() < Duration::from_secs(2));
        }

        #[test]
        fn the_deadline_bounds_an_injected_command_that_never_closes_stdout() {
            let mut cmd = std::process::Command::new("/bin/sh");
            cmd.args(["-c", "sleep 30 & sleep 30"])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .process_group(0);
            let start = Instant::now();
            assert_eq!(run_bounded(cmd, Duration::from_millis(200)), None);
            assert!(start.elapsed() < Duration::from_secs(2));
        }
    }
}
