#!/usr/bin/env bash
# Starts Kex in dev mode as a first-time user: wipes the data of the "onboarding"
# profile (KEX_PROFILE, see docs/USER_DATA.md) and runs `pnpm tauri dev` on it.
# Only touches app.betauer.kex.dev.onboarding, never the real or the dev data.
#
# CLI: scripts/run-onboarding.sh
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "run-onboarding.sh only supports macOS." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

data="$HOME/Library/Application Support/app.betauer.kex.dev.onboarding"
logs="$HOME/Library/Logs/app.betauer.kex.dev.onboarding"

rm -rf "${data:?}"/* "${logs:?}"/* 2>/dev/null || true

KEX_PROFILE=onboarding exec pnpm tauri dev
