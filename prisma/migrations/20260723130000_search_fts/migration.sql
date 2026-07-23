-- Search (ADR-0021, 12_search.md): Postgres full-text search over existing
-- tables — no new tables, no denormalized search column. GIN indexes over an
-- immutable to_tsvector expression let ranked prefix queries stay fast at V1
-- scale. Prisma can't express expression indexes, so this is raw SQL.
--
-- The expression here MUST match the one the SearchRepository queries with,
-- byte-for-byte, or Postgres won't use the index.

CREATE INDEX IF NOT EXISTS "issues_fts_idx"
  ON "issues"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')));

CREATE INDEX IF NOT EXISTS "projects_fts_idx"
  ON "projects"
  USING GIN (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("key", '')));

-- Issue-key lookups (BR-3) are ILIKE on a short column; a plain btree can't
-- serve a leading-wildcard ILIKE, but the org-scoped candidate set is small,
-- so V1 relies on the existing (projectId, key) locality. No extra index here;
-- a trigram index on key is a logged Future Scope item if key search grows hot.
