-- Collision-free ordering backstop (ADR-0010): ranks are unique per
-- (project, status) column. Every generated key carries a random suffix
-- (rank.ts), so duplicates are already impossible by construction — this unique
-- index turns the astronomically-rare collision into a loud error instead of a
-- silent duplicate, and still covers the board/list ORDER BY rank query.
--
-- Replaces the plain covering index from 20260720000000_rank_collation. The
-- column keeps its COLLATE "C" (set on the column, inherited by this index).
--
-- NOTE for the prod apply (GL-4): confirm there are no existing duplicate
-- (projectId, status, rank) rows first, or this CREATE will fail:
--   SELECT "projectId","status","rank", count(*) FROM "issues"
--   WHERE "deletedAt" IS NULL
--   GROUP BY 1,2,3 HAVING count(*) > 1;

DROP INDEX "issues_projectId_status_rank_idx";
CREATE UNIQUE INDEX "issues_projectId_status_rank_key"
  ON "issues" ("projectId", "status", "rank");
