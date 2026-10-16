#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
requested="${1:-}"
requested="${requested#v}"
if [[ -n "$requested" && ! "$requested" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Expected a stable version such as v0.9.4" >&2
  exit 1
fi

for command in docker gh jq python3 git; do
  command -v "$command" >/dev/null
done
git diff --quiet
git diff --cached --quiet

image="ghcr.io/grengin-oss/grengin-api:${requested:+v}${requested:-latest}"
manifest="$(docker buildx imagetools inspect "$image" --format '{{json .Manifest}}')"
jq -e '[.manifests[].platform | select(.os == "linux") | .architecture] | sort == ["amd64", "arm64"]' <<< "$manifest" >/dev/null
digest="$(jq -er '.digest | select(test("^sha256:[a-f0-9]{64}$"))' <<< "$manifest")"
config="$(docker buildx imagetools inspect "ghcr.io/grengin-oss/grengin-api@$digest" --format '{{json .Image}}')"
revision="$(jq -er '.["linux/amd64"].config.Labels["org.opencontainers.image.revision"] | select(test("^[a-f0-9]{40}$"))' <<< "$config")"
jq -e --arg revision "$revision" '.["linux/arm64"].config.Labels["org.opencontainers.image.revision"] == $revision' <<< "$config" >/dev/null

# Docker metadata can label the image as "latest"; Cargo at the image's exact source revision
# is the authority for the product version.
cargo="$(gh api "repos/grengin-oss/grengin-api/contents/Cargo.toml?ref=$revision" --jq .content | base64 --decode)"
version="$(python3 -c 'import sys,tomllib; print(tomllib.loads(sys.stdin.read())["package"]["version"])' <<< "$cargo")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
if [[ -n "$requested" && "$requested" != "$version" ]]; then
  echo "Image source version $version does not match requested $requested" >&2
  exit 1
fi
tag="v$version"

output() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
}
output version "$tag"

releases="$(gh release list --repo grengin-oss/grengin --limit 100 --json tagName)"
if jq -e --arg tag "$tag" 'any(.[]; .tagName == $tag)' <<< "$releases" >/dev/null; then
  echo "$tag is already published; leaving it unchanged."
  output publish false
  exit 0
fi

current="$(jq -er .version package.json)"
python3 -c 'import sys; parse=lambda s:tuple(map(int,s.split("."))); sys.exit(0 if parse(sys.argv[1]) >= parse(sys.argv[2]) else "Refusing to release an older backend version")' "$version" "$current"

mkdir -p release/notes
temporary="$(mktemp)"
trap 'rm -f "$temporary"' EXIT
jq --arg version "$version" '.version = $version' package.json > "$temporary"
chmod --reference=package.json "$temporary"
mv "$temporary" package.json
printf '%s\n' "$revision" > release/backend-commit.txt
printf 'ghcr.io/grengin-oss/grengin-api@%s\n' "$digest" > release/backend-image.txt
if [[ ! -f "release/notes/$tag.md" ]]; then
  {
    printf '## Grengin %s\n\n' "$tag"
    printf 'Complete frontend and backend source archives, plus static Linux AMD64 and ARM64 bundles.\n'
    printf 'The backend is Grengin API %s, pinned to commit `%s` and its published image digest.\n\n' "$tag" "$revision"
    printf 'Install the latest stable Linux release:\n\n```bash\n'
    printf "curl --proto '=https' --tlsv1.2 -sSf https://meta.grengin.com/install.sh | sh\n"
    printf '```\n\nBackend container:\n\n```bash\n'
    printf 'docker pull ghcr.io/grengin-oss/grengin-api:%s\n```\n' "$tag"
  } > "release/notes/$tag.md"
fi

output publish true
echo "Prepared $tag from backend $revision ($digest)"
