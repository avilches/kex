//! Finds the command that launched an agent inside a shell line.
//!
//! The line reaches us from OSC 133;C as typed (aliases unexpanded, control chars including
//! newlines flattened to spaces, cut at 256 chars by zsh, fish and PowerShell; bash sends no
//! text), so it can be `cd dir && claude-max --resume x`, `(cd dir; FOO=1 claude)` or
//! `cd ~/claude-docs`. The launcher name and its prefix of assignments and wrappers are what
//! has to be repeated on restore; everything before the agent segment (`cd`, the grouping, the
//! other commands) must not be.
//!
//! Anything this module cannot resolve with certainty is not guessed. A wrapper option it does
//! not know, or a quoting style whose meaning depends on the shell (`'it\'s'` is two things in
//! zsh and fish), yields `None`. A line that was cut mid-construct still names the agent but
//! is flagged `complete: false`, so that its text is never replayed. Command substitutions and
//! `${...}` are consumed whole, quotes inside them included, but never analysed.

pub const DEFAULT_AGENTS: &[&str] = &["claude", "codex"];

/// Longest line the shell scripts send; a line this long may have been cut.
pub const MAX_LINE_CHARS: usize = 256;

struct Wrapper {
    name: &'static str,
    /// Options that consume the next token as their value.
    value_opts: &'static [&'static str],
    /// Plain arguments before the command (`timeout 5 claude`).
    positionals: usize,
}

const fn wrapper(name: &'static str, value_opts: &'static [&'static str], positionals: usize) -> Wrapper {
    Wrapper { name, value_opts, positionals }
}

/// Commands that run their arguments as another command. Anything outside this list
/// (`pnpm dlx`, `bun x`, `direnv exec .`, `ssh host`) is deliberately not resolved.
const WRAPPERS: &[Wrapper] = &[
    wrapper("exec", &["-a"], 0),
    wrapper("command", &[], 0),
    wrapper("builtin", &[], 0),
    wrapper("env", &["-u", "-C", "-S"], 0),
    wrapper("time", &[], 0),
    wrapper("nohup", &[], 0),
    wrapper("nice", &["-n"], 0),
    wrapper("sudo", &["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"], 0),
    wrapper("noglob", &[], 0),
    wrapper("nocorrect", &[], 0),
    wrapper("npx", &["-p", "--package"], 0),
    wrapper("bunx", &[], 0),
    wrapper("pnpx", &[], 0),
    wrapper("timeout", &["-s", "--signal", "-k", "--kill-after"], 1),
    wrapper("caffeinate", &["-t", "-w"], 0),
];

/// Wrapper options known to take no value. Any other option makes the command word
/// unresolvable (`sudo -Eu claude ls`, `command -v claude`).
const FLAG_OPTIONS: &[&str] = &[
    "-i", "-p", "-y", "--yes", "-E", "-H", "-c", "-l", "--foreground", "--preserve-status",
];

/// Reserved words that may open a segment before the command (`if x; then claude; fi`).
const LEADING: &[&str] = &["{", "!", "then", "do", "else"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub agent: String,
    /// Raw tokens up to and including the command word: assignments, wrappers and launcher.
    pub head: Vec<String>,
    /// Raw tokens after the command word.
    pub args: Vec<String>,
    /// False when the line ended inside a quote, a substitution or after a lone backslash, or
    /// was long enough to have been cut: the agent is known, the text must not be replayed.
    pub complete: bool,
}

impl Invocation {
    pub fn command(&self) -> String {
        self.head.iter().chain(self.args.iter()).map(String::as_str).collect::<Vec<_>>().join(" ")
    }

    /// `-p` / `--print` among the agent's own options (not after `--`).
    pub fn is_print_mode(&self) -> bool {
        self.args.iter().take_while(|t| t.as_str() != "--").any(|t| t == "-p" || t == "--print")
    }
}

/// The last segment of `line` whose command word is one of `agents`.
pub fn find_agent_invocation(line: &str, agents: &[String]) -> Option<Invocation> {
    let split = split_segments(line);
    if split.ambiguous {
        return None;
    }
    let complete = !split.unterminated && line.chars().count() < MAX_LINE_CHARS;
    let mut found = None;
    for segment in split.segments {
        if let Some(inv) = match_segment(segment, agents, complete) {
            found = Some(inv);
        }
    }
    found
}

pub fn is_print_mode(line: &str, agents: &[String]) -> bool {
    find_agent_invocation(line, agents).is_some_and(|inv| inv.is_print_mode())
}

/// How many tokens a redirection occupies: 1 when its target is attached (`2>/dev/null`),
/// 2 when it is a bare operator followed by the target (`>`, `2>>`, `<<<`), None otherwise.
/// Process substitutions (`<(cmd)`, `>(cmd)`) are values, not redirections.
pub fn redirection_tokens(token: &str) -> Option<usize> {
    let rest = token.trim_start_matches(|c: char| c.is_ascii_digit());
    if !(rest.starts_with(['<', '>']) || rest.starts_with("&>")) {
        return None;
    }
    if rest.starts_with(['<', '>']) && rest[1..].starts_with('(') {
        return None;
    }
    Some(if rest.trim_start_matches(['<', '>', '&', '|']).is_empty() { 2 } else { 1 })
}

fn match_segment(tokens: Vec<String>, agents: &[String], complete: bool) -> Option<Invocation> {
    let mut i = 0;
    while i < tokens.len() && LEADING.contains(&tokens[i].as_str()) {
        i += 1;
    }
    let mut head: Vec<String> = Vec::new();
    while i < tokens.len() {
        let tok = tokens[i].as_str();
        if is_assignment(tok) {
            head.push(tokens[i].clone());
            i += 1;
            continue;
        }
        if let Some(n) = redirection_tokens(tok) {
            i += n;
            continue;
        }
        let word = base_name(tok);
        if let Some(w) = WRAPPERS.iter().find(|w| w.name == word) {
            let next = skip_wrapper_args(&tokens, i + 1, w)?;
            head.extend(tokens[i..next.min(tokens.len())].iter().cloned());
            i = next;
            continue;
        }
        let agent = agents.iter().find(|a| {
            word.strip_prefix(a.as_str()).is_some_and(|rest| rest.is_empty() || rest.starts_with('-'))
        })?;
        head.push(tokens[i].clone());
        return Some(Invocation {
            agent: agent.clone(),
            head,
            args: tokens[i + 1..].to_vec(),
            complete,
        });
    }
    None
}

/// Index of the first token after the wrapper's options and positionals, or None when an
/// option's meaning is unknown (so the command word cannot be told apart from a value).
fn skip_wrapper_args(tokens: &[String], mut i: usize, w: &Wrapper) -> Option<usize> {
    while i < tokens.len() && tokens[i].starts_with('-') {
        let opt = tokens[i].as_str();
        i += 1;
        if opt == "--" {
            break;
        }
        if w.value_opts.contains(&opt) {
            i += 1;
            continue;
        }
        let numeric = opt.len() > 1 && opt[1..].bytes().all(|b| b.is_ascii_digit());
        let long_with_value = opt.starts_with("--") && opt.contains('=');
        if FLAG_OPTIONS.contains(&opt) || numeric || long_with_value {
            continue;
        }
        return None;
    }
    i += w.positionals;
    Some(i)
}

fn is_assignment(tok: &str) -> bool {
    let Some(eq) = tok.find('=') else { return false };
    let name = tok[..eq].strip_suffix('+').unwrap_or(&tok[..eq]);
    let mut chars = name.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// The file name of a command word. A backslash is a separator only in a Windows path
/// (`C:\bin\claude`, `\\host\x`); elsewhere a single leading one is the alias bypass
/// (`\claude`) and `my\claude` is just the command `myclaude`.
fn base_name(tok: &str) -> &str {
    let unquoted = tok
        .strip_prefix('"').and_then(|t| t.strip_suffix('"'))
        .or_else(|| tok.strip_prefix('\'').and_then(|t| t.strip_suffix('\'')))
        .unwrap_or(tok);
    let bytes = unquoted.as_bytes();
    let windows_path = unquoted.starts_with("\\\\")
        || (bytes.len() > 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && matches!(bytes[2], b'\\' | b'/'));
    if windows_path {
        return unquoted.rsplit(['/', '\\']).next().unwrap_or(unquoted);
    }
    let name = unquoted.rsplit('/').next().unwrap_or(unquoted);
    name.strip_prefix('\\').unwrap_or(name)
}

#[derive(Default)]
struct Splitter {
    segments: Vec<Vec<String>>,
    tokens: Vec<String>,
    tok: String,
    in_token: bool,
    unterminated: bool,
    ambiguous: bool,
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

// The scanners below start at the opening character, copy everything through the matching
// close into the current token and return the index after it. Reaching the end of input
// without a close marks the line unterminated.

fn copy_escaped(chars: &[char], mut i: usize, sp: &mut Splitter) -> usize {
    sp.push(chars[i]);
    i += 1;
    match chars.get(i) {
        Some(&next) => {
            sp.push(next);
            i + 1
        }
        None => {
            sp.unterminated = true;
            i
        }
    }
}

fn scan_single(chars: &[char], mut i: usize, sp: &mut Splitter, ansi_c: bool) -> usize {
    sp.push(chars[i]);
    i += 1;
    while i < chars.len() {
        let c = chars[i];
        if ansi_c && c == '\\' {
            i = copy_escaped(chars, i, sp);
            continue;
        }
        // Whether `\'` closes the string depends on the shell (zsh yes, fish no).
        if c == '\'' && !ansi_c && sp.tok.ends_with('\\') {
            sp.ambiguous = true;
        }
        sp.push(c);
        i += 1;
        if c == '\'' {
            return i;
        }
    }
    sp.unterminated = true;
    i
}

fn scan_backtick(chars: &[char], mut i: usize, sp: &mut Splitter) -> usize {
    sp.push(chars[i]);
    i += 1;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' {
            i = copy_escaped(chars, i, sp);
            continue;
        }
        sp.push(c);
        i += 1;
        if c == '`' {
            return i;
        }
    }
    sp.unterminated = true;
    i
}

fn scan_double(chars: &[char], mut i: usize, sp: &mut Splitter) -> usize {
    sp.push(chars[i]);
    i += 1;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' => i = copy_escaped(chars, i, sp),
            '"' => {
                sp.push(c);
                return i + 1;
            }
            '$' if chars.get(i + 1) == Some(&'(') => {
                sp.push(c);
                i = scan_group(chars, i + 1, sp, '(', ')');
            }
            '$' if chars.get(i + 1) == Some(&'{') => {
                sp.push(c);
                i = scan_group(chars, i + 1, sp, '{', '}');
            }
            // A backtick is a substitution in POSIX shells and the escape character in PowerShell.
            '`' => {
                sp.ambiguous = true;
                i = scan_backtick(chars, i, sp);
            }
            _ => {
                sp.push(c);
                i += 1;
            }
        }
    }
    sp.unterminated = true;
    i
}

fn scan_group(chars: &[char], mut i: usize, sp: &mut Splitter, open: char, close: char) -> usize {
    let mut depth = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\'' => i = scan_single(chars, i, sp, false),
            '"' => i = scan_double(chars, i, sp),
            '`' => i = scan_backtick(chars, i, sp),
            '$' if chars.get(i + 1) == Some(&'\'') => {
                sp.push(c);
                i = scan_single(chars, i + 1, sp, true);
            }
            '\\' => i = copy_escaped(chars, i, sp),
            _ => {
                sp.push(c);
                i += 1;
                if c == open {
                    depth += 1;
                } else if c == close {
                    depth -= 1;
                    if depth == 0 {
                        return i;
                    }
                }
            }
        }
    }
    sp.unterminated = true;
    i
}

/// Splits on `&&`, `||`, `;`, `|`, `&`, newlines and parentheses outside quotes. Redirections
/// that contain `&` or `|` (`2>&1`, `&>`, `>|`) stay inside their token.
fn split_segments(line: &str) -> Splitter {
    let chars: Vec<char> = line.chars().collect();
    let mut sp = Splitter::default();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        match c {
            '\\' => i = copy_escaped(&chars, i, &mut sp),
            '\'' => i = scan_single(&chars, i, &mut sp, false),
            '"' => i = scan_double(&chars, i, &mut sp),
            '`' => i = scan_backtick(&chars, i, &mut sp),
            '$' if next == Some('(') => {
                sp.push(c);
                i = scan_group(&chars, i + 1, &mut sp, '(', ')');
            }
            '$' if next == Some('{') => {
                sp.push(c);
                i = scan_group(&chars, i + 1, &mut sp, '{', '}');
            }
            '$' if next == Some('\'') => {
                sp.push(c);
                i = scan_single(&chars, i + 1, &mut sp, true);
            }
            '<' | '>' if next == Some('(') => {
                sp.push(c);
                i = scan_group(&chars, i + 1, &mut sp, '(', ')');
            }
            '=' if next == Some('(') && !sp.in_token => {
                sp.push(c);
                i = scan_group(&chars, i + 1, &mut sp, '(', ')');
            }
            // Glob qualifier or array value glued to a word: `./*(/)`, `FOO=(a b)`.
            '(' if sp.in_token => i = scan_group(&chars, i, &mut sp, '(', ')'),
            '\n' | '\r' | ';' | '(' | ')' => {
                sp.end_segment();
                i += 1;
            }
            c if c.is_whitespace() => {
                sp.end_token();
                i += 1;
            }
            '|' => {
                if sp.in_token && sp.tok.ends_with('>') {
                    sp.push(c);
                } else {
                    sp.end_segment();
                }
                i += 1;
            }
            '&' => {
                let after_redirect = sp.in_token && sp.tok.ends_with(['>', '<']);
                if after_redirect || next == Some('>') {
                    sp.push(c);
                } else {
                    sp.end_segment();
                }
                i += 1;
            }
            _ => {
                sp.push(c);
                i += 1;
            }
        }
    }
    sp.end_segment();
    sp
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

    fn same(line: &str) {
        assert_eq!(cmd(line).as_deref(), Some(line), "line: {line}");
    }

    fn complete(line: &str) -> Option<bool> {
        find_agent_invocation(line, &agents()).map(|i| i.complete)
    }

    #[test]
    fn plain_command_is_kept_whole() {
        same("claude --resume 'abc'");
        assert_eq!(complete("claude --resume 'abc'"), Some(true));
    }

    #[test]
    fn retry_line_drops_the_cd() {
        let line = " cd '/Users/x/Library/Application Support/Taxes' && claude-max --resume 'abc-1'";
        assert_eq!(cmd(line).as_deref(), Some("claude-max --resume 'abc-1'"));
    }

    #[test]
    fn launcher_alias_and_absolute_path_are_kept() {
        same("claude-max");
        same("/opt/homebrew/bin/claude --x");
        same("\\claude --x");
        same("/My\\ Dir/claude --x");
        same("'C:\\bin\\claude' --x");
        same("C:\\bin\\claude --x");
    }

    #[test]
    fn a_backslash_inside_a_word_is_not_a_path_separator() {
        assert_eq!(cmd("my\\claude --x"), None);
    }

    #[test]
    fn grouping_is_dropped() {
        assert_eq!(cmd("(cd /tmp && claude --x)").as_deref(), Some("claude --x"));
        assert_eq!(cmd("{ cd /tmp; claude --x; }").as_deref(), Some("claude --x"));
        assert_eq!(cmd("{ claude --x ; }").as_deref(), Some("claude --x"));
        assert_eq!(cmd("cd /tmp; claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("false || claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("claude --x &").as_deref(), Some("claude --x"));
        assert_eq!(cmd("if true; then claude --x; fi").as_deref(), Some("claude --x"));
        assert_eq!(cmd("! claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("FOO=1 { claude; }"), None);
    }

    #[test]
    fn pipes_and_trailing_commands_are_dropped() {
        assert_eq!(cmd("claude --x | tee out").as_deref(), Some("claude --x"));
        assert_eq!(cmd("claude --x; echo done").as_deref(), Some("claude --x"));
    }

    #[test]
    fn assignments_and_wrappers_are_kept() {
        same("FOO=1 BAR=2 claude --x");
        same("FOO='a b' claude --x");
        same("env FOO=1 claude --x");
        same("env -i FOO=1 claude --x");
        same("time -p claude --x");
        same("command claude --x");
        same("npx claude");
        same("npx -y claude");
        assert_eq!(cmd("cd d && FOO=1 nohup claude").as_deref(), Some("FOO=1 nohup claude"));
    }

    #[test]
    fn wrapper_option_values_are_skipped_not_mistaken_for_the_command() {
        same("sudo -u bob claude --x");
        same("nice -n 10 claude --x");
        same("nice -10 claude --x");
        same("env -u FOO claude --x");
        same("timeout 5 claude --x");
        same("timeout -s KILL 5s claude --x");
        same("timeout --foreground 5 claude --x");
        same("caffeinate -i claude --x");
        same("sudo -- claude --x");
        assert_eq!(cmd("sudo -u claude whoami"), None);
        assert_eq!(cmd("command -v claude"), None);
        assert_eq!(cmd("exec -a claude zsh"), None);
        assert_eq!(cmd("timeout 5 sleep 1"), None);
    }

    #[test]
    fn unknown_wrapper_options_are_not_guessed() {
        assert_eq!(cmd("sudo -Eu claude ls"), None);
        assert_eq!(cmd("sudo --user claude ls"), None);
        assert_eq!(cmd("nice -x claude ls"), None);
        assert_eq!(cmd("env -P claude ls"), None);
        assert_eq!(cmd("npx -w claude ls"), None);
    }

    #[test]
    fn subcommand_style_launchers_are_deliberately_not_resolved() {
        assert_eq!(cmd("pnpm dlx claude"), None);
        assert_eq!(cmd("bun x claude"), None);
        assert_eq!(cmd("direnv exec . claude"), None);
        assert_eq!(cmd("mise exec -- claude"), None);
        assert_eq!(cmd("ssh host claude"), None);
    }

    #[test]
    fn loop_keywords_before_the_command_are_skipped() {
        assert_eq!(cmd("while true; do claude --x; done").as_deref(), Some("claude --x"));
    }

    #[test]
    fn operators_inside_quotes_do_not_split() {
        same("claude --append-system-prompt 'a && b; c' --x");
        same("claude --append-system-prompt \"a || b\" --x");
        assert_eq!(cmd("cd 'a && claude'").as_deref(), None);
    }

    #[test]
    fn redirections_stay_in_the_token() {
        same("claude --x 2>&1");
        same("claude --x &> /tmp/o");
        same("claude --x >| /tmp/o");
        same("claude --x > >(tee out.log)");
        same("claude --x 2> >(tee e.log >&2) --y");
    }

    #[test]
    fn a_redirection_before_the_command_word_is_skipped_and_not_kept() {
        assert_eq!(cmd(">/tmp/o claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("> out.log claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("2>&1 claude --x").as_deref(), Some("claude --x"));
        assert_eq!(cmd("FOO=1 >/tmp/o claude --x").as_deref(), Some("FOO=1 claude --x"));
        assert_eq!(cmd("</tmp/claude ls"), None);
        assert_eq!(cmd(">/tmp/claude echo hi"), None);
    }

    #[test]
    fn process_substitutions_are_values_not_redirections() {
        same("claude --mcp-config <(echo '{}') --verbose");
        same("claude --settings <(echo '{}')");
        assert_eq!(redirection_tokens("<(echo x)"), None);
        assert_eq!(redirection_tokens(">(tee x)"), None);
        assert_eq!(redirection_tokens("2>(tee x)"), None);
    }

    #[test]
    fn substitutions_are_consumed_whole_with_their_quotes() {
        same("claude --append-system-prompt \"$(cat a; echo b)\" --x");
        same("claude --x $(echo a && echo b)");
        same("claude --append-system-prompt $(echo ')') --x");
        same("claude --append-system-prompt \"$(cat \"a;b\")\" --verbose");
        same("claude --append-system-prompt \"$(printf \"%s\" \"a   b\")\"");
        same("claude --add-dir `echo a; echo b` --x");
        same("claude =(echo a; echo b) --x");
        same("claude --add-dir ./*(/) --verbose");
        same("claude --add-dir ${y:-a;b} --verbose");
        same("claude --add-dir ${y:-a&&b} --verbose");
        same("claude --add-dir ${y:-a|b} --verbose");
        same("claude --add-dir ${y:-)} --verbose");
        assert_eq!(
            cmd("cd a && claude --append-system-prompt $(echo ')') ; rm -rf y").as_deref(),
            Some("claude --append-system-prompt $(echo ')')")
        );
    }

    #[test]
    fn ansi_c_quoting_honours_escaped_quotes() {
        same("claude --name $'it\\'s' --x");
        assert_eq!(cmd("claude --name $'it\\'s' && rm -rf /tmp/y").as_deref(), Some("claude --name $'it\\'s'"));
    }

    #[test]
    fn quoting_whose_meaning_depends_on_the_shell_is_not_guessed() {
        assert_eq!(cmd("claude --name 'it\\'s' ; rm -rf y"), None);
        assert_eq!(cmd("claude --append-system-prompt \"a`\"b\" ; rm -rf y"), None);
        assert_eq!(cmd("claude --name \"it`s\" ; rm -rf y"), None);
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
    fn a_line_cut_mid_construct_names_the_agent_but_is_not_complete() {
        for line in [
            "claude --append-system-prompt 'abc def",
            "claude --append-system-prompt \"abc $(echo def",
            "claude --add-dir /a\\",
            "claude $(echo",
            "claude --x $'abc",
            "claude --x `abc",
            "claude --x ${y:-a",
        ] {
            assert_eq!(complete(line), Some(false), "line: {line}");
        }
        assert_eq!(complete("claude --x 'ok' $(echo ok)"), Some(true));
    }

    #[test]
    fn a_line_as_long_as_the_shell_cut_is_not_complete() {
        let long = format!("claude --append-system-prompt '{}' --x", "x".repeat(300));
        assert_eq!(complete(&long), Some(false));
        let max = format!("claude {}", "a".repeat(MAX_LINE_CHARS - "claude ".len()));
        assert_eq!(max.chars().count(), MAX_LINE_CHARS);
        assert_eq!(complete(&max), Some(false));
        let below = format!("claude {}", "a".repeat(MAX_LINE_CHARS - 8));
        assert_eq!(complete(&below), Some(true));
    }

    #[test]
    fn degenerate_input_does_not_panic() {
        assert_eq!(cmd("cd 'abc").as_deref(), None);
        assert_eq!(cmd(""), None);
        assert_eq!(cmd("   "), None);
        assert_eq!(cmd("\\"), None);
        assert_eq!(cmd("$("), None);
        assert_eq!(cmd("'"), None);
        assert_eq!(cmd("claude \u{1F600} \u{e9} \u{4e2d}").as_deref(), Some("claude \u{1F600} \u{e9} \u{4e2d}"));
    }

    #[test]
    fn invocation_separates_head_and_args() {
        let inv = find_agent_invocation("cd x && FOO=1 claude-max --resume 'a'", &agents()).unwrap();
        assert_eq!(inv.agent, "claude");
        assert_eq!(inv.head, vec!["FOO=1", "claude-max"]);
        assert_eq!(inv.args, vec!["--resume", "'a'"]);
    }

    #[test]
    fn redirection_token_count() {
        assert_eq!(redirection_tokens("2>/dev/null"), Some(1));
        assert_eq!(redirection_tokens(">"), Some(2));
        assert_eq!(redirection_tokens("2>>"), Some(2));
        assert_eq!(redirection_tokens("&>"), Some(2));
        assert_eq!(redirection_tokens(">|"), Some(2));
        assert_eq!(redirection_tokens("--x"), None);
        assert_eq!(redirection_tokens("2"), None);
    }

    #[test]
    fn print_mode_looks_only_at_the_agent_options() {
        assert!(is_print_mode("cd x && claude -p hi", &agents()));
        assert!(is_print_mode("claude --print", &agents()));
        assert!(!is_print_mode("time -p claude --x", &agents()));
        assert!(!is_print_mode("claude --model opus", &agents()));
        assert!(!is_print_mode("ls -p", &agents()));
        assert!(!is_print_mode("claude -- -p", &agents()));
    }
}
