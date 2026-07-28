#!/usr/bin/env bash
# GL-4 / DB-2 — Production baseline: record already-applied migrations.
#
# Run this ONCE, from a checkout of this repo, with DIRECT_URL pointed at PROD
# (the unpooled port-5432 connection). It uses `prisma migrate resolve` so each
# migration is recorded with the CORRECT checksum — do NOT insert rows into
# `_prisma_migrations` by hand, or `migrate deploy` will later fail its checksum
# check.
#
# PREREQUISITE (do first, in the Supabase SQL editor): finish the partially-
# applied board_rank migration, whose DROP COLUMN step never ran in prod:
#     ALTER TABLE "issues" DROP COLUMN IF EXISTS "boardOrder";
# Until that column is gone, board_rank's effects are not fully present and
# recording it as applied would be dishonest.
#
# Usage:
#     export DIRECT_URL="postgresql://…prod…:5432/postgres"   # unpooled!
#     CONFIRM=yes bash scripts/prod-baseline-resolve.sh
set -euo pipefail

# init is already recorded; resolve the rest that were applied by hand.
MIGRATIONS=(
  20260715000000_perf_indexes
  20260719000000_board_rank
  20260720000000_rank_collation
  20260720100000_rank_unique
  20260720160425_home_personalization
  20260720200000_issue_version
  20260720203221_backlog_index
  20260721000000_sprint_position
  20260721100000_comments_extensible
  20260723120000_labels_components
  20260723130000_search_fts
  20260723140000_feature_flags
)

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "DIRECT_URL is not set. Point it at prod (unpooled, port 5432) first." >&2
  exit 1
fi

echo "About to mark ${#MIGRATIONS[@]} migrations as applied against:"
echo "  ${DIRECT_URL%%\?*}"
echo "Confirm you have already run the boardOrder DROP in the SQL editor."
if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo "Set CONFIRM=yes to proceed. Nothing done." >&2
  exit 1
fi

for m in "${MIGRATIONS[@]}"; do
  echo "→ resolve --applied $m"
  npx prisma migrate resolve --applied "$m"
done

echo
echo "Now verifying — this should report no pending migrations:"
npx prisma migrate status
