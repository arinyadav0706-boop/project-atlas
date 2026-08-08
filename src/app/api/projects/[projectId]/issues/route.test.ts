import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// API contract tests for the issues collection route: auth guard, Zod
// validation, success codes, and domain-error → HTTP mapping via handleRoute.
vi.mock("@/features/authentication/services/actor.service", async () => {
  const { UnauthorizedError } = await import("@/shared/lib/errors");
  const getActor = vi.fn();
  const requireActor = async () => {
    const a = await getActor();
    if (!a) throw new UnauthorizedError();
    return a;
  };
  return { getActor, requireActor, requireMutationActor: requireActor };
});
vi.mock("@/features/issues/services/issue.service", () => ({
  IssueService: { list: vi.fn(), create: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { GET, POST } from "./route";
import { ConflictError, ForbiddenError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(IssueService);
const params = { params: Promise.resolve({ projectId: "proj-1" }) };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/projects/proj-1/issues";
const emptyPage = {
  items: [],
  nextCursor: null,
  counts: { ALL: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 },
};

function jsonReq(body: unknown, method = "POST") {
  return new NextRequest(URL_BASE, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("GET /projects/:id/issues", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    const res = await GET(new NextRequest(URL_BASE), params);
    expect(res.status).toBe(401);
    expect(svc.list).not.toHaveBeenCalled();
  });

  it("200 and passes cursor/take/status through to the service", async () => {
    actorMock.mockResolvedValue(actor);
    svc.list.mockResolvedValue(emptyPage as never);
    const res = await GET(
      new NextRequest(`${URL_BASE}?status=TODO&take=10&cursor=abc`),
      params,
    );
    expect(res.status).toBe(200);
    expect(svc.list).toHaveBeenCalledWith(
      actor,
      "proj-1",
      expect.objectContaining({ status: "TODO", take: 10, cursor: "abc" }),
    );
  });
});

describe("POST /projects/:id/issues", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    const res = await POST(
      jsonReq({ type: "TASK", title: "x", priority: "MEDIUM" }),
      params,
    );
    expect(res.status).toBe(401);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it("422 on invalid body (missing title)", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await POST(jsonReq({ type: "TASK", priority: "MEDIUM" }), params);
    expect(res.status).toBe(422);
    expect(svc.create).not.toHaveBeenCalled();
  });

  it("422 on invalid enum (bad type)", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await POST(
      jsonReq({ type: "BANANA", title: "x", priority: "MEDIUM" }),
      params,
    );
    expect(res.status).toBe(422);
  });

  it("201 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.create.mockResolvedValue({ id: "i1", key: "ENG-1" } as never);
    const res = await POST(
      jsonReq({ type: "TASK", title: "x", priority: "MEDIUM" }),
      params,
    );
    expect(res.status).toBe(201);
  });

  it("maps ForbiddenError → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.create.mockRejectedValue(new ForbiddenError());
    const res = await POST(
      jsonReq({ type: "TASK", title: "x", priority: "MEDIUM" }),
      params,
    );
    expect(res.status).toBe(403);
  });

  it("maps ConflictError (archived project) → 409", async () => {
    actorMock.mockResolvedValue(actor);
    svc.create.mockRejectedValue(new ConflictError("Archived projects are read-only."));
    const res = await POST(
      jsonReq({ type: "TASK", title: "x", priority: "MEDIUM" }),
      params,
    );
    expect(res.status).toBe(409);
  });
});
