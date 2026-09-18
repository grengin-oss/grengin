#!/bin/sh
# Grengin release installer for Linux amd64/arm64.
# Intended usage:
#   curl --proto '=https' --tlsv1.2 -sSf \
#     https://meta.grengin.com/install.sh | sh

set -eu

REPO="${GRENGIN_REPO:-grengin-oss/grengin}"
GRENGIN_HOME="${GRENGIN_HOME:-$HOME/.grengin}"
BIN_DIR="${GRENGIN_BIN_DIR:-$HOME/.local/bin}"
REQUESTED_VERSION="${GRENGIN_VERSION:-latest}"
NO_MODIFY_PATH="${GRENGIN_NO_MODIFY_PATH:-0}"
GITHUB_BASE="${GRENGIN_GITHUB_BASE:-https://github.com}"
INSTALL_SCRIPT_URL="${GRENGIN_INSTALL_URL:-https://meta.grengin.com/install.sh}"

say() { printf '%s\n' "$*"; }
info() { printf '\033[1;34minfo:\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT HUP INT TERM

need curl
need tar
need uname
need awk
need grep
need sed
need find
need wc
need head
need cp
need mv
need ln
need chmod
need mkdir
need rm

OS="${GRENGIN_OS:-$(uname -s)}"
case "$OS" in
  Linux) PLATFORM="linux" ;;
  Darwin)
    die "macOS prebuilt release assets are not published yet; this installer currently supports Linux"
    ;;
  *)
    die "unsupported operating system: $OS (supported: Linux)"
    ;;
esac

MACHINE="${GRENGIN_ARCH:-$(uname -m)}"
case "$MACHINE" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) die "unsupported CPU architecture: $MACHINE (supported: amd64, arm64)" ;;
esac

say ""
say "  Grengin installer"
say "  -----------------"
info "target: $PLATFORM/$ARCH"
info "install root: $GRENGIN_HOME"
info "command directory: $BIN_DIR"

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t grengin) || die "could not create temporary directory"

# Resolve the latest tag using GitHub's stable /releases/latest redirect. This
# avoids depending on jq or on unauthenticated GitHub API rate limits.
if [ "$REQUESTED_VERSION" = "latest" ]; then
  info "resolving latest stable release"
  LATEST_URL="$GITHUB_BASE/$REPO/releases/latest"
  EFFECTIVE_URL=$(curl --proto '=https' --tlsv1.2 -fsSL \
    -o /dev/null -w '%{url_effective}' \
    -H 'User-Agent: grengin-installer' \
    "$LATEST_URL") || die "failed to resolve latest Grengin release"
  TAG=${EFFECTIVE_URL##*/}
  case "$TAG" in
    v[0-9]*|[0-9]*) ;;
    *) die "could not determine latest release tag from: $EFFECTIVE_URL" ;;
  esac
else
  case "$REQUESTED_VERSION" in
    v*) TAG="$REQUESTED_VERSION" ;;
    *) TAG="v$REQUESTED_VERSION" ;;
  esac
fi

VERSION=${TAG#v}
[ -n "$VERSION" ] || die "empty release version"

DOWNLOAD_ROOT="$GITHUB_BASE/$REPO/releases/download/$TAG"

# The documented release contract uses the version without the leading v.
# The second candidate makes the installer tolerant of a future/past release
# that may have used the tag verbatim in asset filenames.
ASSET_A="grengin-$VERSION-$PLATFORM-$ARCH.tar.gz"
ASSET_B="grengin-$TAG-$PLATFORM-$ARCH.tar.gz"
SUMS_A="grengin-$VERSION-SHA256SUMS.txt"
SUMS_B="grengin-$TAG-SHA256SUMS.txt"

ARCHIVE_PATH="$TMP_DIR/grengin.tar.gz"
CHECKSUM_PATH="$TMP_DIR/SHA256SUMS.txt"
ARCHIVE_NAME=""

fetch_asset() {
  name=$1
  output=$2
  url="$DOWNLOAD_ROOT/$name"
  curl --proto '=https' --tlsv1.2 -fL --retry 3 --retry-delay 1 \
    -H 'User-Agent: grengin-installer' \
    -o "$output" "$url"
}

info "downloading Grengin $VERSION for $PLATFORM/$ARCH"
if fetch_asset "$ASSET_A" "$ARCHIVE_PATH"; then
  ARCHIVE_NAME="$ASSET_A"
elif [ "$ASSET_B" != "$ASSET_A" ] && fetch_asset "$ASSET_B" "$ARCHIVE_PATH"; then
  ARCHIVE_NAME="$ASSET_B"
else
  die "release $TAG does not provide a $PLATFORM-$ARCH bundle"
fi

if fetch_asset "$SUMS_A" "$CHECKSUM_PATH"; then
  :
elif [ "$SUMS_B" != "$SUMS_A" ] && fetch_asset "$SUMS_B" "$CHECKSUM_PATH"; then
  :
else
  die "release $TAG does not provide the documented SHA-256 checksum file"
fi

EXPECTED_SHA=$(awk -v f="$ARCHIVE_NAME" '$0 ~ ("[ *]" f "$") { print $1; exit }' "$CHECKSUM_PATH")
[ -n "$EXPECTED_SHA" ] || die "checksum for $ARCHIVE_NAME was not found in the release checksum file"

case "$EXPECTED_SHA" in
  *[!0-9A-Fa-f]*|'') die "invalid SHA-256 value in checksum file" ;;
esac
[ "${#EXPECTED_SHA}" -eq 64 ] || die "invalid SHA-256 length in checksum file"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')
else
  die "sha256sum or shasum is required to verify the release"
fi

[ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] || die "SHA-256 verification failed for $ARCHIVE_NAME"
ok "SHA-256 verified"

# Reject obvious path traversal before extraction.
if tar -tzf "$ARCHIVE_PATH" | awk '
  /^\// { bad=1 }
  /(^|\/)\.\.($|\/)/ { bad=1 }
  END { exit bad ? 0 : 1 }
'; then
  die "release archive contains an unsafe path"
fi

EXTRACT_DIR="$TMP_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"

ENTRY_COUNT=$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 | wc -l | awk '{print $1}')
FIRST_ENTRY=$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 | head -n 1 || true)
if [ "$ENTRY_COUNT" = "1" ] && [ -d "$FIRST_ENTRY" ]; then
  PAYLOAD_ROOT="$FIRST_ENTRY"
else
  PAYLOAD_ROOT="$EXTRACT_DIR"
fi

API_BIN=$(find "$PAYLOAD_ROOT" -type f -name grengin-api | head -n 1 || true)
SQLX_BIN=$(find "$PAYLOAD_ROOT" -type f -name sqlx-mcp | head -n 1 || true)
MANIFEST=$(find "$PAYLOAD_ROOT" -type f -name RELEASE-MANIFEST.json | head -n 1 || true)

[ -n "$API_BIN" ] || die "release archive does not contain grengin-api"
[ -n "$MANIFEST" ] || die "release archive does not contain RELEASE-MANIFEST.json"

mkdir -p "$GRENGIN_HOME/versions" "$BIN_DIR"
VERSION_DIR="$GRENGIN_HOME/versions/$VERSION"
STAGING_DIR="$GRENGIN_HOME/versions/.${VERSION}.installing.$$"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
cp -R "$PAYLOAD_ROOT"/. "$STAGING_DIR"/

API_REL=${API_BIN#"$PAYLOAD_ROOT"/}
[ "$API_REL" != "$API_BIN" ] || die "failed to locate grengin-api inside release payload"
if [ -n "$SQLX_BIN" ]; then
  SQLX_REL=${SQLX_BIN#"$PAYLOAD_ROOT"/}
else
  SQLX_REL=""
fi

chmod +x "$STAGING_DIR/$API_REL"
if [ -n "$SQLX_REL" ]; then
  chmod +x "$STAGING_DIR/$SQLX_REL"
fi

# Do not disturb the current installation until the full new payload exists.
OLD_DIR=""
if [ -e "$VERSION_DIR" ]; then
  OLD_DIR="$GRENGIN_HOME/versions/.${VERSION}.old.$$"
  rm -rf "$OLD_DIR"
  mv "$VERSION_DIR" "$OLD_DIR"
fi
mv "$STAGING_DIR" "$VERSION_DIR"
ln -sfn "$VERSION_DIR" "$GRENGIN_HOME/current.new"
mv -f "$GRENGIN_HOME/current.new" "$GRENGIN_HOME/current"
printf '%s\n' "$VERSION" > "$GRENGIN_HOME/version"
[ -z "$OLD_DIR" ] || rm -rf "$OLD_DIR"

ln -sfn "$VERSION_DIR/$API_REL" "$BIN_DIR/grengin-api"
if [ -n "$SQLX_REL" ]; then
  ln -sfn "$VERSION_DIR/$SQLX_REL" "$BIN_DIR/sqlx-mcp"
else
  rm -f "$BIN_DIR/sqlx-mcp"
fi

# Install a small manager command. It deliberately does not attempt to run the
# static frontend as a production web server; the release bundle is preserved
# intact under ~/.grengin/current for deployment by the user's web server.
cat > "$BIN_DIR/grengin" <<EOF_MANAGER
#!/bin/sh
set -eu
GRENGIN_HOME="\${GRENGIN_HOME:-$GRENGIN_HOME}"
BIN_DIR="\${GRENGIN_BIN_DIR:-$BIN_DIR}"
INSTALL_URL="\${GRENGIN_INSTALL_URL:-$INSTALL_SCRIPT_URL}"

usage() {
  cat <<'HELP'
Grengin release manager

Usage:
  grengin version        Show installed product version
  grengin home           Show the active release directory
  grengin api [args...]  Run grengin-api
  grengin sqlx-mcp ...   Run sqlx-mcp when present
  grengin update         Install the latest stable release
  grengin uninstall      Remove this user installation
HELP
}

case "\${1:-}" in
  version|--version|-V)
    printf 'grengin %s\\n' "\$(cat "\$GRENGIN_HOME/version")"
    ;;
  home)
    printf '%s\\n' "\$GRENGIN_HOME/current"
    ;;
  api)
    shift
    exec "\$BIN_DIR/grengin-api" "\$@"
    ;;
  sqlx-mcp)
    shift
    [ -x "\$BIN_DIR/sqlx-mcp" ] || { echo 'sqlx-mcp is not installed in this release' >&2; exit 1; }
    exec "\$BIN_DIR/sqlx-mcp" "\$@"
    ;;
  update)
    need_curl() { command -v curl >/dev/null 2>&1 || { echo 'curl is required for update' >&2; exit 1; }; }
    need_curl
    curl --proto '=https' --tlsv1.2 -sSf "\$INSTALL_URL" | \
      GRENGIN_HOME="\$GRENGIN_HOME" GRENGIN_BIN_DIR="\$BIN_DIR" sh
    ;;
  uninstall)
    printf 'Removing Grengin from %s\\n' "\$GRENGIN_HOME"
    rm -f "\$BIN_DIR/grengin-api" "\$BIN_DIR/sqlx-mcp" "\$BIN_DIR/grengin"
    rm -rf "\$GRENGIN_HOME"
    printf 'Grengin removed. Profile PATH entries, if any, were left unchanged.\\n'
    ;;
  ''|-h|--help|help)
    usage
    ;;
  *)
    echo "unknown command: \$1" >&2
    usage >&2
    exit 2
    ;;
esac
EOF_MANAGER
chmod +x "$BIN_DIR/grengin"

# rustup-like environment helper.
cat > "$GRENGIN_HOME/env" <<EOF_ENV
# Generated by the Grengin installer.
case ":\$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) export PATH="$BIN_DIR:\$PATH" ;;
esac
EOF_ENV

PATH_CHANGED=0
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) PATH_CHANGED=1 ;;
esac

PROFILE_CHANGED=0
if [ "$PATH_CHANGED" -eq 1 ] && [ "$NO_MODIFY_PATH" != "1" ]; then
  # Profiles source the generated environment file so custom install locations
  # continue to work without hard-coding ~/.local/bin.
  ENV_LINE="[ -f \"$GRENGIN_HOME/env\" ] && . \"$GRENGIN_HOME/env\""
  append_env_line() {
    profile=$1
    if [ ! -e "$profile" ]; then
      : > "$profile"
    fi
    if ! grep -F "$ENV_LINE" "$profile" >/dev/null 2>&1; then
      printf '\n# Grengin\n%s\n' "$ENV_LINE" >> "$profile"
      PROFILE_CHANGED=1
    fi
  }

  append_env_line "$HOME/.profile"
  case "${SHELL:-}" in
    */bash) append_env_line "$HOME/.bashrc" ;;
    */zsh) append_env_line "$HOME/.zshrc" ;;
  esac
fi

ok "Grengin $VERSION installed"
say ""
say "Installed commands:"
say "  $BIN_DIR/grengin"
say "  $BIN_DIR/grengin-api"
if [ -n "$SQLX_REL" ]; then
  say "  $BIN_DIR/sqlx-mcp"
fi
say ""
say "Release bundle:"
say "  $GRENGIN_HOME/current"
say ""
if [ "$PATH_CHANGED" -eq 1 ]; then
  say "For this shell, run:"
  say "  . \"$GRENGIN_HOME/env\""
  [ "$PROFILE_CHANGED" -eq 1 ] && say "Future shells will source the same environment file automatically."
else
  say "Run: grengin version"
fi
say ""
say "Runtime note: grengin-api still needs PostgreSQL 16+ with pgvector/ltree"
say "and DATABASE_URL, JWT_SECRET, APP_KEY, and REDIRECT_URL configuration."
