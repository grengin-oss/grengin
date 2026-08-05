#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_VERSION="${1:-}"
RELEASE_VERSION="${RELEASE_VERSION#v}"
BACKEND_SOURCE_DIR="${BACKEND_SOURCE_DIR:-${REPOSITORY_ROOT}/.release-work/grengin-api}"
RELEASE_OUTPUT_DIR="${RELEASE_OUTPUT_DIR:-${REPOSITORY_ROOT}/release-dist}"
BACKEND_PIN_FILE="${REPOSITORY_ROOT}/release/backend-commit.txt"

if [[ ! "${RELEASE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 <version> (for example: $0 v0.3.1)" >&2
  exit 1
fi

PROJECT_VERSION="$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)",/\1/p' "${REPOSITORY_ROOT}/package.json" | head -n 1)"
if [[ "${PROJECT_VERSION}" != "${RELEASE_VERSION}" ]]; then
  echo "Release version ${RELEASE_VERSION} does not match package.json version ${PROJECT_VERSION}." >&2
  exit 1
fi

if [[ ! -f "${BACKEND_PIN_FILE}" ]]; then
  echo "Missing backend pin: ${BACKEND_PIN_FILE}" >&2
  exit 1
fi

BACKEND_COMMIT="$(tr -d '[:space:]' < "${BACKEND_PIN_FILE}")"
if [[ ! "${BACKEND_COMMIT}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Backend pin must be a full 40-character commit SHA." >&2
  exit 1
fi

if [[ ! -d "${BACKEND_SOURCE_DIR}/.git" ]]; then
  echo "Backend checkout not found at ${BACKEND_SOURCE_DIR}." >&2
  exit 1
fi

CHECKED_OUT_BACKEND_COMMIT="$(git -C "${BACKEND_SOURCE_DIR}" rev-parse HEAD)"
if [[ "${CHECKED_OUT_BACKEND_COMMIT}" != "${BACKEND_COMMIT}" ]]; then
  echo "Backend checkout is ${CHECKED_OUT_BACKEND_COMMIT}; expected ${BACKEND_COMMIT}." >&2
  exit 1
fi

if [[ ! -d "${REPOSITORY_ROOT}/dist" ]]; then
  echo "Frontend build not found. Run pnpm build before packaging." >&2
  exit 1
fi

if ! git -C "${REPOSITORY_ROOT}" diff --quiet || \
   ! git -C "${REPOSITORY_ROOT}" diff --cached --quiet; then
  echo "Tracked frontend files have uncommitted changes; refusing to create a release bundle." >&2
  exit 1
fi

for command_name in git tar gzip zip sha256sum; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

FRONTEND_COMMIT="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
BACKEND_VERSION="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "${BACKEND_SOURCE_DIR}/Cargo.toml" | head -n 1)"
PACKAGE_NAME="grengin-${RELEASE_VERSION}"
SOURCE_DATE_EPOCH="$(git -C "${REPOSITORY_ROOT}" show -s --format=%ct HEAD)"
STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/grengin-release.XXXXXX")"
PACKAGE_ROOT="${STAGING_ROOT}/${PACKAGE_NAME}"

cleanup() {
  rm -rf -- "${STAGING_ROOT}"
}
trap cleanup EXIT

mkdir -p \
  "${PACKAGE_ROOT}/frontend" \
  "${PACKAGE_ROOT}/frontend-dist" \
  "${PACKAGE_ROOT}/backend" \
  "${RELEASE_OUTPUT_DIR}"
RELEASE_OUTPUT_DIR="$(cd "${RELEASE_OUTPUT_DIR}" && pwd)"

git -C "${REPOSITORY_ROOT}" archive HEAD | tar -xf - -C "${PACKAGE_ROOT}/frontend"
git -C "${BACKEND_SOURCE_DIR}" archive "${BACKEND_COMMIT}" | tar -xf - -C "${PACKAGE_ROOT}/backend"
cp -R "${REPOSITORY_ROOT}/dist/." "${PACKAGE_ROOT}/frontend-dist/"

cat > "${PACKAGE_ROOT}/RELEASE-MANIFEST.json" <<EOF
{
  "release": "v${RELEASE_VERSION}",
  "frontend": {
    "repository": "https://github.com/grengin-oss/grengin",
    "commit": "${FRONTEND_COMMIT}",
    "source_path": "frontend",
    "build_path": "frontend-dist"
  },
  "backend": {
    "repository": "https://github.com/grengin-oss/grengin-api",
    "version": "${BACKEND_VERSION}",
    "commit": "${BACKEND_COMMIT}",
    "source_path": "backend"
  }
}
EOF

find "${PACKAGE_ROOT}" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

TAR_NAME="${PACKAGE_NAME}.tar.gz"
ZIP_NAME="${PACKAGE_NAME}.zip"
CHECKSUM_NAME="${PACKAGE_NAME}-SHA256SUMS.txt"

(
  cd "${STAGING_ROOT}"
  tar \
    --sort=name \
    --mtime="@${SOURCE_DATE_EPOCH}" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -cf - "${PACKAGE_NAME}" | gzip -n > "${RELEASE_OUTPUT_DIR}/${TAR_NAME}"
  find "${PACKAGE_NAME}" -print | LC_ALL=C sort | zip -X -q -y "${RELEASE_OUTPUT_DIR}/${ZIP_NAME}" -@
)

(
  cd "${RELEASE_OUTPUT_DIR}"
  sha256sum "${TAR_NAME}" "${ZIP_NAME}" > "${CHECKSUM_NAME}"
)

echo "Created release assets:"
echo "  ${RELEASE_OUTPUT_DIR}/${TAR_NAME}"
echo "  ${RELEASE_OUTPUT_DIR}/${ZIP_NAME}"
echo "  ${RELEASE_OUTPUT_DIR}/${CHECKSUM_NAME}"
