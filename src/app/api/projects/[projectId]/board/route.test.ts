import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/authentication/services/actor.service", () => ({
  getActor: vi.fn(),
}));
vi.mock("@/features/board/services/board.service", () => ({
  BoardService: { getBoard: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { BoardService } from "@/features/board/services/board.service";
import { GET } from "./route";
import { NotFoundError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(BoardService);
const params = { params: { projectId: "proj-1" } };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };

function req(query = "") {
  return new NextRequest(`http://localhost/api/projects/proj-1/board${query}`);
}

beforeEach(() => vi.resetAllMocks());

it("401 when unauthenticated", async () => {
  actorMock.mockResolvedValue(null);
  expect((await GET(req(), params)).status).toBe(401);
});

it("200 with an empty filter when no query params are given", async () => {
  actorMock.mockResolvedValue(actor);
  svc.getBoard.mockResolvedValue({ columns: [], counts: {}, appliedFilter: {}, canWrite: true } as never);
  const res = await GET(req(), params);
  expect(res.status).toBe(200);
  expect(svc.getBoard).toHaveBeenCalledWith(actor, "proj-1", {});
});

it("parses BoardFilter fields from the query string (assignee/type + repeated labelIds)", async () => {
  actorMock.mockResolvedValue(actor);
  svc.getBoard.mockResolvedValue({} as never);
  await GET(req("?assigneeId=u-9&type=BUG&labelIds=l1&labelIds=l2"), params);
  expect(svc.getBoard).toHaveBeenCalledWith(actor, "proj-1", {
    assigneeId: "u-9",
    type: "BUG",
    labelIds: ["l1", "l2"],
  });
});

it("422 on an invalid filter enum value", async () => {
  actorMock.mockResolvedValue(actor);
  const res = await GET(req("?type=EPICFAIL"), params);
  expect(res.status).toBe(422);
  expect(svc.getBoard).not.toHaveBeenCalled();
});

it("maps NotFound (cross-org / missing project) → 404", async () => {
  actorMock.mockResolvedValue(actor);
  svc.getBoard.mockRejectedValue(new NotFoundError("Project not found."));
  expect((await GET(req(), params)).status).toBe(404);
});
