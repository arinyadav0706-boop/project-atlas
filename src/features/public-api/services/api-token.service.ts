import { ApiTokenRepository } from "@/features/public-api/repositories/api-token.repository";
import { UnauthorizedError, ValidationError, NotFoundError, ForbiddenError } from "@/shared/lib/errors";
import { logSwallowed } from "@/shared/lib/swallowed";
import type { Actor } from "@/shared/types/actor";
import {
  bearerFrom,
  generateToken,
  parseToken,
  secretMatches,
  tokenHint,
} from "@/features/public-api/lib/token";
import {
  API_SCOPES,
  type ApiScope,
  type ApiTokenDto,
  type CreatedApiTokenDto,
} from "@/features/public-api/types/public-api.types";

// Personal access tokens: minting, listing, revoking, and the authentication
// path itself (ADR-0052 §2-§3).

/** Beyond this a person is not managing tokens, they are leaking them. */
export const MAX_TOKENS_PER_USER = 20;

/**
 * How stale `lastUsedAt` may get.
 *
 * Writing it on every request would put an UPDATE in front of every read in
 * the API. Nobody needs this to the second; they need to know whether a token
 * was used this week (BR-14).
 */
const TOUCH_INTERVAL_MS = 60_000;
const lastTouched = new Map<string, number>();

export interface AuthenticatedToken {
  tokenId: string;
  actor: Actor;
  scopes: ApiScope[];
}

function toDto(row: {
  id: string;
  name: string;
  publicId: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string };
}): ApiTokenDto {
  return {
    id: row.id,
    name: row.name,
    hint: tokenHint(row.publicId),
    scopes: row.scopes as ApiScope[],
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    owner: row.user,
  };
}

export const ApiTokenService = {
  /**
   * Turn an `Authorization` header into an actor (BR-2).
   *
   * Every rejection is the same 401 with the same message. Distinguishing
   * "no such token" from "wrong secret" from "revoked" would hand an attacker
   * a way to confirm which public ids exist, and none of those distinctions
   * helps a legitimate caller who simply has a bad token.
   */
  async authenticate(header: string | null): Promise<AuthenticatedToken> {
    const raw = bearerFrom(header);
    if (!raw) {
      throw new UnauthorizedError(
        "Provide a token as `Authorization: Bearer eag_…`.",
      );
    }
    const parsed = parseToken(raw);
    if (!parsed) throw new UnauthorizedError("That token is not valid.");

    const row = await ApiTokenRepository.findForAuth(parsed.publicId);
    // Verify the secret even when the row is missing? No — there is nothing to
    // compare against, and the timing difference reveals only that a random
    // 32-hex id is not in the table, which an attacker already assumes.
    if (!row) throw new UnauthorizedError("That token is not valid.");
    if (!secretMatches(parsed.secret, row.secretHash)) {
      throw new UnauthorizedError("That token is not valid.");
    }
    if (row.revokedAt) throw new UnauthorizedError("That token has been revoked.");
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("That token has expired.");
    }
    // A token must stop working the moment its owner is deactivated or removed
    // — otherwise offboarding a person leaves their scripts running.
    if (!row.user.isActive || row.user.deletedAt) {
      throw new UnauthorizedError("The account this token belongs to is not active.");
    }

    this.touch(row.id);

    return {
      tokenId: row.id,
      scopes: row.scopes as ApiScope[],
      // The actor IS the owner (BR-2). Every downstream service runs the same
      // permission engine it runs for a session, so a token cannot do anything
      // its owner could not do in the UI, and scopes only narrow from there.
      actor: {
        userId: row.userId,
        orgRole: row.user.orgRole,
        organizationId: row.organizationId,
      },
    };
  },

  /** Best-effort, throttled. A failure here must never fail the request. */
  touch(tokenId: string): void {
    const now = Date.now();
    const previous = lastTouched.get(tokenId) ?? 0;
    if (now - previous < TOUCH_INTERVAL_MS) return;
    lastTouched.set(tokenId, now);
    void ApiTokenRepository.touch(tokenId).catch((error) => {
      logSwallowed("apiToken.touch", error);
    });
  },

  /** A person's own tokens. Never anyone else's — tokens are personal (BR-12). */
  async list(actor: Actor): Promise<ApiTokenDto[]> {
    const rows = await ApiTokenRepository.listForUser(actor.userId);
    return rows.map(toDto);
  },

  async create(
    actor: Actor,
    input: { name: string; scopes: ApiScope[]; expiresInDays?: number | null },
  ): Promise<CreatedApiTokenDto> {
    const live = await ApiTokenRepository.countLiveForUser(actor.userId);
    if (live >= MAX_TOKENS_PER_USER) {
      throw new ValidationError(
        `You already have ${MAX_TOKENS_PER_USER} active tokens, which is the limit. Revoke one first.`,
      );
    }
    const scopes = [...new Set(input.scopes)];
    if (scopes.length === 0) {
      throw new ValidationError("Choose at least one scope.");
    }
    const unknown = scopes.filter((s) => !API_SCOPES.includes(s));
    if (unknown.length > 0) {
      throw new ValidationError(`Unknown scope: ${unknown.join(", ")}.`);
    }

    const generated = generateToken();
    const row = await ApiTokenRepository.create({
      organizationId: actor.organizationId,
      userId: actor.userId,
      name: input.name,
      publicId: generated.publicId,
      secretHash: generated.secretHash,
      scopes,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null,
    });
    // The only moment the secret exists outside the caller's hands (BR-4).
    return { ...toDto(row), plaintext: generated.plaintext };
  },

  async revoke(actor: Actor, tokenId: string): Promise<void> {
    const row = await ApiTokenRepository.findById(tokenId);
    if (!row) throw new NotFoundError("Token not found.");
    // Tenant scope first (F-1), then ownership: a token is personal, and even
    // an org admin revoking someone else's would be a surprising side channel.
    if (row.organizationId !== actor.organizationId) {
      throw new NotFoundError("Token not found.");
    }
    if (row.userId !== actor.userId) {
      throw new ForbiddenError("You can only revoke your own tokens.");
    }
    await ApiTokenRepository.revoke(tokenId, actor.userId);
  },
};
