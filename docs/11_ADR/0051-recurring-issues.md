# ADR-0051 — Recurring issues

- **Status:** Accepted
- **Date:** 2026-08-22
- **Module:** `docs/02_Modules/32_recurring.md`
- **Relates to:** ADR-0050 (automations), ADR-0031 (metrics replay transitions),
  ADR-0011 (optimistic concurrency), ADR-0004 (portability), ADR-0042 (custom
  fields), ADR-0024 (permission engine)

## Context

Standups, weekly reports, monthly access reviews, quarterly compliance checks,
the 90-day machine service. Every team has work that arrives on a clock, and
without this someone re-types it or — far more often — forgets to.

ClickUp puts a **Recurring** setting on a task. Jira has no native recurring
issue and instead ships it as an Automation rule with a **Scheduled** trigger
and a **Create issue** action; its newer "recurring work items" can recur on a
schedule *or* based on whether the previous one was completed. Asana has
"repeat" on a task, including "repeat after completion".

Strip the packaging and all three agree on the useful parts: two flavours
(fixed schedule, and after the last one is done), an end condition, and a
weekday-skip for daily work. Where they disagree is the part that matters most
here, and it is the first decision below.

## Decision

### 1. Every occurrence is a NEW issue. Nothing is ever reopened

ClickUp offers a choice: create a new task, or reset the same task to its
starting status. The second is tempting — one permanent row for "Monday
standup" is tidy — and it is wrong for this product specifically.

EAGLES replays **cycle time and velocity from status transitions**
(ADR-0031). One row that has been completed fifty-two times has no cycle time
at all: its `createdAt` is a year before its fiftieth completion, so the
standup that took twenty minutes reads as a year of lead time, and the numbers
downstream are wrong in a way nobody can see. It also destroys the history —
"what did we decide at the standup on the 3rd" has nowhere to live.

So: a recurrence produces a new issue each time, exactly as Jira's Create-issue
action does. A row per occurrence is the only shape in which "we did this
fifty-two times, median cycle time 20 minutes" is a question the database can
answer.

### 2. The recurrence is its own row, not a flag on an issue

ClickUp and Asana hang the schedule on a task. Two consequences follow there
and neither is good: deleting the task silently kills the schedule, and the
live instance doubles as the template, so editing this week's title edits next
week's too.

A `RecurringIssue` row owns the fields to be stamped out. The issues it creates
are ordinary issues that can be edited, closed and deleted without touching
what comes next. The familiar entry point survives — **Repeat this…** on an
issue prefills a template from it — but what is saved is a template, not a
property of that issue.

### 3. Two flavours: FIXED_SCHEDULE and AFTER_COMPLETION

They answer different questions and both competitors carry both.

- **Fixed schedule** — every Monday, whether or not last Monday's is done. A
  standup happens on Monday regardless.
- **After completion** — N days after the previous instance is closed. "Service
  the machine 90 days after the last service" is measured from the service, not
  from a calendar, and a fixed schedule would drift into nonsense the first time
  a service was late.

For the fixed flavour, an optional **skip if the last one is still open**.
Without it, a daily task nobody does becomes thirty identical open issues, and
the pile is what makes people turn the feature off.

### 4. Missed occurrences are never backfilled

If nothing ticks for three weeks, a weekly recurrence creates **one** issue, not
three. Three identical standup tickets dated in the past are not catch-up, they
are spam, and a team's first experience of a restored service must not be
triage. `nextRunAt` always advances to the next occurrence strictly in the
future.

This is the behaviour a person expects from an alarm clock, and the opposite of
what a naive "while (nextRunAt < now) fire()" loop does.

### 5. Execution is an HTTP tick that any scheduler can call

No worker, no queue, no platform SDK. A secret-guarded `POST` endpoint runs
everything due; Vercel Cron, a Kubernetes CronJob, a systemd timer and a GitHub
Actions schedule can all call a URL, so nothing here is a bet on the current
host (ADR-0004). Adding a queue for V1 would be infrastructure ahead of need
(rule 10).

The cost is honest: resolution is however often the tick runs. Hourly is the
intended cadence and is right for work measured in days.

### 6. A tick claims each due recurrence with a conditional update

`UPDATE … WHERE id = ? AND nextRunAt = ?` — the same trick as optimistic
concurrency (ADR-0011). Two overlapping ticks cannot both create the issue,
and calling the endpoint twice by accident is therefore harmless. No lock, no
queue, no distributed coordination: one row, one conditional write.

That property is what makes decision 5 safe. An endpoint anyone can retry has
to be idempotent or it is a duplicate-issue generator.

### 7. The time zone lives on the recurrence

"Every Monday at 9" is meaningless without one, and a 500-person org spanning
three continents has no single right answer — a global default would silently
put half the company's standup on Sunday night. An IANA string per recurrence,
defaulted from the creator's browser.

Deliberately not a user or org setting yet: those are real features with their
own surface, and putting the zone where the schedule is keeps the answer next to
the question.

### 8. Issues are created through `IssueService`, reported by a real person

Same reasoning as ADR-0050 §9: the service path is where required custom fields,
assignee validation, the project key counter and the assignment notification
live, and writing straight to the table would be a way round all of them.

Unlike an automation, a recurrence acts as **a person — the reporter named on
the template**, defaulting to whoever created it. `Issue.reporterId` is a real
FK and, more importantly, "who do I ask about this" should have an answer. A
recurrence is a scheduled person, not a robot acting on someone else's trigger,
so ADR-0050's rule-as-actor does not apply.

It follows that a recurrence-created issue **does** fire `ISSUE_CREATED`
automations, which is wanted: "every Monday create the standup" composes with
"when a standup is created, assign the rotating lead". There is no loop risk —
automations cannot create issues.

### 9. What a recurrence produced is a query, not a log table

`Issue.recurrenceId` points back. Automations needed a run log because most
evaluations produce *nothing* and the absence is the thing you need explained; a
recurrence that fires produces an issue, and the issue is the record. A
`lastRunAt` and a count on the template cover "is this thing alive".

### 10. An end condition: a date, a count, or neither

Jira calls it expiry. A quarterly review that runs for one financial year should
stop by itself, and the alternative — remembering to delete it — is the same
class of chore the module exists to remove.

## Consequences

**Good.** The last of the "why we stay on ClickUp" capabilities lands. Metrics
stay correct because every occurrence is a real row. The scheduler is a URL, so
it survives a host change. Idempotency is a property of one conditional write
rather than of infrastructure.

**Costs.** Resolution is bounded by tick frequency. A tick that never runs
means recurrences silently stop — visible only as a stale "next run", so the UI
shows that date prominently and it is tracked (REC-4). Time zones are per
recurrence, which is right today and will look odd once a user setting exists.
No end-user-visible history of skipped occurrences.

**Not decided here.** Recurring *subtask sets* ("every story gets Design /
Build / Test"), recurrence on sprints, a natural-language schedule parser,
per-user or per-org default time zones, and pausing a recurrence for a fixed
window (holiday shutdown).
