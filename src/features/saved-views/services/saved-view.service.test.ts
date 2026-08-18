import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { SavedViewRepository } from "@/features/saved-views/repositories/saved-view.repository";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/saved-views/repositories/saved-view.repository", async (orig) => {
  const actual = await orig<typeof import("@/features/saved-views/repositories/saved-view.repository")>();
  return {
    ...actual,
    SavedViewRepository: {
      memberProjectIds: vi.fn(),
      allProjectIds: vi.fn(),
      listIssues: vi.fn(),
      listViews: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    },
  };
});

const repo = vi.mocked(SavedViewRepository);

const member: Actor = {
  userId: "u-member",
  organizationId: "org-1",
  orgRole: "MEMBER",
} as Actor;

const admin: Actor = {
  userId: "u-admin",
  organizationId: "org-1",
  orgRole: "ADMIN",
} as Actor;

beforeEach(() => {
  vi.clearAllMocks();
  repo.memberProjectIds.mockResolvedValue([
    { projectId: "p1" },
    { projectId: "p2" },
  ] as never);
  repo.allProjectIds.mockResolvedValue([
    { id: "p1" },
    { id: "p2" },
    { id: "p3" },
  ] as never);
  repo.listIssues.mockResolvedValue([] as never);
});

// ADR-0040 §1 — the one rule that makes a shared view safe.
describe("project scope", () => {
  it("queries only the projects the member belongs to", async () => {
    await SavedViewService.queryIssues(member, {});
    expect(repo.listIssues).toHaveBeenCalledWith(
      ["p1", "p2"],
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("gives an org admin every project in their org", async () => {
    await SavedViewService.queryIssues(admin, {});
    expect(repo.listIssues.mock.calls[0]![0]).toEqual(["p1", "p2", "p3"]);
  });

  it("treats the filter's projectIds as a narrowing, never a widening", async () => {
    // p3 exists, but this member is not in it. Asking for it must not grant it.
    await SavedViewService.queryIssues(member, { projectIds: ["p2", "p3"] });
    expect(repo.listIssues.mock.calls[0]![0]).toEqual(["p2"]);
  });

  it("returns an empty result, and runs no query, when nothing is visible", async () => {
    repo.memberProjectIds.mockResolvedValue([] as never);
    const result = await SavedViewService.queryIssues(member, {});
    expect(result).toEqual({ items: [], nextCursor: null, projectsInScope: 0 });
    expect(repo.listIssues).not.toHaveBeenCalled();
  });

  it("returns empty when a view names only projects the viewer cannot see (BR-3)", async () => {
    const result = await SavedViewService.queryIssues(member, { projectIds: ["p3"] });
    expect(result.projectsInScope).toBe(0);
    expect(repo.listIssues).not.toHaveBeenCalled();
  });
});

describe("pagination", () => {
  const row = (id: string) => ({
    id,
    key: `K-${id}`,
    title: id,
    type: "TASK",
    status: "TODO",
    priority: "MEDIUM",
    storyPoints: null,
    dueDate: null,
    updatedAt: new Date("2026-01-01"),
    version: 0,
    projectId: "p1",
    project: { key: "P1", name: "One" },
    assignee: null,
  });

  it("caps the page and reports the next cursor from the last kept row", async () => {
    // take+1 rows come back; the extra one only signals "there is more".
    repo.listIssues.mockResolvedValue([row("a"), row("b"), row("c")] as never);
    const result = await SavedViewService.queryIssues(member, {}, "UPDATED_DESC", { take: 2 });
    expect(result.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.nextCursor).toBe("b");
  });

  it("reports no next cursor on the last page", async () => {
    repo.listIssues.mockResolvedValue([row("a")] as never);
    const result = await SavedViewService.queryIssues(member, {}, "UPDATED_DESC", { take: 2 });
    expect(result.nextCursor).toBeNull();
  });

  it("clamps take to the maximum page size (BR-9)", async () => {
    await SavedViewService.queryIssues(member, {}, "UPDATED_DESC", { take: 5000 });
    expect(repo.listIssues.mock.calls[0]![3]).toMatchObject({ take: 100 });
  });
});

describe("view access", () => {
  const view = (over: Record<string, unknown> = {}) => ({
    id: "v1",
    name: "Mine",
    filter: {},
    sort: "UPDATED_DESC",
    visibility: "PRIVATE",
    ownerId: "u-member",
    owner: { id: "u-member", name: "Member" },
    ...over,
  });

  it("hides someone else's private view as not-found, not forbidden", async () => {
    repo.findById.mockResolvedValue(view({ ownerId: "someone-else" }) as never);
    // A 403 would confirm the view exists; 404 does not.
    await expect(SavedViewService.get(member, "v1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets anyone in the org read a shared view", async () => {
    repo.findById.mockResolvedValue(
      view({ ownerId: "other", visibility: "SHARED", owner: { id: "other", name: "O" } }) as never,
    );
    const dto = await SavedViewService.get(member, "v1");
    expect(dto.canEdit).toBe(false);
  });

  it("refuses a non-owner editing a shared view (BR-5)", async () => {
    repo.findById.mockResolvedValue(
      view({ ownerId: "other", visibility: "SHARED", owner: { id: "other", name: "O" } }) as never,
    );
    await expect(
      SavedViewService.update(member, "v1", { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an org admin edit anyone's view", async () => {
    repo.findById.mockResolvedValue(
      view({ ownerId: "other", visibility: "SHARED", owner: { id: "other", name: "O" } }) as never,
    );
    repo.update.mockResolvedValue(view({ name: "Renamed" }) as never);
    await expect(SavedViewService.update(admin, "v1", { name: "Renamed" })).resolves.toBeTruthy();
  });

  it("translates the unique-name violation into a conflict (BR-10)", async () => {
    repo.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(
      SavedViewService.create(member, {
        name: "Mine",
        filter: {},
        sort: "UPDATED_DESC",
        visibility: "PRIVATE",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// BR-8: a view whose stored filter has rotted must still open, or its owner has
// no way to repair it.
describe("corrupt stored filter", () => {
  it("opens with an empty filter and a flag rather than throwing", async () => {
    repo.findById.mockResolvedValue({
      id: "v1",
      name: "Rotted",
      filter: { status: "NOT_A_STATUS", nonsense: 12 },
      sort: "UPDATED_DESC",
      visibility: "PRIVATE",
      ownerId: "u-member",
      owner: { id: "u-member", name: "Member" },
    } as never);

    const dto = await SavedViewService.get(member, "v1");
    expect(dto.filterCorrupt).toBe(true);
    expect(dto.filter).toEqual({});
  });

  it("strips unknown keys from a filter that is otherwise valid", async () => {
    repo.findById.mockResolvedValue({
      id: "v1",
      name: "Extra",
      filter: { status: "TODO", legacyField: "gone" },
      sort: "UPDATED_DESC",
      visibility: "PRIVATE",
      ownerId: "u-member",
      owner: { id: "u-member", name: "Member" },
    } as never);

    const dto = await SavedViewService.get(member, "v1");
    expect(dto.filterCorrupt).toBe(false);
    expect(dto.filter).toEqual({ status: "TODO" });
  });
});
