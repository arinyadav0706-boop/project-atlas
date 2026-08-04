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
  ProjectService: { changeMemberRole: vi.fn(), removeMember: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { PATCH, DELETE } from "./route";
import { ConflictError, ForbiddenError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(ProjectService);
const params = { params: { projectId: "proj-1", memberId: "member-2" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/projects/proj-1/members/member-2";

function jsonReq(body: unknown) {
  return new NextRequest(URL_BASE, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("PATCH /projects/:id/members/:memberId", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await PATCH(jsonReq({ role: "LEAD" }), params)).status).toBe(401);
  });
  it("422 on invalid role enum", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await PATCH(jsonReq({ role: "SUPERUSER" }), params);
    expect(res.status).toBe(422);
    expect(svc.changeMemberRole).not.toHaveBeenCalled();
  });
  it("204 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.changeMemberRole.mockResolvedValue(undefined as never);
    expect((await PATCH(jsonReq({ role: "MEMBER" }), params)).status).toBe(204);
  });
  it("maps ForbiddenError (non-LEAD) → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.changeMemberRole.mockRejectedValue(new ForbiddenError("Only a project LEAD can perform this action."));
    expect((await PATCH(jsonReq({ role: "MEMBER" }), params)).status).toBe(403);
  });
  it("maps ConflictError (last LEAD) → 409", async () => {
    actorMock.mockResolvedValue(actor);
    svc.changeMemberRole.mockRejectedValue(new ConflictError("A project must have at least one LEAD"));
    expect((await PATCH(jsonReq({ role: "MEMBER" }), params)).status).toBe(409);
  });
});

describe("DELETE /projects/:id/members/:memberId", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status).toBe(401);
  });
  it("204 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.removeMember.mockResolvedValue(undefined as never);
    expect((await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status).toBe(204);
  });
  it("maps ConflictError (last LEAD) → 409", async () => {
    actorMock.mockResolvedValue(actor);
    svc.removeMember.mockRejectedValue(new ConflictError("A project must have at least one LEAD"));
    expect((await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status).toBe(409);
  });
});
