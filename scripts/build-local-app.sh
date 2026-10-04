#!/usr/bin/env bash
# Fast local build: release profile, macOS .app bundle only (no dmg), no
# updater artifacts so it never asks for TAURI_SIGNING_PRIVATE_KEY. Installs
# straight into /Applications, replacing whatever Kex.app is there.
#
# Does NOT quit or relaunch a running Kex: this script may itself be running
# inside a Kex terminal tab, so killing the app would kill the shell running
# it. Quit and reopen Kex yourself once the copy is done.
#
# CLI: scripts/build-local-app.sh
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "build-local-app.sh only supports macOS (installs into /Applications)." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

pnpm tauri build -b app -c '{"bundle":{"createUpdaterArtifacts":false}}'

bundle="src-tauri/target/release/bundle/macos/Kex.app"
if [[ ! -d "$bundle" ]]; then
  echo "Expected bundle not found at $bundle" >&2
  exit 1
fi

rm -rf /Applications/Kex.app
ditto "$bundle" /Applications/Kex.app

echo
echo "Installed to /Applications/Kex.app."
echo "Quit and reopen Kex yourself to pick up the new build."
