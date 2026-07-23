import { cache } from "react";
import type { Actor } from "@/shared/types/actor";
import { NotFoundError } from "@/shared/lib/errors";
import { AdminCapability, requireCapability } from "@/features/admin/authz/capabilities";
import { AuditAction } from "@/features/admin/audit/audit-actions";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { FeatureFlagRepository } from "@/features/admin/repositories/feature-flag.repository";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  isFeatureFlagKey,
  type FeatureFlagKey,
} from "@/features/admin/registry/feature-flags";
import type { FeatureFlagDto } from "@/features/admin/types/admin.types";
import type { SetFeatureFlagInput } from "@/features/admin/validation/admin.schemas";

// React's cache() memoizes per server request (same pattern as getActor), but
// it only exists in the RSC runtime — in non-RSC contexts (unit tests) it's
// undefined, so fall back to the un-memoized function.
const perRequest: typeof cache =
  typeof cache === "function" ? cache : (<T>(fn: T) => fn) as typeof cache;

// The flag store being unavailable — a DB blip, or the feature_flags table not
// yet migrated in an environment (GL-4) — must NEVER take down the app. Flags
// gate behavior, not core availability (ADR-0023 BR-5), so a failed lookup
// fails safe to the code-registry defaults instead of throwing.
async function safeListOverrides(organizationId: string) {
  try {
    return await FeatureFlagRepository.listOverrides(organizationId);
  } catch (error) {
    console.error(
      "[feature-flags] override lookup failed; falling back to registry defaults",
      error,
    );
    return [];
  }
}

// Load an org's overrides once per request. A page gating several flags pays
// one query. Stale keys not in the registry are ignored at read time (ADR-0023 §1).
const loadOverrides = perRequest(
  async (organizationId: string): Promise<Map<string, boolean>> => {
    const rows = await safeListOverrides(organizationId);
    return new Map(rows.map((row) => [row.key, row.enabled]));
  },
);

export const FeatureFlagService = {
  // The consumption seam other modules depend on (ADR-0023 §2). Resolves
  // override → registry default, org-scoped (F-1). No capability required — a
  // flag gates any user's features, it is not an admin-only read. Flags gate
  // behavior/visibility only, never tenant isolation or RBAC (13_admin.md BR-5).
  async isEnabled(actor: Actor, key: FeatureFlagKey): Promise<boolean> {
    const overrides = await loadOverrides(actor.organizationId);
    const override = overrides.get(key);
    return override ?? FEATURE_FLAGS[key].defaultEnabled;
  },

  // The admin catalog: every registered flag with its effective state for this
  // org (ADR-0023 §3). Registry is the source of truth, so removed flags never
  // appear even if a stale row exists.
  async listForAdmin(actor: Actor): Promise<FeatureFlagDto[]> {
    requireCapability(actor, AdminCapability.MANAGE_FEATURE_FLAGS);
    // Same fail-safe: the admin console shows registry defaults if the store is
    // unavailable, rather than 500ing the page.
    const overrides = await safeListOverrides(actor.organizationId);
    const byKey = new Map(overrides.map((row) => [row.key, row]));

    return FEATURE_FLAG_KEYS.map((key) => {
      const def = FEATURE_FLAGS[key];
      const override = byKey.get(key);
      return {
        key,
        description: def.description,
        owner: def.owner,
        defaultEnabled: def.defaultEnabled,
        enabled: override ? override.enabled : def.defaultEnabled,
        isOverridden: override !== undefined,
        updatedAt: override?.updatedAt ? override.updatedAt.toISOString() : null,
      };
    });
  },

  // Set or clear an override (audited, ADR-0023 §3). Unknown keys are rejected
  // (404) — you can only toggle a registered flag.
  async setOverride(
    actor: Actor,
    key: string,
    input: SetFeatureFlagInput,
  ): Promise<FeatureFlagDto> {
    requireCapability(actor, AdminCapability.MANAGE_FEATURE_FLAGS);
    if (!isFeatureFlagKey(key)) throw new NotFoundError("Unknown feature flag.");

    const def = FEATURE_FLAGS[key];
    const existing = await FeatureFlagRepository.findOverride(actor.organizationId, key);
    const beforeEnabled = existing ? existing.enabled : def.defaultEnabled;

    let enabled: boolean;
    let isOverridden: boolean;
    let updatedAt: string | null;

    if (input.reset === true) {
      await FeatureFlagRepository.deleteOverride(actor.organizationId, key);
      enabled = def.defaultEnabled;
      isOverridden = false;
      updatedAt = null;
    } else {
      const row = await FeatureFlagRepository.upsertOverride({
        organizationId: actor.organizationId,
        key,
        enabled: input.enabled as boolean,
        actorId: actor.userId,
      });
      enabled = row.enabled;
      isOverridden = true;
      updatedAt = row.updatedAt.toISOString();
    }

    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.FEATURE_FLAG_CHANGED,
      entityType: "FeatureFlag",
      entityId: key,
      beforeData: { enabled: beforeEnabled, isOverridden: existing !== null },
      afterData: { enabled, isOverridden },
    });

    return {
      key,
      description: def.description,
      owner: def.owner,
      defaultEnabled: def.defaultEnabled,
      enabled,
      isOverridden,
      updatedAt,
    };
  },
};
