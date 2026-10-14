//! Finds the command that launched an agent inside a shell line.
//!
//! The line reaches us from OSC 133;C exactly as typed (aliases unexpanded, control chars
//! flattened to spaces, cut at 256 chars), so it can be `cd dir && claude-max --resume x`,
//! `(cd dir; FOO=1 claude)` or `cd ~/claude-docs`. The launcher name and its prefix of
//! assignments and wrappers are what has to be repeated on restore; everything before the
//! agent segment (`cd`, the grouping, the other commands) must not be.
//!
//! Unterminated quotes (a truncated line) are tolerated: the rest of the line is one token.
//! `$(...)`, `<(...)` and backticks are opaque inside a token and never analysed.

const WRAPPERS: &[&str] = &[
    "exec", "command", "builtin", "env", "time", "nohup", "nice", "sudo", "noglob", "npx", "bunx",
    "pnpx",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub agent: String,
    /// Raw tokens up to and including the command word: assignments, wrappers and launcher.
    pub head: Vec<String>,
    /// Raw tokens after the command word.
    pub args: Vec<String>,
}

impl Invocation {
    pub fn command(&self) -> String {
        self.head.iter().chain(self.args.iter()).map(String::as_str).collect::<Vec<_>>().join(" ")
    }
}

/// The last segment of `line` whose command word is one of `agents`.
pub fn find_agent_invocation(line: &str, agents: &[String]) -> Option<Invocation> {
    let mut found = None;
    for segment in split_segments(line) {
        if let Some(inv) = match_segment(segment, agents) {
            found = Some(inv);
        }
    }
    found
}

pub fn is_print_mode(line: &str, agent: &str) -> bool {
    find_agent_invocation(line, &[agent.to_string()])
        .is_some_and(|inv| inv.args.iter().any(|t| t == "-p" || t == "--print"))
}

fn match_segment(tokens: Vec<String>, agents: &[String]) -> Option<Invocation> {
    let mut i = 0;
    while i < tokens.len() {
        let tok = tokens[i].as_str();
        if tok == "{" || is_assignment(tok) {
            i += 1;
            continue;
        }
        let word = base_name(tok);
        if WRAPPERS.contains(&word) {
            i += 1;
            while i < tokens.len() && tokens[i].starts_with('-') {
                i += 1;
            }
            continue;
        }
        let agent = agents.iter().find(|a| {
            word.strip_prefix(a.as_str()).is_some_and(|rest| rest.is_empty() || rest.starts_with('-'))
        })?;
        let start = tokens.iter().position(|t| t != "{").unwrap_or(0);
        return Some(Invocation {
            agent: agent.clone(),
            head: tokens[start..=i].to_vec(),
            args: tokens[i + 1..].to_vec(),
        });
    }
    None
}

fn is_assignment(tok: &str) -> bool {
    let Some(eq) = tok.find('=') else { return false };
    let name = tok[..eq].strip_suffix('+').unwrap_or(&tok[..eq]);
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn base_name(tok: &str) -> &str {
    let unquoted = tok
        .strip_prefix('"').and_then(|t| t.strip_suffix('"'))
        .or_else(|| tok.strip_prefix('\'').and_then(|t| t.strip_suffix('\'')))
        .unwrap_or(tok);
    unquoted.rsplit(['/', '\\']).next().unwrap_or(unquoted)
}

#[derive(Default)]
struct Splitter {
    segments: Vec<Vec<String>>,
    tokens: Vec<String>,
    tok: String,
    in_token: bool,
}

impl Splitter {
    fn push(&mut self, c: char) {
        self.tok.push(c);
        self.in_token = true;
    }

    fn end_token(&mut self) {
        if self.in_token {
            self.tokens.push(std::mem::take(&mut self.tok));
            self.in_token = false;
        }
    }

    fn end_segment(&mut self) {
        self.end_token();
        if !self.tokens.is_empty() {
            self.segments.push(std::mem::take(&mut self.tokens));
        }
    }
}

/// Splits on `&&`, `||`, `;`, `|`, `&`, newlines and parentheses outside quotes. Redirections
/// that contain `&` (`2>&1`, `&>`) stay inside their token.
fn split_segments(line: &str) -> Vec<Vec<String>> {
    let chars: Vec<char> = line.chars().collect();
    let mut sp = Splitter::default();
    let (mut single, mut double, mut backtick) = (false, false, false);
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if single {
            sp.push(c);
            single = c != '\'';
        } else if c == '\\' && !backtick {
            sp.push(c);
            if let Some(&next) = chars.get(i + 1) {
                sp.push(next);
                i += 1;
            }
        } else if double {
            sp.push(c);
            double = c != '"';
        } else if backtick {
            sp.push(c);
            backtick = c != '`';
        } else {
            match c {
                '\'' => { single = true; sp.push(c); }
                '"' => { double = true; sp.push(c); }
                '`' => { backtick = true; sp.push(c); }
                '$' | '<' if chars.get(i + 1) == Some(&'(') => {
                    let mut depth = 0;
                    while i < chars.len() {
                        sp.push(chars[i]);
                        match chars[i] {
                            '(' => depth += 1,
                            ')' => {
                                depth -= 1;
                                if depth == 0 {
                                    break;
                                }
                            }
                            _ => {}
                        }
                        i += 1;
                    }
                }
                '\n' | '\r' => sp.end_segment(),
                c if c.is_whitespace() => sp.end_token(),
                ';' | '|' | '(' | ')' => sp.end_segment(),
                '&' => {
                    let after_redirect = sp.in_token && matches!(sp.tok.chars().last(), Some('>' | '<'));
                    if after_redirect || chars.get(i + 1) == Some(&'>') {
                        sp.push(c);
                    } else {
                        sp.end_segment();
                    }
                }
                _ => sp.push(c),
            }
        }
        i += 1;
    }
    sp.end_segment();
    sp.segments
}

#[cfg(test)]
mod tests {
    use super::*;

    fn agents() -> Vec<String> {
        vec!["claude".into(), "codex".into()]
    }

    fn cmd(line: &str) -> Option<String> {
        find_agent_invocation(line, &agents()).map(|i| i.command())
    }

    #[test]
    fn plain_command_is_kept_whole() {
        assert_eq!(cmd("claude --resume 'abc'").as_deref(), Some("claude --resume 'abc'"));
    }

    #[test]
    fn retry_line_drops_the_cd() {
        let line = " cd '/Users/x/Library/Application Support/Taxes' && claude-max --resume 'abc-1'";
        assert_eq!(cmd(line).as_deref(), Some("claude-max --resume 'abc-1'"));
    }

    #[test]
    fn launcher_alias_and_absolute_path_are_kept() {
        assert_eq!(cmd("claude-max").as_deref(), Some("claude-max"));
        assert_eq!(cmd("/opt/homebrew/bin/claude --x").as_deref(), Some("/opt/homebrew/bin/claude --x"));
        assert_eq!(cmd("\\claude --x").as_deref(), Some("\\claude --x"));
        assert_eq!(cmd("'C:\\bin\\claude' --x").as_deref(), Some("'C:\\bin\\claude' --x"));
    }

    #[test]
    fn grouping_is_dropped() {
        assert_eq!(cmd("(cd /tmp && claude --x)").as_deref(), Some("claude --x"));
        assert_eq!(cmd("{ cd /tmp; claude --x; }").as_deref(), Some("claude --x"));
        assert_eq!(cmd("{ claude --x ; }").as_deref(), Some("claude --x"));
        assert_eq!(cmd("cd /tmp; claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("false || claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("claude --x &").as_deref(), Some("claude --x"));
    }

    #[test]
    fn pipes_and_trailing_commands_are_dropped() {
        assert_eq!(cmd("claude --x | tee out").as_deref(), Some("claude --x"));
        assert_eq!(cmd("claude --x; echo done").as_deref(), Some("claude --x"));
    }

    #[test]
    fn assignments_and_wrappers_are_kept() {
        assert_eq!(cmd("FOO=1 BAR=2 claude --x").as_deref(), Some("FOO=1 BAR=2 claude --x"));
        assert_eq!(cmd("env FOO=1 claude --x").as_deref(), Some("env FOO=1 claude --x"));
        assert_eq!(cmd("time -p claude --x").as_deref(), Some("time -p claude --x"));
        assert_eq!(cmd("command claude --x").as_deref(), Some("command claude --x"));
        assert_eq!(cmd("npx claude").as_deref(), Some("npx claude"));
        assert_eq!(cmd("cd d && FOO=1 nohup claude").as_deref(), Some("FOO=1 nohup claude"));
    }

    #[test]
    fn operators_inside_quotes_do_not_split() {
        let line = "claude --append-system-prompt 'a && b; c' --x";
        assert_eq!(cmd(line).as_deref(), Some(line));
        let line = "claude --append-system-prompt \"a || b\" --x";
        assert_eq!(cmd(line).as_deref(), Some(line));
        assert_eq!(cmd("cd 'a && claude'").as_deref(), None);
    }

    #[test]
    fn redirections_with_ampersand_stay_in_the_token() {
        assert_eq!(cmd("claude --x 2>&1").as_deref(), Some("claude --x 2>&1"));
        assert_eq!(cmd("claude --x &> /tmp/o").as_deref(), Some("claude --x &> /tmp/o"));
    }

    #[test]
    fn substitutions_are_opaque() {
        assert_eq!(
            cmd("claude --append-system-prompt \"$(cat a; echo b)\" --x").as_deref(),
            Some("claude --append-system-prompt \"$(cat a; echo b)\" --x")
        );
        assert_eq!(cmd("claude --x $(echo a && echo b)").as_deref(), Some("claude --x $(echo a && echo b)"));
    }

    #[test]
    fn only_the_command_word_counts() {
        assert_eq!(cmd("cd ~/claude-docs"), None);
        assert_eq!(cmd("cd ~/Projects/claude"), None);
        assert_eq!(cmd("echo claude"), None);
        assert_eq!(cmd("cat claude.txt"), None);
        assert_eq!(cmd("claudexyz"), None);
        assert_eq!(cmd("vim src/main.rs"), None);
        assert_eq!(cmd("FOO=claude ls"), None);
    }

    #[test]
    fn the_last_agent_segment_wins() {
        assert_eq!(cmd("claude --a && codex resume --last").as_deref(), Some("codex resume --last"));
    }

    #[test]
    fn truncated_line_with_open_quote_does_not_panic() {
        let line = "claude --append-system-prompt 'abc def";
        assert_eq!(cmd(line).as_deref(), Some(line));
        assert_eq!(cmd("cd 'abc").as_deref(), None);
        assert_eq!(cmd("claude \\").as_deref(), Some("claude \\"));
        assert_eq!(cmd("claude $(echo"), Some("claude $(echo".into()));
        assert_eq!(cmd(""), None);
        assert_eq!(cmd("   "), None);
    }

    #[test]
    fn invocation_separates_head_and_args() {
        let inv = find_agent_invocation("cd x && FOO=1 claude-max --resume 'a'", &agents()).unwrap();
        assert_eq!(inv.agent, "claude");
        assert_eq!(inv.head, vec!["FOO=1", "claude-max"]);
        assert_eq!(inv.args, vec!["--resume", "'a'"]);
    }

    #[test]
    fn print_mode_looks_only_at_the_agent_args() {
        assert!(is_print_mode("cd x && claude -p hi", "claude"));
        assert!(is_print_mode("claude --print", "claude"));
        assert!(!is_print_mode("time -p claude --x", "claude"));
        assert!(!is_print_mode("claude --model opus", "claude"));
        assert!(!is_print_mode("ls -p", "claude"));
    }
}
