// Removes the entire VERUS demo org (ADR-0033) in FK-safe order, scoped so no
// other organization is touched. Used by the seed for idempotent re-runs and as
// a standalone command: `npm run seed:verus:teardown`.
//
// Adopted accounts: the owner's real logins are *upserted* into VERUS (they may
// pre-date the demo and carry rows — project memberships, reported issues — in
// the org they came from). Teardown must never delete such an account, and
// cannot: those foreign rows reference it. They are instead moved back out to
// another organization so the VERUS org row can go. Accounts the seed itself
// created (id prefixed `verus-`) reference nothing outside VERUS and are
// deleted normally.
import { PrismaClient } from "@prisma/client";
import { ORG_ID } from "./data";

const SEEDED_ID_PREFIX = "verus-";

export async function teardownVerus(prisma: PrismaClient, orgId: string = ORG_ID): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return;

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const adoptedIds = userIds.filter((id) => !id.startsWith(SEEDED_ID_PREFIX));
  const seededIds = userIds.filter((id) => id.startsWith(SEEDED_ID_PREFIX));

  const inOrgIssue = { issue: { project: { organizationId: orgId } } } as const;

  // Children first, parents last. Self-referential tables (issues.epicId,
  // teams.parentTeamId) are safe within a single deleteMany — Postgres checks
  // immediate FKs at statement end, by which point the whole set is gone.
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  // Personal signal rows are keyed by user, not org: clear them for everyone in
  // VERUS (an adopted account loses its starred/recent list — a preference, not
  // domain data).
  await prisma.recentItem.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.favorite.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  // Mentions before comments: the FK is RESTRICT, so the reverse order fails.
  // Replies and their roots go together in one statement — Postgres checks the
  // self-referencing FK at statement end, the same reason teams.parentTeamId
  // is safe above.
  await prisma.commentMention.deleteMany({
    where: { comment: { issue: { project: { organizationId: orgId } } } },
  });
  await prisma.comment.deleteMany({ where: inOrgIssue });
  await prisma.workLog.deleteMany({ where: inOrgIssue });
  await prisma.attachment.deleteMany({ where: inOrgIssue });
  await prisma.issueComponent.deleteMany({ where: inOrgIssue });
  await prisma.issueLabel.deleteMany({ where: inOrgIssue });
  await prisma.issue.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.component.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.sprint.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.projectMember.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.project.deleteMany({ where: { organizationId: orgId } });
  await prisma.teamMembership.deleteMany({ where: { team: { organizationId: orgId } } });
  await prisma.team.deleteMany({ where: { organizationId: orgId } });
  await prisma.featureFlag.deleteMany({ where: { organizationId: orgId } });
  await prisma.label.deleteMany({ where: { organizationId: orgId } });

  if (adoptedIds.length > 0) {
    const home = await prisma.organization.findFirst({
      where: { id: { not: orgId } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (home) {
      await prisma.user.updateMany({
        where: { id: { in: adoptedIds } },
        data: { organizationId: home.id },
      });
    } else {
      // Nothing to move them to. Deleting them would orphan whatever they
      // reference elsewhere, so stop with an actionable message instead of a
      // raw foreign-key error.
      throw new Error(
        `Cannot remove the VERUS org: ${adoptedIds.length} pre-existing account(s) were ` +
          `adopted into it and there is no other organization to move them back to. ` +
          `Create another organization first, or delete those accounts by hand.`,
      );
    }
  }

  // Only ever delete accounts the seed created; their auth links go with them.
  await prisma.authAccount.deleteMany({ where: { userId: { in: seededIds } } });
  await prisma.user.deleteMany({ where: { id: { in: seededIds } } });
  await prisma.organization.delete({ where: { id: orgId } });
}

// Standalone entry.
if (process.argv[1] && process.argv[1].endsWith("teardown.ts")) {
  const prisma = new PrismaClient();
  teardownVerus(prisma)
    .then(() => console.log(`Removed the VERUS demo org (${ORG_ID}).`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
