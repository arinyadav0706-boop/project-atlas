import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import { DashboardService } from "@/features/dashboards/services/dashboard.service";
import { DashboardRepository } from "@/features/dashboards/repositories/dashboard.repository";
import { SavedViewRepository } from "@/features/saved-views/repositories/saved-view.repository";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/dashboards/repositories/dashboard.repository", () => ({
  DashboardRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    setWidgets: vi.fn(),
    countIssues: vi.fn(),
    groupIssues: vi.fn(),
    listIssues: vi.fn(),
    usersByIds: vi.fn(),
  },
}));
vi.mock("@/features/saved-views/repositories/saved-view.repository", () => ({
  SavedViewRepository: {
    listViews: vi.fn(),
    memberProjectIds: vi.fn(),
    allProjectIds: vi.fn(),
  },
}));
vi.mock("@/features/custom-fields/services/custom-field.service", () => ({
  CustomFieldService: { resolvePredicates: async () => [] },
}));

const repo = vi.mocked(DashboardRepository);
const views = vi.mocked(SavedViewRepository);

const member = { userId: "u1", organizationId: "org-1", orgRole: "MEMBER" } as Actor;
const admin = { userId: "u-admin", organizationId: "org-1", orgRole: "ADMIN" } as Actor;

function widget(over: Record<string, unknown> = {}) {
  return {
    id: "w1",
    title: "Open",
    type: "STAT",
    width: "SMALL",
    position: 0,
    filter: {},
    savedViewId: null,
    savedView: null,
    breakdownBy: null,
    ...over,
  };
}

function dashboard(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    name: "Mine",
    visibility: "PRIVATE",
    ownerId: "u1",
    owner: { id: "u1", name: "Me" },
    widgets: [widget()],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(dashboard() as never);
  repo.countIssues.mockResolvedValue(7 as never);
  repo.groupIssues.mockResolvedValue([] as never);
  repo.listIssues.mockResolvedValue([] as never);
  repo.usersByIds.mockResolvedValue([] as never);
  views.listViews.mockResolvedValue([] as never);
  views.memberProjectIds.mockResolvedValue([
    { projectId: "p1" },
    { projectId: "p2" },
  ] as never);
  views.allProjectIds.mockResolvedValue([
    { id: "p1" },
    { id: "p2" },
    { id: "p3" },
  ] as never);
});

// ADR-0044 §2 / BR-3 — the same rule as saved views, carried over unchanged.
describe("results are scoped to the viewer", () => {
  it("counts only within the member's projects", async () => {
    await DashboardService.data(member, "d1");
    expect(repo.countIssues.mock.calls[0]![0]).toEqual(["p1", "p2"]);
  });

  it("gives an org admin their whole org", async () => {
    repo.findById.mockResolvedValue(dashboard({ ownerId: "u-admin" }) as never);
    await DashboardService.data(admin, "d1");
    expect(repo.countIssues.mock.calls[0]![0]).toEqual(["p1", "p2", "p3"]);
  });

  it("treats a widget's projectIds as a narrowing, never a widening", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ widgets: [widget({ filter: { projectIds: ["p2", "p3"] } })] }) as never,
    );
    // p3 exists but this member is not in it.
    await DashboardService.data(member, "d1");
    expect(repo.countIssues.mock.calls[0]![0]).toEqual(["p2"]);
  });

  it("returns an empty widget, and runs no query, when nothing is visible", async () => {
    views.memberProjectIds.mockResolvedValue([] as never);
    const [data] = await DashboardService.data(member, "d1");
    expect(data).toMatchObject({ kind: "stat", count: 0, projectsInScope: 0 });
    expect(repo.countIssues).not.toHaveBeenCalled();
  });

  it("resolves the project scope ONCE for the whole dashboard", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ widgets: [widget({ id: "a" }), widget({ id: "b" }), widget({ id: "c" })] }) as never,
    );
    await DashboardService.data(member, "d1");
    expect(views.memberProjectIds).toHaveBeenCalledTimes(1);
    expect(repo.countIssues).toHaveBeenCalledTimes(3);
  });
});

// BR-5 — the failure mode that matters: unfiltered is a WIDER set than intended.
describe("a widget pointing at a saved view", () => {
  it("reads the view's filter live", async () => {
    repo.findById.mockResolvedValue(
      dashboard({
        widgets: [widget({ savedViewId: "v1", savedView: { id: "v1", name: "Bugs" } })],
      }) as never,
    );
    views.listViews.mockResolvedValue([
      { id: "v1", name: "Bugs", filter: { type: "BUG" }, visibility: "SHARED", ownerId: "other", owner: { id: "other", name: "O" }, sort: "UPDATED_DESC" },
    ] as never);

    await DashboardService.data(member, "d1");
    expect(repo.countIssues.mock.calls[0]![1]).toEqual({ type: "BUG" });
  });

  it("renders unavailable — not unfiltered — when the view is not visible", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ widgets: [widget({ savedViewId: "gone" })] }) as never,
    );
    views.listViews.mockResolvedValue([] as never);

    const [data] = await DashboardService.data(member, "d1");
    expect(data).toMatchObject({ kind: "unavailable" });
    // The important half: it must NOT have run an unfiltered count.
    expect(repo.countIssues).not.toHaveBeenCalled();
  });
});

// BR-10 — a 200-person org must not render 200 bars.
describe("breakdown slices", () => {
  const groups = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ status: `S${i}`, _count: { _all: n - i } }));

  beforeEach(() => {
    repo.findById.mockResolvedValue(
      dashboard({ widgets: [widget({ type: "BREAKDOWN", breakdownBy: "STATUS" })] }) as never,
    );
  });

  it("labels known enum values for humans", async () => {
    repo.groupIssues.mockResolvedValue([
      { status: "IN_PROGRESS", _count: { _all: 3 } },
      { status: "TODO", _count: { _all: 5 } },
    ] as never);
    const [data] = await DashboardService.data(member, "d1");
    expect(data).toMatchObject({
      kind: "breakdown",
      slices: [
        { label: "To Do", count: 5 },
        { label: "In Progress", count: 3 },
      ],
      total: 8,
    });
  });

  it("caps at 12 and collapses the rest into Other, keeping the total honest", async () => {
    repo.groupIssues.mockResolvedValue(groups(20) as never);
    const [data] = await DashboardService.data(member, "d1");
    const breakdown = data as { slices: { label: string; count: number }[]; total: number };
    expect(breakdown.slices).toHaveLength(13);
    expect(breakdown.slices.at(-1)!.label).toBe("Other (8)");
    // The visible slices must still sum to everything counted, or the chart lies.
    const summed = breakdown.slices.reduce((s, x) => s + x.count, 0);
    expect(summed).toBe(breakdown.total);
    expect(summed).toBe(groups(20).reduce((s, g) => s + g._count._all, 0));
  });

  it("names a null group rather than showing a blank slice", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ widgets: [widget({ type: "BREAKDOWN", breakdownBy: "ASSIGNEE" })] }) as never,
    );
    repo.groupIssues.mockResolvedValue([{ assigneeId: null, _count: { _all: 4 } }] as never);
    const [data] = await DashboardService.data(member, "d1");
    expect((data as { slices: { label: string }[] }).slices[0]!.label).toBe("Unassigned");
  });
});

describe("access", () => {
  it("hides someone else's private dashboard as not-found", async () => {
    repo.findById.mockResolvedValue(dashboard({ ownerId: "other" }) as never);
    await expect(DashboardService.get(member, "d1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets anyone in the org read a shared dashboard, read-only", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ ownerId: "other", visibility: "SHARED", owner: { id: "other", name: "O" } }) as never,
    );
    expect((await DashboardService.get(member, "d1")).canEdit).toBe(false);
  });

  it("refuses a non-owner editing a shared dashboard (BR-2)", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ ownerId: "other", visibility: "SHARED", owner: { id: "other", name: "O" } }) as never,
    );
    await expect(
      DashboardService.update(member, "d1", { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an org admin edit anyone's dashboard", async () => {
    repo.findById.mockResolvedValue(
      dashboard({ ownerId: "other", visibility: "SHARED", owner: { id: "other", name: "O" } }) as never,
    );
    repo.update.mockResolvedValue(dashboard({ name: "Renamed" }) as never);
    await expect(DashboardService.update(admin, "d1", { name: "Renamed" })).resolves.toBeTruthy();
  });
});

// BR-4 — a widget carries one source, not both.
describe("saving widgets", () => {
  it("drops the inline filter when the widget points at a view", async () => {
    repo.setWidgets.mockResolvedValue([] as never);
    await DashboardService.setWidgets(member, "d1", {
      widgets: [
        {
          title: "Bugs",
          type: "STAT",
          width: "SMALL",
          filter: { type: "BUG" },
          savedViewId: "v1",
        },
      ],
    });
    expect(repo.setWidgets.mock.calls[0]![1][0]).toMatchObject({
      savedViewId: "v1",
      filter: {},
    });
  });

  // Ids key the batched data response, so a reorder must not recreate rows —
  // every card would blank while it refetched.
  it("forwards an existing widget's id so a save updates it in place", async () => {
    repo.setWidgets.mockResolvedValue([] as never);
    await DashboardService.setWidgets(member, "d1", {
      widgets: [{ id: "w1", title: "Open", type: "STAT", width: "SMALL", filter: {} }],
    });
    expect(repo.setWidgets.mock.calls[0]![1][0]).toMatchObject({ id: "w1" });
  });

  it("keeps the inline filter when there is no view", async () => {
    repo.setWidgets.mockResolvedValue([] as never);
    await DashboardService.setWidgets(member, "d1", {
      widgets: [{ title: "Bugs", type: "STAT", width: "SMALL", filter: { type: "BUG" } }],
    });
    expect(repo.setWidgets.mock.calls[0]![1][0]).toMatchObject({ filter: { type: "BUG" } });
  });
});
