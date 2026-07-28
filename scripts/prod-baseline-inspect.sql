-- GL-4 / DB-2 — Production baseline INSPECTION (read-only).
--
-- Run this FIRST, against production, before any `prisma migrate resolve`.
-- Supabase: paste into the SQL editor. Or locally with DIRECT_URL (port 5432,
-- unpooled) pointed at prod:
--   psql "$DIRECT_URL" -f scripts/prod-baseline-inspect.sql
--
-- It changes nothing. Use the output to decide, per the runbook in
-- docs/06_Infrastructure/03_Migrations_and_Deploy.md, which migrations' effects
-- are already present (→ `migrate resolve --applied`) vs. missing (→ apply the
-- migration's SQL by hand first, then resolve).

\echo '== 1. Migration history (empty/partial means prod was created by hand) =='
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY started_at;

\echo '== 2. perf_indexes present? (covering indexes on issues / audit_logs) =='
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('issues', 'audit_logs')
ORDER BY indexname;

\echo '== 3. rank column: exists, collation, and is boardOrder gone? =='
SELECT column_name, data_type, collation_name
FROM information_schema.columns
WHERE table_name = 'issues' AND column_name IN ('rank', 'boardOrder')
ORDER BY column_name;

\echo '== 4. rank_unique present? (unique index on (projectId,status,rank)) =='
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'issues' AND indexdef ILIKE '%unique%rank%';

\echo '== 4b. If the unique index is MISSING, check for duplicates FIRST =='
\echo '   (any row here blocks the unique index — resolve dups before applying)'
SELECT "projectId", status, rank, COUNT(*)
FROM issues
WHERE "deletedAt" IS NULL
GROUP BY "projectId", status, rank
HAVING COUNT(*) > 1;

\echo '== 5. Tables from the newer additive migrations (present = already applied) =='
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('components', 'issue_components', 'feature_flags')
ORDER BY table_name;

\echo '== 6. FTS GIN indexes present? (search_fts) =='
SELECT indexname
FROM pg_indexes
WHERE indexname IN ('issues_fts_idx', 'projects_fts_idx')
ORDER BY indexname;

\echo '== 7. Additive columns from later migrations (present = already applied) =='
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'issues'    AND column_name = 'version')
   OR (table_name = 'sprints'   AND column_name = 'position')
   OR (table_name = 'comments'  AND column_name IN ('bodyFormat', 'editedAt', 'version'))
   OR (table_name = 'users'     AND column_name = 'notificationsEnabled')
ORDER BY table_name, column_name;
