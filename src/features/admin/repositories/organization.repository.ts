import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
export const OrganizationRepository = {
  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  update(id: string, data: { name: string; domain?: string; updatedBy: string }) {
    return prisma.organization.update({
      where: { id },
      data: { name: data.name, domain: data.domain, updatedBy: data.updatedBy },
    });
  },
};
