#!/usr/bin/env bash
# Starts the installed Kex with JavaScriptCore options that keep its JIT from
# spending minutes optimizing one huge function (a freeze measured on 2026-10-24,
# see performance/CLAUDE.md). With no arguments it applies the default caps below;
# pass NAME=VALUE pairs to try others, e.g.
#   scripts/run-performance.sh useFTLJIT=false
#   scripts/run-performance.sh --verify
#
# The WebContent process does not inherit the normal environment, only variables
# with the __XPC_ prefix. Do not enable reportDFGCompileTimes: it makes the JIT
# thread ask the main thread for script source and WebKit kills the process in a loop.
#
# CLI: scripts/run-performance.sh [--verify] [NAME=VALUE ...]
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "run-performance.sh only supports macOS." >&2
  exit 1
fi

app="/Applications/Kex.app"
if [[ ! -d "$app" ]]; then
  echo "$app not found. Install it with: pnpm build:local" >&2
  exit 1
fi

if pgrep -f "$app/Contents/MacOS/kex" >/dev/null; then
  echo "Kex is already running. Quit it first, the variables only apply at launch." >&2
  exit 1
fi

verify=0
options=()
for arg in "$@"; do
  if [[ "$arg" == "--verify" ]]; then verify=1; else options+=("$arg"); fi
done
if [[ ${#options[@]} -eq 0 ]]; then
  options=(maximumOptimizationCandidateBytecodeCost=20000 maximumFTLCandidateBytecodeCost=10000)
fi
if [[ $verify -eq 1 ]]; then
  options+=(dumpOptions=1 useOSLog=true)
fi

env_args=()
for opt in "${options[@]}"; do env_args+=(--env "__XPC_JSC_$opt"); done

open -n "$app" "${env_args[@]}"

echo "Kex started with: ${options[*]}"
if [[ $verify -eq 1 ]]; then
  echo "Check delivery: log show --last 1m --predicate 'eventMessage CONTAINS \"maximumOptimizationCandidateBytecodeCost\"'"
fi
