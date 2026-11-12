import { prisma } from "@/shared/lib/db";

// Integration-test helper: since ADR-0059 every work log belongs to a weekly
// timesheet and a row, so a test that needs logged time creates all three.
// Writes straight to the database on purpose — tests of other modules should
// not depend on the timesheets service's rules.
export async function createWorkLogFixture(
  input: { issueId: string; userId: string; minutes: number; workDate: Date },
) {
  const issue = await prisma.issue.findUniqueOrThrow({
    where: { id: input.issueId },
    select: { project: { select: { organizationId: true } } },
  });
  const organizationId = issue.project.organizationId;
  const policy = await prisma.timesheetPolicy.upsert({
    where: {
      organizationId_effectiveFrom: {
        organizationId,
        effectiveFrom: new Date("2000-01-03T00:00:00.000Z"),
      },
    },
    create: {
      organizationId,
      effectiveFrom: new Date("2000-01-03T00:00:00.000Z"),
      timezone: "UTC",
    },
    update: {},
  });
  const d = new Date(input.workDate);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const periodStart = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000);
  const sheet = await prisma.timesheet.upsert({
    where: { userId_periodStart: { userId: input.userId, periodStart } },
    create: {
      organizationId,
      userId: input.userId,
      periodStart,
      periodEnd: new Date(periodStart.getTime() + 6 * 86_400_000),
      policyId: policy.id,
    },
    update: {},
  });
  const row =
    (await prisma.timesheetRow.findFirst({ where: { timesheetId: sheet.id, issueId: input.issueId } })) ??
    (await prisma.timesheetRow.create({
      data: { timesheetId: sheet.id, issueId: input.issueId, position: 0 },
    }));
  return prisma.workLog.create({
    data: {
      organizationId,
      issueId: input.issueId,
      userId: input.userId,
      minutes: input.minutes,
      workDate: day,
      timesheetId: sheet.id,
      timesheetRowId: row.id,
    },
  });
}
