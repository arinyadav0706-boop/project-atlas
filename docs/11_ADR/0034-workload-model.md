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
2. **Reference = a fixed 40-hour week** (`WEEKLY_CAPACITY_MINUTES = 2400`), a
   documented constant in code — *not* a database field. The headline number is
   **weeks of queued work** (`remaining ÷ 2400`), which is honest about its own
   precision and needs no schema change. Per-person capacity is logged in the
   backlog for when a doc requires it.
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
