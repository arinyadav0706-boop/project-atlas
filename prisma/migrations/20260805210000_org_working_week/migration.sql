-- Working-time basis for capacity metrics (ADR-0034 amendment).
-- Purely additive with defaults, so existing rows keep today's behaviour
-- (a 40-hour week) and the migration is safe to run at any time.
ALTER TABLE "organizations"
  ADD COLUMN "workingMinutesPerDay" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "workingDaysPerWeek" INTEGER NOT NULL DEFAULT 5;
