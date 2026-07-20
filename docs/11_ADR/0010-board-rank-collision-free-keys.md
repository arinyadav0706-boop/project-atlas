# ADR-0010: Board Rank — Collision-Free Keys for Concurrent Reordering

**Status:** Accepted
**Date:** 2026-07-20
**Deciders:** Founding CTO; founder direction (build for scale, not a demo)

## Context

ADR-0009 adopted string fractional ranking (`fractional-indexing`) for board and
backlog order. That scheme is correct for single-writer reordering, but under
**concurrent** reordering it has a defect: two clients dropping a card into the
*same gap* at the *same instant* both call `generateKeyBetween(before, after)`
with identical neighbours and get the **identical key**.

Consequences of a duplicate key:

- Two cards share a rank → their display order falls to the `id` tiebreaker
  (stable, but not what either user intended).
- Worse: you **cannot** `generateKeyBetween` two *equal* keys — so no card can
  ever be inserted between the two tied cards until one is re-ranked. A "dead
  gap."

This never bites at a handful of users, but EAGLES is built for scale. The
contention is naturally **per-`(project, status)` column** — it does not grow
with org size (ten million users do not drag the same card), so the realistic
worst case is a busy team triaging one board. Still, "safe = no data loss" is
not the product bar; concurrent reorders must be *correct*. String fractional
ranking is the right family (Figma, Linear, Jira all use it at scale); we just
need to close the concurrency gap. Now — while data is tiny — is the cheapest
time to change the key format, exactly as with the ADR-0007→0009 switch.

## Decision

Make every generated key **unique by construction** by appending a random
base-62 **suffix** to the fractional key:

```
rank = <fractionalKey> <SEP> <randomSuffix>      e.g.  a0V#7bQ2mК9x
```

- **`SEP` = `#`** (byte `0x23`) — deliberately lower than every base-62 key
  character (`'0'` = `0x30`), so a bare fractional key always sorts before its
  longer extensions (e.g. `a2` before `a2V`). Under `COLLATE "C"` (ADR-0009)
  ordering is pure byte comparison, so this is exact.
- **Suffix** = a short per-actor discriminator (last 4 base-62 chars of the
  actor id) + 8 random base-62 chars. The actor part means two *different*
  actors can never produce the same key even if the random parts coincided; the
  random part covers a single actor's own concurrent inserts (~2.2e14 space).
  Two truly-concurrent inserts into one gap get different suffixes → different
  keys that both order between the same neighbours. No coordination, no lock, no
  retry. The actor id is optional to the key module, so seed/backfill/tests use
  random-only.
- **Reorder** strips suffixes before bisecting (`generateKeyBetween` on the
  fractional parts) and appends a fresh suffix — see `src/shared/lib/rank.ts`.
- **Backward compatible:** bare backfilled keys (`a0`, `a1`, …) have no
  separator and are their own fractional part, so old and new keys interoperate
  with **no data migration**.
- **Backstop:** a **unique** index on `(projectId, status, rank)` (ADR-0010
  migration) makes the astronomically-rare suffix collision a loud error, never
  a silent duplicate. It also covers the `ORDER BY rank` query.

The suffix combines **actor id + random jitter** rather than either alone:
random jitter provides the core guarantee, and the actor discriminator makes
cross-actor collisions impossible by construction (the "actor-suffix" the
founder asked for). The actor id is threaded as an optional argument so the key
module stays pure and usable without actor context.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **`id` tiebreaker only** (status quo) | Display stays consistent, but tied cards create a "dead gap" you can't insert between; not correct. |
| **Unique index + regenerate-on-conflict retry** | Works, but adds a retry loop and, under real contention, retry storms on the hot gap. Suffix keys avoid collisions entirely, so retries are never needed. |
| **Full CRDT sequence** (site-id interleaved, Yjs/Fugue-style) | Correct and powerful, but real complexity we don't need for per-column board contention; revisit only if/when live multiplayer boards are built. |
| **Random-only suffix** (no actor part) | Equivalent in practice, but adding the actor discriminator makes cross-actor collisions impossible by construction for negligible cost, and matches the intended design. |

## Consequences

- **Positive:** concurrent reorders are collision-free *by construction* — no
  duplicate ranks, no dead gaps, no retries; keys stay byte-ordered; backward
  compatible with existing data; the foundation for future realtime multiplayer.
- **Negative / trade-offs accepted:** keys are ~9 chars longer (negligible);
  a residual rare edge remains — inserting *between two cards that already share
  a fractional part* (from a prior collision) can't bisect, so the new card
  lands within that cluster rather than exactly between (documented in
  `rank.ts`; the re-rank repair tool, DB-8, tidies clusters). This is
  Postgres-byte-order dependent, inheriting ADR-0009's `COLLATE "C"` requirement.
- **Not covered here (separate concern):** *lost updates* when two clients move
  the **same** card — currently last-writer-wins. Optimistic concurrency
  (reject a stale move, refresh) is tracked as a follow-up on DB-8, not part of
  this key-format decision.
- **Follow-up actions:**
  1. Suffix key generation in `rank.ts` + unit/fuzz/collision tests (done).
  2. Unique index `(projectId, status, rank)` migration + integration test
     proving two same-gap moves persist distinctly (done).
  3. Optimistic-concurrency guard for same-card moves (DB-8, open).
  4. Apply the unique index to prod as part of GL-4 — check for pre-existing
     duplicates first (see migration note).
