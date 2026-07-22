-- Sprint queue ordering (ADR-0015 / FUT-8): a small integer position for the
-- PLANNED sprint queue, reindexed on reorder. ACTIVE always sorts first; existing
-- rows default to 0 and fall back to createdAt ordering.
ALTER TABLE "sprints" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
