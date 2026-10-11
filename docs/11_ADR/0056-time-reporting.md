# ADR-0056 — Time reporting for HR: who logged what, against what capacity

- **Status:** PROPOSED — awaiting approval on §4 (who may see whose hours).
  Everything else is settled and needs no schema change.
- **Date:** 2026-10-11
- **Module:** `docs/02_Modules/36_time_reports.md`
- **Related:** ADR-0030 (time tracking), ADR-0034 (workload + the working
  week), ADR-0032 (manager scope), module 19, module 21

---

## 1. The ask

HR needs to answer two questions EAGLES already holds the data for and has no
screen for:

1. **"How many hours did this person log, over this period, split by project?"**
2. **"How does the team's logged time compare with the time available?"**

Today the only time surface is a panel on one issue. Nothing aggregates by
person or by period, and the four existing reports — velocity, status
breakdown, cycle time, burndown — are all project reports.

## 2. A correction worth recording

When this was first scoped I said utilisation would need "a working-calendar
concept, which is a much bigger piece". **That was wrong, and wrong in the
direction that makes work look harder than it is.** ADR-0034's amendment
already put the working week on the organization:

```prisma
workingMinutesPerDay Int @default(480)
workingDaysPerWeek   Int @default(5)
```

They are set in Admin → Organization, `weeklyCapacityMinutes()` already reads
them, and `describeWorkingWeek()` already renders "8h × 5 days = 40h week"
wherever a capacity number appears. **So utilisation v1 needs no schema change
at all.** What is genuinely missing is *per-person* capacity — part-time
factors and a leave calendar — which is already logged as backlog WL-1 and is
NOT in this ADR.

The lesson is the ordinary one: check what the schema already carries before
estimating a feature off the shape of its name.

## 3. Decision: two reports, one capacity basis, no new tables

### 3.1 The timesheet — one person, one period

Rows are `WorkLog` entries, grouped three ways off one query: by day, by
project, by issue. The three groupings must reconcile to the same total, and a
test asserts it rather than a reviewer eyeballing it — a timesheet whose
columns disagree is worse than no timesheet, because somebody will act on it.

### 3.2 The team summary — many people, one period

One row per person in scope: logged, capacity, utilisation, and the number of
days they logged anything on. Sorted by logged descending.

### 3.3 Capacity, stated in full

```
capacityMinutes = workingDaysInPeriod × Organization.workingMinutesPerDay
utilisation     = loggedMinutes ÷ capacityMinutes
```

`workingDaysInPeriod` counts calendar days in the range, taking the first
`workingDaysPerWeek` days of each week starting Monday. A 6-day company gets
6-day weeks, exactly as the Workload view already does.

**What this deliberately does NOT model, and must say so on screen:**

- **No public holidays.** A week with a holiday in it shows a capacity that is
  one day too high, so utilisation reads low.
- **No leave.** Somebody on holiday for the period looks like somebody who
  logged nothing.
- **No part-time factor.** A three-day-a-week person is measured against a
  five-day week.

These are not oversights to be discovered later by whoever is on the receiving
end of the number. Every screen showing utilisation carries the basis
(`describeWorkingWeek`) and the caveat, and the caveat is a UI requirement in
the module doc, not a nicety. **Utilisation is a conversation starter, not a
performance measure**, and the product should say that in the places it is
easy to forget.

Closing those three gaps is WL-1, and it is the one piece here that needs
schema. It is deliberately not bundled in (rules 2 and 10).

## 4. Who may see whose hours — THE decision to confirm

This is the part that is a policy choice rather than an engineering one, and
in an HR tool it is the part worth getting signed off rather than inferred.

**Proposed, and it is exactly the rule Workload already enforces (ADR-0032,
module 21 BR-8), not a new one:**

| Caller | May see |
|---|---|
| Anyone | **Their own timesheet, always.** No scope check on yourself. |
| A manager | Anyone in a team they manage, plus all descendant teams. |
| An org admin with `MANAGE_TEAMS` | Anyone in the organization. |
| Everyone else | Their own timesheet, and nothing else. |

Reusing the Workload rule rather than writing a second one is the whole point:
two permission models over the same people is how one of them quietly becomes
wrong. A person outside the caller's scope resolves to `NotFoundError`, never
a 403 — a 403 confirms the person exists and which team they are in.

**What this does not do:** it gives HR nothing unless HR holds `MANAGE_TEAMS`.
That is the right default — the capability is the switch, and it is granted
deliberately rather than implied by a job title. Confirm that HR should hold
`MANAGE_TEAMS`, or say so and a narrower `VIEW_TIME_REPORTS` capability is a
small addition.

## 5. Reports read. They never write.

No report surface edits, approves or locks a work log. Module 19 BR-3 already
says only the author may edit their own entry, and a reporting screen that
could overwrite recorded time would make the record worth less than the
spreadsheet it replaces. **Approval workflow, locking a period, and
billable/non-billable are all out of scope** and each needs its own decision.

## 6. Where the code goes

In the **`time-tracking` feature**, beside the `WorkLog` writes:
`repositories/time-report.repository.ts`, `services/time-report.service.ts`,
`lib/period.ts`.

Not a new `time-reports` feature, and not inside `reports`: `reports` is the
project-report registry (velocity, burndown, cycle time), and two features
issuing their own queries against `work_logs` is how two definitions of "hours
logged" appear. One table, one owning feature.

## 7. What could make this wrong

- **If utilisation gets used in performance reviews**, the three missing
  factors in §3.3 stop being acceptable and WL-1 becomes urgent rather than
  deferred. The caveat on screen is a mitigation, not a fix.
- **If HR needs approval or period locking**, this is a reporting layer under
  a workflow that does not exist, and the workflow should be designed before
  the reports harden around its absence.
- **If anyone asks for billable hours**, that is a field on `WorkLog` that does
  not exist and a decision about what billable means here. Propose it as a doc
  change first.
