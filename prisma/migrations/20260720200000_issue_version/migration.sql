-- Optimistic concurrency control (ADR-0011): a monotonic version per issue.
-- Every mutation increments it; a conditional write (WHERE version = expected)
-- detects and rejects a lost update instead of silently overwriting. Backfills
-- existing rows to 0.
ALTER TABLE "issues" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
