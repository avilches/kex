#!/bin/sh
# kex-statusline-v1
# Claude Code runs this on every status line tick (several a second while streaming), so it
# prints nothing, spawns nothing on a tick it skips, and never waits for Kex.

# Read the whole payload before any exit: Claude writes it to our stdin and an early exit
# could hand it EPIPE.
payload=
while IFS= read -r line || [ -n "$line" ]; do
    payload="$payload$line "
done
[ -n "$KEX_TAB_ID" ] || exit 0
[ -n "$KEX_IPC" ] || exit 0
# Daemon workers inherit a stale tab environment (measured by Orca).
[ -z "$CLAUDE_JOB_DIR" ] || exit 0
# Both ids are pasted into the JSON unescaped, so only the nid() alphabet and digits pass.
case "$KEX_TAB_ID" in
    *[!A-Za-z0-9_-]*) exit 0 ;;
esac
case "${KEX_PTY_ID:-}" in
    *[!0-9]*) exit 0 ;;
esac

# What the UI shows: context use and, for subscribers, the rate limit windows. A tick whose
# reading did not change is sent again only once the interval has passed, which resyncs a Kex
# that restarted; a changed reading goes out at once, and it changes at most once per API call.
reading="${payload#*\"remaining_percentage\":}"
[ "$reading" = "$payload" ] && reading=
reading="${reading%%[,\}]*}"
limits="${payload#*\"rate_limits\":}"
[ "$limits" = "$payload" ] && limits=
limits="${limits%%\}\}*}"
reading="$reading|$limits"

interval="${KEX_STATUSLINE_MIN_POST_INTERVAL_SECONDS:-15}"
case "$interval" in ''|*[!0-9]*) interval=15 ;; esac
# A clock without a process: bash 5 has EPOCHSECONDS; bash 3.2 (macOS /bin/sh) and dash do not,
# and there the session's own total_duration_ms serves, since only the gap between ticks matters.
now="${EPOCHSECONDS:-}"
if [ -z "$now" ]; then
    now="${payload#*\"total_duration_ms\":}"
    [ "$now" = "$payload" ] && now=
    now="${now%%[!0-9]*}"
    [ -n "$now" ] && [ "${#now}" -le 15 ] && now=$((now / 1000))
fi
case "$now" in ''|*[!0-9]*) now=0 ;; esac

stamp_dir="$HOME/.config/kex/statusline"
stamp="$stamp_dir/$KEX_TAB_ID"
last_at=
last_reading=
if [ -f "$stamp" ]; then
    { IFS= read -r last_at; IFS= read -r last_reading; } < "$stamp" 2>/dev/null
fi
case "$last_at" in ''|*[!0-9]*) last_at= ;; esac
if [ "$reading" = "$last_reading" ] && [ -n "$last_at" ] && [ "${#last_at}" -le 15 ]; then
    elapsed=$((now - last_at))
    [ "$elapsed" -ge 0 ] && [ "$elapsed" -lt "$interval" ] && exit 0
fi
umask 077
[ -d "$stamp_dir" ] || mkdir -p "$stamp_dir" 2>/dev/null
printf '%s\n%s\n' "$now" "$reading" 2>/dev/null > "$stamp"

# Same frame shape as trigger-event.sh, with the ids set last so the payload cannot pick them
# (a repeated key keeps its last value). Nothing is spooled: an old reading is worthless.
payload="${payload%"${payload##*[!\ ]}"}"
case "$payload" in
    '{}') exit 0 ;;
    '{'*'}') ;;
    *) exit 0 ;;
esac
frame="${payload%\}},\"hook_event_name\":\"StatusLine\",\"agent\":\"claude\",\"tab_id\":\"$KEX_TAB_ID\",\"pty_id\":\"${KEX_PTY_ID:-}\"}"
# In the background with its output redirected, so Claude's status line never waits on the
# socket and the pipe it reads closes as soon as this script exits. GNU and busybox nc have no
# -U and fail at once, which is what hands the frame to python3, as in trigger-event.sh; both
# give up within a second, so nothing outlives the send.
{
    printf '%s\n' "$frame" | nc -w 1 -U "$KEX_IPC" \
        || printf '%s\n' "$frame" | python3 -c "
import socket, sys
s = socket.socket(socket.AF_UNIX)
s.settimeout(1)
s.connect(sys.argv[1])
s.sendall(sys.stdin.buffer.read())
" "$KEX_IPC"
} >/dev/null 2>&1 </dev/null &
exit 0
