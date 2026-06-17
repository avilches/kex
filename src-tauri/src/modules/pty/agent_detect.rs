const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const OSC_INTRO: u8 = b']';
const ST_FINAL: u8 = b'\\';

const OSC_MAX: usize = 4096;

const DEFAULT_AGENTS: &[&str] = &["claude", "codex"];

// OSC 777;kex;<event>;<panel_id>;<session_id>;<transcript_path>;<cwd>[;<extra...>]
const KEX_UNIFIED_MARKER: &[u8] = b"kex;";

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
    Started { agent: String, cmd_string: String },
    // Llevan session data - Rust los usa para record_session + emit meta
    SessionStart {
        panel_id: String,
        agent: String,
        session_id: String,
        transcript_path: String,
        cwd: String,
        source: String,
        session_title: String,
        model: String,
    },
    UserPromptSubmit {
        panel_id: String,
        agent: String,
        session_id: String,
        transcript_path: String,
        cwd: String,
        prompt: String,
    },
    // Estado del agente
    Notification { message: String },
    Stop { last_message: String },
    StopFailure { error_message: String },
    SessionEnd { reason: String },
    PermissionRequest { tool_name: String },
    MessageDisplay { turn_id: String, message: String },
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
            Transition::Started { agent, .. } =>
                AgentSignal { id, kind: "started", agent: Some(agent), message: None, tool_name: None, prompt: None },
            Transition::UserPromptSubmit { agent, prompt, .. } =>
                AgentSignal { id, kind: "UserPromptSubmit", agent: Some(agent), message: None, tool_name: None, prompt: Some(prompt) },
            Transition::Notification { message } =>
                AgentSignal { id, kind: "Notification", agent: None, message: Some(message), tool_name: None, prompt: None },
            Transition::Stop { last_message } =>
                AgentSignal { id, kind: "Stop", agent: None, message: Some(last_message), tool_name: None, prompt: None },
            Transition::StopFailure { error_message } =>
                AgentSignal { id, kind: "StopFailure", agent: None, message: Some(error_message), tool_name: None, prompt: None },
            Transition::SessionEnd { .. } =>
                AgentSignal { id, kind: "SessionEnd", agent: None, message: None, tool_name: None, prompt: None },
            Transition::PermissionRequest { tool_name } =>
                AgentSignal { id, kind: "PermissionRequest", agent: None, message: None, tool_name: Some(tool_name), prompt: None },
            Transition::MessageDisplay { message, .. } =>
                AgentSignal { id, kind: "MessageDisplay", agent: None, message: Some(message), tool_name: None, prompt: None },
            Transition::Exited =>
                AgentSignal { id, kind: "exited", agent: None, message: None, tool_name: None, prompt: None },
            Transition::SessionStart { .. } =>
                unreachable!("SessionStart is handled before into_signal"),
        }
    }
}

fn is_print_mode(cmd: &[u8]) -> bool {
    let s = match std::str::from_utf8(cmd) {
        Ok(s) => s,
        Err(_) => return false,
    };
    s.split_whitespace()
        .skip(1) // skip binary name
        .any(|t| t == "-p" || t == "--print")
}

pub struct AgentDetector {
    agents: Vec<String>,
    state: State,
    osc: Vec<u8>,
    armed: bool,
    status: Status,
    current_agent: String,
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
            current_agent: String::new(),
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
        if let Some(data) = pt.strip_prefix(KEX_UNIFIED_MARKER) {
            self.handle_kex_unified(data, emit);
            return;
        }
        // OSC 9;4 is taskbar progress, ignore
        if pt.starts_with(b"4;") || pt == b"4" {
            return;
        }
        // Generic attention (Claude Code without hooks, OSC 9 or other OSC 777)
        self.generic_attention(emit);
    }

    fn handle_kex_unified<F: FnMut(Transition)>(&mut self, data: &[u8], emit: &mut F) {
        let fields: Vec<String> = data
            .split(|&b| b == b';')
            .map(|f| percent_decode(f))
            .collect();

        if fields.len() < 5 {
            log::debug!("[osc777] kex: malformed payload ({} fields)", fields.len());
            return;
        }

        let event = &fields[0];
        let panel_id = &fields[1];
        let session_id = &fields[2];
        let transcript_path = &fields[3];
        let cwd = &fields[4];

        // Auto-arm only for events that imply the agent is active, not for
        // termination events (StopFailure/SessionEnd) - those disarm immediately
        // and auto-arming before disarming would emit a spurious Started.
        match event.as_str() {
            "SessionStart" | "UserPromptSubmit" | "Notification" | "Stop"
            | "PermissionRequest" | "MessageDisplay" => {
                self.ensure_armed(emit);
            }
            _ => {}
        }

        match event.as_str() {
            "SessionStart" => {
                if panel_id.is_empty() || session_id.is_empty() {
                    log::debug!("[osc777] kex: SessionStart missing panel_id or session_id");
                    return;
                }
                let source = fields.get(5).cloned().unwrap_or_default();
                let session_title = fields.get(6).cloned().unwrap_or_default();
                let model = fields.get(7).cloned().unwrap_or_default();
                log::debug!(
                    "[osc777] kex: SessionStart panel={panel_id} session={session_id} \
                     cwd={cwd} source={source} title={session_title:?} model={model:?}"
                );
                emit(Transition::SessionStart {
                    panel_id: panel_id.clone(),
                    agent: self.current_agent.clone(),
                    session_id: session_id.clone(),
                    transcript_path: transcript_path.clone(),
                    cwd: cwd.clone(),
                    source,
                    session_title,
                    model,
                });
            }
            "UserPromptSubmit" => {
                let prompt = fields.get(5).cloned().unwrap_or_default();
                log::debug!(
                    "[osc777] kex: UserPromptSubmit panel={panel_id} session={session_id} \
                     cwd={cwd} prompt={prompt:?}"
                );
                self.status = Status::Working;
                emit(Transition::UserPromptSubmit {
                    panel_id: panel_id.clone(),
                    agent: self.current_agent.clone(),
                    session_id: session_id.clone(),
                    transcript_path: transcript_path.clone(),
                    cwd: cwd.clone(),
                    prompt,
                });
            }
            "Notification" => {
                let notif_type = fields.get(5).cloned().unwrap_or_default();
                let message = fields.get(6).cloned().unwrap_or_default();
                log::debug!(
                    "[osc777] kex: Notification panel={panel_id} type={notif_type} msg={message:?}"
                );
                self.status = Status::Waiting;
                emit(Transition::Notification { message });
            }
            "Stop" => {
                let reason = fields.get(5).cloned().unwrap_or_default();
                let last_message = fields.get(6).cloned().unwrap_or_default();
                log::debug!(
                    "[osc777] kex: Stop panel={panel_id} reason={reason} \
                     last_msg={last_message:?}"
                );
                emit(Transition::Stop { last_message });
                self.status = Status::Idle;
            }
            "StopFailure" => {
                let error_type = fields.get(5).cloned().unwrap_or_default();
                let error_message = fields.get(6).cloned().unwrap_or_default();
                log::debug!(
                    "[osc777] kex: StopFailure panel={panel_id} type={error_type} msg={error_message:?}"
                );
                self.disarm();
                emit(Transition::StopFailure { error_message });
            }
            "SessionEnd" => {
                let reason = fields.get(5).cloned().unwrap_or_default();
                log::debug!("[osc777] kex: SessionEnd panel={panel_id} reason={reason}");
                self.disarm();
                emit(Transition::SessionEnd { reason });
            }
            "PermissionRequest" => {
                let tool_name = fields.get(5).cloned().unwrap_or_default();
                log::debug!("[osc777] kex: PermissionRequest panel={panel_id} tool={tool_name}");
                self.status = Status::Waiting;
                emit(Transition::PermissionRequest { tool_name });
            }
            "MessageDisplay" => {
                let turn_id = fields.get(5).cloned().unwrap_or_default();
                let message = fields.get(6).cloned().unwrap_or_default();
                log::debug!(
                    "[osc777] kex: MessageDisplay panel={panel_id} turn={turn_id} \
                     msg={message:?}"
                );
                emit(Transition::MessageDisplay { turn_id, message });
            }
            _ => {
                log::debug!("[osc777] kex: unknown event: {event}");
            }
        }
    }

    fn handle_osc133<F: FnMut(Transition)>(&mut self, pt: &[u8], emit: &mut F) {
        match pt.first() {
            Some(b'C') => {
                let cmd = pt.strip_prefix(b"C;").unwrap_or(b"");
                if is_print_mode(cmd) {
                    log::debug!("[shell] osc133 C: skip arm (print mode) cmd={}", String::from_utf8_lossy(cmd));
                    return;
                }
                if let Some(agent) = self.match_agent(cmd) {
                    let cmd_string = String::from_utf8_lossy(cmd).into_owned();
                    log::debug!("[shell] osc133 C: armed agent={agent} cmd={cmd_string}");
                    self.armed = true;
                    self.status = Status::Idle;
                    self.current_agent = agent.clone();
                    emit(Transition::Started { agent, cmd_string });
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
            self.current_agent = "claude".into();
            emit(Transition::Started { agent: "claude".into(), cmd_string: String::new() });
        }
    }

    fn generic_attention<F: FnMut(Transition)>(&mut self, emit: &mut F) {
        if self.armed {
            self.status = Status::Waiting;
            emit(Transition::Notification { message: String::new() });
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

    // Auto-arm case (no prior OSC 133;C): cmd_string is empty.
    fn started(agent: &str) -> Transition {
        Transition::Started { agent: agent.into(), cmd_string: String::new() }
    }

    fn started_cmd(agent: &str, cmd: &str) -> Transition {
        Transition::Started { agent: agent.into(), cmd_string: cmd.into() }
    }

    // Helper: build a kex unified OSC body with the required 5 fields
    fn kex_osc(event: &str) -> String {
        format!("777;kex;{event};panel1;sess1;%2Ftmp%2Ftranscript;%2Fhome%2Fuser")
    }

    // Helper: notification kex OSC with optional message (field[5]=type, field[6]=message)
    fn kex_notification_osc(msg: &str) -> String {
        format!("777;kex;Notification;panel1;sess1;%2Ftmp%2Ftranscript;%2Fhome%2Fuser;notice;{msg}")
    }

    fn notification(msg: &str) -> Transition {
        Transition::Notification { message: msg.into() }
    }

    fn user_prompt_submit() -> Transition {
        Transition::UserPromptSubmit {
            panel_id: "panel1".into(),
            agent: "claude".into(),
            session_id: "sess1".into(),
            transcript_path: "/tmp/transcript".into(),
            cwd: "/home/user".into(),
            prompt: "".into(),
        }
    }

    #[test]
    fn arms_on_agent_command() {
        let mut d = AgentDetector::new();
        assert_eq!(run(&mut d, &osc("133;C;claude")), vec![started_cmd("claude", "claude")]);
        let mut d2 = AgentDetector::new();
        assert_eq!(
            run(&mut d2, &osc("133;C;claude --model opus")),
            vec![started_cmd("claude", "claude --model opus")],
        );
    }

    #[test]
    fn does_not_arm_in_print_mode() {
        let mut d = AgentDetector::new();
        assert!(run(&mut d, &osc("133;C;claude -p hello")).is_empty());
        assert!(run(&mut d, &osc("133;C;claude --print")).is_empty());
        assert!(run(&mut d, &osc("133;C;claude --model opus -p")).is_empty());
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
    fn kex_marker_drives_status() {
        let mut d = AgentDetector::new();
        // Arm via shell OSC 133;C → status=Idle
        run(&mut d, &osc("133;C;claude"));
        // Notification while Idle → Waiting
        assert_eq!(
            run(&mut d, &osc(&kex_notification_osc("hello"))),
            vec![notification("hello")]
        );
        // UserPromptSubmit while Waiting → Working
        assert_eq!(run(&mut d, &osc(&kex_osc("UserPromptSubmit"))), vec![user_prompt_submit()]);
        // Duplicate UserPromptSubmit - always emits so JS can re-create session after ESC/CTRL+C
        assert_eq!(run(&mut d, &osc(&kex_osc("UserPromptSubmit"))), vec![user_prompt_submit()]);
        assert_eq!(run(&mut d, &osc(&kex_osc("Stop"))), vec![Transition::Stop { last_message: "".into() }]);
    }

    #[test]
    fn kex_marker_auto_arms_without_preexec() {
        let mut d = AgentDetector::new();
        assert_eq!(
            run(&mut d, &osc(&kex_notification_osc("msg"))),
            vec![started("claude"), notification("msg")]
        );
    }

    #[test]
    fn generic_osc777_and_osc9_attention_only_when_armed() {
        let mut d = AgentDetector::new();
        // Non-kex OSC 777 when not armed → no output
        assert!(run(&mut d, &osc("777;some-other-payload")).is_empty());
        run(&mut d, &osc("133;C;codex"));
        // Non-kex OSC 777 when armed → generic attention (Notification with empty message)
        assert_eq!(run(&mut d, &osc("777;some-other-payload")), vec![notification("")]);
        assert_eq!(run(&mut d, &osc("9;needs you")), vec![notification("")]);
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
    fn stays_armed_after_stop_ready_for_next_prompt() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        assert_eq!(run(&mut d, &osc(&kex_osc("Stop"))), vec![Transition::Stop { last_message: "".into() }]);
        // Stop leaves detector armed (Claude still running) - next prompt needs no auto-arm.
        assert_eq!(run(&mut d, &osc(&kex_osc("UserPromptSubmit"))), vec![user_prompt_submit()]);
        // Explicit shell exit (133;D) disarms.
        assert_eq!(run(&mut d, &osc("133;D;0")), vec![Transition::Exited]);
        // Now disarmed: next UserPromptSubmit auto-arms.
        assert_eq!(
            run(&mut d, &osc(&kex_osc("UserPromptSubmit"))),
            vec![started("claude"), user_prompt_submit()],
        );
    }

    #[test]
    fn rearmed_on_new_invocation_after_stop() {
        // After Stop (still armed), if the user exits and reruns claude, 133;C re-arms.
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        run(&mut d, &osc(&kex_osc("Stop")));
        // New invocation: 133;C fires again (no guard; Claude restarted in same terminal).
        assert_eq!(run(&mut d, &osc("133;C;claude")), vec![started_cmd("claude", "claude")]);
    }

    #[test]
    fn oversized_osc_does_not_panic() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let mut seq = vec![ESC, OSC_INTRO];
        seq.extend(std::iter::repeat_n(b'x', OSC_MAX + 100));
        seq.extend_from_slice(&[ESC, ST_FINAL]);
        assert!(run(&mut d, &seq).is_empty());
        assert_eq!(
            run(&mut d, &osc(&kex_notification_osc(""))),
            vec![notification("")]
        );
    }

    #[test]
    fn session_start_emits_transition() {
        let mut d = AgentDetector::new();
        let transitions = run(
            &mut d,
            &osc("777;kex;SessionStart;panel1;sess1;%2Ftmp%2Ftranscript;%2Fhome%2Fuser"),
        );
        assert_eq!(transitions.len(), 2);
        assert_eq!(transitions[0], started("claude"));
        assert_eq!(
            transitions[1],
            Transition::SessionStart {
                panel_id: "panel1".into(),
                agent: "claude".into(),
                session_id: "sess1".into(),
                transcript_path: "/tmp/transcript".into(),
                cwd: "/home/user".into(),
                source: "".into(),
                session_title: "".into(),
                model: "".into(),
            }
        );
    }

    #[test]
    fn kex_malformed_payload_ignored() {
        let mut d = AgentDetector::new();
        // Only 3 fields - must be ignored
        assert!(run(&mut d, &osc("777;kex;SessionStart;panel1;sess1")).is_empty());
    }

    #[test]
    fn stop_failure_and_session_end_disarm() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        // fields: [0]=StopFailure [1]=panel1 [2]=sess1 [3]=transcript [4]=cwd [5]=type [6]=error_message
        let stop_fail = run(
            &mut d,
            &osc("777;kex;StopFailure;panel1;sess1;%2Ftmp%2Ftranscript;%2Fhome%2Fuser;failure_type;something%20bad"),
        );
        assert_eq!(
            stop_fail,
            vec![Transition::StopFailure { error_message: "something bad".into() }]
        );
        // Should be disarmed now - 133;D should produce no Exited
        assert!(run(&mut d, &osc("133;D;0")).is_empty());

        // Re-arm and test SessionEnd
        run(&mut d, &osc("133;C;claude"));
        let end = run(
            &mut d,
            &osc("777;kex;SessionEnd;panel1;sess1;%2Ftmp%2Ftranscript;%2Fhome%2Fuser"),
        );
        assert_eq!(end, vec![Transition::SessionEnd { reason: "".into() }]);
        assert!(run(&mut d, &osc("133;D;0")).is_empty());
    }

    #[test]
    fn permission_request_emits_tool_name() {
        let mut d = AgentDetector::new();
        run(&mut d, &osc("133;C;claude"));
        let transitions = run(
            &mut d,
            &osc("777;kex;PermissionRequest;panel1;sess1;%2Ftmp%2Ftranscript;%2Fhome%2Fuser;Bash"),
        );
        assert_eq!(
            transitions,
            vec![Transition::PermissionRequest { tool_name: "Bash".into() }]
        );
    }
}
