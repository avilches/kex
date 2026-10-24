use crate::modules::agent::launch_cmd::DEFAULT_AGENTS;
use crate::modules::editors::detect::{DetectedEditor, DetectedKind};

fn display_name(agent: &str) -> &str {
    match agent {
        "claude" => "Claude Code",
        "codex" => "Codex",
        "opencode" => "OpenCode",
        "omp" => "OMP",
        "pi" => "Pi",
        other => other,
    }
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
        detect_agents_with(|name| unix_lookup::find_in_path(&path, name))
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
        .filter(|name| is_plain_name(name))
        .filter_map(|name| {
            let binary = lookup(name)?;
            Some(DetectedEditor {
                id: name.to_string(),
                name: display_name(name).to_string(),
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
    use std::path::Path;
    use std::process::{Command, Stdio};
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

    pub(super) fn read_login_path(shell: &str, timeout: Duration) -> Option<OsString> {
        let mut cmd = Command::new(shell);
        cmd.args(["-l", "-i", "-c", "/usr/bin/printenv PATH"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        for (key, value) in crate::modules::workspace::appimage_env_overrides() {
            match value {
                Some(v) => cmd.env(key, v),
                None => cmd.env_remove(key),
            };
        }
        let mut child = cmd.spawn().ok()?;
        let mut stdout = child.stdout.take()?;
        let reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = stdout.read_to_end(&mut buf);
            buf
        });
        let deadline = Instant::now() + timeout;
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    log::warn!("login shell PATH lookup did not finish in time");
                    return None;
                }
            }
        }
        let out = reader.join().ok()?;
        parse_printenv_output(&String::from_utf8_lossy(&out)).map(OsString::from)
    }

    pub(super) fn parse_printenv_output(out: &str) -> Option<String> {
        out.lines()
            .map(str::trim)
            .rfind(|l| !l.is_empty())
            .filter(|l| l.contains('/'))
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
        assert_eq!(names, ["Claude Code", "Codex", "OpenCode", "OMP", "Pi"]);
    }

    #[test]
    fn serializes_kind_lowercase() {
        let found = detect_agents_with(|n| Some(n.to_string()));
        let v = serde_json::to_value(&found[0]).unwrap();
        assert_eq!(v["kind"], "agent");
    }

    #[test]
    fn only_plain_names_are_looked_up() {
        assert!(DEFAULT_AGENTS.iter().all(|n| is_plain_name(n)));
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
        use std::path::Path;
        use std::time::Duration;

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
        fn takes_the_last_line_of_noisy_shell_output() {
            let out = "welcome banner\n\n/opt/homebrew/bin:/usr/bin\n\n";
            assert_eq!(
                parse_printenv_output(out).as_deref(),
                Some("/opt/homebrew/bin:/usr/bin")
            );
            assert_eq!(parse_printenv_output(""), None);
            assert_eq!(parse_printenv_output("no path here"), None);
        }

        #[test]
        fn login_path_comes_first_and_duplicates_are_dropped() {
            let merged = merge_paths(
                OsStr::new("/home/u/.local/bin:/usr/bin"),
                OsStr::new("/usr/bin:/bin"),
            );
            assert_eq!(merged, "/home/u/.local/bin:/usr/bin:/bin");
        }

        #[test]
        fn reads_path_from_a_shell_and_gives_up_on_a_hung_one() {
            let dir = tempfile::tempdir().unwrap();
            let ok = script(dir.path(), "ok.sh", "echo noise\necho /x/bin:/y/bin\n", 0o755);
            let hung = script(dir.path(), "hung.sh", "sleep 5\n", 0o755);
            assert_eq!(
                read_login_path(&ok, Duration::from_secs(5)).unwrap(),
                "/x/bin:/y/bin"
            );
            assert_eq!(read_login_path(&hung, Duration::from_millis(200)), None);
        }
    }
}
