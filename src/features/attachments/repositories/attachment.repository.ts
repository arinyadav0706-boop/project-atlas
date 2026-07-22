import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// The repository owns the `attachments` metadata rows; blob bytes live behind the
// StorageAdapter (ADR-0017).

const uploaderSelect = {
  select: { id: true, name: true, avatarUrl: true },
} as const;

const attachmentSelect = {
  id: true,
  issueId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  storageKey: true,
  uploadedById: true,
  createdAt: true,
  uploadedBy: uploaderSelect,
} as const;

// Attachments per issue are few; the list is bounded rather than paginated in the
// MVP (Performance doc, standard #1).
export const ATTACHMENT_LIST_LIMIT = 200;

export const AttachmentRepository = {
  listByIssue(issueId: string) {
    return prisma.attachment.findMany({
      where: { issueId, deletedAt: null },
      select: attachmentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: ATTACHMENT_LIST_LIMIT,
    });
  },

  // A single attachment plus the owning issue's projectId — the service needs the
  // project for tenant scope (F-1) and RBAC without a second query.
  findById(id: string) {
    return prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      select: { ...attachmentSelect, issue: { select: { projectId: true } } },
    });
  },

  create(input: {
    issueId: string;
    uploadedById: string;
    fileName: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    return prisma.attachment.create({
      data: { ...input, createdBy: input.uploadedById },
      select: attachmentSelect,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
      select: { id: true },
    });
  },
};

export type AttachmentRow = Awaited<
  ReturnType<typeof AttachmentRepository.listByIssue>
>[number];
