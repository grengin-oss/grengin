#!/usr/bin/env bash
# Networked smoke test against the real latest GitHub Release.
# Run on a disposable Linux amd64/arm64 CI runner.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export HOME="$WORK/home"
export GRENGIN_HOME="$HOME/.grengin"
export GRENGIN_BIN_DIR="$HOME/.local/bin"
export GRENGIN_NO_MODIFY_PATH=1
mkdir -p "$HOME"

sh "$ROOT_DIR/install.sh"

"$GRENGIN_BIN_DIR/grengin" version
ACTIVE="$($GRENGIN_BIN_DIR/grengin home)"
test -d "$ACTIVE"
test -f "$ACTIVE/RELEASE-MANIFEST.json" || find "$ACTIVE" -name RELEASE-MANIFEST.json -type f | grep -q .
test -x "$GRENGIN_BIN_DIR/grengin-api"

"$GRENGIN_BIN_DIR/grengin" uninstall
! test -e "$GRENGIN_HOME"

printf 'Real-release smoke test passed.\n'
