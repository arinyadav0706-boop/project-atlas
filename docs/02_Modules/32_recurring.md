# 32 — Recurring issues

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0051-recurring-issues.md`
- **Depends on:** 04_issues (the create path it reuses), 30_workflow (a
  completion is a status category), 31_automations (the created issue trips
  `ISSUE_CREATED` rules), 15_roles

## 1. Overview

Work that arrives on a clock: standups, weekly reports, monthly access reviews,
the 90-day service. A **recurrence** is a template plus a schedule; each time it
fires it stamps out a **new issue**.

Scope: two flavours (fixed schedule, after completion), daily / weekly /
monthly with an interval, weekday selection, skip weekends, an end condition,
and a portable scheduler tick. **No separate "yearly"** — monthly with an
interval of 12 is yearly and of 3 is quarterly, so every real cadence is
expressible with one fewer frequency to get wrong (rule 10). Not: recurring subtask sets, recurring sprints, natural-language
schedules, holiday pauses.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | Every occurrence is a **new issue**. A recurrence never reopens or resets an existing one — cycle time and velocity replay from status transitions (ADR-0031), and one row completed fifty-two times has no cycle time at all. |
| BR-2 | A recurrence is its **own row**, not a property of an issue. The issues it creates can be edited, closed and deleted without changing what comes next. Deleting a spawned issue never affects the schedule. |
| BR-3 | Two flavours. **`FIXED_SCHEDULE`** fires on the calendar regardless of the last instance. **`AFTER_COMPLETION`** fires `intervalDays` after the previous instance reaches a `DONE` **category** (30_workflow BR-3 — the category, so a project that calls it "Shipped" still counts). |
| BR-4 | **Missed occurrences are never backfilled.** However long the scheduler was down, one tick creates at most one issue per recurrence, and `nextRunAt` advances to the next occurrence strictly in the future. |
| BR-5 | A tick **claims** each due recurrence with a conditional update on `nextRunAt` (ADR-0011's trick). Two overlapping ticks cannot both create the issue, so the endpoint is safe to retry. |
| BR-6 | `skipIfOpen` (fixed schedule only): if the previous instance is still open, skip this occurrence and advance anyway. Without it a daily task nobody does becomes thirty identical open issues. |
| BR-7 | Issues are created through **`IssueService`**, so required custom fields, assignee validation, the project key counter and the assignment notification all still apply (ADR-0051 §8). |
| BR-8 | The issue is **reported by the person named on the template**, defaulting to its creator. A recurrence is a scheduled person, not a robot — "who do I ask" must have an answer. |
| BR-9 | A recurrence-created issue **does** trip `ISSUE_CREATED` automations. That composition is wanted, and there is no loop risk because an automation cannot create an issue. |
| BR-15 | Every interval is counted from **`startsOn`**, not from when the row was written — otherwise "every other Tuesday" means something different depending on the minute someone clicked save. A month day past the month's length **clamps** (the 31st fires on 28 February), rather than skipping the month. |
| BR-10 | The **time zone lives on the recurrence** (IANA). "Every Monday at 9" has no meaning without one, and a global default would put half a 500-person org's standup on Sunday night. |
| BR-11 | A recurrence ends on a date, after a count of occurrences, or never. On ending it is marked inactive rather than deleted — the issues it produced keep their back-pointer. |
| BR-12 | Administered by **LEAD** on the project, or an org ADMIN (ADR-0024), server-side. Anyone who can see the project can see the recurrences and what they produced. |
| BR-13 | A recurrence whose template no longer builds a legal issue (a deleted assignee, a required custom field added later) **fails that occurrence, records why, and still advances** — a permanently stuck schedule that silently produces nothing is worse than a gap. |
| BR-14 | Soft-deleting a recurrence stops it immediately. Issues it already created are untouched and keep pointing at it. |

## 3. Database

```prisma
enum RecurrenceMode {
  FIXED_SCHEDULE
  AFTER_COMPLETION
}

enum RecurrenceFrequency {
  DAILY
  WEEKLY
  MONTHLY
}

model RecurringIssue {
  id             String              @id @default(cuid())
  organizationId String              // denormalised for tenant-scoped queries (F-1)
  projectId      String
  name           String
  active         Boolean             @default(true)
  mode           RecurrenceMode      @default(FIXED_SCHEDULE)
  frequency      RecurrenceFrequency @default(WEEKLY)
  /// Every N days/weeks/months/years. 1 = every time.
  interval       Int                 @default(1)
  /// Every interval is counted from here, so "every 3 days" and "every other
  /// Tuesday" have a defined answer and a recurrence can start next month.
  startsOn       DateTime
  /// WEEKLY: which days (0=Sun … 6=Sat). MONTHLY: `dayOfMonth`, clamped to the
  /// month's length so the 31st still fires in February.
  weekdays       Int[]
  dayOfMonth     Int?
  /// Local time of day, minutes past midnight, in `timeZone`.
  timeOfDay      Int                 @default(540)   // 09:00
  timeZone       String              @default("UTC")
  /// DAILY only: never land on a Saturday or Sunday.
  skipWeekends   Boolean             @default(false)
  /// FIXED_SCHEDULE only (BR-6).
  skipIfOpen     Boolean             @default(false)
  /// AFTER_COMPLETION only: days after the previous instance is done.
  intervalDays   Int?

  // ── The template stamped out each time ──
  title          String
  description    String?
  type           IssueType           @default(TASK)
  priority       IssuePriority       @default(MEDIUM)
  assigneeId     String?
  reporterId     String              // BR-8
  /// Days from creation to the new issue's due date. Null = no due date.
  dueInDays      Int?

  // ── State ──
  nextRunAt      DateTime?           // null once ended (BR-11)
  lastRunAt      DateTime?
  occurrences    Int                 @default(0)
  endsOn         DateTime?
  maxOccurrences Int?
  /// Why the last occurrence failed, if it did (BR-13).
  lastError      String?

  // + audit fields, deletedAt
  @@index([nextRunAt])
  @@index([projectId])
}
```

Plus `Issue.recurrenceId String?` with an index — the back-pointer that makes
"what did this produce" a query rather than a log table (ADR-0051 §9).

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/recurrences` | Recurrences, with next run and what each produced. |
| `POST` | `/api/projects/{id}/recurrences` | Create. |
| `PATCH` | `/api/projects/{id}/recurrences/{recurrenceId}` | Edit, pause/resume. |
| `DELETE` | `/api/projects/{id}/recurrences/{recurrenceId}` | Soft-delete. |
| `POST` | `/api/scheduler/tick` | Run everything due. Secret-guarded; idempotent (BR-5). |

## 5. The scheduler

One endpoint, called by whatever the host provides — Vercel Cron, a Kubernetes
CronJob, a systemd timer, GitHub Actions. Authenticated with
`SCHEDULER_SECRET` as a bearer token, **not** a session: no user is present.

Hourly is the intended cadence. Resolution is bounded by it, which is right for
work measured in days, and the tick is cheap when nothing is due (one indexed
query on `nextRunAt`).

## 6. UI

Project settings → **Recurring work**, beside Automations.

- **List** — name, a plain-English schedule ("Every Monday at 09:00 · Europe/London"),
  next run, how many it has created, a pause switch.
- **Builder** — flavour, frequency, the fields to stamp out, and an end
  condition. Shows the next three dates it would fire, because a schedule you
  cannot preview is a schedule you find out about on Monday.
- **Repeat this…** on an issue — prefills a template from that issue (BR-2).

## 7. Acceptance Criteria

1. A weekly recurrence due now creates exactly one issue and advances a week.
2. Two ticks racing create exactly one issue (BR-5).
3. A scheduler down for three weeks creates one issue, not three (BR-4).
4. `AFTER_COMPLETION` creates nothing on a tick; closing the last instance
   creates the next one, `intervalDays` later.
5. `skipIfOpen` skips while the previous instance is open, and resumes once it
   is closed.
6. Created issues carry `recurrenceId`, are reported by the template's reporter,
   and appear in the recurrence's "created" count.
7. A recurrence past `endsOn` or `maxOccurrences` goes inactive and stops.
8. A template that cannot build a legal issue records `lastError` and still
   advances (BR-13).
9. `POST /api/scheduler/tick` without the secret is 401.
10. A MEMBER can see recurrences but not create or edit; a LEAD and an org
    ADMIN can; another org's project is a 404.
11. A recurrence-created issue trips `ISSUE_CREATED` automations (BR-9).

## 8. Future Scope

Recurring subtask sets, recurring sprints, a natural-language schedule parser
("every other Tuesday"), per-user and per-org default time zones, pausing for a
date range (holiday shutdown), and an end-user-visible history of skipped
occurrences.
