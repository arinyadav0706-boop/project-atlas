# 03 — Migrations & Deploy

## Why this exists (the 2026-07-20 incident)

Merging the Board shipped code that queried the new `rank` column while
production still had `boardOrder`, so the Issues and Board pages 500'd. Root
cause: **deploys ran only `next build` — they never applied database
migrations.** Code reached prod; schema did not. See ledger `DB-2` / `GL-4`.

## The mechanism: migrations run on every deploy

The fix is a `vercel-build` script (Vercel runs it in preference to `build`):

```
"vercel-build": "prisma generate && prisma migrate deploy && next build"
```

`prisma migrate deploy` applies any pending migrations against `DIRECT_URL`
(the unpooled connection) before the app is built. If a migration fails, the
build fails and Vercel keeps the last good deployment — code can never again
outrun the schema. Local `npm run build` stays `next build` only.

**Requirements in the Vercel project env:** `DIRECT_URL` (unpooled, port 5432)
must be set — `migrate deploy` cannot run through PgBouncer.

> **Ordering matters — do the baseline BEFORE this reaches a deploying branch.**
> The `vercel-build` script now exists in `package.json`, but it only takes
> effect once merged to the deploying branch (`main`) *and* redeployed. Merging
> it before the baseline below is green would make that deploy's `migrate deploy`
> fail against un-baselined prod and block new deploys. So: run the baseline
> first, confirm `migrate status` is clean, and only then merge the branch
> carrying this script. That ordering is the whole point of this document.

## ⚠️ One-time prerequisite: baseline production FIRST

Production was created **manually**, so it has **no migration history** and its
state is **inconsistent** (some migrations' effects were applied by hand — `init`,
the `board_rank` + `rank_collation` hotfixes — while others may not be, e.g.
`perf_indexes`). If `migrate deploy` runs against it as-is, it will try to apply
`init` from scratch and fail ("relation already exists").

**Do not enable `vercel-build` (merge it to a deploying branch) until the
baseline below is done**, or new deploys will be blocked (the running app stays
up; only new builds fail).

### Baseline runbook (run once, locally, with `DIRECT_URL` pointed at prod)

1. **Inspect** what prod actually has, so you resolve honestly (don't guess).
   The full read-only inspection is scripted in
   **`scripts/prod-baseline-inspect.sql`** — run it against prod (Supabase SQL
   editor, or `psql "$DIRECT_URL" -f scripts/prod-baseline-inspect.sql`). It
   covers migration history, the perf indexes, the `rank` column
   (existence/collation/uniqueness + a duplicate check), the newer additive
   tables/columns, and the FTS indexes. The core queries:
   ```sql
   -- migration history (likely empty or partial):
   SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at;
   -- which indexes exist (tells you if perf_indexes' effects are present):
   SELECT indexname FROM pg_indexes WHERE tablename IN ('issues','audit_logs');
   -- rank column present + collated + unique?
   SELECT column_name, collation_name FROM information_schema.columns
     WHERE table_name='issues' AND column_name IN ('rank','boardOrder');
   ```
2. **Apply, by hand, any migration whose effects are missing** so prod's schema
   matches the full migration set (e.g. run `perf_indexes`' SQL if those indexes
   aren't there; run `prod-rank-unique.sql` for the unique index).
3. **Mark every migration whose effects are now present as applied** so Prisma's
   history matches reality and `migrate deploy` won't re-run them:
   ```bash
   npx prisma migrate resolve --applied 20260713000000_init
   npx prisma migrate resolve --applied 20260715000000_perf_indexes
   npx prisma migrate resolve --applied 20260719000000_board_rank
   npx prisma migrate resolve --applied 20260720000000_rank_collation
   npx prisma migrate resolve --applied 20260720100000_rank_unique
   ```
4. **Verify** `npx prisma migrate status` reports no pending migrations.
5. **Now enable the pipeline:** add the `vercel-build` script to `package.json`
   and confirm `DIRECT_URL` is set in Vercel. From here, `migrate deploy` runs on
   every deploy — a safe no-op when nothing is pending, applying only genuinely
   new migrations.

After this, GL-4 is closed and the incident class cannot recur.

## Alternative (if auto-migrate-on-deploy is ever too blunt)

For migrations that are risky or slow, run them as a **deliberate, gated step**
(a manually-approved GitHub Action, or `migrate deploy` run by hand) *before*
merging the code that depends on them, and keep `vercel-build` as the safety net
for the routine additive ones. Auto-migrate-on-deploy is the pragmatic default
for this team's size; revisit if a migration ever needs a maintenance window.
