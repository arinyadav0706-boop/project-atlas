# ADR-0050 — Automations

- **Status:** Accepted
- **Date:** 2026-08-21
- **Module:** `docs/02_Modules/31_automations.md`
- **Relates to:** ADR-0049 (statuses), ADR-0024 (permission engine), ADR-0019
  (notifications), ADR-0046 (dependencies), ADR-0011 (optimistic concurrency)

## Context

Every competitor has this and we do not. Jira Automation, ClickUp Automations
and Asana Rules are the same idea and, when you strip the marketing, the same
shape: **a trigger fires, conditions decide, actions run**. It is the feature
that turns a tracker into something a team stops maintaining by hand — "when a
bug is marked Done, tell the reporter", "when a story enters review, assign the
QA lead", "when priority goes to Highest, comment the escalation checklist".

It is also the feature most able to damage a project silently. A rule that
changes a field can trigger a rule that changes it back. An action that runs
under the triggering user's name makes an audit log lie. A rule that fails
quietly leaves someone staring at an issue that did not do what they were told
it would.

So the interesting decisions here are not "what triggers exist". They are the
four safety properties, and they are what this ADR is mostly about.

## Decision

### 1. Trigger → Conditions → Actions, exactly as the others do

One trigger per rule; conditions ANDed; actions in order. This is Jira's shape,
ClickUp's shape and Asana's shape, and copying it is deliberate — the mental
model is the thing users already have, and inventing a different one buys
nothing.

Caps, in the same spirit: **1 trigger, ≤10 conditions, ≤5 actions, ≤20 rules per
project**. ClickUp allows 1/15/6. A rule with 15 conditions is not a rule
anybody can reason about, and a per-project ceiling is what stops one project's
automation budget from becoming everyone's performance problem.

### 2. Rules are per project

Consistent with statuses (ADR-0049 §3) and for the same reasons: no scheme
indirection, no join to answer "what automates this project", and a nullable
`scopeId` can widen it later without moving a row. Org-wide rules are tracked
(AUT-4), not pre-built.

### 3. Automation changes do NOT re-trigger automations

**The single most important rule in the module.** A status-change rule whose
action changes status is an infinite loop, and it is the first thing anybody
builds by accident.

Jira's default is exactly this, and it is right: a change made by the automation
actor does not fire further rules. That makes the common accident inert rather
than catastrophic, and it makes rule behaviour predictable — a rule reacts to
*people*, not to other rules.

Chaining is genuinely useful and is tracked (AUT-5) behind an explicit
per-rule opt-in with a depth limit, which is also how Jira ships it. Defaulting
it on would be choosing a nice-to-have over a footgun.

Belt as well as braces: execution carries a **depth counter capped at 1** and a
per-request executed-rule cap, so even a future opt-in cannot produce an
unbounded cascade.

### 4. Actions run as an "Automation" actor, never as the triggering user

If a rule reassigns an issue, the activity feed must not say Priya did it. Priya
moved a card; the rule reassigned. Attributing automated writes to whoever
happened to trip the trigger makes the audit log actively misleading — the one
thing an audit log may never be.

Every automated write is attributed to the rule, and the run log records which
rule did what. Jira does this with a dedicated "Automation for Jira" user; we do
it with an actor whose id is the rule's.

**Amended during implementation.** That actor covers almost everything for free,
because `updatedBy`, the audit log's `actorId` and a notification's `createdBy`
are all plain columns. Two places are not:

- `RecentItem.userId` is a real FK. A rule has no "continue working" list, so
  the recorder short-circuits on an automation actor rather than inserting.
- `Comment.authorId` is a real FK, and a comment must show *somebody*. So
  `authorId` became nullable alongside a new `automationRuleId`, with a CHECK
  that exactly one is set. A rule's comment renders as the rule's current name
  with an "Automation" badge and no edit affordance.

The rejected alternative was a real `Automation` user row per organization —
Jira's model. It fails here for a reason worth recording: that row would surface
in every member picker, mention list, assignee dropdown, workload chart and seat
count in the product, and each new user-listing query would be a fresh place to
forget the filter. One nullable column and a CHECK is a smaller, more durable
promise than an exclusion rule eight queries have to remember.

The `NOTIFY` action also needed its own `NotificationType.AUTOMATION` rather
than borrowing `STATUS_CHANGED`: the reader's follow-up question — "who decided
that?" — has a different answer when a rule sent it.

### 5. Execution is synchronous, AFTER the write commits, and best-effort

Not inside the transaction: an automation must never roll back the user's
action. Not a queue either — we have no worker, and adding one for V1 would be
infrastructure ahead of need (rule 10, ADR-0004 portability).

So: the primary write commits, then rules run in the same request, and any
failure is caught, logged to the run log, and swallowed with respect to the
user's action. The cost is honest — a slow rule slows the response — and the
caps in §1 bound it. A queue is the obvious V2 (AUT-6) and the service is shaped
so it can move behind one without callers changing.

### 6. Every run is recorded, including the ones that did nothing

Jira's rule audit log is the difference between "the tool is haunted" and "rule
3 did that at 14:02". We record **every** evaluation outcome:

- `SUCCESS` — actions ran, with a human sentence saying what changed
- `SKIPPED` — a condition said no, naming which one
- `FAILED` — an action threw, with the reason

Skipped runs are the ones people think are noise and are actually the most
useful: "why didn't my rule fire" is the more common question, and without the
skip record the answer is unknowable.

Retention is bounded (AUT-7) rather than unbounded growth.

### 7. Conditions and actions are JSON documents, validated by Zod at every edge

Not one table per condition type. A rule is a small document — Jira and ClickUp
both store one — and modelling `AutomationCondition` and `AutomationAction` as
tables buys referential integrity we do not need and costs a migration every
time a new action type is added.

The trade is that the database cannot police the shape, so **Zod does, on the
way in and on the way out**. Reading a rule parses it; a rule that fails to
parse is reported as broken rather than executed on a guess. Strict TypeScript
sees discriminated unions throughout, so a new action type is a compile error
everywhere it must be handled, which is exactly the property the table version
would have given.

### 8. The engine is pure

Matching a trigger, evaluating conditions and planning actions is a pure
function from `(event, rules)` to a plan. No Prisma, no clock, no IO. Same
reasoning as the Timeline's date maths and the Calendar's grid: this is where
"why did my ticket change" lives, and it must be answerable in a unit test
rather than by reproducing a state in a browser.

The service does the IO: load rules, call the engine, apply the plan, write the
log.

### 9. Actions reuse the services, not the repositories

A rule that sets status goes through the same guarded path a person does —
transition rules, the subtask-done guard, the invariant, the unblock
notification. An automation that writes straight to the table would be a way
round every rule the product has, which is how "automation corrupted our data"
happens.

The one thing automation may bypass is **optimistic concurrency**: it reads the
issue immediately before acting, so there is no stale client version to check.
It still increments the version, so a human's in-flight edit is refused rather
than silently overwritten.

## Consequences

**Good.** The competitive gap closes with one concept people already know. The
engine is pure and testable. The run log makes automated behaviour explainable,
which is the difference between a feature and a support burden. Actions reuse
the service layer, so every existing rule still applies.

**Costs.** Synchronous execution puts rule time on the user's request. JSON
documents mean the database cannot validate a rule's shape. No chaining in V1,
which some genuinely useful rules want. A rule editor is a lot of UI for a
concept that is three dropdowns.

**Not decided here.** Scheduled triggers ("every Monday", "3 days before due"),
which need a scheduler; rule chaining; org-wide rules; branches ("for each
subtask"); smart values / templating in comment text; webhooks as an action; and
a rule marketplace of templates.
