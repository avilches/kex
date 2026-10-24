#!/usr/bin/env bash
# kex-session-v10
# Some Claude Code versions treat an empty hook stdout as a failure, so `{}` goes out first,
# before any early exit or socket work; Claude reads it as "no output" (no context, no warning).
printf '{}\n'
[ -n "$KEX_TERMINAL" ] || exit 0
[ -n "$KEX_TAB_ID" ] || exit 0

PAYLOAD="$(cat)"
# Tag the agent into the frame so Kex's dispatcher can attribute it without guessing.
# The hook command passes the agent as the first argument (Codex's handlers pass "codex");
# Claude Code's command has none, so it defaults to "claude". OpenCode's plugin writes
# the socket itself with "agent":"opencode".
AGENT="${1:-claude}"
PAYLOAD="$(printf '%s' "$PAYLOAD" | jq -c --arg agent "$AGENT" '. + {"agent": $agent}')"
EVENT="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // empty')"

# Codex documents PascalCase event names, which is unmeasured, so its snake_case spelling
# is sent as the same event. Claude Code's names are matched exactly.
if [ "$AGENT" = "codex" ]; then
    CANONICAL=""
    case "$EVENT" in
        session_start) CANONICAL=SessionStart ;;
        user_prompt_submit) CANONICAL=UserPromptSubmit ;;
        stop) CANONICAL=Stop ;;
        permission_request) CANONICAL=PermissionRequest ;;
        subagent_start) CANONICAL=SubagentStart ;;
        subagent_stop) CANONICAL=SubagentStop ;;
    esac
    if [ -n "$CANONICAL" ]; then
        EVENT="$CANONICAL"
        PAYLOAD="$(printf '%s' "$PAYLOAD" | jq -c --arg event "$EVENT" '.hook_event_name = $event')"
    fi
fi

# Caps the per-tab spool file so a tab that never reopens in Kex (and so
# never drains it) can't grow the file without bound.
MAX_SPOOL_LINES=200

# Appends the undelivered payload to a per-tab spool file that Kex's IPC
# listener replays on startup, so a failed send loses no event. Oldest lines
# are dropped first once the cap is hit, keeping the most recent state.
spool_event() {
    local spool_dir="$HOME/.config/kex/spool"
    local spool_file="$spool_dir/$KEX_TAB_ID.jsonl"
    mkdir -p "$spool_dir" 2>/dev/null || return 0
    printf '%s\n' "$PAYLOAD" >> "$spool_file"
    local lines
    lines="$(wc -l < "$spool_file" 2>/dev/null)"
    if [ -n "$lines" ] && [ "$lines" -gt "$MAX_SPOOL_LINES" ]; then
        # A fixed temp name would race two overlapping rotations (same tab,
        # both crossing the line cap) onto the same file, letting one mv
        # clobber the other's freshly-appended line. Suffix with our own PID
        # so each rotation gets its own temp file.
        # tail reads the file at an instant before the mv below lands, so a third
        # invocation that appends a line in that gap (with the file already at the
        # cap) can lose it. Accepted without a lock: hooks for the same tab fire
        # serially in normal use, and adding sync (e.g. an mkdir-based mutex) would
        # complicate a script that runs on every hook event to close a case that
        # doesn't happen in practice.
        local rotate_tmp="$spool_file.tmp.$$"
        tail -n "$MAX_SPOOL_LINES" "$spool_file" > "$rotate_tmp" 2>/dev/null \
            && mv "$rotate_tmp" "$spool_file"
    fi
}

# Send raw payload to KEX_IPC Unix socket.
# Uses nc -U (BSD/OpenBSD netcat on macOS + most Linux), falls back to python3.
# Spools the event to disk if KEX_IPC is set but neither delivery path works.
send_ipc() {
    [ -n "$KEX_IPC" ] || return 0
    printf '%s\n' "$PAYLOAD" | nc -w 1 -U "$KEX_IPC" 2>/dev/null && return 0
    python3 -c "
import socket, sys
s = socket.socket(socket.AF_UNIX)
s.settimeout(2)
try:
    s.connect(sys.argv[1])
    s.sendall(sys.stdin.buffer.read())
finally:
    s.close()
" "$KEX_IPC" <<< "$PAYLOAD" 2>/dev/null && return 0
    spool_event
}

handle_SessionStart() {
    send_ipc
}

handle_UserPromptSubmit() {
    send_ipc
}

handle_Notification() {
    send_ipc
}

handle_Stop() {
    send_ipc
}

handle_StopFailure() {
    send_ipc
}

handle_SessionEnd() {
    send_ipc
}

handle_PermissionRequest() {
    send_ipc
}

handle_MessageDisplay() {
    send_ipc
}

handle_SubagentStart() {
    send_ipc
}

handle_SubagentStop() {
    send_ipc
}

case "$EVENT" in
    SessionStart|UserPromptSubmit|Notification|Stop|StopFailure|SessionEnd|PermissionRequest|MessageDisplay|SubagentStart|SubagentStop)
        "handle_${EVENT}" ;;
    *) exit 0 ;;
esac
