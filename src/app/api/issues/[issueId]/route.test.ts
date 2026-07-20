import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/authentication/services/actor.service", () => ({
  getActor: vi.fn(),
}));
vi.mock("@/features/issues/services/issue.service", () => ({
  IssueService: { get: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { GET, PATCH, DELETE } from "./route";
import { NotFoundError, ForbiddenError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(IssueService);
const params = { params: { issueId: "issue-1" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/issues/issue-1";

function jsonReq(body: unknown, method: string) {
  return new NextRequest(URL_BASE, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("GET /issues/:id", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(401);
  });
  it("200 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.get.mockResolvedValue({ id: "issue-1" } as never);
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(200);
  });
  it("maps NotFoundError → 404", async () => {
    actorMock.mockResolvedValue(actor);
    svc.get.mockRejectedValue(new NotFoundError("Issue not found."));
    expect((await GET(new NextRequest(URL_BASE), params)).status).toBe(404);
  });
});

describe("PATCH /issues/:id", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await PATCH(jsonReq({ title: "y", expectedVersion: 0 }, "PATCH"), params)).status).toBe(401);
  });
  it("422 on invalid body (title too long)", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await PATCH(jsonReq({ title: "x".repeat(201) }, "PATCH"), params);
    expect(res.status).toBe(422);
    expect(svc.update).not.toHaveBeenCalled();
  });
  it("200 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.update.mockResolvedValue({ id: "issue-1" } as never);
    expect((await PATCH(jsonReq({ title: "y", expectedVersion: 0 }, "PATCH"), params)).status).toBe(200);
  });
  it("maps ForbiddenError → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.update.mockRejectedValue(new ForbiddenError());
    expect((await PATCH(jsonReq({ title: "y", expectedVersion: 0 }, "PATCH"), params)).status).toBe(403);
  });
});

describe("DELETE /issues/:id", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status).toBe(401);
  });
  it("204 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.delete.mockResolvedValue(undefined as never);
    expect((await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status).toBe(204);
  });
  it("maps ForbiddenError → 403", async () => {
    actorMock.mockResolvedValue(actor);
    svc.delete.mockRejectedValue(new ForbiddenError());
    expect((await DELETE(new NextRequest(URL_BASE, { method: "DELETE" }), params)).status).toBe(403);
  });
});
