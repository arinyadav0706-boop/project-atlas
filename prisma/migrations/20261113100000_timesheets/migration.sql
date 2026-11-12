-- Timesheets, activities and approval (ADR-0059, docs/02_Modules/37_timesheets.md).
--
-- Hand-ordered from `prisma migrate diff`: existing work_logs need their new
-- required columns BACKFILLED before NOT NULL, and the exactly-one /
-- tags-only-on-activities rules are CHECK constraints Prisma cannot express.
-- Rehearsed against the VERUS demo dataset before reaching main (TS-4).
-- Since DB-9 a failure here fails the deploy and production keeps the old
-- build, so every step is plain DDL/DML with no external dependency.

-- ── 1. Types ───────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ApproverRelation" AS ENUM ('REPORTING', 'FUNCTIONAL', 'PROJECT');

-- CreateEnum
CREATE TYPE "TimesheetApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TimesheetApprovalMode" AS ENUM ('PARALLEL', 'SEQUENTIAL');

-- CreateEnum
CREATE TYPE "NotesRequirement" AS ENUM ('NONE', 'BILLABLE', 'ALL');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('MANUAL', 'HRONE');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "FavoriteEntityType" ADD VALUE 'ACTIVITY';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'TIMESHEET';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TIMESHEET_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'TIMESHEET_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE 'TIMESHEET_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'TIMESHEET_UNLOCKED';
ALTER TYPE "NotificationType" ADD VALUE 'WORKLOG_REMOVED';

-- ── 2. Columns on existing tables (all nullable or defaulted) ───────────────
ALTER TABLE "issues" ADD COLUMN "defaultBillable" BOOLEAN;
ALTER TABLE "organizations" ADD COLUMN "hrConnectedAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN "clientId" TEXT,
ADD COLUMN "currency" CHAR(3),
ADD COLUMN "defaultBillable" BOOLEAN;
ALTER TABLE "users" ADD COLUMN "functionalManagerId" TEXT;

ALTER TABLE "work_logs" ADD COLUMN "organizationId" TEXT,
ADD COLUMN "activityId" TEXT,
ADD COLUMN "projectId" TEXT,
ADD COLUMN "clientId" TEXT,
ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "billableOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "timesheetId" TEXT,
ADD COLUMN "timesheetRowId" TEXT,
ALTER COLUMN "issueId" DROP NOT NULL;

-- ── 3. New tables ──────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "activity_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "activity_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billable" BOOLEAN,
    "requiresProject" BOOLEAN NOT NULL DEFAULT false,
    "requiresClient" BOOLEAN NOT NULL DEFAULT false,
    "notesRequired" BOOLEAN NOT NULL DEFAULT false,
    "visibleToAllTeams" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_teams" (
    "activityId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "activity_teams_pkey" PRIMARY KEY ("activityId","teamId")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "defaultBillable" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "weekStartDay" INTEGER NOT NULL DEFAULT 1,
    "dueWeekday" INTEGER NOT NULL DEFAULT 1,
    "dueTime" TEXT NOT NULL DEFAULT '11:00',
    "reminderHoursBeforeDue" INTEGER[] DEFAULT ARRAY[24, 2]::INTEGER[],
    "autoLockOnApproval" BOOLEAN NOT NULL DEFAULT true,
    "lockAfterDays" INTEGER,
    "overtimeDailyMinutes" INTEGER,
    "notesRequired" "NotesRequirement" NOT NULL DEFAULT 'NONE',
    "employeesMayOverrideBillable" BOOLEAN NOT NULL DEFAULT true,
    "defaultBillable" BOOLEAN NOT NULL DEFAULT false,
    "approverRelations" "ApproverRelation"[] DEFAULT ARRAY['REPORTING']::"ApproverRelation"[],
    "approvalMode" "TimesheetApprovalMode" NOT NULL DEFAULT 'PARALLEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "timesheet_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "policyId" TEXT NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "round" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "submittedLate" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "expectedMinutesAtSubmit" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_rows" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "issueId" TEXT,
    "activityId" TEXT,
    "projectId" TEXT,
    "clientId" TEXT,
    "billableOverride" BOOLEAN,
    "pinnedRowId" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "returnedReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "timesheet_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinned_timesheet_rows" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issueId" TEXT,
    "activityId" TEXT,
    "projectId" TEXT,
    "clientId" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pinned_timesheet_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_approvals" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "relation" "ApproverRelation" NOT NULL,
    "projectId" TEXT,
    "approverId" TEXT NOT NULL,
    "fallbackFrom" "ApproverRelation",
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "TimesheetApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "timesheet_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "source" "AvailabilitySource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_leaves" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'APPROVED',
    "source" "AvailabilitySource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_categories_organizationId_name_key" ON "activity_categories"("organizationId", "name");

-- CreateIndex
CREATE INDEX "activities_organizationId_categoryId_archivedAt_idx" ON "activities"("organizationId", "categoryId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "activities_categoryId_name_key" ON "activities"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organizationId_name_key" ON "clients"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_policies_organizationId_effectiveFrom_key" ON "timesheet_policies"("organizationId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "timesheets_organizationId_status_periodStart_idx" ON "timesheets"("organizationId", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_userId_periodStart_key" ON "timesheets"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "timesheet_rows_timesheetId_position_idx" ON "timesheet_rows"("timesheetId", "position");

-- CreateIndex
CREATE INDEX "pinned_timesheet_rows_userId_position_idx" ON "pinned_timesheet_rows"("userId", "position");

-- CreateIndex
CREATE INDEX "timesheet_approvals_timesheetId_round_idx" ON "timesheet_approvals"("timesheetId", "round");

-- CreateIndex
CREATE INDEX "timesheet_approvals_approverId_status_idx" ON "timesheet_approvals"("approverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organizationId_date_name_key" ON "holidays"("organizationId", "date", "name");

-- CreateIndex
CREATE INDEX "employee_leaves_userId_date_idx" ON "employee_leaves"("userId", "date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_functionalManagerId_fkey" FOREIGN KEY ("functionalManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_categories" ADD CONSTRAINT "activity_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "activity_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_teams" ADD CONSTRAINT "activity_teams_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_policies" ADD CONSTRAINT "timesheet_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "timesheet_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_pinnedRowId_fkey" FOREIGN KEY ("pinnedRowId") REFERENCES "pinned_timesheet_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_timesheet_rows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_timesheet_rows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_timesheet_rows_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_timesheet_rows_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_timesheet_rows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_timesheet_rows_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4. One default policy per existing organization ───────────────────────
-- effectiveFrom 2000-01-03 (a Monday) so back-filled weeks are governed too.
-- Organizations created later get theirs from the service on first use.
-- Timezone: UTC until an admin sets it (ADR-0059 Q7; backlog TS-15).
INSERT INTO "timesheet_policies" ("id", "organizationId", "effectiveFrom", "timezone")
SELECT 'tsp_' || replace(gen_random_uuid()::text, '-', ''), o."id", DATE '2000-01-03', 'UTC'
FROM "organizations" o;

-- ── 5. Backfill existing work logs (ADR-0059 §5) ───────────────────────────
UPDATE "work_logs" wl
SET "organizationId" = p."organizationId"
FROM "issues" i JOIN "projects" p ON p."id" = i."projectId"
WHERE i."id" = wl."issueId";

-- One timesheet per (person, Monday-start week). Weeks before the week the
-- migration runs in are FROZEN (DRAFT + lockedAt, lockedById NULL = migration);
-- the current week stays an open DRAFT (Q1). No approval is fabricated.
INSERT INTO "timesheets" ("id", "organizationId", "userId", "periodStart", "periodEnd",
                          "policyId", "status", "lockedAt", "createdAt", "updatedAt")
SELECT 'ts_' || replace(gen_random_uuid()::text, '-', ''),
       w."organizationId", w."userId", w."periodStart", w."periodStart" + 6,
       pol."id", 'DRAFT',
       CASE WHEN w."periodStart" < date_trunc('week', CURRENT_DATE)::date THEN now() END,
       now(), now()
FROM (
  SELECT DISTINCT wl."organizationId", wl."userId",
         date_trunc('week', wl."workDate")::date AS "periodStart"
  FROM "work_logs" wl
) w
JOIN "timesheet_policies" pol ON pol."organizationId" = w."organizationId";

-- One row per (timesheet, issue), ordered by the first day it was logged. A
-- row whose logs are all deleted is itself soft-deleted.
INSERT INTO "timesheet_rows" ("id", "timesheetId", "position", "issueId",
                              "createdAt", "updatedAt", "deletedAt")
SELECT 'tsr_' || replace(gen_random_uuid()::text, '-', ''),
       r."timesheetId",
       (row_number() OVER (PARTITION BY r."timesheetId" ORDER BY r."firstDay", r."issueId") - 1)::int,
       r."issueId", now(), now(),
       CASE WHEN r."liveLogs" = 0 THEN now() END
FROM (
  SELECT t."id" AS "timesheetId", wl."issueId",
         min(wl."workDate") AS "firstDay",
         count(*) FILTER (WHERE wl."deletedAt" IS NULL) AS "liveLogs"
  FROM "work_logs" wl
  JOIN "timesheets" t
    ON t."userId" = wl."userId"
   AND t."periodStart" = date_trunc('week', wl."workDate")::date
  GROUP BY t."id", wl."issueId"
) r;

UPDATE "work_logs" wl
SET "timesheetId" = t."id", "timesheetRowId" = r."id"
FROM "timesheets" t
JOIN "timesheet_rows" r ON r."timesheetId" = t."id"
WHERE t."userId" = wl."userId"
  AND t."periodStart" = date_trunc('week', wl."workDate")::date
  AND r."issueId" = wl."issueId";

-- ── 6. Lock in the invariants ──────────────────────────────────────────────
ALTER TABLE "work_logs" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "timesheetId" SET NOT NULL,
ALTER COLUMN "timesheetRowId" SET NOT NULL;

ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_issue_xor_activity"
  CHECK (num_nonnulls("issueId", "activityId") = 1);
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_tags_only_on_activities"
  CHECK (("projectId" IS NULL AND "clientId" IS NULL) OR "activityId" IS NOT NULL);
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_issue_xor_activity"
  CHECK (num_nonnulls("issueId", "activityId") = 1);
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_tags_only_on_activities"
  CHECK (("projectId" IS NULL AND "clientId" IS NULL) OR "activityId" IS NOT NULL);
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_rows_issue_xor_activity"
  CHECK (num_nonnulls("issueId", "activityId") = 1);
ALTER TABLE "pinned_timesheet_rows" ADD CONSTRAINT "pinned_rows_tags_only_on_activities"
  CHECK (("projectId" IS NULL AND "clientId" IS NULL) OR "activityId" IS NOT NULL);
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_period_order"
  CHECK ("periodEnd" >= "periodStart");
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_minutes_range"
  CHECK ("minutes" > 0 AND "minutes" <= 1440);

-- ── 7. Indexes and foreign keys on work_logs (after backfill) ──────────────

-- CreateIndex
CREATE INDEX "work_logs_timesheetId_workDate_idx" ON "work_logs"("timesheetId", "workDate");

-- CreateIndex
CREATE INDEX "work_logs_timesheetRowId_workDate_idx" ON "work_logs"("timesheetRowId", "workDate");

-- CreateIndex
CREATE INDEX "work_logs_organizationId_workDate_idx" ON "work_logs"("organizationId", "workDate");

-- CreateIndex
CREATE INDEX "work_logs_activityId_idx" ON "work_logs"("activityId");



-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_timesheetRowId_fkey" FOREIGN KEY ("timesheetRowId") REFERENCES "timesheet_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
