use crate::modules::agent::launch_cmd::{find_agent_invocation, DEFAULT_AGENTS};

const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const OSC_INTRO: u8 = b']';
const ST_FINAL: u8 = b'\\';

const OSC_MAX: usize = 4096;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum State {
    Ground,
    Esc,
    Osc,
    OscEsc,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Transition {
    Started {
        agent: String,
        cmd_string: String,
    },
    // First real interactive prompt (OSC 133;B) seen on this PTY. Independent
    // of agent detection: fires for every shell, armed or not, exactly once.
    ShellReady,
    // A `-p` / `--print` agent line is running: the agent is never armed, but its hooks still
    // report to the tab's socket and must be ignored until the shell's `D` ends the command.
    PrintRun,
    PrintRunEnded,
    Notification {
        message: String,
    },
    Exited,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSignal {
    pub id: u32,
    pub kind: &'static str,
    pub agent: Option<String>,
    pub message: Option<String>,
    pub tool_name: Option<String>,
    pub prompt: Option<String>,
}

impl Transition {
    pub fn into_signal(self, id: u32) -> AgentSignal {
        match self {
            Transition::Started { agent, .. } => AgentSignal {
                id,
                kind: "started",
                agent: Some(agent),
                message: None,
                tool_name: None,
                prompt: None,
            },
            Transition::Notification { message } => AgentSignal {
                id,
                kind: "Notification",
                agent: None,
                message: Some(message),
                tool_name: None,
                prompt: None,
            },
            Transition::Exited => AgentSignal {
                id,
                kind: "exited",
                agent: None,
                message: None,
                tool_name: None,
                prompt: None,
            },
            Transition::ShellReady | Transition::PrintRun | Transition::PrintRunEnded => {
                unreachable!("{self:?} is handled before into_signal")
            }
        }
    }
}

pub struct AgentDetector {
    agents: Vec<String>,
    state: State,
    osc: Vec<u8>,
    armed: bool,
    print_run: bool,
    shell_ready_emitted: bool,
    /// The previous thing in the stream was a `C` mark without command text, with nothing
    /// (text, another escape sequence) between it and the next byte.
    last_mark_bare_c: bool,
}

impl AgentDetector {
    pub fn new() -> Self {
        Self::with_agents(DEFAULT_AGENTS.iter().map(|s| s.to_string()).collect())
    }

    pub fn with_agents(agents: Vec<String>) -> Self {
        Self {
            agents,
            state: State::Ground,
            osc: Vec::new(),
            armed: false,
            print_run: false,
            shell_ready_emitted: false,
            last_mark_bare_c: false,
        }
    }

    /// Feed a chunk of raw PTY output. Transitions come only from OSC sequences
    /// (`133` prompt boundaries, `9`/`777` attention), never from raw output,
    /// so a TUI agent that repaints continuously never flaps working/waiting.
    pub fn process<F: FnMut(Transition)>(&mut self, input: &[u8], mut emit: F) {
        if self.state == State::Ground && !input.contains(&ESC) {
            if !input.is_empty() {
                self.last_mark_bare_c = false;
            }
            return;
        }

        for &b in input {
            match self.state {
                State::Ground => {
                    if b == ESC {
                        self.state = State::Esc;
                    } else {
                        self.last_mark_bare_c = false;
                    }
                }
                State::Esc => match b {
                    OSC_INTRO => {
                        self.state = State::Osc;
                        self.osc.clear();
                    }
                    ESC => {}
                    _ => {
                        self.last_mark_bare_c = false;
                        self.state = State::Ground;
                    }
                },
                State::Osc => match b {
                    BEL => {
                        self.finish_osc(&mut emit);
                        self.state = State::Ground;
                    }
                    ESC => self.state = State::OscEsc,
                    _ => {
                        if self.osc.len() < OSC_MAX {
                            self.osc.push(b);
                        } else {
                            self.osc.clear();
                            self.state = State::Ground;
                        }
                    }
                },
                State::OscEsc => match b {
                    ST_FINAL => {
                        self.finish_osc(&mut emit);
                        self.state = State::Ground;
                    }
                    ESC => {}
                    _ => {
                        self.osc.clear();
                        self.state = State::Ground;
                    }
                },
            }
        }
    }

    /// Called when the underlying PTY closes. Reports the agent as exited so the
    /// UI doesn't leave a stale entry if the shell died mid-command.
    pub fn finish<F: FnMut(Transition)>(&mut self, mut emit: F) {
        if self.armed {
            self.disarm();
            emit(Transition::Exited);
        }
        if std::mem::take(&mut self.print_run) {
            emit(Transition::PrintRunEnded);
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
        self.last_mark_bare_c = false;
    }

    fn finish_osc<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        let body = std::mem::take(&mut self.osc);
        let (ps, pt) = match body.iter().position(|&c| c == b';') {
            Some(i) => (&body[..i], &body[i + 1..]),
            None => (&body[..], &body[0..0]),
        };
        log::trace!(
            "[osc] ps={} pt={}",
            String::from_utf8_lossy(ps),
            String::from_utf8_lossy(pt)
        );
        if ps != b"133" {
            self.last_mark_bare_c = false;
        }
        match ps {
            b"133" => self.handle_osc133(pt, emit),
            // OSC 9;4 is taskbar progress, not a notification.
            b"9" if !pt.starts_with(b"4;") && pt != b"4" => self.generic_attention(emit),
            b"777" => self.handle_osc777(pt, emit),
            _ => {}
        }
    }

    fn handle_osc777<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        // OSC 9;4 is taskbar progress, ignore
        if pt.starts_with(b"4;") || pt == b"4" {
            return;
        }
        // Generic attention (Claude Code without hooks, any other OSC 777)
        self.generic_attention(emit);
    }

    fn handle_osc133<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        let after_bare_c = std::mem::take(&mut self.last_mark_bare_c);
        match pt.first() {
            Some(b'B') => {
                if !self.shell_ready_emitted {
                    self.shell_ready_emitted = true;
                    log::debug!("[shell] osc133 B: shell ready (first interactive prompt)");
                    emit(Transition::ShellReady);
                }
            }
            Some(b'C') => {
                let line = String::from_utf8_lossy(pt.strip_prefix(b"C;").unwrap_or(b""));
                self.last_mark_bare_c = line.trim().is_empty();
                let Some(inv) = find_agent_invocation(&line, &self.agents) else {
                    return;
                };
                if inv.is_print_mode() {
                    log::debug!("[shell] osc133 C: skip arm (print mode) cmd={line}");
                    self.print_run = true;
                    emit(Transition::PrintRun);
                    return;
                }
                self.print_run = false;
                // A cut line still names the agent, but replaying its text would be wrong.
                let cmd_string = if inv.complete {
                    inv.command()
                } else {
                    String::new()
                };
                let agent = inv.agent;
                log::debug!("[shell] osc133 C: armed agent={agent} cmd={cmd_string}");
                self.armed = true;
                emit(Transition::Started { agent, cmd_string });
            }
            // OMP draws `B C D;0` as one unbroken string around each message and when it resumes
            // a session. A shell that names its commands never sends a bare `C`, and its own `D`
            // arrives after the agent's output, so a `D` stuck to a bare `C` is the TUI, not the
            // end of the command. Pi draws `A B C` and no `D`, so the shell's `D` after it is real.
            Some(b'D') if self.armed && after_bare_c => {
                log::debug!("[shell] osc133 D: ignored (drawn by the agent's own UI)");
            }
            Some(b'D') if self.armed => {
                log::debug!("[shell] osc133 D: exited");
                self.disarm();
                emit(Transition::Exited);
            }
            Some(b'D') if std::mem::take(&mut self.print_run) => {
                log::debug!("[shell] osc133 D: print run ended");
                emit(Transition::PrintRunEnded);
            }
            _ => {}
        }
    }

    fn generic_attention<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        if self.armed {
            emit(Transition::Notification {
                message: String::new(),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(d: &mut AgentDetector, input: &[u8]) -> Vec<Transition> {
        let mut out = Vec::new();
        d.process(input, |t| out.push(t));
        out
    }

    fn osc(body: &str) -> Vec<u8> {
        let mut v = vec![ESC, OSC_INTRO];
        v.extend_from_slice(body.as_bytes());
        v.extend_from_slice(&[ESC, ST_FINAL]);
        v
    }

    // Auto-arm case (no prior OSC 133;C): cmd_string is empty.
    fn started(agent: &str) -> Transition {
        Transition::Started {
            agent: agent.into(),
            cmd_string: String::new(),
        }
    }

    fn started_cmd(agent: &str, cmd: &str) -> Transition {
        Transition::Started {
            agent: agent.into(),
            cmd_string: cmd.into(),
        }
    }

    fn notification(msg: &str) -> Transition {
        Transition::Notification {
            message: msg.into(),
        }
    }

    #[test]
    fn arms_on_agent_command() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;claude")),
            vec![started_cmd("claude", "claude")]
        );
        let mut d2 = AgentDetector::new();
        assert_eq!(
            run(&mut d2, &osc("133;C;claude --model opus")),
            vec![started_cmd("claude", "claude --model opus")],
        );
    }

    #[test]
    fn does_not_arm_in_print_mode() {
        for line in [
            "claude -p hello",
            "claude --print",
            "claude --model opus -p",
        ] {
            let mut d = AgentDetector::new();
            assert_eq!(
                run(&mut d, &osc(&format!("133;C;{line}"))),
                vec![Transition::PrintRun],
                "{line}"
            );
        }
    }

    #[test]
    fn a_print_run_ends_with_the_shells_d_mark() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude -p hello"));
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::PrintRunEnded]);
        assert!(run(&mut d, &osc("133;D;0")).is_empty());
    }

    #[test]
    fn d_without_a_print_run_says_nothing() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;D;0")).is_empty());
    }

    #[test]
    fn an_agent_start_closes_the_print_run_it_follows() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude -p hello"));
        assert_eq!(
            run(&mut d, &osc("133;C;claude")),
            vec![started_cmd("claude", "claude")]
        );
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn the_pty_closing_ends_a_print_run() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude -p hello"));
        let mut out = Vec::new();
        d.finish(|t| out.push(t));
        assert_eq!(out, vec![Transition::PrintRunEnded]);
    }

    #[test]
    fn arms_on_pathed_and_wrapped_command() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;/usr/local/bin/codex exec")),
            vec![started_cmd("codex", "/usr/local/bin/codex exec")]
        );
        let mut d2 = AgentDetector::new();
        assert_eq!(
            run(&mut d2, &osc("133;C;npx claude")),
            vec![started_cmd("claude", "npx claude")]
        );
    }

    #[test]
    fn stashes_only_the_agent_segment_of_a_retry_line() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C; cd '/a b' && claude-max --resume 'x'")),
            vec![started_cmd("claude", "claude-max --resume 'x'")]
        );
    }

    #[test]
    fn stashes_assignments_and_drops_grouping() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;(cd /tmp && FOO=1 claude --safe-mode)")),
            vec![started_cmd("claude", "FOO=1 claude --safe-mode")]
        );
    }

    #[test]
    fn arms_but_stashes_nothing_when_the_line_was_cut() {
        let mut d = AgentDetector::new();
        let cut = format!("133;C;claude --append-system-prompt '{}", "x".repeat(300));
        assert_eq!(run(&mut d, &osc(&cut)), vec![started("claude")]);
        let mut d2 = AgentDetector::new();
        assert_eq!(
            run(&mut d2, &osc("133;C;claude --add-dir /a\\")),
            vec![started("claude")]
        );
    }

    #[test]
    fn does_not_arm_on_shell_dependent_quoting() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;claude --name 'it\\'s' ; rm -rf y")).is_empty());
    }

    #[test]
    fn does_not_arm_when_the_agent_is_only_an_argument() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;cd ~/claude-docs")).is_empty());
        assert!(run(&mut d, &osc("133;C;cd ~/Projects/claude")).is_empty());
        assert!(run(&mut d, &osc("133;C;echo claude")).is_empty());
    }

    #[test]
    fn print_mode_is_checked_on_the_agent_segment_only() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;cd x && claude -p hi")),
            vec![Transition::PrintRun]
        );
        assert_eq!(
            run(&mut d, &osc("133;C;ls -p; claude --safe-mode")),
            vec![started_cmd("claude", "claude --safe-mode")]
        );
    }

    #[test]
    fn arms_on_dash_suffixed_alias() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;claude-enigma")),
            vec![started_cmd("claude", "claude-enigma")]
        );
    }

    #[test]
    fn does_not_arm_on_other_commands() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;vim src/main.rs")).is_empty());
        assert!(run(&mut d, &osc("133;C;cat claude.txt")).is_empty());
        assert!(run(&mut d, &osc("133;C;claudexyz")).is_empty());
    }

    #[test]
    fn ignores_bell_and_plain_output() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert!(run(&mut d, &[BEL]).is_empty());
        assert!(run(&mut d, b"thinking...\x07more").is_empty());
    }

    #[test]
    fn generic_osc777_and_osc9_attention_only_when_armed() {
        let mut d = AgentDetector::new();
        // OSC 777 when not armed → no output
        assert!(run(&mut d, &osc("777;some-other-payload")).is_empty());
        run(&mut d, &osc("133;C;codex"));
        // OSC 777 when armed → generic attention (Notification with empty message)
        assert_eq!(
            run(&mut d, &osc("777;some-other-payload")),
            vec![notification("")]
        );
        assert_eq!(run(&mut d, &osc("9;needs you")), vec![notification("")]);
        assert!(run(&mut d, &osc("9;4;1;50")).is_empty());
    }

    #[test]
    fn an_agent_drawing_its_own_command_marks_does_not_end_the_session() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;B"));
        assert_eq!(
            run(&mut d, &osc("133;C;omp --resume 'abc'")),
            vec![started_cmd("omp", "omp --resume 'abc'")]
        );
        for mark in ["133;A", "133;B", "133;C", "133;D;0", "133;A"] {
            assert!(run(&mut d, &osc(mark)).is_empty(), "mark {mark}");
        }
        for _ in 0..2 {
            for mark in ["133;B", "133;C", "133;D;0", "133;A"] {
                assert!(run(&mut d, &osc(mark)).is_empty(), "mark {mark}");
            }
        }
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn pi_drawing_marks_without_a_d_does_not_swallow_the_shells_real_exit() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;B"));
        run(&mut d, &osc("133;C;pi"));
        for _ in 0..2 {
            for mark in ["133;A", "133;B", "133;C"] {
                assert!(run(&mut d, &osc(mark)).is_empty(), "mark {mark}");
            }
            run(&mut d, b" Hi there");
        }
        run(&mut d, b"\x1b[?25h\r\nTo resume this session...\r\n");
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn plain_text_between_a_bare_c_and_the_shells_d_is_enough_to_keep_the_exit() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;B"));
        run(&mut d, &osc("133;C;pi"));
        run(&mut d, &osc("133;C"));
        run(&mut d, b"goodbye\r\n");
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn a_d_split_from_its_c_by_another_sequence_is_the_shells() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;B"));
        run(&mut d, &osc("133;C;omp"));
        run(&mut d, &osc("133;C"));
        run(&mut d, b"\x1b[0m");
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn the_agents_own_c_and_d_are_ignored_even_when_a_read_splits_them() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;B"));
        run(&mut d, &osc("133;C;omp"));
        let mut joined = osc("133;B");
        joined.extend(osc("133;C"));
        joined.extend(osc("133;D;0"));
        let (first, second) = joined.split_at(joined.len() - 5);
        assert!(run(&mut d, first).is_empty());
        assert!(run(&mut d, second).is_empty());
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn a_normal_exit_after_the_agents_own_marks_is_still_detected() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;omp"));
        run(&mut d, &osc("133;C"));
        assert!(run(&mut d, &osc("133;D;0")).is_empty());
        run(&mut d, &osc("133;A"));
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
    }

    #[test]
    fn exits_on_133d() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
        assert!(run(&mut d, &osc("133;D;0")).is_empty());
    }

    #[test]
    fn bel_terminator_inside_osc_is_not_attention() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut seq = vec![ESC, OSC_INTRO];
        seq.extend_from_slice(b"0;set title");
        seq.push(BEL);
        assert!(run(&mut d, &seq).is_empty());
    }

    #[test]
    fn started_split_across_chunks() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &[ESC, OSC_INTRO]).is_empty());
        assert!(run(&mut d, b"133;C;cla").is_empty());
        let mut out = run(&mut d, b"ude");
        out.extend(run(&mut d, &[ESC, ST_FINAL]));
        assert_eq!(out, vec![started_cmd("claude", "claude")]);
    }

    #[test]
    fn finish_reports_exited_when_armed() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut out = Vec::new();
        d.finish(|t| out.push(t));
        assert_eq!(out, vec![Transition::Exited]);
        let mut out2 = Vec::new();
        d.finish(|t| out2.push(t));
        assert!(out2.is_empty());
    }

    #[test]
    fn oversized_osc_does_not_panic() {
        let mut d = AgentDetector::new();
        let mut seq = vec![ESC, OSC_INTRO];
        seq.extend(std::iter::repeat_n(b'x', OSC_MAX + 100));
        seq.extend_from_slice(&[ESC, ST_FINAL]);
        assert!(run(&mut d, &seq).is_empty());
        // The detector survives the oversized sequence and still arms normally.
        assert_eq!(
            run(&mut d, &osc("133;C;claude")),
            vec![started_cmd("claude", "claude")]
        );
    }

    #[test]
    fn emits_shell_ready_on_first_prompt_b() {
        let mut d = AgentDetector::new();
        assert_eq!(run(&mut d, &osc("133;B")), vec![Transition::ShellReady]);
    }

    #[test]
    fn shell_ready_emits_only_once() {
        let mut d = AgentDetector::new();
        assert_eq!(run(&mut d, &osc("133;B")), vec![Transition::ShellReady]);
        assert!(run(&mut d, &osc("133;B")).is_empty());
    }

    #[test]
    fn shell_ready_does_not_require_an_armed_agent() {
        let mut d = AgentDetector::new();
        // No 133;C ever seen (no agent running) - still signals shell readiness.
        assert_eq!(run(&mut d, &osc("133;B")), vec![Transition::ShellReady]);
    }

}
