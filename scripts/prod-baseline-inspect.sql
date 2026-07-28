-- GL-4 / DB-2 — Production baseline INSPECTION (read-only).
--
-- Run this FIRST, against production, before any `prisma migrate resolve`.
-- It changes nothing. Use the output to decide, per the runbook in
-- docs/06_Infrastructure/03_Migrations_and_Deploy.md, which migrations' effects
-- are already present (→ `migrate resolve --applied`) vs. missing (→ apply the
-- migration's SQL by hand first, then resolve).
--
-- HOW TO RUN
--   • Supabase SQL editor (pure SQL, one result table): run QUERY A, then
--     run QUERY B. The editor shows only the LAST statement's result, so run
--     them one at a time — QUERY B is a single UNION so all checks come back
--     in one table. (Do NOT use psql `\echo` here — the editor rejects it.)
--   • psql:  psql "$DIRECT_URL" -f scripts/prod-baseline-inspect.sql

-- ===========================================================================
-- QUERY A — migration history. Empty/partial => prod was created by hand.
-- If this ERRORS with "relation _prisma_migrations does not exist", that is a
-- meaningful result: Prisma has never recorded a migration here. Report it.
-- ===========================================================================
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY started_at;

-- ===========================================================================
-- QUERY B — everything else, as one result table (section | detail).
-- A section that returns NO rows means that thing is NOT present in prod
-- (e.g. no "4_rank_unique_index" row => the unique index is missing).
-- ===========================================================================
SELECT '2_perf_indexes (issues/audit_logs)' AS section, indexname AS detail
FROM pg_indexes
WHERE tablename IN ('issues', 'audit_logs')
UNION ALL
SELECT '3_rank_columns',
       column_name || ' | ' || data_type || ' | coll=' || COALESCE(collation_name, 'none')
FROM information_schema.columns
WHERE table_name = 'issues' AND column_name IN ('rank', 'boardOrder')
UNION ALL
SELECT '4_rank_unique_index', indexname
FROM pg_indexes
WHERE tablename = 'issues' AND indexdef ILIKE '%unique%rank%'
UNION ALL
SELECT '4b_rank_duplicates (must be empty)',
       "projectId" || ' | ' || status::text || ' | ' || rank || ' | count=' || COUNT(*)::text
FROM issues
WHERE "deletedAt" IS NULL
GROUP BY "projectId", status, rank
HAVING COUNT(*) > 1
UNION ALL
SELECT '5_new_tables', table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('components', 'issue_components', 'feature_flags')
UNION ALL
SELECT '6_fts_indexes', indexname
FROM pg_indexes
WHERE indexname IN ('issues_fts_idx', 'projects_fts_idx')
UNION ALL
SELECT '7_new_columns', table_name || '.' || column_name
FROM information_schema.columns
WHERE (table_name = 'issues'   AND column_name = 'version')
   OR (table_name = 'sprints'  AND column_name = 'position')
   OR (table_name = 'comments' AND column_name IN ('bodyFormat', 'editedAt', 'version'))
   OR (table_name = 'users'    AND column_name = 'notificationsEnabled')
ORDER BY section, detail;
