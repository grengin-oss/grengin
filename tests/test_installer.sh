#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAKE_HOME="$WORK/home"
FAKE_BIN="$WORK/home/.local/bin"
FAKE_RELEASE="$WORK/release"
MOCK_BIN="$WORK/mock-bin"
mkdir -p "$FAKE_HOME" "$FAKE_RELEASE" "$MOCK_BIN"

VERSION=9.9.9
TAG="v$VERSION"
ARCH="amd64"
ASSET="grengin-$VERSION-linux-$ARCH.tar.gz"
SUMS="grengin-$VERSION-SHA256SUMS.txt"
PAYLOAD="$WORK/payload/grengin-$VERSION-linux-$ARCH"
mkdir -p "$PAYLOAD/bin" "$PAYLOAD/frontend/assets"

cat > "$PAYLOAD/bin/grengin-api" <<'SCRIPT'
#!/bin/sh
printf 'mock grengin-api ok %s\n' "${1:-}"
SCRIPT
chmod +x "$PAYLOAD/bin/grengin-api"

cat > "$PAYLOAD/bin/sqlx-mcp" <<'SCRIPT'
#!/bin/sh
printf 'mock sqlx-mcp ok %s\n' "${1:-}"
SCRIPT
chmod +x "$PAYLOAD/bin/sqlx-mcp"

printf '<!doctype html><title>Grengin mock</title>\n' > "$PAYLOAD/frontend/index.html"
printf '{"product":"grengin","version":"9.9.9","platform":"linux","arch":"amd64"}\n' > "$PAYLOAD/RELEASE-MANIFEST.json"

tar -czf "$FAKE_RELEASE/$ASSET" -C "$WORK/payload" "$(basename "$PAYLOAD")"
SHA="$(sha256sum "$FAKE_RELEASE/$ASSET" | awk '{print $1}')"
printf '%s  %s\n' "$SHA" "$ASSET" > "$FAKE_RELEASE/$SUMS"

REAL_CURL="$(command -v curl)"
cat > "$MOCK_BIN/curl" <<EOF_CURL
#!/usr/bin/env bash
set -euo pipefail
out=""
write_effective=0
url=""
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    -o|--output)
      out="\$2"; shift 2 ;;
    -w|--write-out)
      [[ "\$2" == *url_effective* ]] && write_effective=1
      shift 2 ;;
    -H|--header|--retry|--retry-delay|--proto|--tlsv1.2)
      if [[ "\$1" == "-H" || "\$1" == "--header" || "\$1" == "--retry" || "\$1" == "--retry-delay" || "\$1" == "--proto" ]]; then shift 2; else shift; fi ;;
    -*) shift ;;
    *) url="\$1"; shift ;;
  esac
done
if [[ "\$url" == */releases/latest ]]; then
  if [[ -n "\$out" && "\$out" != "/dev/null" ]]; then : > "\$out"; fi
  if [[ \$write_effective -eq 1 ]]; then printf 'https://github.com/grengin-oss/grengin/releases/tag/$TAG'; fi
  exit 0
fi
name="\${url##*/}"
case "\$name" in
  "$ASSET"|"$SUMS")
    cp "$FAKE_RELEASE/\$name" "\$out"
    exit 0
    ;;
  *) exit 22 ;;
esac
EOF_CURL
chmod +x "$MOCK_BIN/curl"

export HOME="$FAKE_HOME"
export GRENGIN_HOME="$FAKE_HOME/.grengin"
export GRENGIN_BIN_DIR="$FAKE_BIN"
export GRENGIN_NO_MODIFY_PATH=1
export GRENGIN_ARCH=amd64
export PATH="$MOCK_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

printf '1/7 syntax check... '
sh -n "$ROOT_DIR/install.sh"
sh -n "$ROOT_DIR/uninstall.sh"
echo PASS

printf '2/7 clean install... '
sh "$ROOT_DIR/install.sh" > "$WORK/install.log"
[[ -x "$FAKE_BIN/grengin" ]]
[[ -L "$FAKE_BIN/grengin-api" ]]
[[ -L "$FAKE_BIN/sqlx-mcp" ]]
[[ -f "$GRENGIN_HOME/current/frontend/index.html" ]]
[[ -f "$GRENGIN_HOME/current/RELEASE-MANIFEST.json" ]]
echo PASS

printf '3/7 command wrappers... '
[[ "$($FAKE_BIN/grengin version)" == "grengin $VERSION" ]]
[[ "$($FAKE_BIN/grengin api hello)" == "mock grengin-api ok hello" ]]
[[ "$($FAKE_BIN/grengin sqlx-mcp hello)" == "mock sqlx-mcp ok hello" ]]
echo PASS

printf '4/7 idempotent reinstall... '
sh "$ROOT_DIR/install.sh" > "$WORK/reinstall.log"
[[ "$($FAKE_BIN/grengin version)" == "grengin $VERSION" ]]
[[ "$(find "$GRENGIN_HOME/versions" -mindepth 1 -maxdepth 1 -type d -name "$VERSION" | wc -l)" -eq 1 ]]
echo PASS

printf '5/7 checksum rejection... '
printf '%064d  %s\n' 0 "$ASSET" > "$FAKE_RELEASE/$SUMS"
if sh "$ROOT_DIR/install.sh" > "$WORK/bad-checksum.log" 2>&1; then
  echo FAIL
  echo 'installer accepted a bad checksum' >&2
  exit 1
fi
grep -q 'SHA-256 verification failed' "$WORK/bad-checksum.log"
echo PASS

printf '6/7 manager uninstall... '
# Restore valid checksum, reinstall, and exercise the generated manager's uninstall.
printf '%s  %s\n' "$SHA" "$ASSET" > "$FAKE_RELEASE/$SUMS"
sh "$ROOT_DIR/install.sh" > "$WORK/pre-manager-uninstall.log"
"$FAKE_BIN/grengin" uninstall > "$WORK/manager-uninstall.log"
[[ ! -e "$GRENGIN_HOME" ]]
[[ ! -e "$FAKE_BIN/grengin" ]]
[[ ! -e "$FAKE_BIN/grengin-api" ]]
echo PASS

printf '7/7 standalone uninstall... '
sh "$ROOT_DIR/install.sh" > "$WORK/pre-standalone-uninstall.log"
sh "$ROOT_DIR/uninstall.sh" > "$WORK/uninstall.log"
[[ ! -e "$GRENGIN_HOME" ]]
[[ ! -e "$FAKE_BIN/grengin" ]]
[[ ! -e "$FAKE_BIN/grengin-api" ]]
echo PASS

printf '\nAll installer tests passed.\n'
