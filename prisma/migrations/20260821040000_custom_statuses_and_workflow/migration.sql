-- Custom statuses and workflow (ADR-0049, docs/02_Modules/30_workflow.md).
--
-- EXPAND -> BACKFILL -> CONTRACT, in that order and in one transaction
-- (ADR-0049 §7). A single migration that added a required FK would fail on the
-- first existing issue, and there are thousands.
--
-- This is also safe in the WRONG deploy order. Old code reads `issues.status`,
-- which still holds exactly what it held before — the column's meaning is
-- narrowed from "the status" to "the status's category", and for the four
-- seeded statuses those are literally the same four values. Given DB-2 (the
-- deploy that ran `next build` without `migrate deploy` and took production
-- down), a migration that is harmless in both orders is not a nicety.

-- 1. EXPAND ─────────────────────────────────────────────────────────────────

-- The enum keeps its four values and its column; only the type's NAME changes,
-- because a type called IssueStatus that holds a category lies to every reader.
ALTER TYPE "IssueStatus" RENAME TO "StatusCategory";

ALTER TABLE "projects"
  ADD COLUMN "enforceTransitions" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "workflow_statuses" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "category"       "StatusCategory" NOT NULL,
  "color"          TEXT NOT NULL,
  "position"       INTEGER NOT NULL,
  "isDefault"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "createdBy"      TEXT,
  "updatedBy"      TEXT,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "workflow_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_statuses_projectId_name_key"
  ON "workflow_statuses"("projectId", "name");
CREATE INDEX "workflow_statuses_projectId_position_idx"
  ON "workflow_statuses"("projectId", "position");

ALTER TABLE "workflow_statuses"
  ADD CONSTRAINT "workflow_statuses_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "status_transitions" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "fromStatusId" TEXT NOT NULL,
  "toStatusId"   TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"    TEXT,
  CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_transitions_fromStatusId_toStatusId_key"
  ON "status_transitions"("fromStatusId", "toStatusId");
CREATE INDEX "status_transitions_projectId_idx" ON "status_transitions"("projectId");

ALTER TABLE "status_transitions"
  ADD CONSTRAINT "status_transitions_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "status_transitions"
  ADD CONSTRAINT "status_transitions_fromStatusId_fkey"
  FOREIGN KEY ("fromStatusId") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "status_transitions"
  ADD CONSTRAINT "status_transitions_toStatusId_fkey"
  FOREIGN KEY ("toStatusId") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nullable for now. Made NOT NULL in step 3, once every row has a value.
ALTER TABLE "issues" ADD COLUMN "statusId" TEXT;

-- 2. BACKFILL ───────────────────────────────────────────────────────────────

-- The four statuses every project already behaved as if it had (BR-7), so a
-- team that never opens the editor sees exactly the board it saw yesterday.
-- Colours are design-token names, matching what the UI already renders per
-- category — never hex, because both themes have to keep working.
INSERT INTO "workflow_statuses"
  ("id", "organizationId", "projectId", "name", "category", "color", "position", "isDefault", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p."organizationId",
  p."id",
  s."name",
  s."category"::"StatusCategory",
  s."color",
  s."position",
  s."isDefault",
  CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN (VALUES
  ('To Do',       'TODO',        'slate',   0, true),
  ('In Progress', 'IN_PROGRESS', 'sky',     1, false),
  ('In Review',   'IN_REVIEW',   'amber',   2, false),
  ('Done',        'DONE',        'emerald', 3, false)
) AS s("name", "category", "color", "position", "isDefault");

-- Point every issue at its project's status for the category it already has.
-- The join is on category, so this is exact rather than a guess: an issue that
-- was IN_REVIEW lands on the seeded "In Review" row of its own project.
UPDATE "issues" i
SET "statusId" = ws."id"
FROM "workflow_statuses" ws
WHERE ws."projectId" = i."projectId"
  AND ws."category" = i."status";

-- 3. CONTRACT ───────────────────────────────────────────────────────────────

-- Fails loudly if any issue was missed rather than quietly leaving a null FK.
-- Every project got all four categories above, so an orphan here means the
-- assumption was wrong and the migration should stop.
DO $$
DECLARE orphaned INTEGER;
BEGIN
  SELECT count(*) INTO orphaned FROM "issues" WHERE "statusId" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'Backfill missed % issue(s) — refusing to continue', orphaned;
  END IF;
END $$;

ALTER TABLE "issues" ALTER COLUMN "statusId" SET NOT NULL;

ALTER TABLE "issues"
  ADD CONSTRAINT "issues_statusId_fkey"
  FOREIGN KEY ("statusId") REFERENCES "workflow_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "issues_statusId_idx" ON "issues"("statusId");
