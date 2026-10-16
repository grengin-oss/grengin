#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
source_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prepare-release.sh"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
mkdir -p "$temporary/repo/scripts" "$temporary/bin"
cp "$source_script" "$temporary/repo/scripts/prepare-release.sh"
cd "$temporary/repo"
git init -q
git config user.name Test
git config user.email test@example.com
printf '{"name":"test","version":"0.9.3"}\n' > package.json
git add .
git commit -qm fixture
export FIXTURE_DIR="$temporary" PATH="$temporary/bin:$PATH"
export GITHUB_OUTPUT="$temporary/outputs"
revision="1111111111111111111111111111111111111111"
digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

cat > "$temporary/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *'.Manifest'* ]]; then
  cat "$FIXTURE_DIR/manifest.json"
else
  cat "$FIXTURE_DIR/config.json"
fi
SH
cat > "$temporary/bin/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  api) printf '[package]\nversion = "0.9.4"\n' | base64 ;;
  release) cat "$FIXTURE_DIR/releases.json" ;;
  *) exit 1 ;;
esac
SH
chmod +x "$temporary/bin/docker" "$temporary/bin/gh"
jq -n --arg digest "$digest" '{digest:$digest,manifests:[{platform:{os:"linux",architecture:"amd64"}},{platform:{os:"linux",architecture:"arm64"}}]}' > "$temporary/manifest.json"
jq -n --arg revision "$revision" '{"linux/amd64":{config:{Labels:{"org.opencontainers.image.revision":$revision}}},"linux/arm64":{config:{Labels:{"org.opencontainers.image.revision":$revision}}}}' > "$temporary/config.json"
printf '[]\n' > "$temporary/releases.json"

bash scripts/prepare-release.sh v0.9.4
[[ "$(jq -r .version package.json)" == 0.9.4 ]]
[[ "$(<release/backend-commit.txt)" == "$revision" ]]
[[ "$(<release/backend-image.txt)" == "ghcr.io/grengin-oss/grengin-api@$digest" ]]
rg -q 'publish=true' "$GITHUB_OUTPUT"
test -f release/notes/v0.9.4.md
echo 'PASS: version, revision, digest and notes are prepared from the image'
git add .
git commit -qm prepared

expect_failure() {
  if bash scripts/prepare-release.sh "$1" > "$temporary/error" 2>&1; then
    echo "Expected preparation to fail: $2" >&2
    exit 1
  fi
  echo "PASS: $2"
}
expect_failure v0.9.5 'a mismatched requested version is rejected'
expect_failure 0.9 'an invalid version is rejected'
cp "$temporary/manifest.json" "$temporary/manifest.saved"
jq '.manifests = [.manifests[0]]' "$temporary/manifest.saved" > "$temporary/manifest.json"
expect_failure v0.9.4 'a missing architecture is rejected'
cp "$temporary/manifest.saved" "$temporary/manifest.json"
cp "$temporary/config.json" "$temporary/config.saved"
jq '.["linux/arm64"].config.Labels["org.opencontainers.image.revision"] = "2222222222222222222222222222222222222222"' "$temporary/config.saved" > "$temporary/config.json"
expect_failure v0.9.4 'different architecture revisions are rejected'
cp "$temporary/config.saved" "$temporary/config.json"
printf '[{"tagName":"v0.9.4"}]\n' > "$temporary/releases.json"
bash scripts/prepare-release.sh
git diff --exit-code
tail -1 "$GITHUB_OUTPUT" | rg -q '^publish=false$'
echo 'PASS: an existing release is skipped without changing its metadata'
