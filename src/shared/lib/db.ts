import { PrismaClient } from "@prisma/client";

// Singleton across hot reloads in dev (Next.js dev server re-evaluates
// modules on every change; without this, each reload opens a new pool of
// DB connections). See docs/01_Architecture/02_Feature_Architecture.md —
// this is the one place other than *.repository.ts files allowed to touch
// PrismaClient directly, since it's the client construction itself, not a
// query.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// PERF_LOG=1 emits a query event per SQL statement (opt-in, diagnostic only —
// zero impact in production where the var is unset). Used by scripts/perf-probe
// to count round-trips per user action. See docs/08_Testing performance report.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    process.env.PERF_LOG ? { log: [{ emit: "event", level: "query" }] } : undefined,
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Serverless functions each hold their own Prisma pool, so under real
// concurrency the database must sit behind a transaction pooler (PgBouncer)
// and the URL must tell Prisma so — `?pgbouncer=true&connection_limit=1`.
// Without it, thousands of concurrent users exhaust Postgres connections.
// See docs/01_Architecture/05_Performance_and_Scalability.md §"Connections".
if (
  process.env.NODE_ENV === "production" &&
  /pooler|6543/.test(process.env.DATABASE_URL ?? "") &&
  !/pgbouncer=true/.test(process.env.DATABASE_URL ?? "")
) {
  console.warn(
    "[db] DATABASE_URL looks pooled but is missing `pgbouncer=true` — " +
      "add `?pgbouncer=true&connection_limit=1` to avoid connection exhaustion under load.",
  );
}
