# ADR-0007: Board Card Ordering — Float Fractional Indexing

**Status:** Superseded by [ADR-0009](0009-board-card-ordering-lexorank.md)
**Date:** 2026-07-19
**Deciders:** Founding CTO (this document), founder go-ahead on Board build

> **Superseded (2026-07-19):** this chose float fractional indexing to avoid a
> migration. That was mis-prioritised — EAGLES is built for future scale, and now
> (near-zero data) is the cheapest time to adopt the robust scheme. See ADR-0009:
> string fractional ranking (LexoRank-style). The reasoning below is retained for
> the record.

## Context

The Board (and Backlog) let users drag cards to reorder them within a status
column. We need an ordering scheme where:

1. A single move updates **one row**, not the whole column (write-cheap at scale).
2. You can always **insert between** any two adjacent cards.
3. It behaves correctly when the board is **filtered** (reorder relative to the
   *visible* neighbours — see ADR-0008).
4. It doesn't force a schema migration on already-live issue data if avoidable.

The schema already has `Issue.boardOrder Float`, and the existing module docs
(`04_issues.md` BR-7, `03_Database/01_Database_Design.md`) already describe it as
a **fractional index with a rebalancing rule**. The only real defect today is
the *create* semantics: new issues are stamped `boardOrder = Date.now()`
(`issue.repository.ts`), which collides and doesn't compose with "insert
between". The tech-debt ledger flagged this as UX-2 ("LexoRank-style").

## Decision

Keep **float fractional indexing** as the ordering mechanism. A card's position
is a `Float boardOrder`; to place a card between neighbours `a` and `b`, write
`(a + b) / 2` to that one row. New issues append to the end of their column
(`max(boardOrder) + STEP`), not `Date.now()`. When a column's gaps get too small
to bisect (float precision), **rebalance that column** by rewriting its cards to
evenly-spaced values in one transaction.

We deliberately choose float fractional indexing **over** string LexoRank keys
for V1.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **String LexoRank keys** (`rank: String`, base-62, Jira-style) | More robust (no precision ceiling) but requires a schema migration + backfill on **live** issue data and a bespoke key-generation utility. The float scheme already meets our needs with a rebalance safety net; the extra robustness isn't worth a live-data migration now. **Kept as the documented escalation path** if a column ever hits float precision at scale. |
| Integer gaps (1000, 2000, …; insert at 1500) | Gaps exhaust → frequent renumbering; float bisection lasts far longer between rebalances. |
| Explicit linked-list / array order | A move rewrites multiple rows — violates the one-row-write goal. |
| Keep `Date.now()` | Collides; doesn't support insert-between; not an ordering scheme at all. |

## Consequences

- **Positive:** one-row write per move; insert-between always works; **no schema
  migration** (keeps all existing docs — issues, backlog, DB, API — consistent);
  no new dependency (portability); works under filtering (bisect between visible
  neighbours).
- **Negative / trade-offs accepted:** float precision can be exhausted by ~50+
  consecutive inserts at the *same* boundary → needs an occasional per-column
  rebalance. This is rare in practice and cheap to run.
- **Follow-up actions:**
  - Fix `createWithKey` to append (`max+STEP`) instead of `Date.now()`.
  - Implement `rankBetween(before, after)` (float midpoint) + unit tests for the
    edge cases (head, tail, between, empty column).
  - Add a per-column **rebalance** utility, invoked when the gap between
    neighbours falls below a threshold (P4 safety net — ledger).
  - String-LexoRank migration remains the documented escalation if precision
    becomes a real problem at scale.
