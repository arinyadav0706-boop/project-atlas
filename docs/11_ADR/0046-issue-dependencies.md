# ADR-0046 — Issue Dependencies: typed links, one cycle rule, warn-don't-block

- Status: Accepted
- Date: 2026-08-19
- Deciders: Founding team
- Relates to: ADR-0045 (subtasks), ADR-0026 (epic hierarchy),
  `docs/02_Modules/27_dependencies.md`

## Context

EAGLES now has two structural relationships — Epic → child (`epicId`) and
parent → subtask (`parentId`). Both are **containment**: they say a thing is
*part of* another thing.

What is missing is the other kind: **ordering**. "This cannot start until that
finishes." Jira calls it issue links, ClickUp calls it dependencies, Asana calls
it blocked-by. All three have it, every team asks for it within a week, and it
is the prerequisite for a Timeline/Gantt view — which cannot draw an arrow it
has no edge for.

This is also the last relationship the issue model needs. Getting it right
matters more than shipping it fast, because a Timeline, a critical-path view and
"what is my team waiting on" all read from this one table.

## Decision

### 1. Three link types, not a configurable catalogue

| Type | Reads as | Symmetric? |
|---|---|---|
| `BLOCKS` | A **blocks** B / B **is blocked by** A | No |
| `RELATES_TO` | A **relates to** B | Yes |
| `DUPLICATES` | A **duplicates** B / B **is duplicated by** A | No |

Jira ships ~5 built-in types and lets an admin invent more. We ship three and no
editor.

The reason is not effort, it is that a configurable link vocabulary is a trap at
this size. Every extra type is another thing a reader must interpret and another
thing that means slightly different things to different teams; Jira instances in
the wild routinely accumulate "Discovered while testing" and "Problem/Incident"
links nobody can define. Three types cover the three actual questions — *what is
in my way*, *what should I read alongside this*, *is this the same bug*. A
fourth can be added in one enum value when a team can name what it is for.

### 2. Direction is stored once, and read from both ends

One row: `source —type→ target`. `A BLOCKS B` is stored as
`{source: A, target: B, type: BLOCKS}`, and B's page derives "is blocked by A"
by reading the rows where it is the *target*. There is no second row and no
inverse type in the enum.

Two rows per link is how link tables rot: the pair goes out of step the first
time something deletes one side, and then A blocks B while B is not blocked by
anything.

**Symmetric types are normalised**: a `RELATES_TO` row always stores the
lexicographically smaller id as `source`. Without that, "A relates to B" and
"B relates to A" are two different rows that the unique index cannot see are the
same fact.

### 3. Links may cross projects; the tenant is the boundary

Both issues must be in the caller's organisation, and the caller must be able to
see both. They need not be in the same project — cross-team dependencies are the
ones that actually hurt, and a tool that can only express within-project blocking
cannot describe the problem it exists to surface.

The read side inherits the same rule as everywhere else (ADR-0040 §1): a link to
an issue in a project you cannot see renders as a **restricted placeholder**, not
as the issue's title. The link's existence is visible — hiding it would make the
list silently incomplete — but nothing about the issue leaks.

### 4. Blocking cycles are refused — better than all three

A `BLOCKS` link that would close a loop (A blocks B blocks C blocks A) is
rejected with the path spelled out.

Jira does not check this and will happily store a cycle. ClickUp warns. We
refuse, for two concrete reasons rather than tidiness:

- A cycle is **unschedulable by definition** — there is no order in which those
  issues can be done, so the data is a statement that cannot be true.
- Every consumer of this table has to walk it. A Timeline, a critical-path
  calculation and "what unblocks the most work" all loop forever or need their
  own cycle guard. Refusing at write time means one guard, in one place, instead
  of one per reader forever.

Implemented as a bounded breadth-first walk over `BLOCKS` edges in the
repository, not a recursive SQL CTE: it is directly unit-testable, it stays
inside Prisma (Feature Architecture §4), and real dependency chains are a
handful of hops deep. It is bounded anyway (`MAX_CYCLE_NODES`) so a pathological
graph refuses the link rather than hanging the request.

### 5. A blocked issue can still be completed — it warns, it does not refuse

This is the deliberate opposite of the subtask rule (ADR-0045 §8), and the
distinction is worth stating because the two look similar.

- A **subtask** is *part of* its parent. A parent marked Done over open subtasks
  is a factual error about its own completeness, and it corrupts cycle time. So
  it is refused.
- A **blocker** is a *separate issue*. "Blocked" is a scheduling assertion made
  by a person at a point in time, and it goes stale: the blocker gets worked
  around, descoped, or turns out not to have mattered. Refusing here would be a
  tool arguing with someone who knows more than it does — and the workaround is
  to delete the link, which destroys the very data we wanted.

So: the API allows it, and the UI **asks first** — "VWP-12 is still blocking
this. Mark done anyway?" — naming the blockers. Jira does not even warn;
ClickUp makes refusal an opt-in setting. Warning by default, refusing never, is
the position that keeps the data honest.

### 6. Closing a blocker notifies whoever was waiting

When an issue moves to `DONE`, everyone assigned to an issue it was blocking is
told: *"VWP-12 is done — VWP-40 is no longer blocked."*

This is the single highest-value part of the feature and the part Jira lacks.
A dependency you have to poll is a dependency you find out about late; Asana got
this right and it is why their version feels useful rather than decorative. It
reuses the existing best-effort fan-out (ADR-0019), so a notification failure
can never fail the transition.

### 7. `blocked` is a filter, not just a badge

`GET /api/issues?blocked=true` returns issues with at least one **open**
blocker. It is the query behind "what is my team waiting on", which is the
question dependencies exist to answer, and it belongs in the shared
`IssueFilter` so saved views and dashboard widgets get it for free.

Deliberately "open blocker", not "has any blocker": an issue blocked by
something already finished is not blocked.

## Consequences

**Good.** One table serves the panel, the badge, the filter, the notification
and — later — Timeline arrows. Cross-project links work, which is where the pain
actually is. No new permission surface: visibility follows the issue.

**Costs.** The cycle guard costs a bounded walk per `BLOCKS` write (a handful of
indexed queries; ordinary links skip it entirely). Cross-project links mean the
panel can contain placeholders, which is a state the UI must render honestly.
`blocked=true` is a `some` sub-query on every filtered list that asks for it —
only when asked, but it is not free.

**Not decided here.** Timeline/Gantt with dependency arrows, critical-path
analysis, auto-scheduling dates from dependencies, dependency-aware sprint
warnings ("this sprint contains a blocked item whose blocker is not in it"), and
bulk-linking from a selection.
