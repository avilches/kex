#!/usr/bin/env bash
# kex-session-v5
[ -n "$KEX_TERMINAL" ] || exit 0
[ -n "$KEX_PANEL_ID" ] || exit 0

PAYLOAD="$(cat)"
EVENT="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // empty')"

# Append full payload to /tmp (does not overwrite).
# Two files: per-event (all panels) and per-panel (all events for this panel).
log_payload() {
    local entry
    entry="$(printf '=== %s ===\n' "$(date)"; printf '%s' "$PAYLOAD" | jq '.'; printf '\n')"
    printf '%s\n' "$entry" >> "/tmp/kex-hook-${EVENT}.log"        2>/dev/null
    printf '%s\n' "$entry" >> "/tmp/kex-panel-${KEX_PANEL_ID}.log" 2>/dev/null
}

emit_kex() {   # args: event extra_fields_percent_encoded
    local event_enc extra PID SID TP CWD seq
    event_enc="$(printf '%s' "$1" | jq -Rr @uri)"
    extra="${2:+;$2}"
    PID="$(printf '%s' "$KEX_PANEL_ID"           | jq -Rr @uri)"
    SID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id      // ""' | jq -Rr @uri)"
    TP="$(printf '%s'  "$PAYLOAD" | jq -r '.transcript_path // ""' | jq -Rr @uri)"
    CWD="$(printf '%s' "$PAYLOAD" | jq -r '.cwd             // ""' | jq -Rr @uri)"
    seq="$(printf '%b' '\033]777;kex;'"${event_enc};${PID};${SID};${TP};${CWD}${extra}"'\007')"
    jq -cn --arg seq "$seq" '{"terminalSequence":$seq}'
}

# Send raw payload to KEX_IPC Unix socket.
# Uses nc -U (BSD/OpenBSD netcat on macOS + most Linux), falls back to python3.
# Fails silently if KEX_IPC is unset or socket is unavailable.
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
" "$KEX_IPC" <<< "$PAYLOAD" 2>/dev/null || true
}

handle_SessionStart() {
    log_payload
    # terminalSequence is not injected by Claude Code for lifecycle hooks.
    # Use Unix socket IPC instead.
    send_ipc
}

handle_UserPromptSubmit() {
    log_payload
    local PROMPT
    PROMPT="$(printf '%s' "$PAYLOAD" | jq -r '.prompt // ""' | cut -c1-512 | jq -Rr @uri)"
    emit_kex "UserPromptSubmit" "$PROMPT"
}

handle_Notification() {
    log_payload
    local TYPE MSG
    TYPE="$(printf '%s' "$PAYLOAD" | jq -r '.notification_type // ""' | jq -Rr @uri)"
    MSG="$(printf '%s'  "$PAYLOAD" | jq -r '.message           // ""' | cut -c1-512 | jq -Rr @uri)"
    emit_kex "Notification" "${TYPE};${MSG}"
}

handle_Stop() {
    log_payload
    local REASON LAST_MSG
    REASON="$(printf '%s'   "$PAYLOAD" | jq -r '.stop_reason            // ""' | jq -Rr @uri)"
    LAST_MSG="$(printf '%s' "$PAYLOAD" | jq -r '.last_assistant_message // ""' | cut -c1-512 | jq -Rr @uri)"
    emit_kex "Stop" "${REASON};${LAST_MSG}"
}

handle_StopFailure() {
    log_payload
    local ETYPE EMSG
    ETYPE="$(printf '%s' "$PAYLOAD" | jq -r '.error_type    // ""' | jq -Rr @uri)"
    EMSG="$(printf '%s'  "$PAYLOAD" | jq -r '.error_message // ""' | cut -c1-512 | jq -Rr @uri)"
    emit_kex "StopFailure" "${ETYPE};${EMSG}"
}

handle_SessionEnd() {
    log_payload
    # Same as SessionStart — terminalSequence not injected.
    send_ipc
}

handle_PermissionRequest() {
    log_payload
    local TOOL
    TOOL="$(printf '%s' "$PAYLOAD" | jq -r '.tool_name // ""' | jq -Rr @uri)"
    emit_kex "PermissionRequest" "$TOOL"
}

handle_MessageDisplay() {
    log_payload
    # Only emit OSC for the final chunk - intermediate streaming deltas are not actionable.
    local FINAL
    FINAL="$(printf '%s' "$PAYLOAD" | jq -r '.final // ""')"
    [ "$FINAL" = "true" ] || return 0
    local TURN_ID DELTA
    TURN_ID="$(printf '%s' "$PAYLOAD" | jq -r '.turn_id // ""' | jq -Rr @uri)"
    DELTA="$(printf '%s'   "$PAYLOAD" | jq -r '.delta   // ""' | cut -c1-512 | jq -Rr @uri)"
    emit_kex "MessageDisplay" "${TURN_ID};${DELTA}"
}

case "$EVENT" in
    SessionStart|UserPromptSubmit|Notification|Stop|StopFailure|SessionEnd|PermissionRequest|MessageDisplay)
        "handle_${EVENT}" ;;
    *) exit 0 ;;
esac
