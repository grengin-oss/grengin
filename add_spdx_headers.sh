#!/usr/bin/env bash
# Adds REUSE-style SPDX headers to first-party source files.
# Idempotent: files already containing "SPDX-License-Identifier" are
# skipped, so re-running is safe.
#
# Usage, from a repository root:
#   DRY_RUN=1 ./add_spdx_headers.sh   # list files that would change
#   ./add_spdx_headers.sh             # apply
#
# Run it inside each repository checkout separately (grengin and
# grengin-api).

set -euo pipefail

YEAR="2026"
HOLDER="Perter Technology Solutions Private Limited"
DRY_RUN="${DRY_RUN:-0}"

COPY_LINE="SPDX-FileCopyrightText: ${YEAR} ${HOLDER}"
LIC_LINE="SPDX-License-Identifier: Apache-2.0"

# Directories never touched: version control, dependencies, build output.
PRUNE=( -path '*/.git/*' -o -path '*/node_modules/*' -o -path '*/target/*'
        -o -path '*/dist/*' -o -path '*/build/*' -o -path '*/.svelte-kit/*'
        -o -path '*/vendor/*'
        )

header_for() {
  case "$1" in
    slash) printf '// %s\n// %s\n\n' "$COPY_LINE" "$LIC_LINE" ;;
    hash)  printf '# %s\n# %s\n\n'   "$COPY_LINE" "$LIC_LINE" ;;
    html)  printf '<!--\n%s\n%s\n-->\n\n' "$COPY_LINE" "$LIC_LINE" ;;
  esac
}

apply() { # $1 = file, $2 = comment style
  local f="$1" style="$2" tmp
  grep -q 'SPDX-License-Identifier' "$f" && return 0
  if [ "$DRY_RUN" = "1" ]; then
    echo "would add: $f"
    return 0
  fi
  tmp="$(mktemp)"
  if [ "$style" = "hash" ] && head -c 2 "$f" | grep -q '#!'; then
    # keep the shebang on line 1
    head -n 1 "$f" > "$tmp"
    header_for hash >> "$tmp"
    tail -n +2 "$f" >> "$tmp"
  else
    header_for "$style" > "$tmp"
    cat "$f" >> "$tmp"
  fi
  cat "$tmp" > "$f"
  rm -f "$tmp"
  echo "added:     $f"
}

walk() { # $1 = filename pattern, $2 = comment style
  local pat="$1" style="$2"
  find . \( "${PRUNE[@]}" \) -prune -o -type f -name "$pat" -print0 |
    while IFS= read -r -d '' f; do
      apply "$f" "$style"
    done
}

walk '*.rs'        slash
walk '*.ts'        slash
walk '*.js'        slash
walk '*.mjs'       slash
walk '*.cjs'       slash
walk '*.svelte'    html
walk '*.sh'        hash
walk '*.hcl'       hash
walk 'Dockerfile*' hash

echo "Done. Review with: git diff --stat"
