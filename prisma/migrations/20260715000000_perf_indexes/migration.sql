-- Performance indexes (docs/01_Architecture/05_Performance_and_Scalability.md).
-- These replace single-/two-column indexes with composites that also cover
-- the ORDER BY of the hot list queries, so Postgres reads them index-ordered
-- instead of sorting in memory once projects hold thousands of issues.
--
-- NOTE: at real scale, create these CONCURRENTLY in a separate step to avoid
-- locking writes. Tables are tiny today, so a plain CREATE INDEX is fine.

-- Issue list/board: WHERE projectId, status  ORDER BY boardOrder
DROP INDEX "issues_projectId_status_idx";
CREATE INDEX "issues_projectId_status_boardOrder_idx" ON "issues"("projectId", "status", "boardOrder");

-- Dashboard "my open issues": WHERE assigneeId, status
DROP INDEX "issues_assigneeId_idx";
CREATE INDEX "issues_assigneeId_status_idx" ON "issues"("assigneeId", "status");

-- Per-entity activity timeline: WHERE entityType, entityId  ORDER BY createdAt
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");
