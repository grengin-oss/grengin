#!/bin/sh
set -eu

GRENGIN_HOME="${GRENGIN_HOME:-$HOME/.grengin}"
BIN_DIR="${GRENGIN_BIN_DIR:-$HOME/.local/bin}"

printf 'Removing Grengin user installation...\n'
rm -f "$BIN_DIR/grengin" "$BIN_DIR/grengin-api" "$BIN_DIR/sqlx-mcp"
rm -rf "$GRENGIN_HOME"
printf 'Grengin removed.\n'
printf 'Any profile line that sourced %s/env was intentionally left in place; it is harmless when the file is absent.\n' "$GRENGIN_HOME"
