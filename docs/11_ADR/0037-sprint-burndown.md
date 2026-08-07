# ADR-0037: Sprint burndown — replaying history we actually have

**Status:** **Accepted** — 2026-08-07.
**Date:** 2026-08-07
**Deciders:** Founders (Arin), acting CTO

## Context

Burndown is the last thing keeping the Sprint module at 🟡, and it is the one
report that asks a question our schema was not built to answer:

> How much work was still open on **each day** of the sprint?

Every other report we ship reads present state. Burndown reads *history*. Before
designing anything we audited what history actually exists.

### What the data can and cannot tell us

| Question | Can we answer it? | Why |
|---|---|---|
| What status was issue X on day D? | **Yes, exactly** | `ISSUE_STATUS_CHANGED` audit rows carry **both** `beforeData.status` and `afterData.status`. The `before` field is what makes this exact rather than assumed — the state *prior* to the first recorded change is recorded, so there is no need to guess a starting status. |
| Was issue X in the sprint on day D? | **No** | Sprint membership changes write **no audit row at all**. `Issue.sprintId` is present-state only. |
| How big was issue X on day D? | **No** | `storyPoints` changes are not audited. `ISSUE_ESTIMATE_SET` exists for `estimateMinutes` but is not replayed here. |

`docs/12_Metrics/01_Metric_Definitions.md` anticipated exactly this and set the
governing rule: *"never fake it with a present-state approximation labelled as
history."* The word that matters is **labelled**. A present-state approximation
that announces itself is honest; one that pretends to be history is not.

## Decision

### 1. Burndown v1 ships now, with its limitation printed on the chart

Cohort = the issues **currently** in the sprint. Their day-by-day status comes
from **exact replay** of the audit log. The chart states, in the same place the
workload page states its unestimated warning:

> Based on the N issues in this sprint **now**. Issues added or removed
> mid-sprint are not reflected — we don't record that history yet. Status
> history is exact.

For a sprint whose contents were stable — the common case — this *is* the true
burndown. For one that churned, it is wrong in a specific, named, predictable
direction, which a reader can reason about. That is a materially different thing
from a number that is quietly wrong.

### 2. `ISSUE_SPRINT_CHANGED` starts being audited today

Additive, no schema change (`AuditLog.action` is already a free string). It is
written on `SprintService.moveIssue` — the single-issue drag into or out of a
sprint, which is *the* mid-sprint scope change that distorts a burndown.

**Scope note, deliberate:** the bulk paths (`delete` → release to backlog,
`complete` → move incomplete onward) are *not* audited in this change. They fire
at a sprint **boundary**, not inside its window, so they cannot distort a
burndown drawn over `[startDate, endDate]`. Auditing them is cheap and is logged
as a follow-up, but it is not needed for correctness here.

Every day this event does not exist, that day's membership history is lost
permanently. That is why it ships now rather than with v2.

### 3. Three units, chosen by the viewer

`Points · Issues · Hours`, defaulting to **points** so burndown and velocity
speak the same language.

This is not decoration. Our own demo org has **153 of 259 open issues with no
estimate**; a team with no story points would see a flat zero line and conclude
the chart is broken. Letting the reader switch to **Issues** — which is always
populated — means the report is useful to a team that does not estimate, and the
honest companion to velocity for one that does.

Per unit: `points = storyPoints ?? 0`, `issues = 1`, `hours = estimateMinutes ?? 0`.
Nulls contribute zero **and are counted separately**, never imputed (Metric rule 3).

### 4. Two honesty counters travel with the data

- **`unsized`** — issues in the sprint carrying no value for the chosen unit.
  Same treatment as workload's unestimated banner: the line is a floor, not a
  reading.
- **`untrackedDone`** — issues that are Done **now** but have no recorded
  `DONE` transition. Their completion date is unknowable, so replay treats them
  as Done for the whole sprint, which drags the line down from day one. This is
  the one place replay can be silently wrong, so it is counted and surfaced
  rather than absorbed.

### 5. The ideal line is a straight line across calendar days

From total scope at sprint start to zero at sprint end. Not working-day-aware:
that would need the org's working week *and* a position on partial sprints, and
a dashed reference line implying that much precision would be false. Labelled
"ideal", as a reference, not a target.

### 6. Where the arithmetic lives

`src/features/reports/lib/burndown.ts` — pure, no I/O, unit-tested, per the
Metric Definitions checklist ("put the arithmetic in a pure, unit-tested
function, not inline in a repository or a component"). The registry definition
(ADR-0020) stays a thin wrapper, as velocity and cycle time are.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Wait for real membership history before shipping any chart | Correct but slow — no burndown for weeks, and Sprint stays 🟡. The caveated version is useful *today* for stable sprints, and the audit event ships either way, so waiting buys accuracy we can also get by upgrading v1 in place. |
| `sprint_daily_snapshot` table + scheduled job | The right long-term answer, and it would also fix velocity's "history moves" caveat. Too heavy for this step: schema change plus a cron plus a backfill story. Logged as a follow-up, and v1's DTO shape does not block it. |
| Infer membership from `Issue.updatedAt` | `updatedAt` moves for *any* edit. Inferring "joined the sprint then" from it would invent history — precisely what the metrics rules forbid. |
| Assume every issue started the sprint in `TODO` | Wrong whenever a sprint carries work in flight, and unnecessary: `beforeData` gives the true prior status. |
| Points only | A team with no story points gets a flat zero line and learns the reports lie. |

## Consequences

- **Positive:** Sprint 🟡 → ✅. No schema change. Status history is exact, not
  approximated. Membership history begins accumulating today. Three units mean
  the report works for teams that estimate and teams that don't. The pure
  engine is reusable by the planned throughput and predictability metrics.
- **Trade-offs:** mid-sprint scope changes are invisible until enough history
  accrues for v2. `untrackedDone` issues (those predating audit logging) pull
  the line down; counted and shown.
- **Cost:** one pure module + tests, one repository read, one registry entry, a
  `line` option builder for the chart kit, and the audit event.

## Follow-ups

- **v2 — true membership replay** once `ISSUE_SPRINT_CHANGED` has accumulated,
  plus scope-change markers on the chart (Jira draws these).
- Audit the bulk sprint paths (`delete`, `complete`) for completeness.
- `sprint_daily_snapshot`, which would also retire velocity's caveat
  (Metric Definitions §3).
