import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Point the local storage adapter at a throwaway dir BEFORE the module that
// constructs it is imported (getStorageAdapter caches on first use).
const AVATAR_DIR = path.join(os.tmpdir(), `eagles-avatars-${process.pid}`);
process.env.STORAGE_PROVIDER = "local";
process.env.STORAGE_LOCAL_DIR = AVATAR_DIR;

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { ProfileService } from "@/features/profile/services/profile.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres + the on-disk storage adapter. Proves the Profile
// service (16_profile.md, ADR-0027): self-edit persists and never changes
// privileged fields; avatar round-trips through the storage seam; F-1 holds on
// the cross-org avatar read.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({ data: { name: tag, domain: `${tag}.example.com` } });
  const user = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}@x.com`, name: `${tag} User`, orgRole: "MEMBER" },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 6), name: `${tag} proj`, createdBy: user.id },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: user.id, role: "LEAD", createdBy: user.id },
  });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, user, project, actor };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);

beforeEach(reset);
afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(AVATAR_DIR, { recursive: true, force: true });
});

describe("Profile service (ADR-0027)", () => {
  it("reflects the user + memberships, and self-edit persists without touching orgRole", async () => {
    const s = await seed("pf1");

    const before = await ProfileService.getMyProfile(s.actor);
    expect(before).toMatchObject({ email: "pf1@x.com", orgRole: "MEMBER", notificationsEnabled: true });
    expect(before.memberships).toHaveLength(1);
    expect(before.memberships[0]).toMatchObject({ role: "LEAD", projectName: "pf1 proj" });

    const after = await ProfileService.updateMyProfile(s.actor, {
      name: "Renamed Person",
      notificationsEnabled: false,
    });
    expect(after.name).toBe("Renamed Person");
    expect(after.notificationsEnabled).toBe(false);
    expect(after.orgRole).toBe("MEMBER");

    // The row itself is unchanged in role/status/email.
    const row = await prisma.user.findUnique({ where: { id: s.user.id } });
    expect(row?.orgRole).toBe("MEMBER");
    expect(row?.isActive).toBe(true);
    expect(row?.email).toBe("pf1@x.com");
    expect(row?.name).toBe("Renamed Person");
    expect(row?.notificationsEnabled).toBe(false);
  });

  it("uploads an avatar through the storage seam, serves it, then removes it", async () => {
    const s = await seed("pf2");

    const set = await ProfileService.setAvatar(s.actor, { mimeType: "image/png", buffer: PNG });
    expect(set.avatarUrl).toMatch(/^\/api\/users\/.+\/avatar\?v=/);

    const served = await ProfileService.getAvatarBytes(s.actor, s.user.id);
    expect(served.mimeType).toBe("image/png");
    expect(Buffer.from(served.body).equals(PNG)).toBe(true);

    const removed = await ProfileService.removeAvatar(s.actor);
    expect(removed.avatarUrl).toBeNull();
    await expect(ProfileService.getAvatarBytes(s.actor, s.user.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("never serves an avatar across the tenant boundary (F-1)", async () => {
    const a = await seed("pfa");
    const b = await seed("pfb");
    await ProfileService.setAvatar(b.actor, { mimeType: "image/png", buffer: PNG });

    // A user in org A asking for org B's avatar gets a 404, not the bytes.
    await expect(ProfileService.getAvatarBytes(a.actor, b.user.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
