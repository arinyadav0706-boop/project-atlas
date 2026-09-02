# ADR-0055 — Shipping the V2 UI without forking the product

- **Status:** PROPOSED — awaiting approval. **No branches have been created.**
- **Date:** 2026-09-02
- **Supersedes:** nothing
- **Related:** `docs/05_UI/04_Modernization_Audit.md`,
  `docs/05_UI/06_Issues_Gate_Report.md`,
  `docs/01_Architecture/02_Feature_Architecture.md`

---

## 1. The question

V1 is the current EAGLES UI. V2 is the redesign. Both must exist for the
length of the migration — ten pages, one gate each — and the constraints are
fixed:

- V1 stays deployable at every commit.
- V2 develops independently.
- A security or backend fix must land in **both**, without being written twice.
- One repository, one database, one set of business logic.
- V2 eventually becomes the main line.

## 2. What this ADR rejects, and why

**A second repository.** Rejected outright. Every backend fix becomes two pull
requests against two copies of the same service layer, and the copies diverge
on the first hotfix somebody is in a hurry to ship. This is the failure mode
the requirement exists to prevent.

**A long-lived `feature/ui-v2` branch.** Superficially the obvious answer, and
the reason it fails is arithmetic: ten pages at roughly a week each is a branch
that lives two to three months. Every merge from `main` in that window is a
conflict in exactly the files V2 is rewriting — the components. The branch
either becomes stale or becomes a full-time merge job. Long-lived feature
branches are how the "no duplicated logic" rule gets broken by accident rather
than by decision.

**`release/v1` as the deploy target.** This makes sense when V1 must be
maintained after `main` has moved past it — a genuine LTS. It is not our
situation: V1 and V2 will share the same `main` for the whole transition, and
the moment a `release/v1` branch exists, a backend hotfix has two homes and a
cherry-pick between them. Worth revisiting **only** if V1 must outlive the
migration for an external reason (a customer pinned to it, a compliance
freeze). Recorded here so the decision is a choice rather than an omission.

## 3. Decision: trunk-based, with the UI selected at runtime

**One branch (`main`), short-lived feature branches per page, and a flag that
decides which presentation renders.** The two UIs live side by side in the
same deployable artifact.

```
main ─────●────●────●────●────●────●──────────────▶  always deployable
           \    \    \    \    \    \
            ui/v2-issues     ui/v2-board  …        (days, not months)
```

Why this satisfies every constraint:

| Constraint | How |
|---|---|
| V1 deployable | `main` is V1 by default — the flag is off. Every commit ships. |
| V2 independent | A page's V2 component is new code in a new file; V1's is untouched until its gate passes. |
| Fixes never diverge | There is one service, one repository, one schema, one API route. A backend fix is one commit on `main` and both UIs get it — there is nothing to port. |
| No duplicated codebase | Duplication is limited to the presentation of a page that is mid-migration, and it is deleted the moment that page's gate passes. |
| V2 merges back | There is nothing to merge back. V2 *is* `main`; flipping the flag's default is the release. |

### 3.1 The flag

`FEATURE_UI_V2` — the existing `feature_flags` table (module 20), so it is a
runtime setting and not a rebuild. Resolution order, most specific first:

1. Per-user override, so the two of us can run V2 while everyone else runs V1.
2. Organisation default.
3. Off.

Which means the rollout is: us → a pilot team → the org → default-on → delete
V1. Each step is reversible in one click, and a bad V2 page is a flag flip
rather than a redeploy.

### 3.2 Where the fork lives, exactly

At the **route segment**, and nowhere else:

```
src/app/(app)/issues/page.tsx        ← reads the flag, renders one or the other
src/features/saved-views/components/
  issue-workspace.tsx                ← V2 (new)
  issue-workspace-legacy.tsx         ← V1 (untouched, deleted at cutover)
```

Both call the SAME `SavedViewService.queryIssues`. Neither owns a rule. The
page component's whole job is the choice.

**Hard boundary, and the one that matters:** if a V2 page needs a service,
repository, schema, API route or permission change, that change lands on `main`
for both UIs, behind its own decision — never inside the flag. The flag selects
a presentation; it must never select a behaviour. The moment `if (v2)` appears
below the component layer, this ADR has been broken and the two-repository
failure mode has arrived by another road.

### 3.3 Feature freeze — the part nobody plans for

While a page is mid-migration, a product change to it has to be made twice.
The answer is not process, it is **duration**: one page at a time, gated,
merged within days. The gate is what keeps the overlap short enough that
double-implementing is rare rather than routine. If a page's migration stalls,
the correct move is to revert its V2 component and re-plan, not to leave two
implementations drifting.

## 4. CI/CD

Nothing in the pipeline changes shape, because nothing about the deployable
changes shape.

| Stage | Today | Under this ADR |
|---|---|---|
| Typecheck / lint / unit | on every push | unchanged — covers both UIs, they are in one tree |
| Integration | on every push | unchanged — one service layer, one set of tests |
| E2E | on `main` + PRs | **runs twice for a migrated page**: once flag-off, once flag-on |
| Build | one artifact | one artifact, containing both UIs |
| Deploy | `main` → production | unchanged |

The only real addition is the doubled E2E, and only for pages that are
mid-migration. That is affordable precisely because the specs assert on roles,
labels and visible text rather than on DOM structure — the same suite runs
against both presentations unmodified. Phase 0 was built that way on purpose;
this is the payoff.

**Bundle cost during the overlap:** both components ship. Measured baseline is
725 kB gzipped across all client chunks; a duplicated page component is
single-digit kB and lives for days. Not a reason to complicate the strategy.

## 5. Cutover

1. All ten pages migrated and gated.
2. Flag default flipped to on, org-wide, with the per-user override retained as
   the escape hatch.
3. One release soak.
4. **Delete every `*-legacy.tsx`, delete the flag, delete the doubled E2E
   runs.** V2 stops being a variant and becomes the product.

Step 4 is the acceptance criterion of the whole programme, not a tidy-up. A
flag that survives its cutover is a permanent fork with a friendly name.

## 6. What could make this wrong

- **If V1 must be maintained after `main` moves on** — a pinned customer, a
  compliance freeze — then `release/v1` becomes correct and the cherry-pick
  cost has to be accepted. Nothing in this decision prevents cutting that
  branch later, and cutting it later is strictly cheaper than maintaining it
  now.
- **If the migration stalls past a quarter**, the overlap stops being cheap and
  the feature-freeze cost stops being theoretical. The gate cadence is the
  control; if two consecutive gates slip, re-open this ADR rather than pushing
  on.
