import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/authentication/services/actor.service", () => ({
  getActor: vi.fn(),
}));
vi.mock("@/features/issues/services/issue.service", () => ({
  IssueService: { transition: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { POST } from "./route";
import { ValidationError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(IssueService);
const params = { params: { issueId: "issue-1" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const };
const URL_BASE = "http://localhost/api/issues/issue-1/transition";

function jsonReq(body: unknown) {
  return new NextRequest(URL_BASE, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

it("401 when unauthenticated", async () => {
  actorMock.mockResolvedValue(null);
  expect((await POST(jsonReq({ status: "IN_PROGRESS" }), params)).status).toBe(401);
});

it("422 on invalid status enum", async () => {
  actorMock.mockResolvedValue(actor);
  const res = await POST(jsonReq({ status: "SHIPPED" }), params);
  expect(res.status).toBe(422);
  expect(svc.transition).not.toHaveBeenCalled();
});

it("200 on a legal transition", async () => {
  actorMock.mockResolvedValue(actor);
  svc.transition.mockResolvedValue({ id: "issue-1", status: "IN_PROGRESS" } as never);
  expect((await POST(jsonReq({ status: "IN_PROGRESS" }), params)).status).toBe(200);
});

it("maps an illegal transition (ValidationError) → 422", async () => {
  actorMock.mockResolvedValue(actor);
  svc.transition.mockRejectedValue(new ValidationError("Cannot move from TODO to DONE"));
  expect((await POST(jsonReq({ status: "DONE" }), params)).status).toBe(422);
});
