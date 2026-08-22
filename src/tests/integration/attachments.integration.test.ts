import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the storage factory at a throwaway dir BEFORE any adapter is constructed
// (the factory caches on first use). Cheap, hermetic, and provider-agnostic —
// this is exactly what a self-hosted deploy runs (ADR-0017).
const STORAGE_DIR = path.join(os.tmpdir(), `eagles-att-${process.pid}`);
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_LOCAL_DIR = STORAGE_DIR;

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { AttachmentService } from "@/features/attachments/services/attachment.service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses } from "./helpers/workflow";

// Integration — real Postgres + the on-disk LocalStorageAdapter. Proves the full
// attachment path (09_attachments.md, ADR-0017): upload writes a blob under an
// opaque key, list/download round-trip the bytes, RBAC on upload/delete, size +
// MIME rejection, and tenant isolation (F-1).

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const lead = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-lead@example.com`, name: `Lead ${tag}` },
  });
  const member = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-mem@example.com`, name: `Member ${tag}` },
  });
  const viewer = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-view@example.com`, name: `Viewer ${tag}` },
  });
  const project = await createProjectWithStatuses({
    data: { organizationId: org.id, key: tag.toUpperCase(), name: `Project ${tag}`, createdBy: lead.id },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
      { projectId: project.id, userId: member.id, role: "MEMBER", createdBy: lead.id },
      { projectId: project.id, userId: viewer.id, role: "VIEWER", createdBy: lead.id },
    ],
  });
  const asLead: Actor = { userId: lead.id, orgRole: "MEMBER", organizationId: org.id };
  const asMember: Actor = { userId: member.id, orgRole: "MEMBER", organizationId: org.id };
  const asViewer: Actor = { userId: viewer.id, orgRole: "MEMBER", organizationId: org.id };
  const issue = await IssueService.create(asLead, project.id, {
    type: "TASK",
    title: "Attach here",
    priority: "MEDIUM",
  });
  return { org, project, issue, asLead, asMember, asViewer };
}

const pdf = (bytes = "hello") => ({
  fileName: "report.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(bytes),
});

beforeEach(reset);
afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
});

describe("Attachments integration", () => {
  it("uploads, lists, and downloads the exact bytes back", async () => {
    const { issue, asMember } = await seed("a1");
    const created = await AttachmentService.upload(asMember, issue.id, pdf("the-bytes"));
    expect(created.fileName).toBe("report.pdf");

    const listed = await AttachmentService.list(asMember, issue.id);
    expect(listed.items).toHaveLength(1);
    expect(listed.canUpload).toBe(true);

    const dl = await AttachmentService.download(asMember, created.id);
    expect(dl.body.toString()).toBe("the-bytes");
    expect(dl.mimeType).toBe("application/pdf");
  });

  it("stores the blob under an opaque key, not the filename", async () => {
    const { issue, asMember } = await seed("op");
    await AttachmentService.upload(asMember, issue.id, pdf());
    const row = await prisma.attachment.findFirstOrThrow({ select: { storageKey: true } });
    expect(row.storageKey.startsWith(`attachments/${issue.id}/`)).toBe(true);
    expect(row.storageKey).not.toContain("report.pdf");
  });

  it("rejects an oversize file and a disallowed MIME type", async () => {
    const { issue, asMember } = await seed("rej");
    await expect(
      AttachmentService.upload(asMember, issue.id, {
        fileName: "big.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(25_000_001),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AttachmentService.upload(asMember, issue.id, {
        fileName: "evil.exe",
        mimeType: "application/x-msdownload",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("forbids a VIEWER from uploading", async () => {
    const { issue, asViewer } = await seed("vw");
    await expect(
      AttachmentService.upload(asViewer, issue.id, pdf()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a LEAD delete another member's file; a VIEWER cannot", async () => {
    const { issue, asMember, asLead, asViewer } = await seed("del");
    const created = await AttachmentService.upload(asMember, issue.id, pdf());

    await expect(AttachmentService.delete(asViewer, created.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await AttachmentService.delete(asLead, created.id);

    const listed = await AttachmentService.list(asMember, issue.id);
    expect(listed.items).toHaveLength(0);
    // The download of a soft-deleted attachment is gone.
    await expect(AttachmentService.download(asMember, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("isolates attachments across orgs (F-1)", async () => {
    const a = await seed("t1");
    const b = await seed("t2");
    const created = await AttachmentService.upload(a.asMember, a.issue.id, pdf());
    // b's member has no visibility into a's project — treated as absent.
    await expect(AttachmentService.download(b.asMember, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
