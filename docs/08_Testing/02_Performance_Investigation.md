# 08 — Performance Investigation (root cause)

**Status:** Investigation only. No optimizations applied — this documents where
the time goes, with measured evidence, before any change.

## Method (what is measured vs. estimated)

The reported 4–8 s symptoms are on the **deployed** stack (Vercel Free +
Supabase Free, Mumbai). That stack can't be run from the build environment, so:

- **Measured (hard numbers):** the application-code floor — every service,
  repository, and DB query — run against a **real local Postgres** with
  per-query logging (`scripts/perf-probe.ts`, `PERF_LOG=1`). This gives exact
  **wall time** and, crucially, the **number of DB round-trips per action**.
- **Estimated (labelled):** the production delta. Because the app floor is
  single-digit-to-tens of ms, the multi-second production times are almost
  entirely **network + cold start**. The per-action **query count** is the
  multiplier: each round-trip pays the Vercel↔Supabase RTT.

## Measured application-code floor (local, warm Postgres)

```
LOGIN: findByEmail                 wall    6.4 ms | queries  1 | db  1.0 ms
LOGIN: bcrypt.compare              wall  110.4 ms | (CPU, no DB)
CREATE PROJECT (service)           wall   26.3 ms | queries  5 | db 10.0 ms
OPEN PROJECTS (list)               wall   10.9 ms | queries  2 | db  5.0 ms
CREATE ISSUE (service)             wall   33.1 ms | queries  8 | db 14.0 ms
OPEN ISSUES (list + counts)        wall   54.6 ms | queries  4 | db 23.0 ms
OPEN ISSUE (detail)                wall   18.7 ms | queries  4 | db  7.0 ms
PROJECT SETTINGS (get + members)   wall    6.3 ms | queries  5 | db  0.0 ms
```

**The application code is not the bottleneck.** Every action completes in
6–55 ms locally. Production is ~150–1000× slower, so the time is spent
*outside* the app logic — in the network between Vercel and Supabase, and in
cold starts.

## The multiplier: DB round-trips per action

| Action | Round-trips | Why (queries) |
|---|--:|---|
| Login (credentials) | **~4** | `findByEmail` ×3 (authorize + signIn callback + jwt callback) + `updateLastLogin` — **redundant** |
| Open Projects | 2 | resolve org (none now) + `listActiveWithMembership` |
| Create Project | 5 | `findByKey` + txn (BEGIN, INSERT project, INSERT member, COMMIT) |
| Open Issues | 4 | `getContext` + `getMemberRole` + `listByProject` + `countByStatus` |
| Create Issue | **8** | `getContext` + `getMemberRole` + txn (BEGIN, UPDATE project, INSERT issue, SELECT assignee, SELECT reporter, COMMIT) |
| Open Issue | 4 | `findDetail` + `getContext` + `getMemberRole` (+ relation selects) |

These are **sequential** round-trips. Same-region they cost ~5–15 ms each;
cross-region (see below) they cost ~300–500 ms each.

## Click → paint breakdown (Create Issue, the worst case)

| Stage | Local (measured) | Prod estimate (cross-region + cold) | Verdict |
|---|--:|--:|---|
| Browser event + React handler | ~5 ms | ~5 ms | fine |
| Network: browser → Vercel (India→US) | — | ~250 ms | region |
| Vercel cold start (lambda + **Prisma engine init**) | — | ~1500 ms (cold) / 0 (warm) | **cold start** |
| Auth (`getActor`, JWT decode) | ~1 ms | ~1 ms (+1 query if old token) | fine |
| **8 DB round-trips** × RTT | ~14 ms | **8 × ~400 ms ≈ 3200 ms** | **region × query count** |
| Service/business logic (CPU) | ~19 ms | ~20 ms | fine |
| Response serialization | ~1 ms | ~5 ms | fine |
| `router.refresh()` → RSC refetch (another server round-trip) | — | ~1000–2000 ms | region + query count |
| **Total** | **~33 ms** | **~6–8 s** | matches report |

The same shape explains the others: **Login ≈ 4 queries + bcrypt(110 ms) +
2 cold requests** (the POST then the redirect GET) → 4–6 s; **navigation** is an
RSC refetch (every page is dynamic) of getActor + page data across the region →
5–6 s.

## Root-cause verification (each suspected cause, with evidence)

| Suspected cause | Verdict | Evidence |
|---|---|---|
| Multiple auth requests per navigation | **No (fixed)** | `getActor`/`getSession` are `cache()`-wrapped; one JWT decode per render |
| Middleware executing too often | **No** | There is **no** `middleware.ts` — 0 ms |
| Duplicate DB queries | **Yes (login)** | `findByEmail` runs **3×** per credentials login (auth-config.ts:62, 81, 120) |
| N+1 queries | **No** | Lists use one query + grouped count; relations via `select`/`include` (batched) |
| Sequential async that should be parallel | **Yes (minor)** | `resolve()` runs `getContext` then `getMemberRole` sequentially; `createWithKey` adds 2 relation SELECTs |
| Vercel cold starts | **Yes (major)** | Free tier; functions cold-start when idle |
| Supabase cold / slow connection | **Yes** | Free tier nano compute; cross-region connection setup |
| Slow Prisma init | **Yes (on cold)** | Prisma engine init adds ~1–2 s to a cold lambda |
| Prisma client recreated | **No** | Singleton in `db.ts` |
| Connection pool problems | **Verify** | Needs `?pgbouncer=true&connection_limit=1` on `DATABASE_URL` (warning added in `db.ts`) |
| Components re-render multiple times | **No (not the cause)** | Server-rendered; client islands are small |
| Large client bundles | **Minor** | First Load JS ~188–216 kB on issue routes (framer-motion heavy); adds ~hundreds of ms on mobile, not seconds |
| Expensive React effects | **No** | Effects are light (filter refetch, hotkey) |
| Slow Server Components | **No (app)** | Measured 6–55 ms; slowness is their DB round-trips over the network |
| `router.refresh()` full reload | **Partial** | It refetches the RSC payload (server round-trip), not a full reload — but cross-region that's 1–2 s after every mutation |
| Redirect loops | **No** | Single redirect on unauth |
| Loading unneeded data | **No** | Pages fetch only what they render (lean `select`) |
| **Region mismatch** | **Yes — prime suspect** | App floor is ms; the only way to reach 8 s is ~400 ms × 8 round-trips → Vercel functions and Supabase are almost certainly in **different regions** |

## Deployment review — infra vs. code split

For **Create Issue (~8 s)**, estimated attribution:

| Contributor | Est. time | Type |
|---|--:|---|
| Cross-region round-trips (8 × ~400 ms) | ~3.2 s | **Infra (region)** |
| Cold start (lambda + Prisma init) | ~1.5–2.5 s | **Infra (Vercel Free)** |
| `router.refresh()` RSC refetch cross-region | ~1–2 s | Infra × app (query count) |
| User↔Vercel latency | ~0.5 s | Infra (region) |
| App logic (CPU + local DB) | ~0.03 s | **App (negligible)** |

**≈ 95%+ of the time is infrastructure** (region mismatch + Free-tier cold
starts), amplified by how many DB round-trips each action makes. **< 5% is
application code.**

**To confirm region mismatch (the one thing to check):** Vercel → Project →
Settings → Functions → **Region**. Vercel Hobby defaults to **Washington, D.C.
(iad1)**; Supabase here is **Mumbai (ap-south-1)**. If they differ, that is the
single biggest cause.

## Top 10 reasons it feels slow (highest impact first)

1. **Region mismatch** — Vercel functions (US) far from Supabase (Mumbai); every
   DB round-trip pays ~400 ms. *Infra.*
2. **Vercel Free cold starts** — idle → ~1.5–2.5 s (incl. Prisma init) on the
   first request. *Infra/Deployment.*
3. **High round-trip count per action** — Create Issue = 8, Project = 5; each is
   sequential, so region latency stacks. *Code (reducible).*
4. **Redundant login queries** — `findByEmail` ×3 per login. *Code.*
5. **`router.refresh()` after every mutation** — a second cross-region RSC fetch.
   *Code/Next.js.*
6. **Supabase Free nano compute** — slow cold connections. *Infra.*
7. **Sequential awaits in `resolve()`** — 2 queries that could be 1 parallel step.
   *Code.*
8. **Connection pooling not confirmed** — without `pgbouncer=true` each cold
   invocation re-negotiates. *Deployment.*
9. **Client bundle (~210 kB, framer-motion)** — adds hydration cost on mobile.
   *React.*
10. **Every route dynamic** — no caching, so navigation always round-trips the
    server. *Next.js/Architecture.*

## The single biggest bottleneck

**Region mismatch between Vercel functions and Supabase**, multiplied by the
number of DB round-trips per action. Fixing it (co-locate the functions with the
DB in Mumbai) turns each ~400 ms round-trip into ~5–15 ms and should take
Create Issue from ~8 s to well under 1 s — with **zero code change**.

## Prioritized action plan (do NOT implement yet — investigation phase)

| # | Action | Type | Expected effect |
|---|---|---|---|
| 1 | Set Vercel function region to **Mumbai (bom1)** to match Supabase | Deploy | ~400 ms → ~10 ms per round-trip; **the** fix (~8 s → <1 s) |
| 2 | Confirm `DATABASE_URL` has `?pgbouncer=true&connection_limit=1` | Deploy | Removes cold connection renegotiation |
| 3 | Keep functions warm / consider Vercel Pro or Supabase paid | Infra | Removes ~1.5–2.5 s cold penalty |
| 4 | Collapse login to **one** `findByEmail`; pass the user through callbacks | Code | −2 round-trips on login |
| 5 | Parallelize `resolve()` (`Promise.all` getContext + getMemberRole) | Code | −1 serial round-trip on most actions |
| 6 | Drop the extra relation SELECTs in `createWithKey` (return lean, refetch only if needed) | Code | −2 round-trips on create issue |
| 7 | Replace `router.refresh()` with targeted state updates where possible | Code | Removes the second cross-region fetch after mutations |
| 8 | Add `<Suspense>` streaming so the shell paints before data | Next.js | Perceived latency drop |
| 9 | Trim/lazy-load framer-motion on heavy routes | React | Smaller bundle, faster hydration |

Items 1–3 are infrastructure and deliver the overwhelming majority of the win.
Items 4–9 are application code that reduce round-trips and perceived latency —
worth doing, but secondary to fixing the region.

## Applied so far

After the region move (Vercel → Mumbai) reads dropped to ~1–2 s, confirming
region was the dominant read-path factor. Two further changes have been made:

1. **`Server-Timing` header on every API route** (`handleRoute`). Open DevTools
   → Network → click a request → the `Server-Timing: app;dur=<ms>` value is the
   time spent *inside* the handler (auth + DB + logic). `total request − app`
   ≈ cold start + network. This gives real production per-request evidence.
2. **Create no longer triggers a full-page refresh.** The dialog hands the
   created issue back and the list inserts it in place + bumps the counts —
   removing the second cross-region round-trip that caused the ~2–3 s
   "render the created task" delay. (Same-shape follow-ups available for edit,
   transition, and delete.)

## Instrumentation

Left in place (opt-in, zero prod impact): `PERF_LOG=1` enables Prisma query
logging in `db.ts`; `scripts/perf-probe.ts` measures the floor + round-trip
counts. `Server-Timing` is always on (a harmless, standard diagnostic header).
