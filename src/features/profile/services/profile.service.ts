import { randomUUID } from "node:crypto";
import type { Actor } from "@/shared/types/actor";
import { NotFoundError } from "@/shared/lib/errors";
import { getStorageAdapter } from "@/shared/lib/storage";
import { ProfileRepository } from "@/features/profile/repositories/profile.repository";
import { assertValidAvatar, sniffImageMime } from "@/features/profile/validation/avatar.rules";
import type { UpdateProfileInput } from "@/features/profile/validation/profile.schemas";
import type { ProfileDto } from "@/features/profile/types/profile.types";

// Business rules from docs/02_Modules/16_profile.md (ADR-0027). Every method acts
// on the caller's OWN row (`/users/me`); the one cross-user read is avatar bytes,
// org-scoped (F-1). Self-edits are not audited (BR-6). Privileged fields never
// reach here — the update schema rejects them (BR-3).

// Avatars use a deterministic per-user key: one upload overwrites the previous,
// so there's never an orphaned blob and the serving route needs no stored key.
function avatarKey(userId: string): string {
  return `avatars/${userId}`;
}

export const ProfileService = {
  async getMyProfile(actor: Actor): Promise<ProfileDto> {
    const user = await ProfileRepository.findById(actor.userId);
    if (!user) throw new NotFoundError("Your account could not be found.");
    const memberships = await ProfileRepository.listMemberships(
      actor.userId,
      actor.organizationId,
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      notificationsEnabled: user.notificationsEnabled,
      orgRole: user.orgRole,
      memberships: memberships.map((m) => ({
        projectId: m.project.id,
        projectKey: m.project.key,
        projectName: m.project.name,
        role: m.role,
      })),
    };
  },

  // BR-1/BR-2: update own name and/or notifications toggle. The input is already
  // validated (strict schema) — this only persists it (last-write-wins, BR-6).
  async updateMyProfile(actor: Actor, input: UpdateProfileInput): Promise<ProfileDto> {
    await ProfileRepository.update(
      actor.userId,
      { name: input.name, notificationsEnabled: input.notificationsEnabled },
      actor.userId,
    );
    return this.getMyProfile(actor);
  },

  // BR-4: store the image through the StorageAdapter (never a client URL) and
  // point avatarUrl at the org-scoped proxy with a cache-busting token so the
  // new image shows immediately despite browser caching.
  async setAvatar(
    actor: Actor,
    file: { mimeType: string; buffer: Buffer },
  ): Promise<ProfileDto> {
    assertValidAvatar(file.mimeType, file.buffer.byteLength);
    await getStorageAdapter().upload({
      storageKey: avatarKey(actor.userId),
      buffer: file.buffer,
      mimeType: file.mimeType,
    });
    const avatarUrl = `/api/users/${actor.userId}/avatar?v=${randomUUID()}`;
    await ProfileRepository.update(actor.userId, { avatarUrl }, actor.userId);
    return this.getMyProfile(actor);
  },

  // BR-4: clear avatarUrl and best-effort remove the blob (a storage failure
  // must never block the user — the DB row is the source of truth).
  async removeAvatar(actor: Actor): Promise<ProfileDto> {
    await ProfileRepository.update(actor.userId, { avatarUrl: null }, actor.userId);
    try {
      await getStorageAdapter().delete(avatarKey(actor.userId));
    } catch {
      // Orphan swept by a future cleanup job (ADR-0017 §5).
    }
    return this.getMyProfile(actor);
  },

  // BR-4/F-1: serve avatar bytes only for a user in the caller's own org. The
  // content-type is sniffed from the bytes (not stored, not client-trusted).
  async getAvatarBytes(
    actor: Actor,
    userId: string,
  ): Promise<{ mimeType: string; body: Buffer }> {
    const target = await ProfileRepository.findAvatarInOrg(userId, actor.organizationId);
    if (!target || !target.avatarUrl) throw new NotFoundError("No avatar.");
    const body = await getStorageAdapter().getObject(avatarKey(userId));
    if (!body) throw new NotFoundError("No avatar.");
    return { mimeType: sniffImageMime(body), body };
  },
};
