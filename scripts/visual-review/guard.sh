#!/usr/bin/env bash
# The loop's hard stop (README.md here): a review round may change how Home
# LOOKS, never what the backend does. Exits 1, naming the files, if anything
# since the base commit touches the database, API routes, data access,
# services, DTO/validation types or the API spec. Those need a human.
#
# Usage: scripts/visual-review/guard.sh <base-commit>
set -euo pipefail

cd "$(dirname "$0")/../.."
base="${1:?usage: guard.sh <base-commit>}"

# Committed changes since the base, plus anything staged or still in the tree.
changed=$( { git diff --name-only "$base"...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u)

forbidden=$(printf '%s\n' "$changed" | grep -E \
  -e '^prisma/' \
  -e '^src/app/api/' \
  -e '\.repository\.ts$' \
  -e '^src/features/[^/]+/services/' \
  -e '^src/features/[^/]+/types/' \
  -e '^src/features/[^/]+/validation/' \
  -e '^src/features/[^/]+/repositories/' \
  -e '^src/shared/lib/(db|env|api)\.ts$' \
  -e '^src/middleware\.ts$' \
  -e '^docs/04_API/' \
  -e '^docs/03_Database/' \
  || true)

if [ -n "$forbidden" ]; then
  echo "GUARD: these changes need human approval (backend, data or API contract):" >&2
  printf '  %s\n' $forbidden >&2
  exit 1
fi
echo "GUARD: ok — presentation-only changes since $base."
