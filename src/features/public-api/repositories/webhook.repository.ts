import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";

// Webhooks and their deliveries (ADR-0052 §7-§9). Prisma lives only in
// `*.repository.ts` (Feature Architecture §4).

const webhookSelect = {
  id: true,
  organizationId: true,
  url: true,
  events: true,
  active: true,
  consecutiveFailures: true,
  disabledReason: true,
  createdAt: true,
} as const;

export const WebhookRepository = {
  list(organizationId: string) {
    return prisma.webhook.findMany({
      where: { organizationId, deletedAt: null },
      select: webhookSelect,
      orderBy: [{ createdAt: "desc" }],
    });
  },

  findById(id: string) {
    return prisma.webhook.findFirst({
      where: { id, deletedAt: null },
      select: webhookSelect,
    });
  },

  countForOrg(organizationId: string) {
    return prisma.webhook.count({ where: { organizationId, deletedAt: null } });
  },

  create(data: {
    organizationId: string;
    url: string;
    secret: string;
    events: string[];
    actorId: string;
  }) {
    const { actorId, ...fields } = data;
    return prisma.webhook.create({
      data: { ...fields, createdBy: actorId, updatedBy: actorId },
      select: webhookSelect,
    });
  },

  update(
    id: string,
    data: { url?: string; events?: string[]; active?: boolean; disabledReason?: string | null },
    actorId: string,
  ) {
    return prisma.webhook.update({
      where: { id },
      // Re-enabling clears the failure count as well as the reason: a webhook
      // switched back on with nine failures already banked would disable again
      // on the first hiccup, which reads as the fix not having worked.
      data: {
        ...data,
        ...(data.active === true ? { consecutiveFailures: 0, disabledReason: null } : {}),
        updatedBy: actorId,
      },
      select: webhookSelect,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.webhook.update({
      where: { id },
      data: { deletedAt: new Date(), active: false, updatedBy: actorId },
      select: { id: true },
    });
  },

  /** Every live subscriber to one event in one organization. */
  subscribers(organizationId: string, event: string) {
    return prisma.webhook.findMany({
      where: { organizationId, deletedAt: null, active: true, events: { has: event } },
      select: { id: true, url: true, secret: true },
    });
  },

  // ── Deliveries ────────────────────────────────────────────────────────────

  queue(rows: { webhookId: string; event: string; payload: Prisma.InputJsonValue }[]) {
    return prisma.webhookDelivery.createMany({
      data: rows.map((row) => ({ ...row, status: "PENDING" as const, nextAttemptAt: new Date() })),
    });
  },

  createOne(data: { webhookId: string; event: string; payload: Prisma.InputJsonValue }) {
    return prisma.webhookDelivery.create({
      data: { ...data, status: "PENDING", nextAttemptAt: new Date() },
      select: { id: true, event: true, payload: true, attempts: true, webhookId: true },
    });
  },

  /**
   * Pending deliveries that are due.
   *
   * The scheduler tick's read (ADR-0051 §5 reused). Served entirely by the
   * `(status, nextAttemptAt)` index and cheap when nothing is due.
   */
  listDue(now: Date, limit: number) {
    return prisma.webhookDelivery.findMany({
      where: { status: "PENDING", nextAttemptAt: { not: null, lte: now } },
      select: {
        id: true,
        webhookId: true,
        event: true,
        payload: true,
        attempts: true,
        // Needed as the claim's expected value — the conditional update below
        // only wins if nothing else has moved it since this read.
        nextAttemptAt: true,
        webhook: { select: { id: true, url: true, secret: true, active: true, deletedAt: true } },
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
    });
  },

  /**
   * Take ownership of one due delivery.
   *
   * The same conditional-update claim as recurrences (ADR-0011's trick):
   * pushing `nextAttemptAt` out before the HTTP call means a second tick that
   * overlaps this one will not also POST it. Without it, a slow customer
   * endpoint plus an hourly tick is a duplicate-delivery generator.
   */
  async claim(id: string, expected: Date, holdUntil: Date): Promise<boolean> {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id, status: "PENDING", nextAttemptAt: expected },
      data: { nextAttemptAt: holdUntil, attempts: { increment: 1 } },
    });
    return claimed.count === 1;
  },

  /** Count an attempt that needed no claim (the inline first try). */
  countAttempt(id: string) {
    return prisma.webhookDelivery.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { id: true },
    });
  },

  settle(
    id: string,
    outcome: {
      status: "SUCCEEDED" | "FAILED" | "PENDING";
      responseCode?: number | null;
      error?: string | null;
      nextAttemptAt: Date | null;
    },
  ) {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: outcome.status,
        responseCode: outcome.responseCode ?? null,
        error: outcome.error ?? null,
        nextAttemptAt: outcome.nextAttemptAt,
      },
      select: { id: true },
    });
  },

  listDeliveries(webhookId: string, take: number) {
    return prisma.webhookDelivery.findMany({
      where: { webhookId },
      select: {
        id: true,
        event: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        responseCode: true,
        error: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take,
    });
  },

  /** Any success resets the run; ten in a row switches the webhook off (BR-10). */
  recordWebhookOutcome(id: string, succeeded: boolean, disable?: string) {
    return prisma.webhook.update({
      where: { id },
      data: succeeded
        ? { consecutiveFailures: 0 }
        : {
            consecutiveFailures: { increment: 1 },
            ...(disable ? { active: false, disabledReason: disable } : {}),
          },
      select: { id: true, consecutiveFailures: true, active: true },
    });
  },

  currentFailures(id: string) {
    return prisma.webhook.findFirst({
      where: { id },
      select: { consecutiveFailures: true },
    });
  },
};
