import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/shared/lib/db";
import { ApiTokenService } from "@/features/public-api/services/api-token.service";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { v1Route, API_RATE_RULE } from "@/features/public-api/lib/v1";
import { verifySignature } from "@/features/public-api/lib/signature";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ApiScope } from "@/features/public-api/types/public-api.types";

// Tier 4 — the public API against a REAL Postgres (ADR-0052).
//
// The token and signature libs are unit-tested directly; this file proves the
// things only a database and a real request can show: that a token resolves to
// an actor who cannot exceed their own permissions, that scopes gate, that the
// envelope and rate headers are on every response, and that a webhook delivery
// is signed, retried and eventually disabled.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE "rate_limits"');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({
      data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role },
    });

  const admin = await mk("admin", "ADMIN");
  const lead = await mk("lead");
  const member = await mk("member");

  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER" = "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });

  const leadActor = actor(lead);
  const project = await ProjectService.create(leadActor, {
    key: `P${tag}`.toUpperCase().slice(0, 8),
    name: "Project",
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: member.id, role: "MEMBER" },
  });
  const statuses = await WorkflowService.listStatuses(leadActor, project.id);

  return {
    org,
    project,
    admin,
    lead,
    member,
    statuses,
    adminActor: actor(admin, "ADMIN"),
    leadActor,
    memberActor: actor(member),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const ALL_SCOPES: ApiScope[] = [
  "projects:read",
  "issues:read",
  "issues:write",
  "comments:write",
  "webhooks:manage",
];

const mint = (actor: Actor, scopes: ALL_SCOPES_TYPE = ALL_SCOPES) =>
  ApiTokenService.create(actor, { name: "test", scopes });
type ALL_SCOPES_TYPE = ApiScope[];

/** Drive a real handler through the real seam, as a real request would. */
async function call(
  token: string | null,
  scope: ApiScope | null,
  handler: Parameters<typeof v1Route>[2] = async () => ({ ok: true }),
  url = "https://eagles.test/api/v1/thing",
) {
  const request = new NextRequest(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const response = await v1Route(request, scope, handler);
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as
      | { data?: unknown; error?: { code: string; message: string; details?: unknown } }
      | null,
    headers: response.headers,
  };
}

describe("authentication (AC-1)", () => {
  it("a valid token authenticates and the response is enveloped", async () => {
    const s = await seed("pa");
    const token = await mint(s.leadActor);

    const res = await call(token.plaintext, null, async ({ actor }) => ({
      userId: actor.userId,
    }));
    expect(res.status).toBe(200);
    // One envelope, always (BR-6).
    expect(res.body).toEqual({ data: { userId: s.lead.id } });
  });

  it.each([
    ["no header", null],
    ["gibberish", "not-a-token"],
    ["right shape, unknown id", `eag_${"a".repeat(32)}_secret`],
  ])("rejects %s with 401 unauthorized", async (_label, token) => {
    await seed(`pb${_label.length}`);
    const res = await call(token, null);
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe("unauthorized");
    // RFC 9110 — a 401 has to say how to authenticate.
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("rejects a token whose secret has been tampered with", async () => {
    const s = await seed("pc");
    const token = await mint(s.leadActor);
    const tampered = `${token.plaintext.slice(0, -1)}${token.plaintext.endsWith("A") ? "B" : "A"}`;
    expect((await call(tampered, null)).status).toBe(401);
  });

  it("rejects a revoked token", async () => {
    const s = await seed("pd");
    const token = await mint(s.leadActor);
    expect((await call(token.plaintext, null)).status).toBe(200);

    await ApiTokenService.revoke(s.leadActor, token.id);
    const res = await call(token.plaintext, null);
    expect(res.status).toBe(401);
    expect(res.body?.error?.message).toContain("revoked");
  });

  it("rejects an expired token", async () => {
    const s = await seed("pe");
    const token = await ApiTokenService.create(s.leadActor, {
      name: "short",
      scopes: ["issues:read"],
      expiresInDays: 1,
    });
    await prisma.apiToken.update({
      where: { id: token.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await call(token.plaintext, "issues:read")).body?.error?.message).toContain("expired");
  });

  it("stops working the moment its owner is deactivated", async () => {
    // Offboarding a person must not leave their scripts running.
    const s = await seed("pf");
    const token = await mint(s.memberActor);
    await prisma.user.update({ where: { id: s.member.id }, data: { isActive: false } });
    expect((await call(token.plaintext, null)).status).toBe(401);
  });

  it("records lastUsedAt (AC-10)", async () => {
    const s = await seed("pg");
    const token = await mint(s.leadActor);
    expect(token.lastUsedAt).toBeNull();

    await call(token.plaintext, null);
    // The write is fire-and-forget; give it a beat to land.
    await new Promise((r) => setTimeout(r, 150));
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
    expect(row.lastUsedAt).not.toBeNull();
  });
});

describe("scopes (AC-2, AC-3)", () => {
  it("refuses a route whose scope the token lacks, and names it", async () => {
    const s = await seed("ph");
    const token = await ApiTokenService.create(s.leadActor, {
      name: "read only",
      scopes: ["issues:read"],
    });
    const res = await call(token.plaintext, "issues:write");
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("insufficient_scope");
    expect(res.body?.error?.message).toContain("issues:write");
  });

  it("a scope cannot widen what its owner may do (BR-2, AC-3)", async () => {
    // The safety property. The token has every scope; the person is a MEMBER,
    // and deleting someone else's issue is a LEAD-or-owner action.
    const s = await seed("pi");
    const issue = await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "Lead's issue",
      priority: "MEDIUM",
    });
    const token = await mint(s.memberActor);

    const res = await call(token.plaintext, "issues:write", async ({ actor }) => {
      await IssueService.delete(actor, issue.id);
      return null;
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("forbidden");
    // …and the issue is still there.
    const still = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(still.deletedAt).toBeNull();
  });

  it("refuses to mint a token with no scopes", async () => {
    const s = await seed("pj");
    await expect(
      ApiTokenService.create(s.leadActor, { name: "x", scopes: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("tenant scope (AC-4)", () => {
  it("another organisation's project is a 404, never a 403", async () => {
    const s = await seed("pk");
    const other = await seed("pl");
    const token = await mint(other.leadActor);

    const res = await call(token.plaintext, "projects:read", async ({ actor }) =>
      ProjectService.get(actor, s.project.id),
    );
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("not_found");
  });

  it("a token cannot be revoked by someone in another organisation", async () => {
    const s = await seed("pm");
    const other = await seed("pn");
    const token = await mint(s.leadActor);
    await expect(
      ApiTokenService.revoke(other.leadActor, token.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a token is personal — a colleague cannot revoke it", async () => {
    const s = await seed("po");
    const token = await mint(s.leadActor);
    await expect(
      ApiTokenService.revoke(s.memberActor, token.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("rate limiting (AC-6)", () => {
  it("puts the headers on a SUCCESSFUL response, not only on a 429", async () => {
    // A client that can only discover the limit by exceeding it will exceed it.
    const s = await seed("pp");
    const token = await mint(s.leadActor);
    const res = await call(token.plaintext, null);

    expect(res.headers.get("X-RateLimit-Limit")).toBe(String(API_RATE_RULE.limit));
    expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBe(API_RATE_RULE.limit - 1);
    expect(Number(res.headers.get("X-RateLimit-Reset"))).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
  });

  it("429s with Retry-After once the bucket is spent", async () => {
    const s = await seed("pq");
    const token = await mint(s.leadActor);
    let last = await call(token.plaintext, null);
    for (let i = 0; i < API_RATE_RULE.limit + 1 && last.status !== 429; i++) {
      last = await call(token.plaintext, null);
    }
    expect(last.status).toBe(429);
    expect(last.body?.error?.code).toBe("rate_limited");
    expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("counts per TOKEN, so one script cannot starve another", async () => {
    const s = await seed("pr");
    const a = await mint(s.leadActor);
    const b = await mint(s.memberActor);
    for (let i = 0; i < 5; i++) await call(a.plaintext, null);

    const res = await call(b.plaintext, null);
    expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBe(API_RATE_RULE.limit - 1);
  });
});

describe("errors", () => {
  it("reports a validation failure field by field", async () => {
    const s = await seed("ps");
    const token = await mint(s.leadActor);
    const { z } = await import("zod");
    const res = await call(token.plaintext, null, async () => {
      z.object({ title: z.string().min(1) }).parse({ title: "" });
      return null;
    });
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe("validation_failed");
    // An integrator debugging from a curl response needs to know WHICH field,
    // and cannot open our source to find out.
    expect(res.body?.error?.details).toEqual([
      expect.objectContaining({ field: "title" }),
    ]);
  });

  it("never leaks an internal error's message", async () => {
    const s = await seed("pt");
    const token = await mint(s.leadActor);
    const res = await call(token.plaintext, null, async () => {
      throw new Error("connection string postgres://user:hunter2@db");
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(res.body?.error?.code).toBe("internal_error");
  });
});

describe("webhooks", () => {
  const sub = (s: Seeded, url = "https://example.test/hook") =>
    WebhookService.create(s.adminActor, {
      url,
      events: ["issue.created", "issue.updated"],
    });

  it("is admin-only, and the secret is returned exactly once", async () => {
    const s = await seed("pu");
    await expect(
      WebhookService.create(s.leadActor, { url: "https://x.test/h", events: ["issue.created"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const created = await sub(s);
    expect(created.secret).toMatch(/^whsec_/);
    // Every later read omits it — there is no endpoint that can read it back.
    const listed = await WebhookService.list(s.adminActor);
    expect(listed[0]!.secret).toBeUndefined();
  });

  it("refuses a private or local URL — this is an SSRF boundary", async () => {
    const s = await seed("pv");
    for (const url of [
      "http://localhost:3000/hook",
      "http://127.0.0.1/hook",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/hook",
      "http://192.168.1.1/hook",
      "http://172.16.0.1/hook",
      "file:///etc/passwd",
    ]) {
      await expect(
        WebhookService.create(s.adminActor, { url, events: ["issue.created"] }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("queues a delivery when a subscribed event happens (AC-7)", async () => {
    const s = await seed("pw");
    const hook = await sub(s);
    await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "Fires a webhook",
      priority: "MEDIUM",
    });

    const deliveries = await prisma.webhookDelivery.findMany({ where: { webhookId: hook.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.event).toBe("issue.created");
    const payload = deliveries[0]!.payload as { event: string; data: { title: string } };
    // A full snapshot, not a bare id (BR-11).
    expect(payload.data.title).toBe("Fires a webhook");
  });

  it("does not queue for an event nobody subscribed to", async () => {
    const s = await seed("px");
    const hook = await WebhookService.create(s.adminActor, {
      url: "https://example.test/hook",
      events: ["comment.created"],
    });
    await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    expect(await prisma.webhookDelivery.count({ where: { webhookId: hook.id } })).toBe(0);
  });

  it("an unreachable endpoint is retried, not dropped", async () => {
    const s = await seed("py");
    // A domain that cannot resolve — the inline attempt fails, and the row must
    // survive as PENDING with a future attempt scheduled.
    const hook = await sub(s, "https://webhook-target.invalid/hook");
    await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });

    const row = await prisma.webhookDelivery.findFirstOrThrow({
      where: { webhookId: hook.id },
    });
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBeGreaterThanOrEqual(0);
    expect(row.error).toBeTruthy();
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("a webhook failing repeatedly is disabled with a reason (AC-8)", async () => {
    const s = await seed("pz");
    const hook = await sub(s, "https://webhook-target.invalid/hook");
    // Bank nine failures, then let a tenth land.
    await prisma.webhook.update({
      where: { id: hook.id },
      data: { consecutiveFailures: 9 },
    });
    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event: "issue.created",
        payload: { event: "issue.created", data: {} },
        status: "PENDING",
        // Already at the attempt ceiling, so this attempt is final.
        attempts: 6,
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    await WebhookService.runDue(new Date());

    const after = await prisma.webhook.findUniqueOrThrow({ where: { id: hook.id } });
    expect(after.active).toBe(false);
    expect(after.disabledReason).toContain("10 failed deliveries");
  });

  it("re-enabling clears the failure count, so it does not disable again at once", async () => {
    const s = await seed("qa");
    const hook = await sub(s);
    await prisma.webhook.update({
      where: { id: hook.id },
      data: { active: false, consecutiveFailures: 10, disabledReason: "gone" },
    });

    const back = await WebhookService.update(s.adminActor, hook.id, { active: true });
    expect(back.active).toBe(true);
    expect(back.consecutiveFailures).toBe(0);
    expect(back.disabledReason).toBeNull();
  });

  it("a delivery for a disabled webhook is settled, not left pending forever", async () => {
    const s = await seed("qb");
    const hook = await sub(s);
    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event: "issue.created",
        payload: { event: "issue.created", data: {} },
        status: "PENDING",
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });
    await WebhookService.update(s.adminActor, hook.id, { active: false });

    await WebhookService.runDue(new Date());
    const row = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: hook.id } });
    expect(row.status).toBe("FAILED");
    expect(row.error).toContain("disabled");
  });

  it("signs a payload the documented recipe verifies (AC-9)", async () => {
    // The recipe in the docs is the code below; if they diverge, this fails.
    const secret = "whsec_example";
    const body = JSON.stringify({ event: "issue.created", data: { key: "VWP-1" } });
    const timestamp = Math.floor(Date.now() / 1000);
    const { signatureHeader } = await import("@/features/public-api/lib/signature");

    expect(
      verifySignature({ secret, header: signatureHeader(secret, timestamp, body), timestamp, rawBody: body }),
    ).toBe(true);
    expect(
      verifySignature({
        secret,
        header: signatureHeader(secret, timestamp, body),
        timestamp,
        rawBody: `${body} `,
      }),
    ).toBe(false);
  });

  it("another organisation's webhook is a 404", async () => {
    const s = await seed("qc");
    const other = await seed("qd");
    const hook = await sub(s);
    await expect(
      WebhookService.deliveries(other.adminActor, hook.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
