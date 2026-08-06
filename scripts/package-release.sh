#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_VERSION="${1:-}"
RELEASE_VERSION="${RELEASE_VERSION#v}"
BACKEND_SOURCE_DIR="${BACKEND_SOURCE_DIR:-${REPOSITORY_ROOT}/.release-work/grengin-api}"
BACKEND_AMD64_ROOTFS="${BACKEND_AMD64_ROOTFS:-${REPOSITORY_ROOT}/.release-work/backend-amd64}"
BACKEND_ARM64_ROOTFS="${BACKEND_ARM64_ROOTFS:-${REPOSITORY_ROOT}/.release-work/backend-arm64}"
RELEASE_OUTPUT_DIR="${RELEASE_OUTPUT_DIR:-${REPOSITORY_ROOT}/release-dist}"
BACKEND_PIN_FILE="${REPOSITORY_ROOT}/release/backend-commit.txt"

if [[ ! "${RELEASE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 <version> (for example: $0 v0.3.2)" >&2
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

for command_name in git install tar gzip zip sha256sum; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

for rootfs in "${BACKEND_AMD64_ROOTFS}" "${BACKEND_ARM64_ROOTFS}"; do
  if [[ ! -x "${rootfs}/usr/local/bin/grengin-api" ]] || \
     [[ ! -x "${rootfs}/usr/local/bin/sqlx-mcp" ]]; then
    echo "Static backend binaries not found in ${rootfs}/usr/local/bin." >&2
    exit 1
  fi
done

FRONTEND_COMMIT="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
BACKEND_VERSION="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "${BACKEND_SOURCE_DIR}/Cargo.toml" | head -n 1)"
SOURCE_DATE_EPOCH="$(git -C "${REPOSITORY_ROOT}" show -s --format=%ct HEAD)"
SOURCE_NAME="grengin-${RELEASE_VERSION}-source"
AMD64_NAME="grengin-${RELEASE_VERSION}-linux-amd64"
ARM64_NAME="grengin-${RELEASE_VERSION}-linux-arm64"
STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/grengin-release.XXXXXX")"

cleanup() {
  rm -rf -- "${STAGING_ROOT}"
}
trap cleanup EXIT

SOURCE_ROOT="${STAGING_ROOT}/${SOURCE_NAME}"
AMD64_ROOT="${STAGING_ROOT}/${AMD64_NAME}"
ARM64_ROOT="${STAGING_ROOT}/${ARM64_NAME}"

mkdir -p \
  "${SOURCE_ROOT}/frontend" \
  "${SOURCE_ROOT}/frontend-dist" \
  "${SOURCE_ROOT}/backend" \
  "${AMD64_ROOT}/bin" \
  "${AMD64_ROOT}/webapp" \
  "${AMD64_ROOT}/licenses" \
  "${ARM64_ROOT}/bin" \
  "${ARM64_ROOT}/webapp" \
  "${ARM64_ROOT}/licenses" \
  "${RELEASE_OUTPUT_DIR}"
RELEASE_OUTPUT_DIR="$(cd "${RELEASE_OUTPUT_DIR}" && pwd)"

git -C "${REPOSITORY_ROOT}" archive HEAD | tar -xf - -C "${SOURCE_ROOT}/frontend"
git -C "${BACKEND_SOURCE_DIR}" archive "${BACKEND_COMMIT}" | tar -xf - -C "${SOURCE_ROOT}/backend"
cp -R "${REPOSITORY_ROOT}/dist/." "${SOURCE_ROOT}/frontend-dist/"

cat > "${SOURCE_ROOT}/RELEASE-MANIFEST.json" <<EOF
{
  "release": "v${RELEASE_VERSION}",
  "artifact_type": "source",
  "license": "Apache-2.0",
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

create_linux_bundle() {
  local architecture="$1"
  local rootfs="$2"
  local bundle_root="$3"

  install -m 0755 "${rootfs}/usr/local/bin/grengin-api" "${bundle_root}/bin/grengin-api"
  install -m 0755 "${rootfs}/usr/local/bin/sqlx-mcp" "${bundle_root}/bin/sqlx-mcp"
  cp -R "${REPOSITORY_ROOT}/dist/." "${bundle_root}/webapp/"
  cp "${REPOSITORY_ROOT}/LICENSE.md" "${bundle_root}/licenses/frontend-LICENSE.md"
  cp "${REPOSITORY_ROOT}/NOTICE" "${bundle_root}/licenses/frontend-NOTICE"
  cp "${BACKEND_SOURCE_DIR}/LICENSE.md" "${bundle_root}/licenses/backend-LICENSE.md"
  cp "${BACKEND_SOURCE_DIR}/NOTICE" "${bundle_root}/licenses/backend-NOTICE"

  cat > "${bundle_root}/RELEASE-MANIFEST.json" <<EOF
{
  "release": "v${RELEASE_VERSION}",
  "artifact_type": "linux-bundle",
  "license": "Apache-2.0",
  "platform": {
    "os": "linux",
    "architecture": "${architecture}"
  },
  "frontend": {
    "repository": "https://github.com/grengin-oss/grengin",
    "commit": "${FRONTEND_COMMIT}",
    "build_path": "webapp"
  },
  "backend": {
    "repository": "https://github.com/grengin-oss/grengin-api",
    "version": "${BACKEND_VERSION}",
    "commit": "${BACKEND_COMMIT}",
    "api_path": "bin/grengin-api",
    "sqlx_mcp_path": "bin/sqlx-mcp"
  }
}
EOF
}

create_linux_bundle "amd64" "${BACKEND_AMD64_ROOTFS}" "${AMD64_ROOT}"
create_linux_bundle "arm64" "${BACKEND_ARM64_ROOTFS}" "${ARM64_ROOT}"

find "${SOURCE_ROOT}" "${AMD64_ROOT}" "${ARM64_ROOT}" \
  -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

create_tar() {
  local package_name="$1"
  (
    cd "${STAGING_ROOT}"
    tar \
      --sort=name \
      --mtime="@${SOURCE_DATE_EPOCH}" \
      --owner=0 \
      --group=0 \
      --numeric-owner \
      -cf - "${package_name}" | gzip -n > "${RELEASE_OUTPUT_DIR}/${package_name}.tar.gz"
  )
}

create_tar "${SOURCE_NAME}"
create_tar "${AMD64_NAME}"
create_tar "${ARM64_NAME}"

(
  cd "${STAGING_ROOT}"
  find "${SOURCE_NAME}" -print | LC_ALL=C sort | \
    zip -X -q -y "${RELEASE_OUTPUT_DIR}/${SOURCE_NAME}.zip" -@
)

CHECKSUM_NAME="grengin-${RELEASE_VERSION}-SHA256SUMS.txt"
(
  cd "${RELEASE_OUTPUT_DIR}"
  sha256sum \
    "${SOURCE_NAME}.tar.gz" \
    "${SOURCE_NAME}.zip" \
    "${AMD64_NAME}.tar.gz" \
    "${ARM64_NAME}.tar.gz" > "${CHECKSUM_NAME}"
)

echo "Created release assets:"
echo "  ${RELEASE_OUTPUT_DIR}/${SOURCE_NAME}.tar.gz"
echo "  ${RELEASE_OUTPUT_DIR}/${SOURCE_NAME}.zip"
echo "  ${RELEASE_OUTPUT_DIR}/${AMD64_NAME}.tar.gz"
echo "  ${RELEASE_OUTPUT_DIR}/${ARM64_NAME}.tar.gz"
echo "  ${RELEASE_OUTPUT_DIR}/${CHECKSUM_NAME}"
