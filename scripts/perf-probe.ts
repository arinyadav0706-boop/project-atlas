/**
 * Performance probe — measures the APPLICATION-CODE floor for each user action
 * against a real Postgres, and counts the DB round-trips per action (the metric
 * that cross-region latency multiplies in production).
 *
 * Run:
 *   PERF_LOG=1 \
 *   DATABASE_URL="postgresql://postgres@localhost:5433/eagles_test?schema=public" \
 *   DIRECT_URL="$DATABASE_URL" \
 *   npx tsx scripts/perf-probe.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/shared/lib/db";
import { UserRepository } from "@/features/authentication/repositories/user.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "@/features/issues/services/issue.service";
import type { Actor } from "@/shared/types/actor";

// Collect a query duration for every SQL statement Prisma runs.
let queries: number[] = [];
(prisma as unknown as {
  $on: (e: "query", cb: (ev: { duration: number }) => void) => void;
}).$on("query", (ev) => queries.push(ev.duration));

async function measure(label: string, fn: () => Promise<unknown>) {
  queries = [];
  const start = performance.now();
  await fn();
  const wall = performance.now() - start;
  const dbTime = queries.reduce((a, b) => a + b, 0);
  console.log(
    `${label.padEnd(34)} wall ${wall.toFixed(1).padStart(7)} ms | ` +
      `queries ${String(queries.length).padStart(2)} | ` +
      `db ${dbTime.toFixed(1).padStart(6)} ms | ` +
      `app ${(wall - dbTime).toFixed(1).padStart(6)} ms`,
  );
}

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
  const org = await prisma.organization.create({ data: { name: "Perf", domain: "perf.test" } });
  const passwordHash = await bcrypt.hash("Passw0rd!", 10);
  const user = await prisma.user.create({
    data: { organizationId: org.id, email: "perf@perf.test", name: "Perf", passwordHash },
  });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };

  console.log("\n=== Application-code floor (local Postgres, warm) ===\n");

  // Login: the credentials authorize() path = findByEmail + bcrypt.compare.
  await measure("LOGIN: findByEmail", async () => {
    await UserRepository.findByEmail("perf@perf.test");
  });
  {
    const start = performance.now();
    await bcrypt.compare("Passw0rd!", passwordHash);
    console.log(
      `${"LOGIN: bcrypt.compare".padEnd(34)} wall ${(performance.now() - start).toFixed(1).padStart(7)} ms | (CPU, no DB)`,
    );
  }

  let projectId = "";
  await measure("CREATE PROJECT (service)", async () => {
    const p = await ProjectService.create(actor, { key: "PERF", name: "Perf Project" });
    projectId = p.id;
  });

  await measure("OPEN PROJECTS (list)", async () => {
    await ProjectService.list(actor);
  });

  let issueId = "";
  await measure("CREATE ISSUE (service)", async () => {
    const i = await IssueService.create(actor, projectId, {
      type: "TASK",
      title: "Perf issue",
      priority: "MEDIUM",
    });
    issueId = i.id;
  });

  await measure("OPEN ISSUES (list + counts)", async () => {
    await IssueService.list(actor, projectId, { take: 50 });
  });

  await measure("OPEN ISSUE (detail)", async () => {
    await IssueService.get(actor, issueId);
  });

  await measure("PROJECT SETTINGS (get + members)", async () => {
    await Promise.all([
      ProjectService.get(actor, projectId),
      ProjectService.listMembers(actor, projectId),
    ]);
  });

  console.log(
    "\nNote: 'queries' = DB round-trips. In production each is multiplied by the\n" +
      "Vercel↔Supabase network RTT (cross-region ≈ 300–600 ms per round-trip).\n",
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
