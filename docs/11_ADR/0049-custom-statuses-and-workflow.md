# ADR-0049 — Custom statuses and workflow

- **Status:** Accepted
- **Date:** 2026-08-21
- **Module:** `docs/02_Modules/30_workflow.md`
- **Relates to:** ADR-0024 (permission engine), ADR-0011 (optimistic
  concurrency), ADR-0014 (sprints), ADR-0046 (dependencies), 05_board, 11_reports

## Context

`IssueStatus` is a Postgres enum of four values, hard-coded since the schema was
written. Every team in the org gets To Do / In Progress / In Review / Done,
whatever they actually do. A support team wants Triage and Waiting on Customer;
a design team wants Concept and Critique. Both Jira and ClickUp have let teams
define their own statuses for a decade, and it is the most common thing an
evaluator checks.

It is also the single most expensive thing left to change. The enum is read in
**72 files** across 64 comparison sites: board columns, the backlog, reports,
metrics, the workload model, the dependency "is it done" guard, the subtask
roll-up, the issue filter, and a `Record<IssueStatusDto, number>` counts type
that is keyed by the enum itself. Every module shipped since has widened that
surface, which is why this is being done now rather than later.

## Decision

### 1. A status has a CATEGORY, and the category is the stable contract

This is the whole design, and it is what both competitors do. Jira gives every
status one of three categories (To Do / In Progress / Done); ClickUp gives every
status a type (Not Started / Active / Done / Closed). Nothing downstream asks
"is this status called Done" — it asks "is this status *in the done category*".

So: **`Issue.status` stops being the status and becomes the category.** It keeps
its column, its four values and its meaning to every existing consumer. A new
`Issue.statusId` points at a per-project `WorkflowStatus` row, which carries the
name, colour and order a human sees.

The consequence is the point: 64 comparison sites, every report, every metric,
the dependency guard and the subtask roll-up keep working **unchanged**, because
they were already asking a category question. Only the places that *display* or
*set* a status need to know about the new table.

### 2. The category set stays at four, including IN_REVIEW

Jira uses three. We keep the four we have — To Do, In Progress, In Review, Done
— and the reason is not laziness, it is that changing the set means backfilling
and re-testing every one of those 64 sites for zero user-visible gain.
"In Review" is also a genuinely useful category in an engineering tool: it is
the bucket meaning *waiting on somebody else*, which is what the workload model
and the blocked-work reports care about. ClickUp ships four categories too.

The Prisma enum is **renamed** `IssueStatus` → `StatusCategory`, because a type
whose name lies about what it holds is a tax paid forever. Only two files import
it from the client, so the rename is cheap now and never gets cheaper.

### 3. Statuses belong to a project, seeded from a template

Not to the organization, and not behind Jira's scheme indirection.

Jira's workflow *schemes* — a shared workflow attached to many projects through
a scheme object — are the right answer at 500 projects and a governance team,
and they are also the single most complained-about part of Jira administration.
Per-project rows are simple, need no join to answer "what are this project's
statuses", and can grow a scheme layer later by adding a nullable `schemeId`
without moving any data. Sharing is tracked (WF-3), not pre-built (rule 10).

Every project gets the same four statuses at creation, so nothing changes for a
team that never opens the editor.

### 4. Deleting a status must move its issues, never orphan them

A status with issues on it cannot simply disappear. Deleting one requires a
replacement, and every issue on the old status moves to it in the same
transaction — the same shape as deleting a label or a component. Three refusals:
the last status in a category, the project's default status, and a replacement
in a different category (which would silently change what "done" means for those
issues).

### 5. Transitions are OFF by default

Jira's workflow engine — transitions with conditions, validators and post
functions — is genuinely powerful and is also why "why can't I move this ticket"
is a support category at every company that runs Jira. ClickUp and Asana let you
move anything anywhere.

So the default is free movement, and a project may opt into **restricted
transitions**: an explicit set of allowed from → to pairs, enforced server-side,
with a refusal that names what *is* allowed rather than just saying no.
Conditions, validators and post-functions are not built (WF-4) — an approval
rule nobody can see is worse than no rule.

### 6. The category, not the status, decides what "done" means

Stated separately because it is the invariant everything rests on:
`Issue.status` is always equal to the category of `Issue.statusId`. It is
denormalised deliberately — the alternative is a join on every list query in the
product — and it is written in one place, in the service, in the same update.
An integration test asserts the two can never disagree.

### 7. Expand, backfill, contract — in that order

The migration adds `statusId` **nullable**, creates four `WorkflowStatus` rows
per existing project, points every issue at the row matching its current
category, and only then makes the column `NOT NULL`. A single migration that
added a required FK would fail on the first existing row.

This also means a deploy that runs the migration and *not* the new code is
harmless: the old code reads `status`, which still holds exactly what it held
before. Given DB-2 — the deploy that once ran `next build` without
`migrate deploy` and took production down — a migration that is safe in both
orders is not a nicety.

## Consequences

**Good.** Teams define their own statuses. Everything downstream keeps working
because it was already category-based. The board becomes data-driven rather than
a hard-coded four columns. The rename makes the model say what it means.

**Costs.** Two writes where there was one, and an invariant that lives in the
service rather than in a constraint — a CHECK cannot span tables, so an
integration test is the guard. The board can no longer assume four columns, so
its layout has to cope with two or with twelve. Per-project statuses mean an org
with 40 projects has 160 status rows and no way to rename "In Review" everywhere
at once (WF-3).

**Not decided here.** Shared status schemes across projects, transition
conditions/validators/post-functions, per-status WIP limits, automations
triggered by a transition, and a status-change audit view beyond the existing
activity feed.
