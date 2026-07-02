#!/usr/bin/env bash
# Recreates the symlinks in user-data/ pointing to Kex runtime directories.
# Safe to run multiple times — existing links are overwritten.
#
# NOTE: ln -sf does NOT replace a symlink that already points to a directory;
# it creates a nested link inside it. We remove first to avoid that.

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

relink() {
    local target="$1" link="$2"
    rm -rf "$link"
    ln -s "$target" "$link"
}

if [[ "$OSTYPE" == darwin* ]]; then
    relink "$HOME/Library/Application Support/app.betauer.kex" "$DIR/config"
    relink "$HOME/Library/Logs/app.betauer.kex"                "$DIR/logs"
elif [[ "$OSTYPE" == linux* ]]; then
    DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
    relink "$DATA/app.betauer.kex"       "$DIR/config"
    relink "$DATA/app.betauer.kex/logs"  "$DIR/logs"
else
    # Windows (Git Bash)
    relink "${APPDATA}/app.betauer.kex"           "$DIR/config"
    relink "${LOCALAPPDATA}/app.betauer.kex/logs" "$DIR/logs"
fi

echo "Symlinks created in $DIR:"
ls -la "$DIR/" | grep -- '->'
