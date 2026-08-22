import type { StatusCategoryDto } from "@/features/workflow/types/workflow.types";
import { prisma } from "@/shared/lib/db";
import { DEFAULT_STATUSES } from "@/features/workflow/lib/defaults";

// Seeding a test project's statuses (30_workflow BR-7).
//
// Integration tests create projects with `prisma.project.create`, which bypasses
// `ProjectRepository.createWithLead` and therefore the status seeding that runs
// inside it. Rather than teach every test the four rows, they call this — which
// reads the SAME `DEFAULT_STATUSES` the real seeding path does, so a test can
// never be green against a set of statuses production would not create.

export interface SeededStatuses {
  /** The status a new issue would get. */
  defaultId: string;
  /** Status id by category, for putting a fixture issue in a known column. */
  byCategory: Record<StatusCategoryDto, string>;
}

export async function seedStatuses(
  projectId: string,
  organizationId: string,
): Promise<SeededStatuses> {
  const rows = await Promise.all(
    DEFAULT_STATUSES.map((s) =>
      prisma.workflowStatus.create({
        data: {
          organizationId,
          projectId,
          name: s.name,
          category: s.category,
          color: s.color,
          position: s.position,
          isDefault: s.isDefault,
        },
        select: { id: true, category: true, isDefault: true },
      }),
    ),
  );

  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.id])) as Record<
    StatusCategoryDto,
    string
  >;
  return { defaultId: rows.find((r) => r.isDefault)!.id, byCategory };
}

/**
 * `prisma.project.create` plus the status seeding that production does.
 *
 * A drop-in for the raw call, because `ProjectRepository.createWithLead` seeds
 * the four statuses in the same transaction that creates the project — a
 * project without them cannot hold an issue, since `Issue.statusId` is
 * required. A fixture that skips the seeding is testing a state production
 * cannot produce.
 *
 * Deliberately a named call at every site rather than a Prisma middleware that
 * seeds behind the scenes: middleware would keep these tests green even if
 * production stopped seeding, which is the exact failure this is guarding
 * against.
 */
export async function createProjectWithStatuses(
  args: Parameters<typeof prisma.project.create>[0],
) {
  const project = await prisma.project.create(args);
  const row = project as unknown as { id: string; organizationId?: string };
  const organizationId =
    row.organizationId ??
    (
      await prisma.project.findUniqueOrThrow({
        where: { id: row.id },
        select: { organizationId: true },
      })
    ).organizationId;
  await seedStatuses(row.id, organizationId);
  return project;
}

/**
 * The id of a project's status for `category`, seeding the four if the project
 * has none yet.
 *
 * For fixtures that build issues from a helper with only a `projectId` in
 * scope. Find-or-seed rather than seed-always so calling it per issue is safe.
 */
export async function statusFor(
  projectId: string,
  category: StatusCategoryDto = "TODO",
): Promise<string> {
  const existing = await prisma.workflowStatus.findFirst({
    where: { projectId, category, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { organizationId: true },
  });
  const seeded = await seedStatuses(projectId, project.organizationId);
  return seeded.byCategory[category];
}
