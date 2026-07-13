import { PrismaClient } from "@prisma/client";

// Singleton across hot reloads in dev (Next.js dev server re-evaluates
// modules on every change; without this, each reload opens a new pool of
// DB connections). See docs/01_Architecture/02_Feature_Architecture.md —
// this is the one place other than *.repository.ts files allowed to touch
// PrismaClient directly, since it's the client construction itself, not a
// query.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
