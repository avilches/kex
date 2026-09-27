#!/usr/bin/env bash
# kex-session-v5
[ -n "$KEX_TERMINAL" ] || exit 0
[ -n "$KEX_TAB_ID" ] || exit 0

PAYLOAD="$(cat)"
EVENT="$(printf '%s' "$PAYLOAD" | jq -r '.hook_event_name // empty')"

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

case "$EVENT" in
    SessionStart|UserPromptSubmit|Notification|Stop|StopFailure|SessionEnd|PermissionRequest|MessageDisplay)
        "handle_${EVENT}" ;;
    *) exit 0 ;;
esac
