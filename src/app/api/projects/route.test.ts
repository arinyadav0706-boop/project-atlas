import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/authentication/services/actor.service", () => ({
  getActor: vi.fn(),
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { list: vi.fn(), create: vi.fn() },
}));

import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { GET, POST } from "./route";
import { ConflictError } from "@/shared/lib/errors";

const actorMock = vi.mocked(getActor);
const svc = vi.mocked(ProjectService);
const actor = { userId: "u1", orgRole: "MEMBER" as const, organizationId: "org-1" };
const URL_BASE = "http://localhost/api/projects";

function jsonReq(body: unknown) {
  return new NextRequest(URL_BASE, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("GET /projects", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("200 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.list.mockResolvedValue([] as never);
    expect((await GET()).status).toBe(200);
  });
});

describe("POST /projects", () => {
  it("401 when unauthenticated", async () => {
    actorMock.mockResolvedValue(null);
    expect((await POST(jsonReq({ key: "ENG", name: "Engineering" }))).status).toBe(401);
  });
  it("422 on invalid body (missing name)", async () => {
    actorMock.mockResolvedValue(actor);
    const res = await POST(jsonReq({ key: "ENG" }));
    expect(res.status).toBe(422);
    expect(svc.create).not.toHaveBeenCalled();
  });
  it("201 on success", async () => {
    actorMock.mockResolvedValue(actor);
    svc.create.mockResolvedValue({ id: "p1", key: "ENG" } as never);
    expect((await POST(jsonReq({ key: "ENG", name: "Engineering" }))).status).toBe(201);
  });
  it("maps ConflictError (duplicate key) → 409", async () => {
    actorMock.mockResolvedValue(actor);
    svc.create.mockRejectedValue(new ConflictError("A project with key ENG already exists."));
    expect((await POST(jsonReq({ key: "ENG", name: "Engineering" }))).status).toBe(409);
  });
});
