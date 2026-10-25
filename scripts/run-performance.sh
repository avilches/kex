#!/usr/bin/env bash
# Starts the installed Kex so that WebKit logs every function its JIT compiles,
# with the name and the time it took, to the macOS unified log. Read it back with
# `python3 performance/kexperf.py jit`. Meant for a Kex built with
# `pnpm build:local --performance`, otherwise the names come out mangled.
#
# The WebContent process does not inherit the normal environment, only variables
# with the __XPC_ prefix, and its stderr goes nowhere, hence useOSLog.
#
# The log grows fast and its cost in a big session is not measured: run Kex
# normally (open -a Kex) once you are done investigating.
#
# CLI: scripts/run-performance.sh
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "run-performance.sh only supports macOS." >&2
  exit 1
fi

app="/Applications/Kex.app"
if [[ ! -d "$app" ]]; then
  echo "$app not found. Install it with: pnpm build:local --performance" >&2
  exit 1
fi

# The environment only applies when the process starts, and a second instance
# would share the production data of the first.
if pgrep -f "$app/Contents/MacOS/kex" >/dev/null; then
  echo "Kex is already running. Quit it first, the variables only apply at launch." >&2
  exit 1
fi

open -n "$app" \
  --env __XPC_JSC_reportDFGCompileTimes=true \
  --env __XPC_JSC_useOSLog=true

echo "Kex started with the JIT compile log on."
echo "After a freeze: python3 performance/kexperf.py jit --hours 3"
