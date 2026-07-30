import { prisma } from "@/shared/lib/db";

// Atomic fixed-window counter store (ADR-0028). Prisma is imported only in
// *.repository.ts files (Feature Architecture §4); this shared limiter is a
// cross-cutting infra concern, so its repository lives in shared/lib.

type HitRow = { count: number };

export const RateLimitRepository = {
  // Atomically increment the window's counter and return the new count. The
  // INSERT … ON CONFLICT … RETURNING is a single statement, so concurrent
  // requests in the same window can't lose an increment. expiresAt is set only
  // on insert (the window's fixed end) and never moved on conflict.
  async hit(key: string, expiresAt: Date): Promise<number> {
    const rows = await prisma.$queryRaw<HitRow[]>`
      INSERT INTO "rate_limits" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET "count" = "rate_limits"."count" + 1
      RETURNING "count"
    `;
    return rows[0]?.count ?? 1;
  },

  // Opportunistic cleanup so the table stays bounded without a cron job.
  async purgeExpired(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "rate_limits" WHERE "expiresAt" < now()`;
  },
};
