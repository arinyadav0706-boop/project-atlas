// Removes the entire VERUS demo org (ADR-0033) in FK-safe order, scoped so no
// other organization is touched. Used by the seed for idempotent re-runs and as
// a standalone command: `npm run seed:verus:teardown`.
import { PrismaClient } from "@prisma/client";
import { ORG_ID } from "./data";

export async function teardownVerus(prisma: PrismaClient, orgId: string = ORG_ID): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return;

  const inOrgIssue = { issue: { project: { organizationId: orgId } } } as const;

  // Children first, parents last. Self-referential tables (issues.epicId,
  // teams.parentTeamId) are safe within a single deleteMany — Postgres checks
  // immediate FKs at statement end, by which point the whole set is gone.
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.recentItem.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.favorite.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.notification.deleteMany({ where: { user: { organizationId: orgId } } });
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
  await prisma.authAccount.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.featureFlag.deleteMany({ where: { organizationId: orgId } });
  await prisma.label.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
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
