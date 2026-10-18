use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// A validated launch request: nothing here goes through a shell.
#[derive(Debug, PartialEq, Eq)]
pub struct SpawnPlan {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
}

fn has_control(s: &str) -> bool {
    s.chars().any(char::is_control)
}

fn is_absolute(s: &str) -> bool {
    Path::new(s).is_absolute()
}

/// Checks `argv` and `cwd` before anything is spawned. The program is either an
/// absolute path to an existing file or a bare name left to PATH resolution; a
/// relative path with separators is refused because it would resolve against Kex's
/// own working directory.
pub fn validate_spawn(argv: &[String], cwd: Option<&str>) -> Result<SpawnPlan, String> {
    let (program, args) = argv.split_first().ok_or("Nothing to run: the command is empty")?;
    if program.trim().is_empty() {
        return Err("Nothing to run: the program name is empty".into());
    }
    if let Some(bad) = argv.iter().find(|a| has_control(a)) {
        return Err(format!("Control characters are not allowed in {bad:?}"));
    }
    if is_absolute(program) {
        if !Path::new(program).is_file() {
            return Err(format!("Program not found: {program}"));
        }
    } else if program.contains('/') || program.contains('\\') {
        return Err(format!("Program must be an absolute path or a bare name: {program}"));
    }
    let cwd = match cwd {
        None => None,
        Some(dir) => {
            if has_control(dir) {
                return Err("Control characters are not allowed in the folder".into());
            }
            if !is_absolute(dir) {
                return Err(format!("Folder must be an absolute path: {dir}"));
            }
            let path = PathBuf::from(dir);
            if !path.is_dir() {
                return Err(format!("Folder does not exist: {dir}"));
            }
            Some(path)
        }
    };
    Ok(SpawnPlan { program: program.clone(), args: args.to_vec(), cwd })
}

fn spawn_detached(plan: &SpawnPlan) -> Result<u32, String> {
    let mut cmd = Command::new(&plan.program);
    cmd.args(&plan.args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    if let Some(dir) = &plan.cwd {
        cmd.current_dir(dir);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Failed to launch {}: {e}", plan.program))?;
    let pid = child.id();
    // Reaped on its own thread: a finished child must not stay a zombie until Kex exits.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(pid)
}

/// Launches a program in the background without a shell. Fire-and-forget: the
/// caller learns whether it started, not how it ended.
#[tauri::command]
pub async fn action_spawn(argv: Vec<String>, cwd: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let plan = validate_spawn(&argv, cwd.as_deref())?;
        spawn_detached(&plan).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|s| s.to_string()).collect()
    }

    fn tmp() -> String {
        std::env::temp_dir().to_string_lossy().into_owned()
    }

    #[test]
    fn rejects_an_empty_command() {
        assert!(validate_spawn(&[], None).is_err());
        assert!(validate_spawn(&argv(&["  "]), None).is_err());
    }

    #[test]
    fn rejects_control_characters_in_any_element() {
        assert!(validate_spawn(&argv(&["code", "a\0b"]), None).is_err());
        assert!(validate_spawn(&argv(&["code", "a\nb"]), None).is_err());
        assert!(validate_spawn(&argv(&["co\rde"]), None).is_err());
    }

    #[test]
    fn rejects_a_relative_program_with_separators() {
        assert!(validate_spawn(&argv(&["./run.sh"]), None).is_err());
        assert!(validate_spawn(&argv(&["bin/tool"]), None).is_err());
        assert!(validate_spawn(&argv(&["..\\tool.exe"]), None).is_err());
    }

    #[test]
    fn rejects_a_missing_absolute_program() {
        let missing = std::env::temp_dir().join("kex-no-such-program-xyz");
        assert!(validate_spawn(&argv(&[&missing.to_string_lossy()]), None).is_err());
    }

    #[test]
    fn rejects_a_bad_cwd() {
        assert!(validate_spawn(&argv(&["code"]), Some("relative/dir")).is_err());
        let missing = std::env::temp_dir().join("kex-no-such-dir-xyz");
        assert!(validate_spawn(&argv(&["code"]), Some(&missing.to_string_lossy())).is_err());
        assert!(validate_spawn(&argv(&["code"]), Some("/tmp\n")).is_err());
        let file = std::env::current_exe().unwrap();
        assert!(validate_spawn(&argv(&["code"]), Some(&file.to_string_lossy())).is_err());
    }

    #[test]
    fn accepts_a_bare_name_and_keeps_arguments_with_spaces_whole() {
        let plan = validate_spawn(&argv(&["code", "--flag", "/my folder/a b.txt"]), Some(&tmp())).unwrap();
        assert_eq!(plan.program, "code");
        assert_eq!(plan.args, vec!["--flag", "/my folder/a b.txt"]);
        assert_eq!(plan.cwd, Some(PathBuf::from(tmp())));
    }

    #[test]
    fn accepts_an_existing_absolute_program() {
        let exe = std::env::current_exe().unwrap();
        assert!(validate_spawn(&argv(&[&exe.to_string_lossy()]), None).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_finished_child_is_reaped_and_a_missing_program_errors() {
        let plan = validate_spawn(&argv(&["true"]), Some(&tmp())).unwrap();
        let pid = spawn_detached(&plan).unwrap() as libc::pid_t;
        std::thread::sleep(std::time::Duration::from_millis(500));
        // A reaped pid no longer exists; a zombie would still answer kill(pid, 0).
        let alive = unsafe { libc::kill(pid, 0) } == 0;
        assert!(!alive, "child {pid} was not reaped");
        let missing = SpawnPlan { program: "kex-definitely-not-a-binary".into(), args: vec![], cwd: None };
        assert!(spawn_detached(&missing).is_err());
    }
}
