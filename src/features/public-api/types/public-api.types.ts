// DTOs for the public API and webhooks (ADR-0052, 33_public_api.md).

/**
 * Scopes. Coarse and read/write split (BR-3).
 *
 * Per-field scopes are a governance fantasy — nobody configures them correctly,
 * and the false confidence they create is worse than the honest coarse version.
 * Five scopes a person can hold in their head beats fifty nobody reads.
 *
 * Note this is already stricter than the competition: ClickUp's and Asana's
 * personal tokens are all-or-nothing.
 */
export const API_SCOPES = [
  "projects:read",
  "issues:read",
  "issues:write",
  "comments:write",
  "webhooks:manage",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_DESCRIPTION: Record<ApiScope, string> = {
  "projects:read": "Read projects and their members",
  "issues:read": "Read issues and comments",
  "issues:write": "Create, edit, move and delete issues",
  "comments:write": "Post comments",
  "webhooks:manage": "Create and manage webhooks",
};

/** Events a webhook can subscribe to (BR-11). `resource.action`, flat. */
export const WEBHOOK_EVENTS = [
  "issue.created",
  "issue.updated",
  "issue.deleted",
  "comment.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const EVENT_DESCRIPTION: Record<WebhookEvent, string> = {
  "issue.created": "An issue is created — by a person, an automation or a schedule",
  "issue.updated": "An issue's fields change, including its status",
  "issue.deleted": "An issue is deleted",
  "comment.created": "A comment is posted",
};

export interface ApiTokenDto {
  id: string;
  name: string;
  /** Last few characters of the PUBLIC id, to tell rows apart. Never the secret. */
  hint: string;
  scopes: ApiScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string };
}

/** The one and only time the secret exists outside the client's hands (BR-4). */
export interface CreatedApiTokenDto extends ApiTokenDto {
  plaintext: string;
}

export type WebhookDeliveryStatusDto = "PENDING" | "SUCCEEDED" | "FAILED";

export interface WebhookDto {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  consecutiveFailures: number;
  /** Set when auto-disabled after repeated failures (BR-10). */
  disabledReason: string | null;
  createdAt: string;
  /** Present only in the create response — shown once, like a token. */
  secret?: string;
}

export interface WebhookDeliveryDto {
  id: string;
  event: string;
  status: WebhookDeliveryStatusDto;
  attempts: number;
  nextAttemptAt: string | null;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
}

export interface DeveloperSettingsDto {
  tokens: ApiTokenDto[];
  webhooks: WebhookDto[];
  /** Whether the viewer may manage webhooks — org ADMIN only (BR-12). */
  canManageWebhooks: boolean;
}

/** The envelope every v1 list returns (BR-5). */
export interface ApiPage<T> {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}
