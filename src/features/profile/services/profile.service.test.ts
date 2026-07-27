import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

const storage = { upload: vi.fn(), getObject: vi.fn(), delete: vi.fn() };

vi.mock("@/features/profile/repositories/profile.repository", () => ({
  ProfileRepository: {
    findById: vi.fn(),
    listMemberships: vi.fn(),
    update: vi.fn(),
    findAvatarInOrg: vi.fn(),
  },
}));
vi.mock("@/shared/lib/storage", () => ({ getStorageAdapter: () => storage }));

import { ProfileRepository } from "@/features/profile/repositories/profile.repository";
import { ProfileService } from "./profile.service";
import { NotFoundError, ValidationError } from "@/shared/lib/errors";

const repo = vi.mocked(ProfileRepository);
const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Ada",
    email: "ada@x.com",
    avatarUrl: null,
    notificationsEnabled: true,
    orgRole: "MEMBER" as const,
    organizationId: "org-1",
    ...overrides,
  };
}

// A tiny valid PNG header so magic-byte sniffing returns image/png.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(userRow());
  repo.listMemberships.mockResolvedValue([
    { role: "LEAD", project: { id: "p1", key: "ENG", name: "Engineering" } },
  ] as never);
  repo.update.mockResolvedValue(userRow() as never);
});

describe("ProfileService.getMyProfile", () => {
  it("maps the user row + memberships to a DTO", async () => {
    const dto = await ProfileService.getMyProfile(actor);
    expect(dto).toMatchObject({
      id: "user-1",
      email: "ada@x.com",
      orgRole: "MEMBER",
      memberships: [{ projectId: "p1", projectKey: "ENG", projectName: "Engineering", role: "LEAD" }],
    });
  });

  it("throws NotFound when the row is gone", async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(ProfileService.getMyProfile(actor)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ProfileService.updateMyProfile", () => {
  it("persists name + notifications for the caller's own id", async () => {
    await ProfileService.updateMyProfile(actor, { name: "Ada L", notificationsEnabled: false });
    expect(repo.update).toHaveBeenCalledWith(
      "user-1",
      { name: "Ada L", notificationsEnabled: false },
      "user-1",
    );
  });
});

describe("ProfileService.setAvatar", () => {
  it("rejects a non-image before touching storage (BR-4)", async () => {
    await expect(
      ProfileService.setAvatar(actor, { mimeType: "application/pdf", buffer: PNG }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects an oversize image (BR-4)", async () => {
    const big = Buffer.alloc(3_000_000);
    await expect(
      ProfileService.setAvatar(actor, { mimeType: "image/png", buffer: big }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("uploads under the per-user key and points avatarUrl at the proxy", async () => {
    await ProfileService.setAvatar(actor, { mimeType: "image/png", buffer: PNG });
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: "avatars/user-1", mimeType: "image/png" }),
    );
    const [, data] = repo.update.mock.calls[0]!;
    expect((data as { avatarUrl: string }).avatarUrl).toMatch(/^\/api\/users\/user-1\/avatar\?v=/);
  });
});

describe("ProfileService.removeAvatar", () => {
  it("clears avatarUrl and best-effort deletes the blob", async () => {
    await ProfileService.removeAvatar(actor);
    expect(repo.update).toHaveBeenCalledWith("user-1", { avatarUrl: null }, "user-1");
    expect(storage.delete).toHaveBeenCalledWith("avatars/user-1");
  });

  it("does not throw if the blob delete fails (source of truth is the row)", async () => {
    storage.delete.mockRejectedValueOnce(new Error("gone"));
    await expect(ProfileService.removeAvatar(actor)).resolves.toBeDefined();
  });
});

describe("ProfileService.getAvatarBytes", () => {
  it("404s for a user outside the caller's org (F-1)", async () => {
    repo.findAvatarInOrg.mockResolvedValueOnce(null);
    await expect(ProfileService.getAvatarBytes(actor, "other")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("404s when the row has no avatar", async () => {
    repo.findAvatarInOrg.mockResolvedValueOnce({ id: "u2", avatarUrl: null } as never);
    await expect(ProfileService.getAvatarBytes(actor, "u2")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("serves bytes with a sniffed content-type", async () => {
    repo.findAvatarInOrg.mockResolvedValueOnce({
      id: "u2",
      avatarUrl: "/api/users/u2/avatar?v=1",
    } as never);
    storage.getObject.mockResolvedValueOnce(PNG);
    const res = await ProfileService.getAvatarBytes(actor, "u2");
    expect(res.mimeType).toBe("image/png");
    expect(res.body).toBe(PNG);
  });
});
