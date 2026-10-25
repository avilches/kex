//! Claude Code's `statusLine` slot and the usage readings its ticks carry. Pure: the settings
//! file is planned by `plan_settings` in `mod.rs`, the frames are routed by `pty/ipc.rs`.
//!
//! The slot holds one command. A command of the user's is never replaced nor wrapped: Kex only
//! takes an empty slot, and only ever rewrites or removes a command it recognises as its own.

use serde_json::{json, Value};

pub const SCRIPT: &str = include_str!("hooks/statusline.sh");
pub const SCRIPT_VERSION: &str = "kex-statusline-v1";
pub const SCRIPT_FILE: &str = "statusline.sh";
const MARKER: &str = "kex-statusline";

pub fn command() -> String {
    format!(r#""$HOME/.config/kex/hooks/{SCRIPT_FILE}"  # {MARKER}"#)
}

#[derive(Debug, PartialEq)]
pub enum Slot {
    Empty,
    Kex,
    Foreign,
}

/// Only a missing or `null` slot is empty. Anything else the user wrote, even a malformed one
/// (a typo in `command`, a blank or non-string command), is theirs and is left alone. Kex's
/// own is recognised by the command ending in its marker comment, which every Kex release
/// writes, so a user command that merely contains the word is not taken for Kex's.
pub fn slot(root: &Value) -> Slot {
    match root.get("statusLine") {
        None | Some(Value::Null) => Slot::Empty,
        Some(s) => match s.get("command").and_then(Value::as_str) {
            Some(c) if is_kex_command(c) => Slot::Kex,
            _ => Slot::Foreign,
        },
    }
}

fn is_kex_command(command: &str) -> bool {
    command
        .trim_end()
        .strip_suffix(MARKER)
        .and_then(|rest| rest.trim_end().strip_suffix('#'))
        .is_some()
}

pub fn install(mut root: Value) -> Value {
    if slot(&root) == Slot::Foreign {
        return root;
    }
    let wanted = json!({ "type": "command", "command": command() });
    if let Some(obj) = root.as_object_mut() {
        if obj.get("statusLine") != Some(&wanted) {
            obj.insert("statusLine".into(), wanted);
        }
    }
    root
}

pub fn remove(mut root: Value) -> Value {
    if slot(&root) == Slot::Kex {
        if let Some(obj) = root.as_object_mut() {
            obj.remove("statusLine");
        }
    }
    root
}

/// What the UI shows of one tick. Every field is optional: an API-billed session has no
/// `rate_limits`, and a session that has not called the API yet has a null context percentage.
#[derive(Debug, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_used_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<Window>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seven_day: Option<Window>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub used_pct: f64,
    /// Unix seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<f64>,
}

fn pct(v: &Value) -> Option<f64> {
    v.as_f64()
        .filter(|n| n.is_finite())
        .map(|n| n.clamp(0.0, 100.0))
}

// `utilization` is the OAuth usage endpoint's spelling of the same number: accepted so a rename
// in the CLI degrades instead of hiding the reading (Orca does the same).
fn window(v: &Value) -> Option<Window> {
    let used_pct = pct(&v["used_percentage"]).or_else(|| pct(&v["utilization"]))?;
    Some(Window {
        used_pct,
        resets_at: v["resets_at"]
            .as_f64()
            .filter(|n| n.is_finite() && *n > 0.0),
    })
}

/// The reading of a tick, or `None` when it carries nothing to show. `used_percentage` is
/// preferred and `remaining_percentage` is its fallback; both were measured on 2.1.310.
pub fn usage(tick: &Value) -> Option<Usage> {
    let ctx = &tick["context_window"];
    let context_used_pct = pct(&ctx["used_percentage"])
        .or_else(|| pct(&ctx["remaining_percentage"]).map(|r| 100.0 - r));
    let limits = &tick["rate_limits"];
    let u = Usage {
        context_used_pct,
        five_hour: window(&limits["five_hour"]),
        seven_day: window(&limits["seven_day"]),
    };
    (u != Usage::default()).then_some(u)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The tick of a real interactive session on 2.1.310 with API billing, ids and paths redacted.
    const API_TICK: &str = r#"{"session_id":"s","transcript_path":"/t.jsonl","cwd":"/w","prompt_id":"p","effort":{"level":"medium"},"session_name":"n","model":{"id":"m","display_name":"Opus 5.5"},"workspace":{"current_dir":"/w","project_dir":"/w","added_dirs":[]},"version":"2.1.310","output_style":{"name":"default"},"cost":{"total_cost_usd":0.0913753,"total_duration_ms":14990,"total_api_duration_ms":6573,"total_lines_added":0,"total_lines_removed":0},"context_window":{"total_input_tokens":18223,"total_output_tokens":4,"context_window_size":1000000,"current_usage":{"input_tokens":2,"output_tokens":4,"cache_creation_input_tokens":18221,"cache_read_input_tokens":0},"used_percentage":2,"remaining_percentage":98},"exceeds_200k_tokens":false,"fast_mode":false,"thinking":{"enabled":true}}"#;
    const FIRST_TICK: &str = r#"{"session_id":"s","cost":{"total_cost_usd":0,"total_duration_ms":253},"context_window":{"total_input_tokens":0,"context_window_size":1000000,"current_usage":null,"used_percentage":null,"remaining_percentage":null}}"#;

    fn v(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn an_empty_slot_gets_kex_command() {
        let out = install(json!({ "theme": "dark" }));
        assert_eq!(slot(&out), Slot::Kex);
        assert_eq!(out["statusLine"]["type"], "command");
        assert_eq!(out["theme"], "dark");
        assert_eq!(install(out.clone()), out, "idempotent");
    }

    #[test]
    fn only_a_missing_or_null_slot_is_empty() {
        for root in [json!({}), json!({ "statusLine": null })] {
            assert_eq!(slot(&root), Slot::Empty, "{root}");
            assert_eq!(slot(&install(root)), Slot::Kex);
        }
    }

    #[test]
    fn a_malformed_slot_is_the_users_and_is_left_alone() {
        for root in [
            json!({ "statusLine": { "type": "command", "command": "" } }),
            json!({ "statusLine": { "type": "command", "command": "  " } }),
            json!({ "statusLine": { "type": "command", "command": 5 } }),
            json!({ "statusLine": { "type": "command", "cmd": "~/hud.sh" } }),
            json!({ "statusLine": "~/hud.sh" }),
            json!({ "statusLine": ["~/hud.sh"] }),
        ] {
            assert_eq!(slot(&root), Slot::Foreign, "{root}");
            assert_eq!(install(root.clone()), root);
            assert_eq!(remove(root.clone()), root);
        }
    }

    #[test]
    fn a_user_command_that_only_contains_the_marker_word_is_not_kex() {
        for command in [
            "~/bin/my-kex-statusline-hud.sh",
            "kex-statusline",
            "~/hud.sh # kex-statusline --verbose",
            "~/hud.sh #kex-statusline-v2",
        ] {
            let root = json!({ "statusLine": { "type": "command", "command": command } });
            assert_eq!(slot(&root), Slot::Foreign, "{command}");
            assert_eq!(install(root.clone()), root);
            assert_eq!(remove(root.clone()), root);
        }
    }

    #[test]
    fn a_foreign_status_line_is_never_replaced_nor_removed() {
        let root = json!({
            "statusLine": { "type": "command", "command": "$HOME/.claude/hooks/run-hud.sh", "padding": 0 }
        });
        assert_eq!(slot(&root), Slot::Foreign);
        assert_eq!(install(root.clone()), root);
        assert_eq!(remove(root.clone()), root);
    }

    #[test]
    fn an_older_kex_command_is_rewritten_and_removed() {
        let root = json!({ "statusLine": { "type": "command", "command": "/old/path.sh # kex-statusline" } });
        let out = install(root);
        assert_eq!(out["statusLine"]["command"], command());
        let gone = remove(out);
        assert!(gone.get("statusLine").is_none());
    }

    #[test]
    fn remove_leaves_an_empty_slot_alone() {
        let root = json!({ "theme": "dark" });
        assert_eq!(remove(root.clone()), root);
    }

    #[test]
    fn the_command_carries_the_marker_and_the_script_its_version() {
        assert!(command().contains(MARKER));
        assert!(SCRIPT.lines().nth(1).unwrap().contains(SCRIPT_VERSION));
    }

    #[test]
    fn an_api_billed_tick_has_context_but_no_limits() {
        assert_eq!(
            usage(&v(API_TICK)),
            Some(Usage {
                context_used_pct: Some(2.0),
                five_hour: None,
                seven_day: None,
            })
        );
    }

    #[test]
    fn a_tick_before_the_first_api_call_has_nothing_to_show() {
        assert_eq!(usage(&v(FIRST_TICK)), None);
        assert_eq!(usage(&json!({})), None);
        assert_eq!(usage(&json!("x")), None);
    }

    #[test]
    fn a_subscriber_tick_reads_both_windows() {
        let tick = json!({
            "context_window": { "used_percentage": 41.5 },
            "rate_limits": {
                "five_hour": { "used_percentage": 23, "resets_at": 1792900000 },
                "seven_day": { "utilization": 61 }
            }
        });
        let u = usage(&tick).unwrap();
        assert_eq!(u.context_used_pct, Some(41.5));
        assert_eq!(
            u.five_hour,
            Some(Window {
                used_pct: 23.0,
                resets_at: Some(1792900000.0)
            })
        );
        assert_eq!(
            u.seven_day,
            Some(Window {
                used_pct: 61.0,
                resets_at: None
            })
        );
    }

    #[test]
    fn readings_are_clamped_and_remaining_is_a_fallback() {
        let tick = json!({ "context_window": { "remaining_percentage": 70 }, "rate_limits": { "five_hour": { "used_percentage": 140 } } });
        let u = usage(&tick).unwrap();
        assert_eq!(u.context_used_pct, Some(30.0));
        assert_eq!(u.five_hour.unwrap().used_pct, 100.0);
    }

    #[cfg(unix)]
    struct Run {
        stdout: String,
        frame: Option<Value>,
    }

    #[cfg(unix)]
    fn run_script(home: &std::path::Path, tick: &str, env: &[(&str, &str)]) -> Run {
        use std::io::{BufRead, BufReader, Write};
        use std::os::unix::net::UnixListener;
        use std::process::{Command, Stdio};

        let script = home.join(SCRIPT_FILE);
        std::fs::write(&script, SCRIPT).unwrap();
        let sock = home.join("s.sock");
        let _ = std::fs::remove_file(&sock);
        let listener = UnixListener::bind(&sock).unwrap();
        listener.set_nonblocking(true).unwrap();
        // /bin/sh is what Claude Code runs the command with; on macOS it is bash 3.2.
        let mut cmd = Command::new("/bin/sh");
        cmd.arg(&script)
            .env("HOME", home)
            .env("KEX_TAB_ID", "tab-1")
            .env("KEX_PTY_ID", "7")
            .env("KEX_IPC", &sock)
            .env_remove("CLAUDE_JOB_DIR")
            .env_remove("KEX_STATUSLINE_MIN_POST_INTERVAL_SECONDS")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped());
        cmd.envs(env.iter().copied());
        let mut child = cmd.spawn().unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(tick.as_bytes())
            .unwrap();
        let out = child.wait_with_output().unwrap();
        // The send runs in the background after the script exits.
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(700);
        let frame = loop {
            match listener.accept() {
                Ok((stream, _)) => {
                    stream.set_nonblocking(false).unwrap();
                    let mut line = String::new();
                    BufReader::new(stream).read_line(&mut line).unwrap();
                    break Some(serde_json::from_str(&line).unwrap());
                }
                Err(_) if std::time::Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(10))
                }
                Err(_) => break None,
            }
        };
        Run {
            stdout: String::from_utf8(out.stdout).unwrap(),
            frame,
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_script_prints_nothing_and_sends_a_tagged_frame() {
        let home = tempfile::tempdir().unwrap();
        let run = run_script(home.path(), &format!("{API_TICK}\n"), &[]);
        assert_eq!(run.stdout, "");
        let frame = run.frame.expect("nothing sent");
        assert_eq!(frame["hook_event_name"], "StatusLine");
        assert_eq!(frame["agent"], "claude");
        assert_eq!(
            (frame["tab_id"].as_str(), frame["pty_id"].as_str()),
            (Some("tab-1"), Some("7"))
        );
        assert_eq!(frame["context_window"]["used_percentage"], 2);
    }

    #[cfg(unix)]
    #[test]
    fn an_nc_without_unix_sockets_falls_back_to_python() {
        use std::os::unix::fs::PermissionsExt;
        let home = tempfile::tempdir().unwrap();
        let bin = home.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        // GNU netcat rejects -U with a usage error on stderr.
        let nc = bin.join("nc");
        std::fs::write(
            &nc,
            "#!/bin/sh\necho 'nc: invalid option -- U' >&2\nexit 1\n",
        )
        .unwrap();
        std::fs::set_permissions(&nc, std::fs::Permissions::from_mode(0o755)).unwrap();
        let path = format!("{}:{}", bin.display(), std::env::var("PATH").unwrap());
        let run = run_script(home.path(), API_TICK, &[("PATH", &path)]);
        assert_eq!(run.stdout, "");
        assert_eq!(run.frame.expect("python3 did not send")["tab_id"], "tab-1");
    }

    #[cfg(unix)]
    #[test]
    fn the_payload_cannot_pick_the_tab() {
        let home = tempfile::tempdir().unwrap();
        let tick =
            r#"{"tab_id":"tab-other","pty_id":"99","context_window":{"remaining_percentage":50}}"#;
        let frame = run_script(home.path(), tick, &[]).frame.unwrap();
        assert_eq!(frame["tab_id"], "tab-1");
        assert_eq!(frame["pty_id"], "7");
    }

    #[cfg(unix)]
    #[test]
    fn an_unchanged_reading_inside_the_interval_is_not_sent_again() {
        let home = tempfile::tempdir().unwrap();
        let tick = |ms: u32, remaining: u32| {
            format!(
                r#"{{"cost":{{"total_duration_ms":{ms}}},"context_window":{{"used_percentage":{},"remaining_percentage":{remaining}}}}}"#,
                100 - remaining
            )
        };
        assert!(run_script(home.path(), &tick(1000, 90), &[])
            .frame
            .is_some());
        assert!(run_script(home.path(), &tick(2000, 90), &[])
            .frame
            .is_none());
        assert!(
            run_script(home.path(), &tick(3000, 80), &[])
                .frame
                .is_some(),
            "a changed reading goes out at once"
        );
        assert!(
            run_script(
                home.path(),
                &tick(3000, 80),
                &[("KEX_STATUSLINE_MIN_POST_INTERVAL_SECONDS", "0")]
            )
            .frame
            .is_some(),
            "the interval is configurable"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_script_stays_silent_outside_kex_and_for_unsafe_ids() {
        let home = tempfile::tempdir().unwrap();
        for env in [
            [("KEX_TAB_ID", "")],
            [("KEX_TAB_ID", "../x")],
            [("KEX_PTY_ID", "7\"")],
            [("CLAUDE_JOB_DIR", "/tmp/job")],
        ] {
            let run = run_script(home.path(), API_TICK, &env);
            assert_eq!(run.stdout, "");
            assert!(run.frame.is_none(), "{env:?}");
        }
        assert!(run_script(home.path(), "not json", &[]).frame.is_none());
    }

    #[test]
    fn malformed_windows_are_ignored() {
        let tick = json!({ "rate_limits": { "five_hour": "x", "seven_day": { "used_percentage": "50" } } });
        assert_eq!(usage(&tick), None);
    }
}
