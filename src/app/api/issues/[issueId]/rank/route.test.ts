import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/authentication/services/actor.service", () => ({
  getActor: vi.fn(),
}));
vi.mock("@/features/issues/services/issue.service", () => ({
  IssueService: { reorder: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { PATCH } from "./route";
import { ConflictError, ForbiddenError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(IssueService);
const params = { params: { issueId: "issue-1" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/issues/issue-1/rank";

function jsonReq(body: unknown) {
  return new NextRequest(URL_BASE, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

it("401 when unauthenticated", async () => {
  actorMock.mockResolvedValue(null);
  expect(
    (await PATCH(jsonReq({ beforeId: null, afterId: null, expectedVersion: 0 }), params))
      .status,
  ).toBe(401);
});

it("422 on an invalid status enum in the body", async () => {
  actorMock.mockResolvedValue(actor);
  const res = await PATCH(jsonReq({ status: "SHIPPED", expectedVersion: 0 }), params);
  expect(res.status).toBe(422);
  expect(svc.reorder).not.toHaveBeenCalled();
});

it("422 when expectedVersion is missing (OCC token required, ADR-0011)", async () => {
  actorMock.mockResolvedValue(actor);
  const res = await PATCH(jsonReq({ beforeId: "b", afterId: "c" }), params);
  expect(res.status).toBe(422);
  expect(svc.reorder).not.toHaveBeenCalled();
});

it("200 on a valid reorder", async () => {
  actorMock.mockResolvedValue(actor);
  svc.reorder.mockResolvedValue({ id: "issue-1", status: "TODO", version: 1 } as never);
  const res = await PATCH(jsonReq({ beforeId: "b", afterId: "c", expectedVersion: 0 }), params);
  expect(res.status).toBe(200);
  expect(svc.reorder).toHaveBeenCalledWith(actor, "issue-1", {
    beforeId: "b",
    afterId: "c",
    expectedVersion: 0,
  });
});

it("maps a VIEWER reorder (ForbiddenError) → 403", async () => {
  actorMock.mockResolvedValue(actor);
  svc.reorder.mockRejectedValue(new ForbiddenError("nope"));
  expect(
    (await PATCH(jsonReq({ afterId: "c", expectedVersion: 0 }), params)).status,
  ).toBe(403);
});

it("maps a stale-neighbour reorder (ConflictError) → 409", async () => {
  actorMock.mockResolvedValue(actor);
  svc.reorder.mockRejectedValue(new ConflictError("board changed"));
  expect(
    (await PATCH(jsonReq({ beforeId: "ghost", expectedVersion: 0 }), params)).status,
  ).toBe(409);
});
