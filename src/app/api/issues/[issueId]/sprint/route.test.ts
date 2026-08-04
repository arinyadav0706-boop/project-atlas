import { beforeEach, expect, it, vi } from "vitest";
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
vi.mock("@/features/sprints/services/sprint.service", () => ({
  SprintService: { moveIssue: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { PATCH } from "./route";
import { ConflictError, ForbiddenError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(SprintService);
const params = { params: { issueId: "issue-1" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/issues/issue-1/sprint";

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
    (await PATCH(jsonReq({ sprintId: null, expectedVersion: 0 }), params)).status,
  ).toBe(401);
});

it("422 when expectedVersion is missing (OCC required)", async () => {
  actorMock.mockResolvedValue(actor);
  const res = await PATCH(jsonReq({ sprintId: "s1" }), params);
  expect(res.status).toBe(422);
  expect(svc.moveIssue).not.toHaveBeenCalled();
});

it("200 forwards a valid move (sprintId + neighbours + version)", async () => {
  actorMock.mockResolvedValue(actor);
  svc.moveIssue.mockResolvedValue({ id: "issue-1", version: 1 } as never);
  const res = await PATCH(
    jsonReq({ sprintId: "s1", beforeId: "b", afterId: "a", expectedVersion: 0 }),
    params,
  );
  expect(res.status).toBe(200);
  expect(svc.moveIssue).toHaveBeenCalledWith(actor, "issue-1", {
    sprintId: "s1",
    beforeId: "b",
    afterId: "a",
    expectedVersion: 0,
  });
});

it("maps a VIEWER move (ForbiddenError) → 403", async () => {
  actorMock.mockResolvedValue(actor);
  svc.moveIssue.mockRejectedValue(new ForbiddenError("nope"));
  expect(
    (await PATCH(jsonReq({ sprintId: "s1", expectedVersion: 0 }), params)).status,
  ).toBe(403);
});

it("maps a COMPLETED-sprint move (ConflictError) → 409", async () => {
  actorMock.mockResolvedValue(actor);
  svc.moveIssue.mockRejectedValue(new ConflictError("frozen"));
  expect(
    (await PATCH(jsonReq({ sprintId: "s1", expectedVersion: 0 }), params)).status,
  ).toBe(409);
});
