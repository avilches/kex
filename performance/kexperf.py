#!/usr/bin/env python3
"""Performance tools for Kex on macOS. Read performance/CLAUDE.md first.

  kexperf.py status                      running Kex instances and their webview processes
  kexperf.py sample [--pid N]            native sample of one Kex webview
  kexperf.py watch [--above 60]          sample automatically when a webview stays hot
  kexperf.py analyze FILE [FILE...]      where the main thread of a sample spends its time
  kexperf.py profiler [--hours N]        summary of the [profiler] lines in Kex.log
"""
import argparse
import ctypes
import glob
import json
import os
import re
import statistics
import subprocess
import sys
import time

LOG_DIRS = {False: "~/Library/Logs/app.betauer.kex", True: "~/Library/Logs/app.betauer.kex.dev"}
LOG_LINE = re.compile(r"^\[(\d{4}-\d{2}-\d{2})\]\[(\d{2}:\d{2}:\d{2})\]\[[^\]]*\]\[(\w+)\] (.*)$")
PROFILER_PREFIX = "[profiler] "
TREE_LINE = re.compile(r"^([ +!:|]*?)(\d+) (.+)$")
THREAD_LINE = re.compile(r"^    \d+ Thread_")

# Main-thread share measured on 2026-10-20 with the same keys, for comparison.
BASELINE = {
    "healthy": {"idle": 62, "rendering": 19, "layout": 5, "style": 3, "javascript": 3},
    "slow": {"idle": 4, "rendering": 74, "layout": 20, "style": 17, "javascript": 14},
}
MAIN_THREAD_KEYS = {
    "idle": "mach_msg2_trap",
    "run_from_timers": "WebCore::timerFired",
    "rendering": "WebPage::updateRendering",
    "layout": "Document::updateLayout",
    "style": "Style::TreeResolver::resolve",
    "javascript": "serviceRequestAnimationFrame",
    "paint": "RenderLayerBacking::paintContents",
    "gpu_flush": "prepareForDisplay",
    "dom_timers": "DOMTimer::fired",
    "ipc": "IPC::Connection::dispatchMessage",
    "gc": "Heap::collect",
}


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stdout


_responsible = None


def responsible_pid(pid):
    global _responsible
    if _responsible is None:
        fn = ctypes.CDLL("/usr/lib/libSystem.B.dylib").responsibility_get_pid_responsible_for_pid
        fn.argtypes = [ctypes.c_int]
        fn.restype = ctypes.c_int
        _responsible = fn
    return _responsible(pid)


def command_of(pid):
    return run(["ps", "-p", str(pid), "-o", "command="]).strip()


def process_rows():
    rows = []
    for line in run(["ps", "-axo", "pid=,ppid=,pcpu=,rss=,ucomm="]).splitlines():
        pid, ppid, cpu, rss, ucomm = line.split(None, 4)
        rows.append({"pid": int(pid), "ppid": int(ppid), "cpu": float(cpu), "rss_mb": int(rss) // 1024, "ucomm": ucomm.strip()})
    return rows


def kex_instances(rows=None):
    rows = rows or process_rows()
    kex = {r["pid"]: r for r in rows if r["ucomm"] == "kex"}
    found = []
    for pid, row in kex.items():
        command = command_of(pid)
        if not command or "<defunct>" in command or row["ppid"] in kex:
            continue
        found.append({**row, "command": command, "dev": "target/debug/" in command})
    return found


def webviews_of(kex_pid, rows):
    out = {"webcontent": [], "gpu": [], "networking": []}
    for row in rows:
        if not row["ucomm"].startswith("com.apple.WebKit") or responsible_pid(row["pid"]) != kex_pid:
            continue
        command = command_of(row["pid"])
        for kind, marker in (("webcontent", "WebKit.WebContent"), ("gpu", "WebKit.GPU"), ("networking", "WebKit.Networking")):
            if marker in command:
                out[kind].append(row)
    return out


def instant_cpu():
    """Per-pid CPU over a one second window; `ps` only gives a decaying average."""
    text = run(["top", "-l", "2", "-s", "1", "-o", "cpu", "-n", "40", "-stats", "pid,cpu"])
    block = text.split("PID")[-1]
    cpu = {}
    for line in block.splitlines()[1:]:
        parts = line.split()
        if len(parts) == 2 and parts[0].isdigit():
            cpu[int(parts[0])] = float(parts[1])
    return cpu


def log_dir(instance, override=None):
    return os.path.expanduser(override or LOG_DIRS[instance["dev"]])


def pick_instance(instances, pid):
    if pid:
        match = [i for i in instances if i["pid"] == pid]
        if not match:
            sys.exit(f"pid {pid} is not a running Kex")
        return match[0]
    if len(instances) == 1:
        return instances[0]
    if not instances:
        sys.exit("no Kex is running")
    for i in instances:
        print(f"{i['pid']}  {i['command']}", file=sys.stderr)
    sys.exit("several Kex are running, pick one with --pid")


def take_sample(instance, webview, seconds, out_dir, prefix="sample"):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{prefix}-{time.strftime('%Y%m%d-%H%M%S')}-{webview['pid']}.txt")
    subprocess.run(["/usr/bin/sample", str(webview["pid"]), str(seconds), "-file", path], capture_output=True, check=True)
    return path


def cmd_status(args):
    rows = process_rows()
    instances = kex_instances(rows)
    if not instances:
        print("no Kex is running")
    cpu = instant_cpu() if instances else {}
    for inst in instances:
        kind = "dev build" if inst["dev"] else "app"
        print(f"Kex {inst['pid']} ({kind}) {inst['command']}")
        views = webviews_of(inst["pid"], rows)
        for label in ("webcontent", "gpu", "networking"):
            for v in views[label]:
                print(f"  {label:<10} {v['pid']:>6}  {cpu.get(v['pid'], 0.0):5.1f}% CPU  {v['rss_mb']:>5} MB")


def cmd_sample(args):
    rows = process_rows()
    instance = pick_instance(kex_instances(rows), args.pid)
    views = webviews_of(instance["pid"], rows)["webcontent"]
    if not views:
        sys.exit(f"Kex {instance['pid']} has no WebContent process")
    cpu = instant_cpu()
    target = max(views, key=lambda v: cpu.get(v["pid"], 0.0))
    print(f"Kex {instance['pid']}: sampling WebContent {target['pid']} ({cpu.get(target['pid'], 0.0):.0f}% CPU, {target['rss_mb']} MB) for {args.seconds}s")
    print(take_sample(instance, target, args.seconds, log_dir(instance, args.out)))


def cmd_watch(args):
    hot = {}
    last = {}
    print(f"watching every {args.every}s, sampling {args.seconds}s when a webview stays at {args.above}% CPU or more", flush=True)
    while True:
        rows = process_rows()
        instances = [i for i in kex_instances(rows) if not args.pid or i["pid"] == args.pid]
        cpu = instant_cpu() if instances else {}
        for inst in instances:
            views = webviews_of(inst["pid"], rows)["webcontent"]
            if not views:
                continue
            target = max(views, key=lambda v: cpu.get(v["pid"], 0.0))
            now_cpu = cpu.get(target["pid"], 0.0)
            hot[inst["pid"]] = hot.get(inst["pid"], 0) + 1 if now_cpu >= args.above else 0
            if hot[inst["pid"]] >= 2 and time.time() - last.get(inst["pid"], 0) > args.cooldown:
                print(f"{time.strftime('%H:%M:%S')} Kex {inst['pid']}: WebContent {target['pid']} at {now_cpu:.0f}% CPU, sampling", flush=True)
                path = take_sample(inst, target, args.seconds, log_dir(inst, args.out), prefix="sample-auto")
                last[inst["pid"]] = time.time()
                hot[inst["pid"]] = 0
                print(f"{time.strftime('%H:%M:%S')} {path}", flush=True)
                if args.once:
                    return
        time.sleep(args.every)


def main_thread_shares(path):
    """Share of the main thread (percent) per key, plus the process footprint line."""
    with open(path, errors="replace") as f:
        lines = f.read().split("\n")
    start = next((i for i, l in enumerate(lines) if "main-thread" in l and "Thread_" in l), None)
    if start is None:
        sys.exit(f"{path}: no main thread found, is it a sample of a WebContent process?")
    end = next((i for i in range(start + 1, len(lines)) if THREAD_LINE.match(lines[i])), len(lines))
    counts = []
    for line in lines[start:end]:
        m = TREE_LINE.match(line)
        if m:
            counts.append((int(m.group(2)), m.group(3)))
    total = counts[0][0]
    shares = {}
    for key, needle in MAIN_THREAD_KEYS.items():
        best = max((c for c, text in counts if needle in text), default=0)
        shares[key] = round(100 * best / total, 1)
    footprint = next((l.strip() for l in lines if l.startswith("Physical footprint:")), "")
    return {"samples": total, "shares": shares, "footprint": footprint}


def verdict(shares):
    if shares["idle"] >= 50:
        return "healthy: the main thread is mostly asleep"
    if shares["idle"] >= 20:
        return "busy: the main thread has little spare time"
    biggest = max(("layout", "style", "javascript", "paint", "dom_timers", "gc"), key=lambda k: shares[k])
    return f"saturated: main thread asleep {shares['idle']}% of the time, largest cost is {biggest} ({shares[biggest]}%)"


def cmd_analyze(args):
    for path in args.files:
        result = main_thread_shares(path)
        s = result["shares"]
        print(f"\n{os.path.basename(path)}  ({result['samples']} main thread samples)  {result['footprint']}")
        print(f"{'':<14}{'this':>7}{'healthy':>9}{'slow':>7}   (percent of the main thread, 2026-10-20 baselines)")
        for key in ("idle", "rendering", "layout", "style", "javascript"):
            print(f"{key:<14}{s[key]:>7}{BASELINE['healthy'][key]:>9}{BASELINE['slow'][key]:>7}")
        for key in ("run_from_timers", "paint", "gpu_flush", "dom_timers", "ipc", "gc"):
            print(f"{key:<14}{s[key]:>7}")
        print("verdict:", verdict(s))


def read_profiler_reports(directory, since):
    reports = []
    for path in sorted(glob.glob(os.path.join(directory, "Kex*.log"))):
        with open(path, errors="replace") as f:
            for line in f:
                m = LOG_LINE.match(line.rstrip("\n"))
                if not m or not m.group(4).startswith(PROFILER_PREFIX + "{"):
                    continue
                stamp = f"{m.group(1)} {m.group(2)}"
                if stamp < since:
                    continue
                try:
                    reports.append((stamp, json.loads(m.group(4)[len(PROFILER_PREFIX):])))
                except json.JSONDecodeError:
                    continue
    reports.sort(key=lambda r: r[0])
    return reports


def cmd_profiler(args):
    since = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - args.hours * 3600))
    directory = os.path.expanduser(args.out or LOG_DIRS[args.dev])
    reports = read_profiler_reports(directory, since)
    if not reports:
        sys.exit(f"no [profiler] lines in {directory} for the last {args.hours} hours; is the profiler on (Settings > General > Diagnostics)?")
    shares = sorted(r["rafShare"] for _, r in reports)
    print(f"{len(reports)} reports from {reports[0][0]} to {reports[-1][0]}, windows: {sorted({r.get('window', '?') for _, r in reports})}")
    print(f"rafShare  median {statistics.median(shares)}  p90 {shares[int(len(shares) * 0.9)]}  max {shares[-1]}")
    print(f"jank frames (>=100 ms): {sum(r['jankFrames'] for _, r in reports)} in {sum(1 for _, r in reports if r['jankFrames'])} reports, worst gap {max(r['worstGapMs'] for _, r in reports)} ms")
    census = [r["census"] for _, r in reports]
    for key in ("nodes", "xterms", "domRendererTerminals", "webglTerminals", "domRows"):
        values = [c[key] for c in census]
        print(f"census {key:<22} min {min(values):>6}  last {values[-1]:>6}  max {max(values):>6}")
    print("\nworst windows (by jank frames, then rafShare):")
    worst = sorted(reports, key=lambda r: (r[1]["jankFrames"], r[1]["rafShare"]), reverse=True)[: args.top]
    for stamp, r in worst:
        print(f"  {stamp}  window {r.get('window', '?')}  rafShare {r['rafShare']}  jank {r['jankFrames']}  worst gap {r['worstGapMs']} ms")
    origins = {}
    for _, r in reports:
        for t in r["top"]:
            agg = origins.setdefault(t["origin"], [0, 0])
            agg[0] += t["ms"]
            agg[1] += t["calls"]
    print("\ncallbacks that took the most time overall:")
    for origin, (ms, calls) in sorted(origins.items(), key=lambda kv: -kv[1][0])[: args.top]:
        print(f"  {ms:>8} ms  {calls:>7} calls  avg {ms / calls:5.1f}  {origin[:170]}")


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status").set_defaults(run=cmd_status)

    p = sub.add_parser("sample")
    p.add_argument("--pid", type=int, help="Kex pid, needed when several Kex run")
    p.add_argument("--seconds", type=int, default=10)
    p.add_argument("--out", help="folder for the sample, default the logs folder of that Kex")
    p.set_defaults(run=cmd_sample)

    p = sub.add_parser("watch")
    p.add_argument("--pid", type=int, help="watch only this Kex, default every Kex that runs")
    p.add_argument("--above", type=float, default=60.0, help="CPU percent that counts as hot")
    p.add_argument("--every", type=int, default=10, help="seconds between checks")
    p.add_argument("--cooldown", type=int, default=600, help="minimum seconds between samples of one Kex")
    p.add_argument("--seconds", type=int, default=10)
    p.add_argument("--out")
    p.add_argument("--once", action="store_true", help="exit after the first sample")
    p.set_defaults(run=cmd_watch)

    p = sub.add_parser("analyze")
    p.add_argument("files", nargs="+")
    p.set_defaults(run=cmd_analyze)

    p = sub.add_parser("profiler")
    p.add_argument("--hours", type=float, default=24.0)
    p.add_argument("--dev", action="store_true", help="read the logs of the dev build")
    p.add_argument("--out", help="logs folder, overrides --dev")
    p.add_argument("--top", type=int, default=8)
    p.set_defaults(run=cmd_profiler)
    return parser


if __name__ == "__main__":
    if sys.platform != "darwin":
        sys.exit("kexperf.py only works on macOS")
    args = build_parser().parse_args()
    try:
        args.run(args)
    except KeyboardInterrupt:
        pass
