import { WebhookRepository } from "@/features/public-api/repositories/webhook.repository";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { logSwallowed } from "@/shared/lib/swallowed";
import type { Actor } from "@/shared/types/actor";
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  generateWebhookSecret,
  signatureHeader,
} from "@/features/public-api/lib/signature";
import {
  MAX_CONSECUTIVE_FAILURES,
  isRetryable,
  nextAttemptAfter,
} from "@/features/public-api/lib/backoff";
import {
  WEBHOOK_EVENTS,
  type WebhookDeliveryDto,
  type WebhookDto,
  type WebhookEvent,
} from "@/features/public-api/types/public-api.types";

// Webhook administration and delivery (ADR-0052 §7-§9).

/** Enough for real integrations, few enough that one event is not a fan-out. */
export const MAX_WEBHOOKS_PER_ORG = 10;
/** One tick will not attempt more than this, however far behind it is. */
const MAX_PER_TICK = 100;
/** A customer's slow endpoint must not hold our request open. */
const DELIVERY_TIMEOUT_MS = 10_000;
/** How long a claimed delivery is held before another tick may retry it. */
const CLAIM_HOLD_MS = 60_000;

function toDto(row: {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  createdAt: Date;
}): WebhookDto {
  return {
    id: row.id,
    url: row.url,
    events: row.events as WebhookEvent[],
    active: row.active,
    consecutiveFailures: row.consecutiveFailures,
    disabledReason: row.disabledReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Webhooks are org-wide, so an org ADMIN administers them (BR-12).
 *
 * Not a project LEAD: a webhook fires for every project its organization can
 * see, and a lead of one project configuring a firehose over all of them is a
 * privilege escalation with extra steps.
 */
function requireAdmin(actor: Actor): void {
  if (actor.orgRole !== "ADMIN") {
    throw new ForbiddenError("Only an organisation admin can manage webhooks.");
  }
}

export const WebhookService = {
  async list(actor: Actor): Promise<WebhookDto[]> {
    requireAdmin(actor);
    const rows = await WebhookRepository.list(actor.organizationId);
    return rows.map(toDto);
  },

  async create(
    actor: Actor,
    input: { url: string; events: WebhookEvent[] },
  ): Promise<WebhookDto> {
    requireAdmin(actor);
    const count = await WebhookRepository.countForOrg(actor.organizationId);
    if (count >= MAX_WEBHOOKS_PER_ORG) {
      throw new ValidationError(
        `This organisation already has ${MAX_WEBHOOKS_PER_ORG} webhooks, which is the limit.`,
      );
    }
    this.assertUrl(input.url);
    const events = [...new Set(input.events)];
    if (events.length === 0) throw new ValidationError("Choose at least one event.");
    const unknown = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (unknown.length > 0) throw new ValidationError(`Unknown event: ${unknown.join(", ")}.`);

    const secret = generateWebhookSecret();
    const row = await WebhookRepository.create({
      organizationId: actor.organizationId,
      url: input.url,
      secret,
      events,
      actorId: actor.userId,
    });
    // Shown exactly once, like a token (BR-4). The row keeps it because
    // SIGNING needs the original bytes — unlike a token, which is only compared.
    return { ...toDto(row), secret };
  },

  async update(
    actor: Actor,
    webhookId: string,
    input: { url?: string; events?: WebhookEvent[]; active?: boolean },
  ): Promise<WebhookDto> {
    const existing = await this.require(actor, webhookId);
    if (input.url) this.assertUrl(input.url);
    const row = await WebhookRepository.update(
      existing.id,
      {
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.events !== undefined ? { events: [...new Set(input.events)] } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      actor.userId,
    );
    return toDto(row);
  },

  async delete(actor: Actor, webhookId: string): Promise<void> {
    const existing = await this.require(actor, webhookId);
    await WebhookRepository.softDelete(existing.id, actor.userId);
  },

  async deliveries(actor: Actor, webhookId: string, take = 50): Promise<WebhookDeliveryDto[]> {
    const existing = await this.require(actor, webhookId);
    const rows = await WebhookRepository.listDeliveries(existing.id, take);
    return rows.map((row) => ({
      id: row.id,
      event: row.event,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      responseCode: row.responseCode,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  async require(actor: Actor, webhookId: string) {
    requireAdmin(actor);
    const row = await WebhookRepository.findById(webhookId);
    // Tenant scope (F-1): another organization's webhook is absent, not
    // forbidden — a 403 would confirm the id exists.
    if (!row || row.organizationId !== actor.organizationId) {
      throw new NotFoundError("Webhook not found.");
    }
    return row;
  },

  /**
   * Only http(s), and never a local address.
   *
   * Without this the webhook feature is a server-side request forgery
   * primitive: an org admin could point it at `http://169.254.169.254/` and
   * have our own servers fetch the cloud metadata endpoint for them.
   */
  assertUrl(raw: string): void {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ValidationError("That is not a valid URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ValidationError("A webhook URL has to be http or https.");
    }
    const host = url.hostname.toLowerCase();
    const blocked =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "[::1]" ||
      host === "::1";
    if (blocked) {
      throw new ValidationError("A webhook can't point at a private or local address.");
    }
  },

  // ── Delivery ──────────────────────────────────────────────────────────────

  /**
   * Record an event for every subscriber, then try once (BR-9).
   *
   * Called after the primary write commits, never inside it, and the whole body
   * is best-effort: a webhook may not slow or fail the action a person took.
   * Anything not delivered now is a row the scheduler will retry.
   */
  async emit(
    organizationId: string,
    event: WebhookEvent,
    data: unknown,
  ): Promise<void> {
    try {
      const subscribers = await WebhookRepository.subscribers(organizationId, event);
      if (subscribers.length === 0) return;

      for (const subscriber of subscribers) {
        const delivery = await WebhookRepository.createOne({
          webhookId: subscriber.id,
          event,
          payload: {
            event,
            occurredAt: new Date().toISOString(),
            organizationId,
            data,
          } as never,
        });
        // First attempt inline. It usually succeeds, and an integration that
        // reacts in the same second feels different from one that reacts on
        // the next tick.
        await this.attempt({
          deliveryId: delivery.id,
          webhook: subscriber,
          event,
          payload: delivery.payload,
          attempts: 0,
        });
      }
    } catch (error) {
      logSwallowed(`webhooks.emit(${event})`, error);
    }
  },

  /**
   * Retry everything due. Called by the scheduler tick (ADR-0051 §5).
   *
   * Reuses that tick rather than adding a queue: it already exists, is already
   * idempotent, and is already deployed. One fewer piece of infrastructure to
   * run is worth more than a purpose-built worker here.
   */
  async runDue(now = new Date()): Promise<{ attempted: number; delivered: number; failed: number }> {
    const due = await WebhookRepository.listDue(now, MAX_PER_TICK);
    let attempted = 0;
    let delivered = 0;
    let failed = 0;

    for (const row of due) {
      if (!row.nextAttemptAt) continue;
      attempted++;
      const result = await this.attempt({
        deliveryId: row.id,
        webhook: row.webhook,
        event: row.event,
        payload: row.payload,
        attempts: row.attempts,
        claimFrom: row.nextAttemptAt,
      });
      if (result === "delivered") delivered++;
      else if (result === "failed") failed++;
    }
    return { attempted, delivered, failed };
  },

  /** One HTTP attempt, plus everything that follows from how it went. */
  async attempt(input: {
    deliveryId: string;
    webhook: { id: string; url: string; secret: string; active?: boolean; deletedAt?: Date | null };
    event: string;
    payload: unknown;
    attempts: number;
    claimFrom?: Date;
  }): Promise<"delivered" | "failed" | "retrying" | "skipped"> {
    const { deliveryId, webhook, event, payload } = input;

    // Disabled or deleted between queueing and now. Settle the row rather than
    // leaving it PENDING forever.
    if (webhook.deletedAt || webhook.active === false) {
      await WebhookRepository.settle(deliveryId, {
        status: "FAILED",
        error: "The webhook was disabled before this could be delivered.",
        nextAttemptAt: null,
      });
      return "skipped";
    }

    if (input.claimFrom) {
      // Push the next attempt out BEFORE the HTTP call, so an overlapping tick
      // cannot also POST this one. The claim increments `attempts`.
      const won = await WebhookRepository.claim(
        deliveryId,
        input.claimFrom,
        new Date(Date.now() + CLAIM_HOLD_MS),
      );
      if (!won) return "skipped";
    } else {
      // The inline first attempt has no claim to make — nothing else can be
      // holding a row that was created microseconds ago — but it is still an
      // attempt, and a delivered webhook reporting "attempts 0" is a delivery
      // log that contradicts itself.
      await WebhookRepository.countAttempt(deliveryId);
    }

    const attemptNumber = input.attempts + 1;
    // Serialise ONCE and sign those exact bytes (§7). Re-serialising for the
    // request body would risk a different key order from the one we signed.
    const body = JSON.stringify({ ...(payload as object), deliveryId });
    const timestamp = Math.floor(Date.now() / 1000);

    let responseCode: number | null = null;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "EAGLES-Webhooks/1",
            [SIGNATURE_HEADER]: signatureHeader(webhook.secret, timestamp, body),
            [TIMESTAMP_HEADER]: String(timestamp),
            [EVENT_HEADER]: event,
            [DELIVERY_HEADER]: deliveryId,
          },
          body,
          signal: controller.signal,
          redirect: "error",
        });
        responseCode = response.status;
        if (!response.ok) error = `The endpoint returned ${response.status}.`;
      } finally {
        clearTimeout(timer);
      }
    } catch (cause) {
      error =
        cause instanceof Error && cause.name === "AbortError"
          ? `No response within ${DELIVERY_TIMEOUT_MS / 1000}s.`
          : `Could not reach the endpoint: ${cause instanceof Error ? cause.message : String(cause)}`;
    }

    if (!error) {
      await WebhookRepository.settle(deliveryId, {
        status: "SUCCEEDED",
        responseCode,
        nextAttemptAt: null,
      });
      await WebhookRepository.recordWebhookOutcome(webhook.id, true);
      return "delivered";
    }

    // A 4xx that is not 408/429 will never work — retrying it for two hours
    // just fills their logs and ours.
    const retryable = responseCode === null || isRetryable(responseCode);
    const nextAt = retryable ? nextAttemptAfter(attemptNumber, new Date()) : null;

    await WebhookRepository.settle(deliveryId, {
      status: nextAt ? "PENDING" : "FAILED",
      responseCode,
      error,
      nextAttemptAt: nextAt,
    });

    // Only a final failure counts against the webhook. Counting every attempt
    // would disable an endpoint after two flaky events rather than ten dead ones.
    if (!nextAt) {
      const current = await WebhookRepository.currentFailures(webhook.id);
      const willBe = (current?.consecutiveFailures ?? 0) + 1;
      await WebhookRepository.recordWebhookOutcome(
        webhook.id,
        false,
        willBe >= MAX_CONSECUTIVE_FAILURES
          ? `Disabled automatically after ${MAX_CONSECUTIVE_FAILURES} failed deliveries in a row. Last error: ${error}`
          : undefined,
      );
      return "failed";
    }
    return "retrying";
  },
};
