import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
export const OrganizationRepository = {
  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  update(
    id: string,
    data: {
      name: string;
      domain?: string;
      workingMinutesPerDay?: number;
      workingDaysPerWeek?: number;
      updatedBy: string;
    },
  ) {
    return prisma.organization.update({
      where: { id },
      data: {
        name: data.name,
        domain: data.domain,
        ...(data.workingMinutesPerDay !== undefined
          ? { workingMinutesPerDay: data.workingMinutesPerDay }
          : {}),
        ...(data.workingDaysPerWeek !== undefined
          ? { workingDaysPerWeek: data.workingDaysPerWeek }
          : {}),
        updatedBy: data.updatedBy,
      },
    });
  },
};
