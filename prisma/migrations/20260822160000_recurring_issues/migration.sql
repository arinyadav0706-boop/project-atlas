-- Recurring issues (ADR-0051, docs/02_Modules/32_recurring.md).
--
-- A template plus a schedule. Each firing stamps out a NEW issue rather than
-- reopening one: cycle time and velocity replay from status transitions
-- (ADR-0031), and a single row completed fifty-two times has no cycle time at
-- all — its createdAt is a year before its fiftieth completion.
--
-- Additive only. Nothing existing changes shape, so this is safe in either
-- deploy order: old code never reads these columns.

CREATE TYPE "RecurrenceMode" AS ENUM ('FIXED_SCHEDULE', 'AFTER_COMPLETION');
-- No YEARLY: monthly with an interval of 12 IS yearly, and of 3 is quarterly.
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "recurring_issues" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId"      TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "mode"           "RecurrenceMode" NOT NULL DEFAULT 'FIXED_SCHEDULE',
    "frequency"      "RecurrenceFrequency" NOT NULL DEFAULT 'WEEKLY',
    "interval"       INTEGER NOT NULL DEFAULT 1,
    -- Every interval is counted from here, so "every 3 days" and "every other
    -- Tuesday" have a defined answer rather than depending on when the row
    -- happened to be written.
    "startsOn"       TIMESTAMP(3) NOT NULL,
    "weekdays"       INTEGER[],
    "dayOfMonth"     INTEGER,
    "timeOfDay"      INTEGER NOT NULL DEFAULT 540,
    "timeZone"       TEXT NOT NULL DEFAULT 'UTC',
    "skipWeekends"   BOOLEAN NOT NULL DEFAULT false,
    "skipIfOpen"     BOOLEAN NOT NULL DEFAULT false,
    "intervalDays"   INTEGER,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "type"           "IssueType" NOT NULL DEFAULT 'TASK',
    "priority"       "IssuePriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId"     TEXT,
    "reporterId"     TEXT NOT NULL,
    "dueInDays"      INTEGER,
    "nextRunAt"      TIMESTAMP(3),
    "lastRunAt"      TIMESTAMP(3),
    "occurrences"    INTEGER NOT NULL DEFAULT 0,
    "endsOn"         TIMESTAMP(3),
    "maxOccurrences" INTEGER,
    "lastError"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdBy"      TEXT,
    "updatedBy"      TEXT,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "recurring_issues_pkey" PRIMARY KEY ("id")
);

-- The scheduler tick reads exactly this column, across every project in the
-- deployment, on every run. It is the only index that has to be fast.
CREATE INDEX "recurring_issues_nextRunAt_idx" ON "recurring_issues"("nextRunAt");
CREATE INDEX "recurring_issues_projectId_idx" ON "recurring_issues"("projectId");

ALTER TABLE "recurring_issues"
  ADD CONSTRAINT "recurring_issues_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recurring_issues"
  ADD CONSTRAINT "recurring_issues_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recurring_issues"
  ADD CONSTRAINT "recurring_issues_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The back-pointer that makes "what did this produce" a query rather than a
-- log table (ADR-0051 §9).
ALTER TABLE "issues" ADD COLUMN "recurrenceId" TEXT;
CREATE INDEX "issues_recurrenceId_idx" ON "issues"("recurrenceId");

ALTER TABLE "issues"
  ADD CONSTRAINT "issues_recurrenceId_fkey"
  FOREIGN KEY ("recurrenceId") REFERENCES "recurring_issues"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
