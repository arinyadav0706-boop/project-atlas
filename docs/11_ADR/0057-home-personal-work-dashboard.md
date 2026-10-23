# ADR-0057: Home becomes a personal work dashboard (supersedes ADR-0012's frozen section set)

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Founders, after management review of the Home mockup (October 2026)

## Context

ADR-0012 froze Home at five sections (My Work, Needs your attention, Continue
working, Due soon, Starred + recent projects), kept every number and chart off
Home, and made `AttentionSource` the only way a new module reaches it. The goal
was to stop Home from turning into a Jira gadget wall, one widget per module.

Management has since reviewed a Home mockup and asked for it. It keeps all five
sections and adds six things ADR-0012 rules out: a row of personal counts,
"Your focus", "Recent activity", a compact "Workload" chart, "Upcoming events"
and "Quick actions". We checked the mockup against the code (see the
limitations table in `docs/02_Modules/02_home.md`). Some panels run on data we
already have, some need new queries or new recording, and some have no data
source at all: system alerts, meetings, daily goals and focus mode.

The concern behind ADR-0012 still holds. If any module can add a panel, Home
grows without limit. And a mockup full of believable numbers invites us to ship
panels backed by nothing.

## Decision

Home becomes a **personal work dashboard** with a **closed set of nine
panels**. Each panel ships only when real data stands behind every element on
it.

The nine panels:

| # | Panel | Answers | Replaces / keeps |
|---|---|---|---|
| 1 | **Summary** (counts) | How much of my work is open, due, moving, stuck, finished? | new |
| 2 | **My Work** | What is assigned to me? | keeps My Work |
| 3 | **Needs your attention** | What needs me now? | keeps the attention stream |
| 4 | **Your focus** | What should I do next? | absorbs Due soon |
| 5 | **Projects** | Where do I work? | keeps the starred + recent strip, richer cards |
| 6 | **Recent activity** | What changed around my work? | new |
| 7 | **Workload** | How full is my queue compared with my team's? | new (reuses the Workload module) |
| 8 | **Upcoming** | What dates are coming? | new |
| 9 | **Quick actions** | Start a common task in one click | new |

"Continue working" moves into the app sidebar as "Recently viewed" once the
shell change lands. Until then it stays a Home panel.

The rules that keep this from becoming the gadget wall:

1. **The set is closed.** A tenth panel needs a new ADR. Modules still reach
   Home through the existing panels: anything that needs a person goes through
   `AttentionSource` (that part of ADR-0012 stands), new events go into Recent
   activity and Upcoming, and new actions become Quick actions. A module never
   gets its own box.
2. **Personal numbers only.** Home's numbers are about *me*: my issues, my
   queue against my team's. Team and organization analytics stay in Reports
   and Dashboards. The Summary row counts things a person can act on and is
   not a reporting surface.
3. **Real data or nothing.** No element ships with sample, estimated or
   decorative values. An element whose data does not exist is left out, not
   imitated. That rules out trend arrows until weekly history exists, meetings
   until a calendar is connected, the daily-goal ring until goals exist as a
   concept, and system alerts until there is a monitoring source. The mockup
   is the target layout, not a promise of every element.
4. **Bounded and streamed.** Each panel is its own `<Suspense>` boundary with
   capped reads and honest counts (02_home.md BR-8). Summary counts are
   computed server-side in one request, never as one browser request per card.
5. **Actions respect permissions.** A Quick action appears only for people
   allowed to perform it, using the same server-side check the action itself
   uses.

**Navigation is not part of this decision.** The mockup's 14-item sidebar
(Board, Backlog, Sprints, Goals, Knowledge and so on at the top level) goes
against ADR-0012's lean-navigation principle, which still applies. Changing
the navigation needs its own decision.

### Phasing

| Phase | Ships | Needs |
|---|---|---|
| **1. Existing data** | Mockup layout; Summary (open, due this week, in progress, in review, blocked, completed in the last 30 days); My Work; attention; Your focus (due soon, then high priority); Projects; Continue working | One summary query; no schema change |
| **2. New queries and recording** | Created-by-me and Mentioned tabs; Recent activity (comments, status changes); start auditing assignee changes so an Assignments tab can follow; project progress and active-sprint counts; personal Workload panel; Upcoming from due dates and sprints; Quick actions with permission checks (needs the missing project-create check) | Audit-log reads, an `ISSUE_ASSIGNEE_CHANGED` audit action, a project summary query |
| **3. New sources** | Trend arrows; meetings in Upcoming; daily goals; PR review requests in attention; focus mode | A weekly snapshot or replay, a calendar integration, a goals model, stored review requests — each its own ADR |

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Keep ADR-0012 unchanged** | Management asked for the mockup. Keeping the decision would make every panel an exception argued case by case, which is worse than a clear new rule. |
| **Configurable gadget dashboard** | The failure ADR-0012 was written against: unlimited panels, per-user layouts nobody maintains, passive charts. A closed set avoids it. |
| **Ship the mockup with sample values where data is missing** | Believable numbers that are not true are worse than no numbers. They would also hide which backend work remains. |
| **Let modules add panels when they need one** | That brings back one-widget-per-module through a slower route. |

## Consequences

- **Positive:** Home matches what management approved, and every number on it
  can be traced to a query. The closed set and the real-data rule keep ADR-0012's
  protection against clutter while removing its ban on personal numbers.
- **Negative / trade-offs accepted:** Home does more work per load (a summary
  query plus more panels), so the performance budget in
  `docs/01_Architecture/05_Performance_and_Scalability.md` applies to every
  panel. The first release will look sparser than the mockup because missing
  elements are left out.
- **Follow-up actions:**
  1. Update `docs/02_Modules/02_home.md` (panels, business rules, API,
     acceptance criteria, phases) and the `HomeResponse` schema in
     `docs/04_API/openapi.yaml`.
  2. Phase 1 in code: the summary query and the mockup layout.
  3. Phase 2: add the `ISSUE_ASSIGNEE_CHANGED` audit action early. Activity
     history only starts on the day we begin recording it.
  4. Add the missing permission check on project creation before Create
     Project becomes a Quick action.
  5. Mark ADR-0012 as superseded in respect of its frozen section set.
