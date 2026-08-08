import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { get: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { GET, PATCH, DELETE } from "./route";
import { NotFoundError, ForbiddenError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(ProjectService);
const params = { params: Promise.resolve({ projectId: "proj-1" }) };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/projects/proj-1";

function jsonReq(body: unknown, method: string) {
  return new NextRequest(URL_BASE, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("GET /projects/:id", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(401);
  });
  it("maps NotFoundError → 404", async () => {
    actorMock.mockResolvedValue(actor);
    svc.get.mockRejectedValue(new NotFoundError("Project not found."));
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(404);
  });
});

describe("PATCH /projects/:id", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await PATCH(jsonReq({ name: "New" }, "PATCH"), params)).status).toBe(401);
  });
  it("422 on invalid status enum", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await PATCH(jsonReq({ status: "PAUSED" }, "PATCH"), params);
    expect(res.status).toBe(422);
  });
  it("maps ForbiddenError (non-LEAD) → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.update.mockRejectedValue(
      new ForbiddenError("Only a project LEAD can perform this action."),
    );
    expect((await PATCH(jsonReq({ name: "New" }, "PATCH"), params)).status).toBe(403);
  });
});

describe("DELETE /projects/:id", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect(
      (await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status,
    ).toBe(401);
  });
  it("204 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.delete.mockResolvedValue(undefined as never);
    expect(
      (await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status,
    ).toBe(204);
  });
  it("maps ForbiddenError (non-LEAD) → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.delete.mockRejectedValue(
      new ForbiddenError("Only a project LEAD can perform this action."),
    );
    expect(
      (await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status,
    ).toBe(403);
  });
});
