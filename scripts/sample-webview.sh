#!/usr/bin/env bash
# Samples the WebKit WebContent process that belongs to a running Kex, so a slow window can be
# inspected natively (style, layout, GC) next to the [profiler] lines in Kex.log. macOS only.
# Usage: scripts/sample-webview.sh [--pid KEX_PID] [--seconds N] [--out DIR]
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "sample-webview.sh only works on macOS" >&2
  exit 1
fi

exec python3 -I - "$@" <<'PY'
import argparse
import ctypes
import os
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--pid", type=int)
parser.add_argument("--seconds", type=int, default=10)
parser.add_argument("--out")
args = parser.parse_args()

libsystem = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
responsible = libsystem.responsibility_get_pid_responsible_for_pid
responsible.argtypes = [ctypes.c_int]
responsible.restype = ctypes.c_int

rows = []
for line in subprocess.run(
    ["ps", "-axo", "pid=,pcpu=,rss=,ucomm="], capture_output=True, text=True, check=True
).stdout.splitlines():
    pid, cpu, rss, ucomm = line.split(None, 3)
    rows.append((int(pid), float(cpu), int(rss), ucomm.strip()))


def command_of(pid):
    return subprocess.run(
        ["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True
    ).stdout.strip()


kexes = {pid: command_of(pid) for pid, _, _, ucomm in rows if ucomm == "kex"}
kexes = {pid: command for pid, command in kexes.items() if command and "<defunct>" not in command}
if args.pid:
    if args.pid not in kexes:
        sys.exit(f"pid {args.pid} is not a running Kex")
    kex_pid = args.pid
elif len(kexes) == 1:
    kex_pid = next(iter(kexes))
elif not kexes:
    sys.exit("no Kex is running")
else:
    for pid, command in kexes.items():
        print(f"{pid}  {command}", file=sys.stderr)
    sys.exit("several Kex are running, pick one with --pid")

webviews = [
    (cpu, pid, rss)
    for pid, cpu, rss, ucomm in rows
    if ucomm.startswith("com.apple.WebKit")
    and responsible(pid) == kex_pid
    and "WebKit.WebContent" in command_of(pid)
]
if not webviews:
    sys.exit(f"Kex {kex_pid} has no WebContent process")
cpu, target, rss = max(webviews)

dev = "target/debug/" in kexes[kex_pid]
out_dir = args.out or os.path.expanduser(
    "~/Library/Logs/app.betauer.kex" + (".dev" if dev else "")
)
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f"sample-{time.strftime('%Y%m%d-%H%M%S')}-{target}.txt")

print(
    f"Kex {kex_pid}: sampling WebContent {target} ({cpu:.0f}% CPU, {rss // 1024} MB) "
    f"for {args.seconds}s of {len(webviews)} webview(s)"
)
subprocess.run(["/usr/bin/sample", str(target), str(args.seconds), "-file", out], check=True)
print(out)
PY
