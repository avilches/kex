#!/usr/bin/env bash
# kex-session-v12
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

# Caps on a tab's spool directory, so a tab that never reopens in Kex (and so never drains
# it) can't grow it without bound. Files older than the age cap are deleted too.
MAX_SPOOL_FILES=200
MAX_SPOOL_AGE_MINUTES=10080

# Sortable, collision-free file name: microsecond timestamp (EPOCHREALTIME on bash 5, GNU date
# %N, or whole seconds on macOS where bash is 3.2 and BSD date has no %N), then PID and RANDOM.
# On the seconds fallback, events of one second order by PID, which only matters for hooks that
# fire within the same second.
spool_name() {
    local now
    if [ -n "$EPOCHREALTIME" ]; then
        now="${EPOCHREALTIME/[.,]/}"
    else
        now="$(date +%s%N 2>/dev/null)"
        case "$now" in
            ''|*[!0-9]*) now="$(date +%s)000000" ;;
            *) now="${now%???}" ;;
        esac
    fi
    printf '%016d-%07d-%05d.json' "$now" "$$" "$RANDOM"
}

# Keeps the newest MAX_SPOOL_FILES events and drops what is too old. It only deletes.
prune_spool() {
    local dir="$1" count excess f
    find "$dir" -maxdepth 1 -type f -mmin +"$MAX_SPOOL_AGE_MINUTES" -exec rm -f {} + 2>/dev/null
    count="$(ls -1 "$dir" 2>/dev/null | wc -l | tr -d ' ')"
    if [ -n "$count" ] && [ "$count" -gt "$MAX_SPOOL_FILES" ]; then
        excess=$((count - MAX_SPOOL_FILES))
        ls -1 "$dir" 2>/dev/null | sort | head -n "$excess" | while IFS= read -r f; do
            rm -f "$dir/$f"
        done
    fi
}

# Writes the undelivered payload as its own file in a per-tab spool directory that Kex's IPC
# listener replays on startup, so a failed send loses no event. Nothing already there is ever
# rewritten, so concurrent invocations cannot lose each other's events. The file is written
# under a dot name and renamed, so the listener never reads a half-written one. The listener
# removes the emptied directory after draining, which can land between our mkdir and mv; hence the retry.
spool_event() {
    # The tab id becomes a directory name; nid() ids are [A-Za-z0-9_-], anything else could
    # point outside the spool.
    case "$KEX_TAB_ID" in
        ''|*[!A-Za-z0-9_-]*) return 0 ;;
    esac
    local dir="$HOME/.config/kex/spool/$KEX_TAB_ID" name attempt
    name="$(spool_name)"
    # Payloads carry prompts and paths: keep the directory 0700 and the files 0600.
    umask 077
    for attempt in 1 2 3; do
        mkdir -p "$dir" 2>/dev/null || return 0
        if printf '%s\n' "$PAYLOAD" > "$dir/.$name.tmp" 2>/dev/null \
            && mv "$dir/.$name.tmp" "$dir/$name" 2>/dev/null; then
            prune_spool "$dir"
            return 0
        fi
    done
    return 0
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

handle_PostCompact() {
    send_ipc
}

case "$EVENT" in
    SessionStart|UserPromptSubmit|Notification|Stop|StopFailure|SessionEnd|PermissionRequest|MessageDisplay|SubagentStart|SubagentStop|PostCompact)
        "handle_${EVENT}" ;;
    *) exit 0 ;;
esac
