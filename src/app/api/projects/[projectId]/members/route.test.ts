import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/authentication/services/actor.service", () => ({
  getActor: vi.fn(),
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { listMembers: vi.fn(), addMember: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { GET, POST } from "./route";
import { ForbiddenError, ValidationError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(ProjectService);
const params = { params: { projectId: "proj-1" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const };
const URL_BASE = "http://localhost/api/projects/proj-1/members";

function jsonReq(body: unknown) {
  return new NextRequest(URL_BASE, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("GET /projects/:id/members", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(401);
  });
  it("200 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.listMembers.mockResolvedValue([] as never);
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(200);
  });
});

describe("POST /projects/:id/members", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await POST(jsonReq({ email: "a@b.com", role: "MEMBER" }), params)).status).toBe(401);
  });
  it("422 on invalid email", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await POST(jsonReq({ email: "not-an-email", role: "MEMBER" }), params);
    expect(res.status).toBe(422);
    expect(svc.addMember).not.toHaveBeenCalled();
  });
  it("201 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.addMember.mockResolvedValue({ id: "m1" } as never);
    expect((await POST(jsonReq({ email: "a@b.com", role: "MEMBER" }), params)).status).toBe(201);
  });
  it("maps ForbiddenError (non-LEAD) → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.addMember.mockRejectedValue(new ForbiddenError("Only a project LEAD can perform this action."));
    expect((await POST(jsonReq({ email: "a@b.com", role: "MEMBER" }), params)).status).toBe(403);
  });
  it("maps ValidationError (no such user) → 422", async () => {
    actorMock.mockResolvedValue(actor);
    svc.addMember.mockRejectedValue(new ValidationError("No active user exists with that email."));
    expect((await POST(jsonReq({ email: "a@b.com", role: "MEMBER" }), params)).status).toBe(422);
  });
});
