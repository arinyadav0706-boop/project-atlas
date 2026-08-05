// Seeds the VERUS demo company (ADR-0033) into the database pointed at by
// DATABASE_URL. Designed to run against the live Supabase demo DB, so it does
// NOT rely on the NODE_ENV guard the bootstrap seed uses — instead it refuses to
// run without an explicit confirmation, and only ever creates/deletes the one
// VERUS org (id `verus-demo-org`).
//
//   SEED_VERUS=confirm npm run seed:verus      # or: npm run seed:verus -- --confirm
//   npm run seed:verus:teardown                # remove it again
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateVerus, summarizeProjects } from "./generate";
import { teardownVerus } from "./teardown";
import { ORG_ID, ORG_NAME, GOOGLE_ADMIN, CREDENTIALS_ADMIN } from "./data";

// One shared password for every credentials account, so the demo owner can sign
// in as ANY role (member / lead / viewer / manager) to show the product from
// each perspective. The Google admin is SSO-only (no password). Printed at the
// end; never committed anywhere but here as the demo default.
const DEMO_PASSWORD = "VerusDemo!2026";

const prisma = new PrismaClient();

function confirmed(): boolean {
  return process.env.SEED_VERUS === "confirm" || process.argv.includes("--confirm");
}

async function insertMany<T>(
  label: string,
  fn: (rows: T[]) => Promise<unknown>,
  rows: T[],
  batch = 1000,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batch) {
    await fn(rows.slice(i, i + batch));
  }
  console.log(`  ${label.padEnd(18)} ${rows.length}`);
}

async function main(): Promise<void> {
  if (!confirmed()) {
    console.error(
      [
        "Refusing to seed without explicit confirmation.",
        "This writes the VERUS demo org into DATABASE_URL. Re-run with:",
        "  SEED_VERUS=confirm npm run seed:verus",
        "  (or: npm run seed:verus -- --confirm)",
        "It only ever creates/deletes the one org id `verus-demo-org`.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const t0 = Date.now();
  console.log(`Seeding the "${ORG_NAME}" demo company → ${ORG_ID}`);
  console.log("Clearing any previous VERUS data (idempotent re-seed)…");
  await teardownVerus(prisma, ORG_ID);

  const d = generateVerus();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Remap: the two owner accounts get placeholder ids in the generator; upsert
  // them by email (they may already exist in another org) and rewrite every
  // reference to their real ids.
  const idMap = new Map<string, string>();
  const rid = (id: string): string => idMap.get(id) ?? id;
  const ridN = <T extends string | null | undefined>(id: T): T =>
    (id == null ? id : (idMap.get(id) ?? id)) as T;

  console.log("Writing…");
  await prisma.organization.create({ data: d.org });

  for (const a of d.admins) {
    const hash = a.credentials ? passwordHash : null;
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: {
        organizationId: ORG_ID,
        orgRole: "ADMIN",
        isActive: true,
        name: a.name,
        ...(hash ? { passwordHash: hash } : {}),
      },
      create: {
        id: a.id,
        organizationId: ORG_ID,
        email: a.email,
        name: a.name,
        orgRole: "ADMIN",
        passwordHash: hash,
      },
    });
    idMap.set(a.id, user.id);
  }
  // The owner accounts may be moving in from another org where they already
  // belong to a team. TeamMembership is unique on userId (one team per user),
  // so sever any old link before assigning their VERUS team — the previous
  // org is being left behind (ADR-0033 login model).
  await prisma.teamMembership.deleteMany({
    where: { userId: { in: d.admins.map((a) => rid(a.id)) } },
  });
  console.log(`  admins             ${d.admins.length} (upserted)`);

  await insertMany<Prisma.UserCreateManyInput>(
    "cast users",
    (rows) => prisma.user.createMany({ data: rows }),
    d.cast.map((u) => ({ ...u, passwordHash, createdBy: ridN(u.createdBy) })),
  );

  await insertMany<Prisma.TeamCreateManyInput>(
    "teams",
    (rows) => prisma.team.createMany({ data: rows }),
    d.teams.map((t) => ({ ...t, managerId: ridN(t.managerId), createdBy: ridN(t.createdBy) })),
  );

  await insertMany<Prisma.TeamMembershipCreateManyInput>(
    "team members",
    (rows) => prisma.teamMembership.createMany({ data: rows }),
    d.memberships.map((m) => ({ ...m, userId: rid(m.userId), createdBy: ridN(m.createdBy) })),
  );

  await insertMany<Prisma.ProjectCreateManyInput>(
    "projects",
    (rows) => prisma.project.createMany({ data: rows }),
    d.projects.map((p) => ({ ...p, createdBy: ridN(p.createdBy) })),
  );

  await insertMany<Prisma.ProjectMemberCreateManyInput>(
    "project members",
    (rows) => prisma.projectMember.createMany({ data: rows }),
    d.projectMembers.map((p) => ({ ...p, userId: rid(p.userId), createdBy: ridN(p.createdBy) })),
  );

  await insertMany<Prisma.ComponentCreateManyInput>(
    "components",
    (rows) => prisma.component.createMany({ data: rows }),
    d.components.map((c) => ({ ...c, leadId: ridN(c.leadId), createdBy: ridN(c.createdBy) })),
  );

  await insertMany<Prisma.SprintCreateManyInput>(
    "sprints",
    (rows) => prisma.sprint.createMany({ data: rows }),
    d.sprints.map((s) => ({ ...s, createdBy: ridN(s.createdBy) })),
  );

  // Epics before other issues so children's epicId resolves.
  const mapIssue = (i: Prisma.IssueCreateManyInput): Prisma.IssueCreateManyInput => ({
    ...i,
    assigneeId: ridN(i.assigneeId),
    reporterId: rid(i.reporterId),
    createdBy: ridN(i.createdBy),
  });
  await insertMany<Prisma.IssueCreateManyInput>(
    "epics",
    (rows) => prisma.issue.createMany({ data: rows }),
    d.epics.map(mapIssue),
  );
  await insertMany<Prisma.IssueCreateManyInput>(
    "issues",
    (rows) => prisma.issue.createMany({ data: rows }),
    d.issues.map(mapIssue),
  );

  await insertMany<Prisma.IssueComponentCreateManyInput>(
    "issue-components",
    (rows) => prisma.issueComponent.createMany({ data: rows }),
    d.issueComponents.map((ic) => ({ ...ic, createdBy: ridN(ic.createdBy) })),
  );

  await insertMany<Prisma.CommentCreateManyInput>(
    "comments",
    (rows) => prisma.comment.createMany({ data: rows }),
    d.comments.map((c) => ({ ...c, authorId: rid(c.authorId), createdBy: ridN(c.createdBy) })),
  );

  await insertMany<Prisma.WorkLogCreateManyInput>(
    "work logs",
    (rows) => prisma.workLog.createMany({ data: rows }),
    d.workLogs.map((w) => ({ ...w, userId: rid(w.userId), createdBy: ridN(w.createdBy) })),
  );

  await insertMany<Prisma.AuditLogCreateManyInput>(
    "audit logs",
    (rows) => prisma.auditLog.createMany({ data: rows }),
    d.auditLogs.map((a) => ({ ...a, actorId: ridN(a.actorId) })),
  );

  // Personal navigation signals are unique per (user, entityType, entityId).
  // An adopted owner account can already carry rows from its previous life, so
  // clear theirs and let any residual collision be skipped rather than abort a
  // seed that has already written everything else.
  const ownerIds = d.admins.map((a) => rid(a.id));
  await prisma.recentItem.deleteMany({ where: { userId: { in: ownerIds } } });
  await prisma.favorite.deleteMany({ where: { userId: { in: ownerIds } } });

  await insertMany<Prisma.RecentItemCreateManyInput>(
    "recent items",
    (rows) => prisma.recentItem.createMany({ data: rows, skipDuplicates: true }),
    d.recentItems.map((r) => ({ ...r, userId: rid(r.userId) })),
  );

  await insertMany<Prisma.FavoriteCreateManyInput>(
    "favorites",
    (rows) => prisma.favorite.createMany({ data: rows, skipDuplicates: true }),
    d.favorites.map((f) => ({ ...f, userId: rid(f.userId) })),
  );

  // ---- Self-check: the seed holds invariants the service layer normally would.
  const [userCount, issueCount, membershipCount] = await Promise.all([
    prisma.user.count({ where: { organizationId: ORG_ID } }),
    prisma.issue.count({ where: { project: { organizationId: ORG_ID } } }),
    prisma.teamMembership.count({ where: { team: { organizationId: ORG_ID } } }),
  ]);
  const expectedUsers = d.stats.users!;
  const expectedIssues = d.stats.totalIssues!;
  const problems: string[] = [];
  if (userCount !== expectedUsers) problems.push(`users ${userCount} ≠ ${expectedUsers}`);
  if (issueCount !== expectedIssues) problems.push(`issues ${issueCount} ≠ ${expectedIssues}`);
  if (membershipCount !== expectedUsers) {
    problems.push(`memberships ${membershipCount} ≠ ${expectedUsers} (one team per user)`);
  }
  for (const p of d.projects) {
    const n = await prisma.issue.count({ where: { projectId: p.id! } });
    if (n !== p.issueKeyCounter) problems.push(`${p.key} issues ${n} ≠ counter ${p.issueKeyCounter}`);
  }
  if (problems.length > 0) {
    throw new Error(`Self-check FAILED:\n  - ${problems.join("\n  - ")}`);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ VERUS seeded and self-checked in ${secs}s.`);
  console.log("\nProjects:");
  for (const p of summarizeProjects()) {
    console.log(`  - ${p.key.padEnd(5)} ${p.name} — ${p.shape}, ~${p.issueCount} issues`);
  }
  console.log("\nLog in:");
  console.log(`  • ${GOOGLE_ADMIN.email}  → Google SSO (org ADMIN, no password)`);
  console.log(`  • ${CREDENTIALS_ADMIN.email}  → password below (org ADMIN)`);
  console.log(`  • any other VERUS account (…@verus.example) → same password`);
  console.log(`\n  Password for all credentials accounts:  ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
