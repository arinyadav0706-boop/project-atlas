# ADR-0045 — Subtasks: a second hierarchy level, Jira's model

- Status: Accepted
- Date: 2026-08-19
- Deciders: Founding team
- Relates to: ADR-0026 (Epic → child hierarchy), `docs/02_Modules/26_subtasks.md`,
  `docs/02_Modules/04_issues.md`

## Context

EAGLES has one hierarchy level: `Epic → (Story | Task | Bug)`, via `epicId`.
ADR-0026 §4 anticipated this change in as many words — sub-tasks "would reuse
the same `epicId`-style parent pointer under a new rule set, or a dedicated
`parentId` — the single-level rule here is the explicit line they'd extend,
documented so it's a conscious change, not an accident."

This is that conscious change. Every comparable tool has it: Jira sub-tasks,
ClickUp subtasks, Asana subtasks. It is the most-used feature EAGLES lacks, and
it is load-bearing for what comes after — dependencies, roll-ups and accurate
time tracking all read off the hierarchy, so the shape has to be right before
they are built on top of it.

## Decision

### 1. A subtask is a full issue, not a checklist item

It gets its own key, status, assignee, priority, description, comments,
attachments, work logs, custom field values and audit trail. Jira's model, not
Asana's lightweight one.

The deciding argument is not fidelity to Jira, it is that a checklist item
cannot do the job. A subtask has to be **assignable to a different person than
its parent** ("Ravi writes the migration, Priya reviews it"), has to show up in
that person's Workload, and has to carry its own time. A boolean on a parent row
does none of that, and the moment someone asks for it you are building the real
thing anyway — twice.

Cost, stated plainly: the issue count grows. A team that splits every story into
four subtasks quadruples its rows. The mitigations are in §6 (subtasks stay out
of the backlog) and BR-9 (a cap per parent).

### 2. `SUBTASK` joins the `IssueType` enum, paired with a new `parentId`

```prisma
enum IssueType { EPIC STORY TASK BUG SUBTASK }

model Issue {
  parentId String?
  parent   Issue?  @relation("Subtasks", fields: [parentId], references: [id])
  subtasks Issue[] @relation("Subtasks")
}
```

with the invariant **`type = SUBTASK` ⟺ `parentId IS NOT NULL`**.

Two things were considered and rejected:

- **`parentId` alone, with "has a parent" meaning "is a subtask".** Every
  existing surface already switches on `type` — icons, the board filter, the
  backlog, the shared `IssueFilter`. A dedicated type makes "exclude subtasks"
  expressible in the filter language we already have, in one place, instead of
  an easily-forgotten `parentId: null` in every query.
- **Reusing `epicId` for both levels.** It would collapse two rule sets into
  one column whose meaning depends on the row's type — the worst of both.

The invariant is enforced **twice**: in the service, and by a Postgres `CHECK`
constraint in the migration. Not belt-and-braces for its own sake — this is the
one rule that, if broken, produces rows no query knows how to interpret (a
`SUBTASK` with no parent is an orphan the backlog hides and the board shows
parentless), and it must not depend on application code being the only writer.

### 3. Exactly one level, and it cannot be extended by accident

- A subtask's parent must be a `STORY`, `TASK` or `BUG` **in the same project**.
- An `EPIC` can never be a subtask's direct parent — the epic is the
  grandparent, reached through the story.
- A `SUBTASK` can never be a parent.
- Nothing is its own parent.

Depth is therefore capped **by construction**, exactly as in ADR-0026: only a
`SUBTASK` may carry a `parentId`, and a `SUBTASK` may not be pointed at. There
is no chain, so there is no cycle, so there is no runtime cycle walk — and none
is added.

### 4. `parentId` is a second pointer, not a replacement for `epicId`

Jira itself unified Epic Link and Parent into one `parent` field in 2023, and
that is the better long-term shape. We are not doing it now: `epicId` has 126
call sites across board, backlog, sprints, filters, reports and saved views, all
working. Unifying means a data migration plus rewriting all of it for **zero
user-visible gain today**, and the risk lands on features people already use.

Logged as a follow-up (backlog ST-7) rather than left implicit. The rule that
keeps the two coherent in the meantime: **`epicId` is the story's parent,
`parentId` is the subtask's parent, and no row ever has both** (only non-epics
carry `epicId`; only subtasks carry `parentId`; a subtask carries no `epicId`).

### 5. A subtask has no independent sprint — it follows its parent

Moving a parent into a sprint, or back to the backlog, moves its subtasks in the
same transaction. A subtask cannot be sprinted on its own.

This is Jira's behaviour and it is right: a subtask is a *part of* its parent's
work. A sprint containing "write the tests" but not "add login" is not a plan,
and a sprint burndown counting a subtask separately from its parent is arithmetic
nobody asked for.

### 6. Backlog excludes subtasks; the board includes them

- **Backlog** — excluded. The backlog is the list of independently plannable
  work. A subtask is not independently plannable (§5), and a backlog four times
  longer than the number of real decisions in it is a worse backlog.
- **Board** — included, as its own card, badged with its parent's key. A subtask
  has its own status, and something with a status has to be movable somewhere.
- **Cross-project `/issues`, saved views, dashboards** — included, and the
  filter gains an explicit `subtask` control (`only` / `exclude`), which is the
  equivalent of Jira's `type != Sub-task`.

### 7. Subtasks carry no story points — a deliberate divergence from Jira

Jira lets you point a subtask, does not roll it up to the parent, and *does*
count it in sprint velocity. That combination is one of the most-complained-about
behaviours in the product: a 5-point story split into a 3 and a 2 makes the
sprint report say 10.

EAGLES computes velocity by summing points over a sprint
(`12_Metrics/01_Metric_Definitions.md`). So the field is **refused on a subtask**
rather than accepted and quietly excluded. Estimation happens at the level a team
commits to, which is the story.

What does roll up:
- **Progress** — "3 of 5 subtasks done", a count, and honest at any size.
- **Time** — remaining `estimateMinutes` sums parent + subtasks. Minutes are
  additive by definition; points are a judgement about a whole deliverable and
  are not.

### 8. A parent cannot move to DONE while a subtask is open

Jira warns and lets you through. EAGLES blocks it, with a message naming how
many are open.

The reason is specific to what this app is for. Cycle time and velocity are both
derived from status transitions (ADR-0031, the audit-log replay). A story marked
Done with three open subtasks records a completion that did not happen, and every
metric downstream of it is then wrong in a way nobody can see. A tracker whose
numbers are its selling point cannot ship the permissive version.

Scoped narrowly, so it blocks the wrong thing and nothing else:
- It applies only to a parent **transitioning into** `DONE`.
- Adding a subtask to an already-done parent is allowed (that is a new discovery,
  not a false completion).
- Bulk edit reports it per issue like any other refusal (ADR-0041 §1), so a
  40-issue bulk move still applies to the 37 that are legal.

### 9. Deleting a parent deletes its subtasks; deleting an epic still detaches

ADR-0026 §2 detaches an epic's children, because they are real work items that
survive the grouping. A subtask is not that — "write the tests", detached from
"add login", is noise nobody will ever triage.

So subtask delete **cascades** (soft, like everything else — no hard deletes),
and the confirmation says how many will go with it. Two different rules for two
different relationships, each stated where it applies rather than one rule
awkwardly covering both.

### 10. Convert in both directions

- **Issue → subtask**: pick a parent. Refused if the issue is an `EPIC`, has epic
  children, or already has subtasks of its own (that would make depth 2).
  Clears `epicId` and `storyPoints` — with the reason shown before it happens,
  not silently.
- **Subtask → issue**: clears `parentId`, becomes a `TASK`.

Both go through the same validated write path as any other edit, version-checked
(ADR-0011).

## Consequences

**Good.** One shared `IssueFilter` change gives Board, Backlog, `/issues`, saved
views and dashboards a consistent answer about subtasks. Subtasks inherit
comments, attachments, custom fields, notifications, RBAC and audit with no new
code, because they are issues. The hierarchy needed by dependencies and roll-ups
now exists.

**Costs.** More rows (§1). A second parent pointer alongside `epicId` until ST-7
unifies them (§4). The DONE guard will occasionally block someone who wanted
through (§8) — deliberate, and reversible in one place if teams reject it.
Subtasks appear on the board, which makes a busy board busier (§6); the parent
badge is the mitigation, and a board-level "hide subtasks" toggle is ST-5.

**Not decided here.** Issue dependencies (blocks / blocked by), subtask
templates, drag-reordering subtasks within a parent, a board toggle to hide them,
and unifying `epicId` into `parentId`.
