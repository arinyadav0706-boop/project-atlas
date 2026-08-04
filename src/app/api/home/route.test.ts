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
vi.mock("@/features/home/services/home.service", () => ({
  HomeService: { getHome: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { HomeService } from "@/features/home/services/home.service";
import { GET } from "./route";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(HomeService);
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };

beforeEach(() => vi.resetAllMocks());

it("401 when unauthenticated", async () => {
  actorMock.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(svc.getHome).not.toHaveBeenCalled();
});

it("200 with the composed home payload", async () => {
  actorMock.mockResolvedValue(actor);
  svc.getHome.mockResolvedValue({
    myWork: [],
    attention: [],
    continueWorking: [],
    dueSoon: [],
    starredProjects: [],
    recentProjects: [],
  });
  const res = await GET();
  expect(res.status).toBe(200);
  expect(svc.getHome).toHaveBeenCalledWith(actor);
});
