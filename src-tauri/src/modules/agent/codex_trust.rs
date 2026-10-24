//! Codex hook trust: the `[hooks.state."<key>"]` tables of `~/.codex/config.toml`.
//!
//! Codex runs a non-managed hook only when its table holds a `trusted_hash` that matches the
//! handler definition. Edits here are textual on purpose: everything outside the touched tables
//! is preserved byte for byte, because the file belongs to the user and to other tools.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CodexHookEvent {
    PreToolUse,
    PermissionRequest,
    PostToolUse,
    PreCompact,
    PostCompact,
    SessionStart,
    UserPromptSubmit,
    SubagentStart,
    SubagentStop,
    Stop,
    Interrupt,
}

impl CodexHookEvent {
    pub const ALL: [CodexHookEvent; 11] = [
        Self::PreToolUse,
        Self::PermissionRequest,
        Self::PostToolUse,
        Self::PreCompact,
        Self::PostCompact,
        Self::SessionStart,
        Self::UserPromptSubmit,
        Self::SubagentStart,
        Self::SubagentStop,
        Self::Stop,
        Self::Interrupt,
    ];

    /// Snake-case name used in trust keys and in the hashed identity.
    pub fn label(self) -> &'static str {
        match self {
            Self::PreToolUse => "pre_tool_use",
            Self::PermissionRequest => "permission_request",
            Self::PostToolUse => "post_tool_use",
            Self::PreCompact => "pre_compact",
            Self::PostCompact => "post_compact",
            Self::SessionStart => "session_start",
            Self::UserPromptSubmit => "user_prompt_submit",
            Self::SubagentStart => "subagent_start",
            Self::SubagentStop => "subagent_stop",
            Self::Stop => "stop",
            Self::Interrupt => "interrupt",
        }
    }

    /// PascalCase name used as the event key in `hooks.json`.
    pub fn hooks_json_name(self) -> &'static str {
        match self {
            Self::PreToolUse => "PreToolUse",
            Self::PermissionRequest => "PermissionRequest",
            Self::PostToolUse => "PostToolUse",
            Self::PreCompact => "PreCompact",
            Self::PostCompact => "PostCompact",
            Self::SessionStart => "SessionStart",
            Self::UserPromptSubmit => "UserPromptSubmit",
            Self::SubagentStart => "SubagentStart",
            Self::SubagentStop => "SubagentStop",
            Self::Stop => "Stop",
            Self::Interrupt => "Interrupt",
        }
    }

    pub fn from_label(label: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|e| e.label() == label)
    }

    pub fn from_hooks_json_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|e| e.hooks_json_name() == name)
    }

    // Codex ignores the matcher of these events, so it is not part of their identity.
    fn hashes_matcher(self) -> bool {
        !matches!(self, Self::UserPromptSubmit | Self::Stop)
    }
}

/// One `command` handler of `hooks.json`, located by event, group and handler index.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustEntry {
    pub source_path: String,
    pub event: CodexHookEvent,
    pub group_index: usize,
    pub handler_index: usize,
    pub command: String,
    pub timeout_sec: Option<u64>,
    pub is_async: bool,
    pub matcher: Option<String>,
    pub status_message: Option<String>,
    pub additional_context_limit: Option<u64>,
}

impl TrustEntry {
    pub fn key(&self) -> String {
        trust_key(
            &self.source_path,
            self.event,
            self.group_index,
            self.handler_index,
        )
    }
}

const DEFAULT_TIMEOUT_SEC: u64 = 600;

pub fn trust_key(source_path: &str, event: CodexHookEvent, group: usize, handler: usize) -> String {
    format!(
        "{}:{}:{group}:{handler}",
        normalize_source_path(source_path),
        event.label()
    )
}

/// `sha256:<hex>` of the canonical (sorted-key, compact) JSON identity Codex hashes.
pub fn trusted_hash(entry: &TrustEntry) -> String {
    let mut handler: BTreeMap<&str, Value> = BTreeMap::new();
    handler.insert("type", Value::from("command"));
    handler.insert("command", Value::from(entry.command.as_str()));
    handler.insert(
        "timeout",
        Value::from(entry.timeout_sec.unwrap_or(DEFAULT_TIMEOUT_SEC).max(1)),
    );
    handler.insert("async", Value::from(entry.is_async));
    if let Some(message) = &entry.status_message {
        handler.insert("statusMessage", Value::from(message.as_str()));
    }
    if let Some(limit) = entry.additional_context_limit {
        handler.insert("additionalContextLimit", Value::from(limit));
    }
    let mut identity: BTreeMap<&str, Value> = BTreeMap::new();
    identity.insert("event_name", Value::from(entry.event.label()));
    identity.insert(
        "hooks",
        Value::Array(vec![serde_json::to_value(handler).unwrap_or_default()]),
    );
    if entry.event.hashes_matcher() {
        if let Some(matcher) = &entry.matcher {
            identity.insert("matcher", Value::from(matcher.as_str()));
        }
    }
    // BTreeMap serializes with sorted keys even with serde_json's preserve_order feature.
    let canonical = serde_json::to_string(&identity).unwrap_or_default();
    let digest = Sha256::digest(canonical.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    format!("sha256:{hex}")
}

/// Writes or refreshes the trust table of every entry. A table that already holds the right
/// hash is left untouched; a user's `enabled = false` survives a refresh.
pub fn upsert_hook_trust(content: &str, entries: &[TrustEntry]) -> String {
    upsert_hook_trust_disabling(content, entries, &[])
}

/// Same, but the tables of the `disabled` keys end up `enabled = false` whatever they held.
pub fn upsert_hook_trust_disabling(
    content: &str,
    entries: &[TrustEntry],
    disabled: &[String],
) -> String {
    let disabled: Vec<String> = disabled.iter().map(|k| lookup_key(k)).collect();
    let mut updated = content.to_string();
    for entry in entries {
        let off = disabled.contains(&lookup_key(&entry.key()));
        updated = upsert_one(&updated, entry, off);
    }
    updated
}

/// Whether the user turned off the trust table of `key` (`enabled = false` in any of its tables).
pub fn hook_trust_disabled(content: &str, key: &str) -> bool {
    let wanted = lookup_key(key);
    find_blocks(content)
        .iter()
        .filter(|b| lookup_key(&b.key) == wanted)
        .any(|b| block_value(content, b, "enabled").as_deref() == Some("false"))
}

/// Deletes the trust tables of the given keys, plus the blank line that separated each one.
pub fn remove_hook_trust(content: &str, keys: &[String]) -> String {
    let wanted: Vec<String> = keys.iter().map(|k| lookup_key(k)).collect();
    let blocks: Vec<Block> = find_blocks(content)
        .into_iter()
        .filter(|b| wanted.contains(&lookup_key(&b.key)))
        .collect();
    let mut updated = content.to_string();
    for block in blocks.iter().rev() {
        let start = start_with_separator(&updated, block.start);
        updated.replace_range(start..block.body_end, "");
    }
    updated
}

/// The `trusted_hash` recorded for a key, if any table for it holds one.
pub fn read_trusted_hash(content: &str, key: &str) -> Option<String> {
    let wanted = lookup_key(key);
    find_blocks(content)
        .into_iter()
        .filter(|b| lookup_key(&b.key) == wanted)
        .find_map(|b| block_value(content, &b, "trusted_hash").and_then(|v| parse_basic_value(&v)))
}

/// Checks an edited file before it is written: it must still be valid TOML and every entry
/// must read back with its hash, both textually and as parsed TOML. The textual editor only
/// sees `[hooks.state."<key>"]` headers, so a table written in another valid form (an inline
/// table, a quoted `"hooks"`) would otherwise end up duplicated.
pub fn verify_hook_trust(content: &str, entries: &[TrustEntry]) -> Result<(), String> {
    let parsed: toml::Table = content
        .parse()
        .map_err(|e| format!("the edited config.toml would not be valid TOML: {e}"))?;
    let state = parsed
        .get("hooks")
        .and_then(|h| h.get("state"))
        .and_then(toml::Value::as_table);
    for entry in entries {
        let hash = trusted_hash(entry);
        let wanted = lookup_key(&entry.key());
        let parsed_ok = state.is_some_and(|tables| {
            tables.iter().any(|(key, table)| {
                lookup_key(key) == wanted
                    && table.get("trusted_hash").and_then(toml::Value::as_str) == Some(&hash)
            })
        });
        if !parsed_ok || read_trusted_hash(content, &entry.key()).as_deref() != Some(&hash) {
            return Err(format!(
                "the trust of {} would not read back from the edited config.toml",
                entry.key()
            ));
        }
    }
    Ok(())
}

/// Every `[hooks.state."<key>"]` table in file order, with its `trusted_hash` when it has one.
pub fn hook_state_tables(content: &str) -> Vec<(String, Option<String>)> {
    find_blocks(content)
        .into_iter()
        .map(|b| {
            let hash = block_value(content, &b, "trusted_hash").and_then(|v| parse_basic_value(&v));
            (b.key, hash)
        })
        .collect()
}

/// The source path, event, group and handler index a trust key names.
pub fn parse_trust_key(key: &str) -> Option<(String, CodexHookEvent, usize, usize)> {
    split_key(key).map(|(path, event, group, handler)| (path.to_string(), event, group, handler))
}

/// Replaces `path` through a temp file in the same directory and a rename. A symlinked
/// config is written through to its target so dotfiles links stay links.
pub fn write_atomically(path: &Path, contents: &str) -> io::Result<()> {
    let target = resolve_write_path(path)?;
    let dir = match target.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&dir)?;
    let mut tmp = tempfile::Builder::new()
        .prefix(".kex-")
        .suffix(".tmp")
        .tempfile_in(&dir)?;
    tmp.write_all(contents.as_bytes())?;
    #[cfg(unix)]
    if let Ok(meta) = fs::metadata(&target) {
        tmp.as_file().set_permissions(meta.permissions())?;
    }
    tmp.as_file().sync_all()?;
    tmp.persist(&target).map_err(|e| e.error)?;
    Ok(())
}

fn resolve_write_path(path: &Path) -> io::Result<PathBuf> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => fs::canonicalize(path),
        Ok(_) => Ok(path.to_path_buf()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(path.to_path_buf()),
        Err(e) => Err(e),
    }
}

fn upsert_one(content: &str, entry: &TrustEntry, force_disabled: bool) -> String {
    let hash = trusted_hash(entry);
    let keys = write_variants(&entry.key());
    let wanted = lookup_key(&keys[0]);
    let blocks: Vec<Block> = find_blocks(content)
        .into_iter()
        .filter(|b| lookup_key(&b.key) == wanted)
        .collect();
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };

    if blocks.is_empty() {
        let text = render_blocks(&keys, &hash, !force_disabled, eol);
        let separator = if content.is_empty() {
            String::new()
        } else if content.ends_with('\n') {
            eol.to_string()
        } else {
            eol.repeat(2)
        };
        return format!("{content}{separator}{text}");
    }

    let current = blocks.iter().all(|b| {
        block_value(content, b, "trusted_hash")
            .and_then(|v| parse_basic_value(&v))
            .as_deref()
            == Some(hash.as_str())
    }) && keys.iter().all(|k| blocks.iter().any(|b| &b.key == k));
    let user_disabled = blocks
        .iter()
        .any(|b| block_value(content, b, "enabled").as_deref() == Some("false"));
    if current && (user_disabled || !force_disabled) {
        return content.to_string();
    }

    let enabled = !user_disabled && !force_disabled;
    let text = render_blocks(&keys, &hash, enabled, eol);
    let mut updated = content.to_string();
    for (index, block) in blocks.iter().enumerate().rev() {
        if index == 0 {
            updated.replace_range(block.start..block.body_end, &text);
        } else {
            let start = start_with_separator(&updated, block.start);
            updated.replace_range(start..block.body_end, "");
        }
    }
    updated
}

fn render_blocks(keys: &[String], hash: &str, enabled: bool, eol: &str) -> String {
    keys.iter()
        .map(|key| {
            format!(
                "[hooks.state.{}]{eol}enabled = {enabled}{eol}trusted_hash = \"{}\"{eol}",
                format_table_key(key),
                escape_basic(hash)
            )
        })
        .collect::<Vec<_>>()
        .join(eol)
}

// Removing a block also takes the single blank line before it, mirroring how it was appended.
fn start_with_separator(content: &str, start: usize) -> usize {
    let before = &content[..start];
    if before.ends_with("\n\r\n") {
        start - 2
    } else if before.ends_with("\n\n") {
        start - 1
    } else {
        start
    }
}

// ---- keys and paths -------------------------------------------------------------------------

fn is_windows_path(path: &str) -> bool {
    let b = path.as_bytes();
    (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/'))
        || path.starts_with("\\\\")
        || path.starts_with("//")
}

fn strip_device_prefix(path: &str) -> String {
    let lower = path.to_ascii_lowercase();
    for prefix in ["\\\\?\\unc\\", "\\\\.\\unc\\"] {
        if lower.starts_with(prefix) {
            return format!("\\\\{}", &path[prefix.len()..]);
        }
    }
    for prefix in ["\\\\?\\", "\\\\.\\"] {
        if lower.starts_with(prefix) && is_windows_path(&path[prefix.len()..]) {
            return path[prefix.len()..].to_string();
        }
    }
    path.to_string()
}

/// Lexical normalization (no filesystem access): `.` and `..` resolved, separators collapsed,
/// trailing separator dropped. Windows paths keep backslashes, POSIX paths forward slashes.
pub fn normalize_source_path(path: &str) -> String {
    if is_windows_path(path) || path.starts_with("\\\\?\\") || path.starts_with("\\\\.\\") {
        let stripped = strip_device_prefix(path).replace('/', "\\");
        let (root, rest) = if let Some(rest) = stripped.strip_prefix("\\\\") {
            let mut parts = rest.splitn(3, '\\');
            let server = parts.next().unwrap_or_default();
            let share = parts.next().unwrap_or_default();
            (
                format!("\\\\{server}\\{share}\\"),
                parts.next().unwrap_or_default().to_string(),
            )
        } else {
            (stripped[..3].to_string(), stripped[3..].to_string())
        };
        let joined = normalize_segments(&rest, '\\');
        return format!("{root}{joined}").trim_end_matches('\\').to_string()
            + if joined.is_empty() { "\\" } else { "" };
    }
    let absolute = path.starts_with('/');
    let joined = normalize_segments(path, '/');
    match (absolute, joined.is_empty()) {
        (true, _) => format!("/{joined}"),
        (false, true) => ".".to_string(),
        (false, false) => joined,
    }
}

fn normalize_segments(path: &str, sep: char) -> String {
    let mut out: Vec<&str> = Vec::new();
    for segment in path.split(sep) {
        match segment {
            "" | "." => {}
            ".." => {
                if out.last().is_some_and(|s| *s != "..") {
                    out.pop();
                } else if !path.starts_with(sep) {
                    out.push("..");
                }
            }
            s => out.push(s),
        }
    }
    out.join(&sep.to_string())
}

fn split_key(key: &str) -> Option<(&str, CodexHookEvent, usize, usize)> {
    let mut parts = key.rsplitn(4, ':');
    let handler = parse_index(parts.next()?)?;
    let group = parse_index(parts.next()?)?;
    let event = CodexHookEvent::from_label(parts.next()?)?;
    let path = parts.next().filter(|p| !p.is_empty())?;
    Some((path, event, group, handler))
}

fn parse_index(value: &str) -> Option<usize> {
    let canonical = value == "0" || (!value.starts_with('0') && !value.is_empty());
    if canonical && value.bytes().all(|b| b.is_ascii_digit()) {
        value.parse().ok()
    } else {
        None
    }
}

// Windows keys compare case-insensitively and regardless of slash direction.
fn lookup_key(key: &str) -> String {
    let fold = |path: &str| {
        let normalized = normalize_source_path(path);
        if is_windows_path(&normalized) {
            normalized.replace('\\', "/").to_lowercase()
        } else {
            normalized
        }
    };
    match split_key(key) {
        Some((path, event, group, handler)) => {
            format!("{}:{}:{group}:{handler}", fold(path), event.label())
        }
        None => fold(key),
    }
}

// Which slash direction Codex records on Windows is unmeasured, so both forms are written.
fn write_variants(key: &str) -> Vec<String> {
    match split_key(key) {
        Some((path, event, group, handler)) if is_windows_path(path) => {
            let suffix = format!(":{}:{group}:{handler}", event.label());
            let back = format!("{}{suffix}", path.replace('/', "\\"));
            let forward = format!("{}{suffix}", path.replace('\\', "/"));
            if back == forward {
                vec![back]
            } else {
                vec![back, forward]
            }
        }
        _ => vec![key.to_string()],
    }
}

fn format_table_key(key: &str) -> String {
    let windows = split_key(key).is_some_and(|(path, ..)| is_windows_path(path));
    if windows && !key.contains('\'') {
        format!("'{key}'")
    } else {
        format!("\"{}\"", escape_basic(key))
    }
}

// ---- TOML scanning ---------------------------------------------------------------------------

struct Block {
    key: String,
    start: usize,
    /// Just past the last line that is neither blank nor a comment; trailing blank lines and
    /// comments stay outside so edits never eat the spacing that precedes the next table.
    body_end: usize,
    end: usize,
}

struct Line<'a> {
    start: usize,
    next: usize,
    text: &'a str,
}

fn lines(content: &str) -> Vec<Line<'_>> {
    let mut out = Vec::new();
    let mut cursor = 0;
    while cursor < content.len() {
        let end = content[cursor..]
            .find('\n')
            .map_or(content.len(), |i| cursor + i);
        let next = if end < content.len() { end + 1 } else { end };
        let mut text = content[cursor..end].trim_end_matches('\r');
        if cursor == 0 {
            text = text.trim_start_matches('\u{feff}');
        }
        out.push(Line {
            start: cursor,
            next,
            text,
        });
        cursor = next;
    }
    out
}

#[derive(Clone, Copy, Default)]
struct ScanState {
    basic: bool,
    literal: bool,
    array_depth: usize,
}

impl ScanState {
    // Lines inside multiline strings or arrays can look like headers but are data.
    fn structural(self) -> bool {
        !self.basic && !self.literal && self.array_depth == 0
    }

    fn advance(mut self, line: &str) -> Self {
        let b = line.as_bytes();
        let mut i = 0;
        while i < b.len() {
            if self.basic {
                if b[i] == b'\\' {
                    i += 2;
                } else if b[i..].starts_with(b"\"\"\"") {
                    self.basic = false;
                    i += 3;
                } else {
                    i += 1;
                }
                continue;
            }
            if self.literal {
                if b[i..].starts_with(b"'''") {
                    self.literal = false;
                    i += 3;
                } else {
                    i += 1;
                }
                continue;
            }
            match b[i] {
                b'#' => break,
                b'"' if b[i..].starts_with(b"\"\"\"") => {
                    self.basic = true;
                    i += 3;
                }
                b'\'' if b[i..].starts_with(b"'''") => {
                    self.literal = true;
                    i += 3;
                }
                b'"' => {
                    i += 1;
                    while i < b.len() && b[i] != b'"' {
                        i += if b[i] == b'\\' { 2 } else { 1 };
                    }
                    i += 1;
                }
                b'\'' => {
                    i += 1;
                    while i < b.len() && b[i] != b'\'' {
                        i += 1;
                    }
                    i += 1;
                }
                b'[' => {
                    self.array_depth += 1;
                    i += 1;
                }
                b']' => {
                    self.array_depth = self.array_depth.saturating_sub(1);
                    i += 1;
                }
                _ => i += 1,
            }
        }
        self
    }
}

fn find_blocks(content: &str) -> Vec<Block> {
    let mut blocks: Vec<Block> = Vec::new();
    let mut open = false;
    let mut state = ScanState::default();
    for line in lines(content) {
        let trimmed = line.text.trim_start();
        if state.structural() && trimmed.starts_with('[') && is_table_header(trimmed) {
            if open {
                if let Some(block) = blocks.last_mut() {
                    block.end = line.start;
                }
            }
            open = false;
            if let Some(key) = parse_hook_state_key(trimmed) {
                let bom = if line.start == 0 && content.starts_with('\u{feff}') {
                    '\u{feff}'.len_utf8()
                } else {
                    0
                };
                blocks.push(Block {
                    key,
                    start: line.start + bom,
                    body_end: line.next,
                    end: content.len(),
                });
                open = true;
            }
        } else if open {
            let filler = state.structural() && (trimmed.is_empty() || trimmed.starts_with('#'));
            if !filler {
                if let Some(block) = blocks.last_mut() {
                    block.body_end = line.next;
                }
            }
        }
        state = state.advance(line.text);
    }
    blocks
}

fn is_table_header(line: &str) -> bool {
    let b = line.as_bytes();
    let array = line.starts_with("[[");
    let mut i = if array { 2 } else { 1 };
    let mut quote: Option<u8> = None;
    while i < b.len() {
        let c = b[i];
        match quote {
            Some(b'"') if c == b'\\' => {
                i += 2;
                continue;
            }
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None if c == b'"' || c == b'\'' => quote = Some(c),
            None if c == b']' => {
                if array && b.get(i + 1) != Some(&b']') {
                    return false;
                }
                let tail = line[i + if array { 2 } else { 1 }..].trim_start();
                return tail.is_empty() || tail.starts_with('#');
            }
            None => {}
        }
        i += 1;
    }
    false
}

fn parse_hook_state_key(line: &str) -> Option<String> {
    let rest = line.strip_prefix('[')?.trim_start();
    let rest = rest.strip_prefix("hooks")?.trim_start();
    let rest = rest.strip_prefix('.')?.trim_start();
    let rest = rest.strip_prefix("state")?.trim_start();
    let rest = rest.strip_prefix('.')?.trim_start();
    let (key, rest) = parse_quoted(rest)?;
    let rest = rest.trim_start().strip_prefix(']')?.trim_start();
    (rest.is_empty() || rest.starts_with('#')).then_some(key)
}

/// A single-line TOML basic or literal string at the start of `s`, and what follows it.
fn parse_quoted(s: &str) -> Option<(String, &str)> {
    if let Some(rest) = s.strip_prefix('\'') {
        let end = rest.find('\'')?;
        return Some((rest[..end].to_string(), &rest[end + 1..]));
    }
    let rest = s.strip_prefix('"')?;
    let mut value = String::new();
    let mut chars = rest.char_indices();
    while let Some((i, c)) = chars.next() {
        match c {
            '"' => return Some((value, &rest[i + 1..])),
            '\\' => {
                let (_, next) = chars.next()?;
                match next {
                    'n' => value.push('\n'),
                    'r' => value.push('\r'),
                    't' => value.push('\t'),
                    'b' => value.push('\u{8}'),
                    'f' => value.push('\u{c}'),
                    '"' => value.push('"'),
                    '\\' => value.push('\\'),
                    other => {
                        value.push('\\');
                        value.push(other);
                    }
                }
            }
            c => value.push(c),
        }
    }
    None
}

fn parse_basic_value(raw: &str) -> Option<String> {
    let (value, rest) = parse_quoted(raw)?;
    let rest = rest.trim_start();
    (rest.is_empty() || rest.starts_with('#')).then_some(value)
}

/// Raw text after `<name> =` for the first structural assignment of `name` in the block.
fn block_value(content: &str, block: &Block, name: &str) -> Option<String> {
    let body = &content[block.start..block.end];
    let mut state = ScanState::default();
    for (index, line) in lines(body).into_iter().enumerate() {
        if index > 0 && state.structural() {
            let trimmed = line.text.trim_start();
            if let Some(rest) = trimmed.strip_prefix(name) {
                if let Some(value) = rest.trim_start().strip_prefix('=') {
                    let value = value.trim();
                    let value = if value.starts_with('"') || value.starts_with('\'') {
                        value
                    } else {
                        value.split('#').next().unwrap_or_default().trim_end()
                    };
                    return Some(value.to_string());
                }
            }
        }
        state = state.advance(line.text);
    }
    None
}

fn escape_basic(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(source: &str, event: CodexHookEvent, group: usize) -> TrustEntry {
        TrustEntry {
            source_path: source.to_string(),
            event,
            group_index: group,
            handler_index: 0,
            command: "kex # kex-session-hook".to_string(),
            timeout_sec: Some(10),
            is_async: false,
            matcher: None,
            status_message: None,
            additional_context_limit: None,
        }
    }

    #[test]
    fn event_names_round_trip() {
        for event in CodexHookEvent::ALL {
            assert_eq!(CodexHookEvent::from_label(event.label()), Some(event));
            assert_eq!(
                CodexHookEvent::from_hooks_json_name(event.hooks_json_name()),
                Some(event)
            );
        }
        assert_eq!(CodexHookEvent::from_hooks_json_name("Notification"), None);
    }

    #[test]
    fn posix_source_paths_are_normalized_lexically() {
        assert_eq!(
            normalize_source_path("/a/./b//c/../hooks.json"),
            "/a/b/hooks.json"
        );
        assert_eq!(normalize_source_path("/a/b/"), "/a/b");
        assert_eq!(normalize_source_path("/"), "/");
        assert_eq!(
            trust_key("/h/.codex//hooks.json", CodexHookEvent::Stop, 2, 0),
            "/h/.codex/hooks.json:stop:2:0"
        );
    }

    #[test]
    fn windows_source_paths_keep_backslashes_and_drop_device_prefix() {
        assert_eq!(
            normalize_source_path(r"\\?\C:\Users\me\.codex\hooks.json"),
            r"C:\Users\me\.codex\hooks.json"
        );
        assert_eq!(
            normalize_source_path("C:/Users/me/.codex/../.codex/hooks.json"),
            r"C:\Users\me\.codex\hooks.json"
        );
        assert_eq!(normalize_source_path(r"C:\"), r"C:\");
    }

    #[test]
    fn key_split_handles_colons_in_windows_paths() {
        let (path, event, group, handler) =
            split_key(r"C:\Users\me\hooks.json:session_start:3:1").unwrap();
        assert_eq!(path, r"C:\Users\me\hooks.json");
        assert_eq!(event, CodexHookEvent::SessionStart);
        assert_eq!((group, handler), (3, 1));
        assert!(split_key("/x:bogus:0:0").is_none());
        assert!(split_key("/x:stop:01:0").is_none());
    }

    #[test]
    fn matcher_is_ignored_for_events_codex_does_not_match_on() {
        let mut a = entry("/h", CodexHookEvent::Stop, 0);
        let plain = trusted_hash(&a);
        a.matcher = Some("*".into());
        assert_eq!(trusted_hash(&a), plain);
        let mut b = entry("/h", CodexHookEvent::SessionStart, 0);
        let plain = trusted_hash(&b);
        b.matcher = Some("*".into());
        assert_ne!(trusted_hash(&b), plain);
    }

    #[test]
    fn missing_timeout_defaults_to_600_and_zero_clamps_to_one() {
        let mut a = entry("/h", CodexHookEvent::Stop, 0);
        a.timeout_sec = None;
        let mut b = a.clone();
        b.timeout_sec = Some(600);
        assert_eq!(trusted_hash(&a), trusted_hash(&b));
        a.timeout_sec = Some(0);
        b.timeout_sec = Some(1);
        assert_eq!(trusted_hash(&a), trusted_hash(&b));
    }

    #[test]
    fn upsert_into_empty_file_writes_one_table() {
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        let out = upsert_hook_trust("", std::slice::from_ref(&e));
        assert_eq!(
            out,
            format!(
                "[hooks.state.\"/h/hooks.json:stop:1:0\"]\nenabled = true\ntrusted_hash = \"{}\"\n",
                trusted_hash(&e)
            )
        );
        assert_eq!(remove_hook_trust(&out, &[e.key()]), "");
    }

    #[test]
    fn crlf_files_get_crlf_tables_and_round_trip() {
        let original = "a = 1\r\n\r\n[x]\r\nb = 2\r\n";
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        let out = upsert_hook_trust(original, std::slice::from_ref(&e));
        assert!(!out.replace("\r\n", "").contains('\n'));
        assert_eq!(read_trusted_hash(&out, &e.key()), Some(trusted_hash(&e)));
        assert_eq!(remove_hook_trust(&out, &[e.key()]), original);
    }

    #[test]
    fn refresh_keeps_a_user_disabled_hook_disabled_and_the_spacing_after_it() {
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        let original = "[hooks.state.\"/h/hooks.json:stop:1:0\"]\nenabled = false\ntrusted_hash = \"sha256:old\"\n\n# next\n[features]\nhooks = true\n";
        let out = upsert_hook_trust(original, std::slice::from_ref(&e));
        assert_eq!(
            out,
            format!(
                "[hooks.state.\"/h/hooks.json:stop:1:0\"]\nenabled = false\ntrusted_hash = \"{}\"\n\n# next\n[features]\nhooks = true\n",
                trusted_hash(&e)
            )
        );
    }

    #[test]
    fn a_disabled_key_is_written_disabled_whether_new_or_current() {
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        let keys = [e.key()];
        let fresh = upsert_hook_trust_disabling("", std::slice::from_ref(&e), &keys);
        assert!(fresh.contains("enabled = false"));
        assert!(hook_trust_disabled(&fresh, &e.key()));

        let current = upsert_hook_trust("", std::slice::from_ref(&e));
        assert!(!hook_trust_disabled(&current, &e.key()));
        let out = upsert_hook_trust_disabling(&current, std::slice::from_ref(&e), &keys);
        assert_eq!(out, fresh);
        assert_eq!(
            upsert_hook_trust_disabling(&out, std::slice::from_ref(&e), &keys),
            out
        );
    }

    #[test]
    fn duplicate_tables_collapse_into_one() {
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        let original = "[hooks.state.\"/h/hooks.json:stop:1:0\"]\ntrusted_hash = \"sha256:a\"\n\n[hooks.state.\"/h/./hooks.json:stop:1:0\"]\ntrusted_hash = \"sha256:b\"\n";
        let out = upsert_hook_trust(original, std::slice::from_ref(&e));
        assert_eq!(out.matches("[hooks.state.").count(), 1);
        assert_eq!(read_trusted_hash(&out, &e.key()), Some(trusted_hash(&e)));
    }

    #[test]
    fn windows_entries_write_both_slash_forms_and_remove_both() {
        let e = entry(r"C:\Users\me\.codex\hooks.json", CodexHookEvent::Stop, 1);
        let out = upsert_hook_trust("a = 1\n", std::slice::from_ref(&e));
        assert!(out.contains(r"[hooks.state.'C:\Users\me\.codex\hooks.json:stop:1:0']"));
        assert!(out.contains("[hooks.state.'C:/Users/me/.codex/hooks.json:stop:1:0']"));
        assert_eq!(upsert_hook_trust(&out, std::slice::from_ref(&e)), out);
        let lower = "c:/users/me/.codex/hooks.json:stop:1:0".to_string();
        assert_eq!(read_trusted_hash(&out, &lower), Some(trusted_hash(&e)));
        assert_eq!(remove_hook_trust(&out, &[e.key()]), "a = 1\n");
    }

    #[test]
    fn verify_accepts_a_clean_edit_and_rejects_what_would_not_read_back() {
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        let out = upsert_hook_trust("a = 1\n", std::slice::from_ref(&e));
        assert!(verify_hook_trust(&out, std::slice::from_ref(&e)).is_ok());
        assert!(verify_hook_trust("a = 1\n", std::slice::from_ref(&e)).is_err());

        let inline = format!(
            "[hooks.state]\n\"{}\" = {{ trusted_hash = \"{}\" }}\n",
            e.key(),
            trusted_hash(&e)
        );
        let edited = upsert_hook_trust(&inline, std::slice::from_ref(&e));
        assert!(verify_hook_trust(&edited, std::slice::from_ref(&e))
            .unwrap_err()
            .contains("not be valid TOML"));
    }

    #[test]
    fn leading_bom_is_preserved() {
        let original =
            "\u{feff}[hooks.state.\"/h/hooks.json:stop:1:0\"]\ntrusted_hash = \"sha256:a\"\n";
        assert_eq!(
            read_trusted_hash(original, "/h/hooks.json:stop:1:0").as_deref(),
            Some("sha256:a")
        );
        let e = entry("/h/hooks.json", CodexHookEvent::Stop, 1);
        assert!(upsert_hook_trust(original, &[e]).starts_with('\u{feff}'));
    }

    #[test]
    fn headers_inside_multiline_arrays_are_data() {
        let original = "x = [\n\"a\",\n]\n[hooks.state.\"/h/hooks.json:stop:1:0\"]\ntrusted_hash = \"sha256:a\"\n";
        assert_eq!(
            read_trusted_hash(original, "/h/hooks.json:stop:1:0").as_deref(),
            Some("sha256:a")
        );
        let tricky =
            "s = '''\n[hooks.state.\"/h/hooks.json:stop:1:0\"]\ntrusted_hash = \"sha256:a\"\n'''\n";
        assert_eq!(read_trusted_hash(tricky, "/h/hooks.json:stop:1:0"), None);
        assert_eq!(
            remove_hook_trust(tricky, &["/h/hooks.json:stop:1:0".to_string()]),
            tricky
        );
    }
}
