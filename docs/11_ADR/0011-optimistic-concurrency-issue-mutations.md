# ADR-0011: Optimistic Concurrency Control for Issue Mutations

**Status:** Accepted
**Date:** 2026-07-20
**Deciders:** Founding CTO; founder direction (product-grade, must hold at scale)

## Context

ADR-0010 made concurrent *reordering* collision-free, but a distinct concurrency
bug remained: a **lost update** when two people mutate the **same** card at once.
Each reads the card, computes a change, and writes — the last write silently
overwrites the first. For a drag this is mild (last position wins); for a field
edit it destroys work (one person's description is lost with no error).

This must hold from 1 to 100M users. Contention on a single card is naturally
tiny (one card, one team), so we do **not** need locks, queues, or distributed
coordination — those would add a scaling bottleneck. We need a check that is
O(1) per write and requires no held lock.

## Decision

Add a monotonic **`version Int @default(0)`** column to `Issue`. **Every**
mutation increments it. A mutation that must not clobber a concurrent change
does a **conditional write** — `UPDATE … SET …, version = version + 1 WHERE id =
? AND version = ?` (Prisma `updateMany`) — and treats **0 rows affected** as a
conflict (the row changed since the client read it), returning `409` so the
client can refresh and retry.

- The client receives `version` on every issue DTO and sends it back as
  `expectedVersion` on a reorder. Board reorder (`PATCH /issues/{id}/rank`) is
  the first consumer; the same mechanism extends to edit/transition/delete by
  adding the `WHERE version = ?` guard (they already increment).
- This is **optimistic** (no locks; conflicts are rare and cheap), the standard
  approach for collaborative record editing. It scales horizontally with no
  shared state.

Chosen over the alternatives:

| Option | Rejected because |
|---|---|
| **`updatedAt` timestamp as the token** | No schema column needed, but timestamp precision can tie two writes in the same instant → a missed conflict. An explicit integer version is unambiguous and self-documenting. |
| **Pessimistic locking** (`SELECT … FOR UPDATE`) | Holds a lock across the request; a real throughput bottleneck under load and needless when conflicts are rare. |
| **Last-writer-wins (status quo)** | Silently loses work — not acceptable for a product. |
| **Full realtime CRDT merge** | Belongs to a future live-multiplayer feature, not single-record edits; large complexity now for no current benefit. |

## Consequences

- **Positive:** lost updates on a card become an explicit, recoverable `409`
  ("refresh and retry") instead of silent data loss; O(1) per write, no locks,
  no coordination — identical cost at any user count; a general mechanism, not a
  reorder-only patch.
- **Negative / trade-offs accepted:** one extra column and a version round-trip
  in DTOs; the client must carry and resend `version` (a small contract
  addition). Under pathological contention on one card, some writes get a `409`
  and retry — acceptable, and that scenario isn't realistic at scale.
- **Scope now vs. later:** the `version` column + increment-on-every-write ships
  now, and the **reorder** path enforces the check (ADR-0010's same-card
  lost-update — the piece that was open). Extending the enforced check to
  **edit** and **transition** (the higher-value "lost edited text" case) is a
  small follow-up tracked in the ledger (DB-8), using the same column and
  pattern — no further schema change.
- **Follow-up actions:**
  1. `version` column + migration; every issue write increments it (done).
  2. `reorderWithVersion` conditional update + `expectedVersion` on the reorder
     contract; client sends and refreshes it (done).
  3. Extend the enforced check to edit/transition/delete (DB-8, open).
  4. Apply the `version` migration to prod as part of GL-4.
