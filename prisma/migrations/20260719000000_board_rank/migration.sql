-- Board card ordering: float `boardOrder` -> string fractional `rank`
-- (LexoRank-style, base-62). See ADR-0009. Adopting the robust scheme now,
-- while data volume is near-zero, avoids a high-risk migration under real load.

-- 1. Add the new column, nullable so we can backfill existing rows.
ALTER TABLE "issues" ADD COLUMN "rank" TEXT;

-- 2. Guard: the SQL backfill below reproduces the `fractional-indexing`
--    library's output byte-for-byte only for up to 62 rows per column
--    ('a' + one base-62 digit). At current (dummy) volume every column is far
--    smaller; fail loudly rather than write an invalid key if that ever breaks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "issues"
    WHERE "deletedAt" IS NULL
    GROUP BY "projectId", "status"
    HAVING count(*) > 62
  ) THEN
    RAISE EXCEPTION
      'rank backfill supports <=62 issues per (project,status) column; a larger column exists. Backfill via the fractional-indexing library instead.';
  END IF;
END $$;

-- 3. Backfill: within each (projectId, status) column, order by creation time
--    and assign 'a0','a1',... — identical to generateNKeysBetween(null,null,n)
--    for n<=62, so the keys remain valid inputs to generateKeyBetween later.
WITH ordered AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "projectId", "status" ORDER BY "createdAt", "id"
    ) AS rn
  FROM "issues"
)
UPDATE "issues" i
SET "rank" =
  'a' || substr(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    o.rn::int,
    1
  )
FROM ordered o
WHERE i."id" = o."id";

-- 4. Every row now has a rank; enforce it.
ALTER TABLE "issues" ALTER COLUMN "rank" SET NOT NULL;

-- 5. Swap the covering index (projectId, status, boardOrder) -> (…, rank).
DROP INDEX "issues_projectId_status_boardOrder_idx";
CREATE INDEX "issues_projectId_status_rank_idx" ON "issues"("projectId", "status", "rank");

-- 6. Drop the retired column.
ALTER TABLE "issues" DROP COLUMN "boardOrder";
