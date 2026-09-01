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
  // ── Everything added AFTER this teardown was first written ───────────────
  //
  // Custom fields (ADR-0042), dashboards (ADR-0044), saved views (ADR-0040)
  // and dependency links (ADR-0046) all hang off issues, projects or the org
  // with RESTRICT foreign keys, and none of them were added here when they
  // shipped. Re-seeding has therefore been broken since module 22 — it failed
  // on the first missing table with a bare P2003, and because a re-seed is a
  // manual, occasional act, nothing said so for months.
  //
  // When a module adds a table, these three queries say whether it belongs
  // here. Run them; do not guess:
  //
  //   SELECT DISTINCT tc.table_name
  //   FROM information_schema.table_constraints tc
  //   JOIN information_schema.constraint_column_usage ccu
  //     ON tc.constraint_name = ccu.constraint_name
  //   WHERE tc.constraint_type = 'FOREIGN KEY'
  //     AND ccu.table_name = ANY (ARRAY['issues','projects','organizations'])
  //     AND tc.table_name <> ccu.table_name;
  await prisma.customFieldValue.deleteMany({ where: inOrgIssue });
  // Code links (ADR-0053) hang off issues with RESTRICT, so they go before the
  // issues do — and before their connection, which cascades but is cheaper to
  // clear explicitly.
  await prisma.codeLink.deleteMany({ where: inOrgIssue });
  await prisma.issueLink.deleteMany({ where: { organizationId: orgId } });
  await prisma.issue.deleteMany({ where: { project: { organizationId: orgId } } });
  // ── Modules 30-34, added after the block above was last corrected ─────────
  //
  // Every one of these was missed when it shipped, exactly as the comment
  // above predicted. A re-seed only survived because the tables happened to be
  // empty; the first VERUS automation rule or code link would have broken it
  // with a bare P2003 again.
  //
  // Ordering is by dependency, not by module: transitions point at statuses,
  // statuses are pointed at by issues (already gone), runs point at rules, and
  // everything points at the project.
  await prisma.statusTransition.deleteMany({
    where: { project: { organizationId: orgId } },
  });
  await prisma.workflowStatus.deleteMany({ where: { organizationId: orgId } });
  await prisma.automationRun.deleteMany({
    where: { project: { organizationId: orgId } },
  });
  // Comments reference a rule with RESTRICT (ADR-0050 §4) and are already gone.
  await prisma.automationRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.recurringIssue.deleteMany({ where: { organizationId: orgId } });
  await prisma.component.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.sprint.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.projectMember.deleteMany({ where: { project: { organizationId: orgId } } });
  await prisma.projectCustomField.deleteMany({
    where: { project: { organizationId: orgId } },
  });
  await prisma.project.deleteMany({ where: { organizationId: orgId } });
  // Dashboards before saved views: a widget may point at a view (ADR-0044 §3),
  // so the reverse order trips that FK. Widgets themselves cascade from the
  // dashboard and need no statement of their own.
  await prisma.dashboard.deleteMany({ where: { organizationId: orgId } });
  await prisma.savedView.deleteMany({ where: { organizationId: orgId } });
  // Definitions last of the custom-field tables — values, per-project
  // enablement and select OPTIONS all reference them.
  await prisma.customFieldOption.deleteMany({
    where: { field: { organizationId: orgId } },
  });
  await prisma.customFieldDefinition.deleteMany({ where: { organizationId: orgId } });
  await prisma.teamMembership.deleteMany({ where: { team: { organizationId: orgId } } });
  await prisma.team.deleteMany({ where: { organizationId: orgId } });
  await prisma.featureFlag.deleteMany({ where: { organizationId: orgId } });
  await prisma.label.deleteMany({ where: { organizationId: orgId } });
  // Org-level integration tables (ADR-0052, ADR-0053). Deliveries and links
  // cascade from their parent, but clearing them explicitly keeps the delete
  // one statement each rather than a cascade nobody can see in this file.
  await prisma.webhookDelivery.deleteMany({
    where: { webhook: { organizationId: orgId } },
  });
  await prisma.webhook.deleteMany({ where: { organizationId: orgId } });
  // Module 35's three tables — credentials, repositories, backfill runs — all
  // cascade from the connection below, so they need no statement here. Checked
  // with the query above rather than assumed, which is the whole point of GIT-7.
  const goingAway = await prisma.codeConnection.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  await prisma.codeConnection.deleteMany({ where: { organizationId: orgId } });
  // `code_auth_states` is the exception: it holds a connectionId as a plain
  // column with no foreign key (it has to survive being written before the
  // handshake completes), so nothing cascades it away. A stale row is harmless
  // — it expires — but leaving rows pointing at a deleted connection is exactly
  // the kind of debris that makes the next person doubt the teardown.
  if (goingAway.length > 0) {
    await prisma.codeAuthState.deleteMany({
      where: { connectionId: { in: goingAway.map((c) => c.id) } },
    });
  }
  await prisma.apiToken.deleteMany({ where: { organizationId: orgId } });

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
