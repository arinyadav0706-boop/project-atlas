-- Pin the board/backlog `rank` column to byte ordering (C collation).
--
-- The LexoRank keys (fractional-indexing, base-62 mixed case) assume the
-- database sorts them by raw bytes. Under a locale collation (e.g. en_US.UTF-8
-- or an ICU collation) mixed-case keys mis-sort — a card dragged to the top
-- gets a 'Z…' key that a locale collation sorts to the BOTTOM, silently
-- breaking board order. C collation is byte order, so ordering is identical on
-- every Postgres host regardless of the server's default locale — this is what
-- keeps the scheme portable across all our hosting options (ADR-0004, ADR-0009).
-- See docs/01_Architecture/06_Portability_Boundary.md.

ALTER TABLE "issues" ALTER COLUMN "rank" TYPE text COLLATE "C";

-- Rebuild the covering index so ORDER BY rank uses the C-collated column.
DROP INDEX IF EXISTS "issues_projectId_status_rank_idx";
CREATE INDEX "issues_projectId_status_rank_idx"
  ON "issues" ("projectId", "status", "rank");
