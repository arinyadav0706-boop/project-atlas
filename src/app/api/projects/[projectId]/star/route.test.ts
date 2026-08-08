import { beforeEach, expect, it, vi } from "vitest";

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
vi.mock("@/features/home/services/favorite.service", () => ({
  FavoriteService: { starProject: vi.fn(), unstarProject: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { POST, DELETE } from "./route";
import { NotFoundError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(FavoriteService);
const params = { params: Promise.resolve({ projectId: "p1" }) };
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const req = new Request("http://localhost/api/projects/p1/star");

beforeEach(() => vi.resetAllMocks());

it("401 when unauthenticated", async () => {
  actorMock.mockResolvedValue(null);
  expect((await POST(req, params)).status).toBe(401);
});

it("stars a project (200)", async () => {
  actorMock.mockResolvedValue(actor);
  svc.starProject.mockResolvedValue(undefined);
  const res = await POST(req, params);
  expect(res.status).toBe(200);
  expect(svc.starProject).toHaveBeenCalledWith(actor, "p1");
});

it("unstars a project (200)", async () => {
  actorMock.mockResolvedValue(actor);
  svc.unstarProject.mockResolvedValue(undefined);
  const res = await DELETE(req, params);
  expect(res.status).toBe(200);
  expect(svc.unstarProject).toHaveBeenCalledWith(actor, "p1");
});

it("maps NotFound (cross-org star) → 404", async () => {
  actorMock.mockResolvedValue(actor);
  svc.starProject.mockRejectedValue(new NotFoundError("Project not found."));
  expect((await POST(req, params)).status).toBe(404);
});
