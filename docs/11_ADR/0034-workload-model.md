# ADR-0034: Workload measured as remaining effort against a weekly reference

**Status:** Accepted
**Date:** 2026-08-05
**Deciders:** Founders (Arin), acting CTO

## Context

"Who on my team is overloaded, and who has room?" is the question our CEO
raised that EAGLES could not answer, and the one Jira answers poorly (its
capacity lives inside a sprint, so work outside a sprint is invisible).

The two axes needed to answer it now both exist:

- **People** — Teams & Hierarchy (ADR-0031/0032) says who reports to whom.
- **Effort** — Time Tracking (ADR-0030) puts `estimateMinutes` on an issue and
  logged minutes in `WorkLog`.

Workload is the first feature that joins them, and it must work **across every
project at once** — a manager's report may be split over three projects, which
is exactly the case a per-project board cannot show.

Three things must be decided: what counts as load, what it is measured
against, and who may see it.

### The capacity problem

A real capacity model wants per-person working hours, leave, and part-time
factors. **We have no such fields**, and inventing them would violate CLAUDE.md
rule 2 (never invent tables/fields) and rule 10 (no speculative scaffolding for
features no doc requires yet).

## Decision

Workload is **remaining effort on a person's open issues, expressed as weeks of
work against a fixed weekly reference**, computed per team (direct members),
across all projects, and visible to the people who manage that team.

1. **Load = remaining effort, not estimate.** For each open issue (status
   ≠ `DONE`, not soft-deleted) assigned to the person:
   `remaining = max(estimateMinutes − loggedMinutes, 0)`, summed. Work already
   logged is no longer ahead of you; using the raw estimate would double-count
   a nearly-finished issue.
2. **Reference = the organization's own working week** (see the amendment
   below). The headline number is **weeks of queued work**
   (`remaining ÷ weeklyCapacity`), which is honest about its own precision.
   Per-person capacity remains backlog WL-1.
3. **Status bands** (pure function, unit-tested): `IDLE` (no open issues),
   `LIGHT` (< 0.5 weeks), `BALANCED` (0.5–2 weeks), `OVERLOADED` (> 2 weeks).
   Two weeks of queued work is the "needs rebalancing" line.
4. **Unestimated work is surfaced, never guessed.** Issues with no estimate
   still count toward the open-issue count and are reported as a separate
   `unestimated` figure. We never impute a default estimate: a fabricated number
   presented as capacity data is worse than an honest gap.
5. **Scope is one team's direct members.** The team picker lists the teams in
   the caller's scope; selecting a parent team does *not* silently roll up its
   descendants (that inflates a row into an unreadable 91-person list and makes
   the query unbounded). Descendant teams appear as their own entries.
6. **Visibility** (server-side, service layer): a manager sees the teams they
   manage plus all descendants (`TeamService.getManagedUserIds` scope, ADR-0032);
   an org admin (capability `MANAGE_TEAMS`) sees every team in the org. Anyone
   else gets an empty scope. Tenant isolation (F-1) applies as everywhere else.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Add `weeklyCapacityMinutes` to `User` | Invents a field no module doc calls for (rules 2 and 10). The constant answers the same question today and the column can land later with a doc change, without touching the aggregation. |
| Measure load as the raw sum of estimates | Double-counts issues that are nearly done — a person with 5 almost-finished issues would read as overloaded. |
| Impute a default estimate for unestimated issues | Fabricates capacity data. Reporting the gap is more useful and more honest. |
| Count issues rather than effort | Treats a 15-minute typo fix and a two-week migration as equal load. |
| Sprint-scoped capacity (Jira's model) | Blind to everything outside a sprint, and useless for the kanban project (OPS) that has no sprints at all. |
| Roll parent teams up to include all descendants | Unbounded query and an unreadable UI (Engineering = 91 people). Descendants are selectable individually. |

## Consequences

- **Positive:**
  - Answers the manager question directly, across projects, with data we
    already store — no schema change, no migration.
  - Honest about precision: "1.3 weeks queued, 4 unestimated" instead of a
    fake percentage.
  - The people axis pays off: manager visibility (ADR-0032) is reused, not
    re-implemented.
- **Negative / trade-offs accepted:**
  - Quality depends on estimates being set. Teams that don't estimate see
    mostly `unestimated` counts — visible by design, and an argument for
    estimating.
  - One flat weekly reference ignores part-time and leave.
  - Aggregation fetches a team's open issues and groups their work logs in the
    application. Bounded by team size (~10–15 people, a few hundred issues) and
    fine at our scale; a single SQL aggregate is the documented swap if teams
    get much larger.
- **Follow-up actions required:**
  - Backlog: per-person capacity/leave; SQL-side aggregation if team sizes grow.


---

## Amendment (2026-08-05): the working week is per organization

**Status:** Accepted · supersedes the fixed constant in Decision §2.

### Context

The original decision used one hardcoded 40-hour week to avoid inventing a
schema field for capacity. That was right about per-*person* capacity and wrong
about the *organization*: EAGLES is sold to companies that work 8 hours over 6
days, 9 hours over 5, or 7.5 over 5. A hardcoded week silently mis-states every
capacity figure for all of them, and no admin setting could fix it.

This is a different question from WL-1. Per-person capacity needs leave
calendars and part-time factors — genuinely complex, still deferred. A company's
standard week is two integers and a settings field.

### Decision

Store the working week on `Organization`:

- `workingMinutesPerDay Int @default(480)`
- `workingDaysPerWeek Int @default(5)`

`weeklyCapacity = workingMinutesPerDay × workingDaysPerWeek`. Both columns are
additive with defaults, so existing rows keep today's behaviour exactly.

- Admins edit it in **Admin → Organization** in hours per day and days per week;
  the database keeps minutes so half-hour days are exact.
- The bands (0.5 weeks / 2 weeks) are unchanged and now relative to *that*
  company's week — "two weeks queued" means two of their weeks.
- Every screen that shows a capacity figure states the basis
  ("Based on a 8h × 5 days = 40h week"), so no number is unexplained.
- A misconfigured or unreadable organization falls back to 40 hours rather than
  dividing by zero.

### Consequences

- Positive: correct for a 6-day company on day one; a single setting rather than
  a code change; the arithmetic stays in one pure, tested function.
- Trade-off: still one week for everyone in the organization. Part-time and
  leave remain WL-1.
- Changing the setting re-bands everyone immediately — intended, and the change
  is written to the audit log like any other org setting.
