# ADR-0039: Next 16 / React 19, and a version policy so this is the last forced one

**Status:** **Accepted** — 2026-08-08.
**Date:** 2026-08-08
**Deciders:** Founders (Arin), acting CTO

Closes the "Next-16 bump scheduled" half of SEC-5.

## Context

Two separate things, and it matters that they are separate.

**The immediate reason:** five high-severity advisories against `next@14` have no
fix on the 14 branch. The criticals were cleared in July by bumping `next-auth`
and `@auth/core` (SEC-5); what remains requires the framework major itself.
There is no patch to wait for.

**The reason it became a project rather than a chore:** the app was scaffolded
on 2026-07-10 on `next@14.2.35`, when 14 was already two majors old, and
**ADR-0002 records no reason for that version.** Every other technology choice
in this repository has a written rationale. This one was `create-next-app`
output taken at face value. It cost nothing at the time and now costs a major
migration, because being three majors behind turns a routine upgrade into a
migration with codemods and a full regression pass.

That second point is the one worth fixing permanently. Upgrading once and
learning nothing guarantees the same conversation in a year.

## Decision

### 1. Go to `next@16.3.0` + `react@19` in one move, not 14 → 15 → 16

A staged upgrade sounds safer and is not. The breaking changes we actually have
to absorb — async `params`/`searchParams`, `fetch` no longer cached by default —
all land in **15**, and 16 adds little on top for an app of this shape. Stopping
at 15 means paying the regression cost twice and sitting on a version that is
already superseded. One hop, one regression pass.

### 2. Async request APIs are adopted properly, not shimmed

Next 15 made `params` and `searchParams` promises. There is a compatibility
shim that lets synchronous access keep working with a warning; we do not use it.
A shim leaves 52 files that are wrong-but-quiet and a deprecation that expires
on someone else's schedule.

The official codemod does the mechanical work; every file it touches is
reviewed, because a codemod that gets 95% right leaves the 5% that matters.

### 3. `fetch` is no longer implicitly cached — and that is a fix, not a risk

In 14, `fetch` in a Server Component was cached by default and needed opting
out. In 15+ it is uncached by default and caching is opt-in. For EAGLES this
is strictly correct: this is a **work-management tool where staleness is a
defect**. A board that shows yesterday's column is worse than a board that takes
another 80ms. We read through Prisma in Server Components rather than `fetch`,
so the practical blast radius is near zero — but the new default matches what we
would have chosen anyway.

### 4. Version policy — the actual deliverable

Added to `04_Coding_Standards.md` and enforced by review, not by hope:

1. **Stay within one major of `latest` for the framework** (Next, React,
   Prisma). One major behind is a planned afternoon; three is this document.
2. **Every major-version choice gets a recorded reason.** "It is what the
   scaffolder emitted" is not a reason. If we deliberately lag, the ADR says
   why and when we revisit.
3. **Quarterly dependency review** — a scheduled look at `npm outdated` and
   `npm audit`, minuted in the backlog. Fifteen minutes, four times a year.
4. **A security advisory with no fix on the current major is a P1 upgrade
   trigger**, not a backlog row. That is what turned SEC-5 from housekeeping
   into a blocker.

## Consequences

- Five high advisories clear.
- 52 files change shape (`params` becomes awaited). Mechanical, wide, low-risk
  individually — which is exactly the change class that needs a full regression
  pass rather than spot checks.
- React 19 brings `ref` as a normal prop and drops legacy `propTypes`. We use
  neither pattern, so the surface is smaller than the version jump suggests.
- `next-auth@5` beta is already on a React-19-compatible line; if it is not, the
  upgrade stops and we reassess rather than forcing peer deps.

## What this does not do

No App Router restructuring, no Server Actions migration, no PPR or
`cacheComponents`. Those are opt-in capabilities, and mixing "make it work on
16" with "adopt 16's new ideas" is how an upgrade turns into a rewrite nobody
can review. They get their own ADRs if we ever want them.
