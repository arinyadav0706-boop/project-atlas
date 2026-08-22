# 31 — Automations

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0050-automations.md`
- **Depends on:** 30_workflow (statuses are what most rules react to),
  04_issues (the write paths actions reuse), 10_notifications, 15_roles

## 1. Overview

Per-project rules of the form **when X happens, if Y is true, do Z** — the same
shape Jira, ClickUp and Asana all use.

Scope: four triggers, six condition types, five actions, an enable/disable
toggle, and a run log. Not: scheduled triggers, rule chaining, branches, smart
values, webhooks.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | A rule is **one trigger, N conditions (ANDed), N actions in order**, scoped to one project. Caps: **10 conditions, 5 actions, 20 rules per project** (ADR-0050 §1). |
| BR-2 | **A change made by an automation never triggers another automation.** The commonest accidental rule — "when status changes, change status" — must be inert, not catastrophic. Enforced by the actor on the write, plus a depth counter capped at 1 and a per-request executed-rule cap. Chaining is a tracked opt-in (AUT-5), not a default. |
| BR-3 | Actions are attributed to the **rule**, never to the person who tripped the trigger. An activity feed saying Priya reassigned an issue she did not reassign is an audit log that lies. A rule's comment carries `automationRuleId` instead of an `authorId` (ADR-0050 §4) and renders with an "Automation" badge; nobody can edit it. |
| BR-4 | Rules run **after the primary write commits**, in the same request, best-effort. A failing rule is logged and swallowed: an automation may never fail or roll back the action a person took. |
| BR-5 | **Every evaluation is recorded** — `SUCCESS`, `SKIPPED` (naming the condition that stopped it) or `FAILED` (naming the error). Skips are the most useful record: "why didn't my rule fire" is the more common question. |
| BR-6 | Conditions and actions are JSON documents **parsed with Zod on write and on read**. A rule that no longer parses is reported as broken and skipped, never executed on a guess. |
| BR-7 | Actions go through the **service layer**, so every existing rule still applies — transition restrictions, the subtask-done guard, the status/category invariant, the unblock notification. |
| BR-8 | Automation writes skip the optimistic-concurrency **check** (there is no stale client version) but still **increment** the version, so a human's in-flight edit is refused rather than silently overwritten. |
| BR-9 | Rules are administered by **LEAD** on the project, or an org ADMIN (ADR-0024), server-side. Anyone who can see the project can read the rules and the run log — automated behaviour that only admins can explain is worse than no automation. |
| BR-10 | A disabled rule is evaluated by nothing and logs nothing. Disabling is the safe alternative to deleting. |
| BR-11 | A rule whose action references something deleted (a status, a user who left) fails that run, logs why, and leaves the issue alone. It does not disable itself — a transient reference and a permanent one are indistinguishable at run time. |
| BR-12 | Deleting a project's status does **not** cascade to rules referencing it; the next run fails loudly per BR-11. Silently rewriting somebody's rule is worse than telling them it broke. |

## 3. Database

Plus two changes outside this module's own tables, both from ADR-0050 §4:
`Comment.authorId` is nullable with a new `automationRuleId` and a CHECK that
exactly one is set, and `NotificationType` gained `AUTOMATION`.

```prisma
enum AutomationTrigger {
  ISSUE_CREATED
  STATUS_CHANGED
  ASSIGNEE_CHANGED
  PRIORITY_CHANGED
}

enum AutomationRunOutcome {
  SUCCESS
  SKIPPED
  FAILED
}

model AutomationRule {
  id             String            @id @default(cuid())
  organizationId String            // denormalised for tenant-scoped queries (F-1)
  projectId      String
  name           String
  enabled        Boolean           @default(true)
  trigger        AutomationTrigger
  /// Zod-validated documents (ADR-0050 §7). The DB cannot police the shape, so
  /// every read and write parses them.
  conditions     Json
  actions        Json
  // + audit fields, deletedAt
  @@index([projectId, enabled])
}

model AutomationRun {
  id         String               @id @default(cuid())
  ruleId     String
  projectId  String
  issueId    String?
  outcome    AutomationRunOutcome
  /// One human sentence: what changed, or which condition stopped it, or why it failed.
  detail     String
  durationMs Int
  createdAt  DateTime             @default(now())
  @@index([ruleId, createdAt])
  @@index([projectId, createdAt])
}
```

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/automations` | Rules with their last run. |
| `POST` | `/api/projects/{id}/automations` | Create a rule. |
| `PATCH` | `/api/projects/{id}/automations/{ruleId}` | Rename, enable/disable, replace the rule document. |
| `DELETE` | `/api/projects/{id}/automations/{ruleId}` | Soft-delete. |
| `GET` | `/api/projects/{id}/automations/runs` | The run log, newest first, optionally by rule. |

## 5. Triggers, conditions and actions

**Triggers** — `ISSUE_CREATED`, `STATUS_CHANGED`, `ASSIGNEE_CHANGED`,
`PRIORITY_CHANGED`. Every one is a thing a person did; scheduled triggers need a
scheduler and are future scope.

**Conditions** — all optional, all ANDed:

| Condition | Meaning |
|---|---|
| `TYPE_IS` | Issue type is one of … |
| `PRIORITY_IS` | Priority is one of … |
| `STATUS_CATEGORY_IS` | The issue's category is one of … (BR-3 of 30_workflow) |
| `STATUS_IS` | The issue is on one of these exact statuses |
| `ASSIGNEE_IS` | Assigned to one of these people, or unassigned |
| `HAS_LABEL` | Carries one of these labels |

**Actions** — run in order:

| Action | Effect |
|---|---|
| `SET_STATUS` | Move to a status in this project |
| `ASSIGN` | Assign to a person, or unassign |
| `SET_PRIORITY` | Change priority |
| `ADD_COMMENT` | Post a comment as the rule |
| `NOTIFY` | Notify the assignee, the reporter, or a named person — typed `AUTOMATION`, so the bell says a rule sent it |

## 6. UI

Project settings → **Automations**.

- **Rule list** — name, a one-line plain-English summary ("When status changes →
  if type is Bug → assign to Priya"), an enable switch, last run outcome and
  when.
- **Builder** — three stacked sections, **When / If / Then**, matching the shape
  the other tools use. Conditions and actions add and remove inline.
- **Run log** — newest first, colour-coded by outcome, each row one sentence.
  Reachable by anyone who can see the project (BR-9).

## 7. Acceptance Criteria

1. A rule with no conditions fires on every matching trigger.
2. A condition that does not hold produces a `SKIPPED` run naming it, and no
   change to the issue.
3. Actions run in order; a failure at action two logs `FAILED` and leaves the
   earlier actions applied.
4. A rule whose action changes the trigger's own field does **not** re-fire —
   one run, not a loop.
5. Automated changes are attributed to the rule in the activity feed, never to
   the triggering user.
6. A rule failure never fails the user's action: the issue still moves.
7. `SET_STATUS` obeys the project's transition rules and the subtask-done guard.
8. A disabled rule never runs and never logs.
9. A rule referencing a deleted status logs `FAILED` and leaves the issue alone.
10. A MEMBER can see rules and the run log but cannot create or edit; a LEAD and
    an org ADMIN can; another org's project is a 404.
11. Twenty rules is the ceiling; the twenty-first is refused with a clear reason.
12. The response to the write that tripped a rule reflects what the rule did —
    creating a bug under an "escalate new bugs" rule returns it already
    escalated, not at the priority it held for a millisecond beforehand.

## 8. Future Scope

Scheduled triggers ("every Monday", "3 days before due"), rule chaining behind a
per-rule opt-in with a depth limit (AUT-5), org-wide rules (AUT-4), branches
("for each subtask"), smart values in comment text, webhook actions, a template
gallery, and moving execution behind a queue (AUT-6).
