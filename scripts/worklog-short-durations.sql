-- READ-ONLY report for ADR-0059 Q10 / §5a (backlog TS-14).
--
-- The issue page has always read a bare number as MINUTES, so a person who
-- typed "1.5" or "8" meaning hours saved 2 or 8 minutes. Before that input
-- starts reading bare numbers as hours, the founder reviews every existing
-- log short enough to be one of these. Nothing here writes; any correction
-- is a separate, approved, audited step.
--
-- Run in the Supabase SQL editor (or psql) against production. Three result
-- sets: totals, per person, then every row.

-- 1. Totals by bucket.
SELECT
  CASE WHEN wl.minutes < 5 THEN 'under 5 min' ELSE '5 to 14 min' END AS bucket,
  count(*)                                                         AS logs,
  count(DISTINCT wl."userId")                                      AS people
FROM work_logs wl
WHERE wl."deletedAt" IS NULL
  AND wl.minutes < 15
GROUP BY 1
ORDER BY 1 DESC;

-- 2. Per person.
SELECT
  u.name,
  u.email,
  count(*) FILTER (WHERE wl.minutes < 5)  AS under_5_min,
  count(*) FILTER (WHERE wl.minutes >= 5) AS from_5_to_14_min,
  min(wl."workDate")                      AS first_day,
  max(wl."workDate")                      AS last_day
FROM work_logs wl
JOIN users u ON u.id = wl."userId"
WHERE wl."deletedAt" IS NULL
  AND wl.minutes < 15
GROUP BY u.id, u.name, u.email
ORDER BY count(*) DESC, u.name;

-- 3. Every row. `if_typed_as_hours` is what the log would be if the number
-- was meant as hours (e.g. 8 -> 480); it is a hint for the review, not a
-- correction.
SELECT
  wl.id                    AS work_log_id,
  u.name                   AS person,
  u.email,
  p.key                    AS project,
  i.key                    AS issue,
  i.title                  AS issue_title,
  wl."workDate"            AS work_date,
  wl.minutes,
  wl.minutes * 60          AS if_typed_as_hours,
  wl.note,
  wl."createdAt"           AS logged_at
FROM work_logs wl
JOIN users u    ON u.id = wl."userId"
JOIN issues i   ON i.id = wl."issueId"
JOIN projects p ON p.id = i."projectId"
WHERE wl."deletedAt" IS NULL
  AND wl.minutes < 15
ORDER BY wl.minutes, u.name, wl."workDate";
