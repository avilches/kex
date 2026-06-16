const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const OSC_INTRO: u8 = b']';
const ST_FINAL: u8 = b'\\';

const OSC_MAX: usize = 2048;

const DEFAULT_AGENTS: &[&str] = &["claude", "codex"];

// OSC 777 marker our Claude Code hooks emit via `terminalSequence`.
const KEX_MARKER: &[u8] = b"notify;Kex;";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum State {
    Ground,
    Esc,
    Osc,
    OscEsc,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Status {
    // Armed but no prompt submitted yet (initial state after arm or disarm).
    Idle,
    Working,
    Waiting,
}

// OSC 777;kex-session;<panel_id>;<agent>;<session_id>;<transcript_path>;<cwd>
// All five fields are percent-encoded (jq @uri) so they're safe to delimit with ';'.
const KEX_SESSION_MARKER: &[u8] = b"kex-session;";

fn percent_decode(s: &[u8]) -> String {
    let mut out = Vec::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if s[i] == b'%' && i + 2 < s.len() {
            let hi = (s[i + 1] as char).to_digit(16);
            let lo = (s[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(s[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Transition {
    Started { agent: String },
    UserPromptSubmit,
    Notification,
    Stop,
    Exited,
    SessionStart { panel_id: String, agent: String, session_id: String, transcript_path: String, cwd: String },
}

#[derive(Clone, serde::Serialize)]
pub struct AgentSignal {
    pub id: u32,
    pub kind: &'static str,
    pub agent: Option<String>,
}

impl Transition {
    pub fn into_signal(self, id: u32) -> AgentSignal {
        match self {
            Transition::Started { agent } => {
                AgentSignal { id, kind: "started", agent: Some(agent) }
            }
            Transition::UserPromptSubmit => AgentSignal { id, kind: "UserPromptSubmit", agent: None },
            Transition::Notification => AgentSignal { id, kind: "Notification", agent: None },
            Transition::Stop => AgentSignal { id, kind: "Stop", agent: None },
            Transition::Exited => AgentSignal { id, kind: "exited", agent: None },
            Transition::SessionStart { .. } => unreachable!("SessionStart is handled before into_signal"),
        }
    }
}

pub struct AgentDetector {
    agents: Vec<String>,
    state: State,
    osc: Vec<u8>,
    armed: bool,
    status: Status,
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
            status: Status::Idle,
        }
    }

    /// Feed a chunk of raw PTY output. Transitions come only from OSC sequences
    /// (`133` prompt boundaries, our `777` hook marker), never from raw output,
    /// so a TUI agent that repaints continuously never flaps working/waiting.
    pub fn process<F: FnMut(Transition)>(&mut self, input: &[u8], mut emit: F) {
        if self.state == State::Ground && !input.contains(&ESC) {
            return;
        }

        for &b in input {
            match self.state {
                State::Ground => {
                    if b == ESC {
                        self.state = State::Esc;
                    }
                }
                State::Esc => match b {
                    OSC_INTRO => {
                        self.state = State::Osc;
                        self.osc.clear();
                    }
                    ESC => {}
                    _ => self.state = State::Ground,
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
    }

    fn disarm(&mut self) {
        self.armed = false;
        self.status = Status::Idle;
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
        match ps {
            b"133" => self.handle_osc133(pt, emit),
            // OSC 9;4 is taskbar progress, not a notification.
            b"9" if !pt.starts_with(b"4;") && pt != b"4" => self.generic_attention(emit),
            b"777" => self.handle_osc777(pt, emit),
            _ => {}
        }
    }

    fn handle_osc777<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        if let Some(event) = pt.strip_prefix(KEX_MARKER) {
            log::debug!("[osc777] hook event: {}", String::from_utf8_lossy(event));
            // Self-arms so notifications work even when no shell preexec fired
            // (bash, Windows, tmux, wrappers).
            match event {
                b"UserPromptSubmit" => {
                    self.ensure_armed(emit);
                    self.set_working(emit);
                }
                b"Notification" => {
                    self.ensure_armed(emit);
                    self.status = Status::Waiting;
                    emit(Transition::Notification);
                }
                b"Stop" => {
                    self.ensure_armed(emit);
                    self.status = Status::Waiting;
                    emit(Transition::Stop);
                    // Stay armed — Claude is still running. Reset to Idle so
                    // the next UserPromptSubmit triggers a new Working transition.
                    self.status = Status::Idle;
                }
                _ => {
                    log::debug!("[osc777] unknown hook event, ignored");
                }
            }
            return;
        }
        if let Some(data) = pt.strip_prefix(KEX_SESSION_MARKER) {
            self.handle_kex_session(data, emit);
            return;
        }
        log::debug!("[osc777] generic attention: {}", String::from_utf8_lossy(pt));
        self.generic_attention(emit);
    }

    fn handle_kex_session<F: FnMut(Transition)>(&mut self, data: &[u8], emit: &mut F) {
        // Format: <panel_id>;<agent>;<session_id>;<transcript_path>;<cwd>
        // All fields are percent-encoded.
        let parts: Vec<&[u8]> = data.splitn(5, |&b| b == b';').collect();
        if parts.len() != 5 {
            log::debug!("[osc777] SessionStart hook: malformed payload ({} parts)", parts.len());
            return;
        }
        let panel_id = percent_decode(parts[0]);
        let agent = percent_decode(parts[1]);
        let session_id = percent_decode(parts[2]);
        let transcript_path = percent_decode(parts[3]);
        let cwd = percent_decode(parts[4]);
        if panel_id.is_empty() || session_id.is_empty() {
            log::debug!("[osc777] SessionStart hook: missing panel_id or session_id");
            return;
        }
        log::debug!("[osc777] SessionStart hook: panel={panel_id} agent={agent} session={session_id} cwd={cwd}");
        emit(Transition::SessionStart { panel_id, agent, session_id, transcript_path, cwd });
    }

    fn handle_osc133<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        match pt.first() {
            Some(b'C') => {
                let cmd = pt.strip_prefix(b"C;").unwrap_or(b"");
                if let Some(agent) = self.match_agent(cmd) {
                    log::debug!("[shell] osc133 C: armed agent={agent} cmd={}", String::from_utf8_lossy(cmd));
                    self.armed = true;
                    self.status = Status::Idle;
                    emit(Transition::Started { agent });
                }
            }
            Some(b'D') if self.armed => {
                log::debug!("[shell] osc133 D: exited");
                self.disarm();
                emit(Transition::Exited);
            }
            _ => {}
        }
    }

    fn ensure_armed<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        if !self.armed {
            log::debug!("[osc777] auto-arming (no shell OSC 133;C seen)");
            self.armed = true;
            self.status = Status::Idle;
            emit(Transition::Started { agent: "claude".into() });
        }
    }

    fn set_working<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        // Always emit — the frontend store handles idempotency. Not emitting would
        // desync Rust and JS state (e.g. after user presses ESC to clear the spinner,
        // the next UserPromptSubmit must always re-create the session).
        self.status = Status::Working;
        emit(Transition::UserPromptSubmit);
    }

    fn generic_attention<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        if self.armed {
            self.status = Status::Waiting;
            emit(Transition::Notification);
        }
    }

    fn match_agent(&self, cmd: &[u8]) -> Option<String> {
        let cmd = std::str::from_utf8(cmd).ok()?;
        for token in cmd.split_whitespace() {
            if token.starts_with('-') {
                continue;
            }
            let base = token.rsplit(['/', '\\']).next().unwrap_or(token);
            if let Some(agent) = self.agents.iter().find(|a| {
                base.strip_prefix(a.as_str())
                    .is_some_and(|rest| rest.is_empty() || rest.starts_with('-'))
            }) {
                return Some(agent.clone());
            }
        }
        None
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

    fn started(agent: &str) -> Transition {
        Transition::Started { agent: agent.into() }
    }

    #[test]
    fn arms_on_agent_command() {
        let mut d = AgentDetector::new();
        assert_eq!(run(&mut d, &osc("133;C;claude -p hello")), vec![started("claude")]);
    }

    #[test]
    fn arms_on_pathed_and_wrapped_command() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("133;C;/usr/local/bin/codex exec")),
            vec![started("codex")]
        );
        let mut d2 = AgentDetector::new();
        assert_eq!(run(&mut d2, &osc("133;C;npx claude")), vec![started("claude")]);
    }

    #[test]
    fn arms_on_dash_suffixed_alias() {
        let mut d = AgentDetector::new();
        assert_eq!(run(&mut d, &osc("133;C;claude-enigma")), vec![started("claude")]);
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
    fn kex_marker_drives_status() {
        let mut d = AgentDetector::new();
        // Arm via shell OSC 133;C → status=Idle
        run(&mut d, &osc("133;C;claude"));
        // Notification while Idle → Waiting
        assert_eq!(run(&mut d, &osc("777;notify;Kex;Notification")), vec![Transition::Notification]);
        // UserPromptSubmit while Waiting → Working
        assert_eq!(run(&mut d, &osc("777;notify;Kex;UserPromptSubmit")), vec![Transition::UserPromptSubmit]);
        // Duplicate UserPromptSubmit — always emits so JS can re-create session after ESC/CTRL+C
        assert_eq!(run(&mut d, &osc("777;notify;Kex;UserPromptSubmit")), vec![Transition::UserPromptSubmit]);
        assert_eq!(run(&mut d, &osc("777;notify;Kex;Stop")), vec![Transition::Stop]);
    }

    #[test]
    fn kex_marker_auto_arms_without_preexec() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc("777;notify;Kex;Notification")),
            vec![started("claude"), Transition::Notification]
        );
    }

    #[test]
    fn generic_osc777_and_osc9_attention_only_when_armed() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("777;notify;Other;ready")).is_empty());
        run(&mut d, &osc("133;C;codex"));
        assert_eq!(run(&mut d, &osc("777;notify;Codex;ready")), vec![Transition::Notification]);
        assert_eq!(run(&mut d, &osc("9;needs you")), vec![Transition::Notification]);
        assert!(run(&mut d, &osc("9;4;1;50")).is_empty());
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
        assert_eq!(out, vec![started("claude")]);
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
    fn stays_armed_after_stop_ready_for_next_prompt() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert_eq!(run(&mut d, &osc("777;notify;Kex;Stop")), vec![Transition::Stop]);
        // Stop leaves detector armed (Claude still running) — next prompt needs no auto-arm.
        assert_eq!(run(&mut d, &osc("777;notify;Kex;UserPromptSubmit")), vec![Transition::UserPromptSubmit]);
        // Explicit shell exit (133;D) disarms.
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
        // Now disarmed: next UserPromptSubmit auto-arms.
        assert_eq!(
            run(&mut d, &osc("777;notify;Kex;UserPromptSubmit")),
            vec![started("claude"), Transition::UserPromptSubmit],
        );
    }

    #[test]
    fn rearmed_on_new_invocation_after_stop() {
        // After Stop (still armed), if the user exits and reruns claude, 133;C re-arms.
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        run(&mut d, &osc("777;notify;Kex;Stop"));
        // New invocation: 133;C fires again (no guard; Claude restarted in same terminal).
        assert_eq!(run(&mut d, &osc("133;C;claude")), vec![started("claude")]);
    }

    #[test]
    fn oversized_osc_does_not_panic() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut seq = vec![ESC, OSC_INTRO];
        seq.extend(std::iter::repeat_n(b'x', OSC_MAX + 100));
        seq.extend_from_slice(&[ESC, ST_FINAL]);
        assert!(run(&mut d, &seq).is_empty());
        assert_eq!(run(&mut d, &osc("777;notify;Kex;Notification")), vec![Transition::Notification]);
    }
}
