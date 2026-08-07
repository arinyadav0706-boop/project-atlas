import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import type {
  BurndownData,
  CycleTimeData,
  StatusBreakdownData,
  VelocityData,
} from "@/features/reports/types/report.types";

vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn() },
}));
vi.mock("@/features/reports/repositories/report.repository", () => ({
  ReportRepository: {
    completedSprintVelocity: vi.fn(),
    statusBreakdown: vi.fn(),
    cycleTimeTransitions: vi.fn(),
    burndownSprints: vi.fn(),
    sprintCohort: vi.fn(),
    statusHistory: vi.fn(),
  },
}));

import { ProjectService } from "@/features/projects/services/project.service";
import { ReportRepository } from "@/features/reports/repositories/report.repository";
import { ReportService } from "./report.service";
import { NotFoundError } from "@/shared/lib/errors";

const projects = vi.mocked(ProjectService);
const repo = vi.mocked(ReportRepository);
const actor: Actor = { userId: "u-1", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue({
    id: "p-1",
    organizationId: "org-1",
    key: "P",
    name: "P",
    status: "ACTIVE",
  } as never);
});

it("lists the registered reports", async () => {
  const metas = await ReportService.listReports(actor, "p-1");
  // Order here is the display order on the Reports tab; burndown sits beside
  // velocity because both answer "how much did we deliver".
  expect(metas.map((m) => m.id)).toEqual([
    "velocity",
    "burndown",
    "status-breakdown",
    "cycle-time",
  ]);
});

it("velocity returns the sprint series in a typed envelope", async () => {
  repo.completedSprintVelocity.mockResolvedValue([{ name: "S1", points: 8, issues: 2 }] as never);
  const result = await ReportService.runReport(actor, "p-1", "velocity");
  expect(result.chartType).toBe("bar");
  expect((result.data as VelocityData).sprints[0]).toMatchObject({ points: 8 });
});

it("status breakdown always includes all four statuses with a total", async () => {
  repo.statusBreakdown.mockResolvedValue([
    { status: "TODO", count: 2 },
    { status: "DONE", count: 1 },
  ] as never);
  const result = await ReportService.runReport(actor, "p-1", "status-breakdown");
  const data = result.data as StatusBreakdownData;
  expect(data.total).toBe(3);
  expect(data.segments).toHaveLength(4);
  expect(data.segments.find((s) => s.status === "IN_REVIEW")!.count).toBe(0);
});

it("cycle time averages In-Progress→Done and reports sample size", async () => {
  const t0 = new Date("2026-07-01T00:00:00Z");
  const t2 = new Date("2026-07-03T00:00:00Z");
  repo.cycleTimeTransitions.mockResolvedValue([
    { entityId: "i-1", status: "IN_PROGRESS", createdAt: t0 },
    { entityId: "i-1", status: "DONE", createdAt: t2 },
  ] as never);
  const result = await ReportService.runReport(actor, "p-1", "cycle-time");
  const data = result.data as CycleTimeData;
  expect(data.sampleSize).toBe(1);
  expect(data.averageDays).toBe(2);
});

it("cycle time is null when nothing qualifies", async () => {
  repo.cycleTimeTransitions.mockResolvedValue([] as never);
  const result = await ReportService.runReport(actor, "p-1", "cycle-time");
  expect((result.data as CycleTimeData).averageDays).toBeNull();
});

it("rejects an unknown report", async () => {
  await expect(ReportService.runReport(actor, "p-1", "nope")).rejects.toBeInstanceOf(NotFoundError);
});

it("treats a project outside the caller's org as absent (F-1)", async () => {
  projects.getContext.mockResolvedValue({
    id: "p-1",
    organizationId: "other-org",
    key: "P",
    name: "P",
    status: "ACTIVE",
  } as never);
  await expect(ReportService.runReport(actor, "p-1", "velocity")).rejects.toBeInstanceOf(
    NotFoundError,
  );
});

// --- Sprint burndown (ADR-0037) -------------------------------------------
// The replay arithmetic is covered in lib/burndown.test.ts; these pin the
// registry wiring — sprint selection, unit switching, and the states where a
// chart must NOT be drawn.

const sprint = (over: Record<string, unknown> = {}) => ({
  id: "s-1",
  name: "Sprint 12",
  status: "COMPLETED",
  startDate: new Date("2026-08-03T00:00:00.000Z"),
  endDate: new Date("2026-08-07T00:00:00.000Z"),
  ...over,
});

function burndown(result: Awaited<ReturnType<typeof ReportService.runReport>>) {
  return result.data as BurndownData;
}

it("burndown: says so plainly when no sprint has ever run", async () => {
  repo.burndownSprints.mockResolvedValue([] as never);

  const data = burndown(await ReportService.runReport(actor, "p-1", "burndown"));
  expect(data.series).toBeNull();
  expect(data.reason).toMatch(/no sprint has run/i);
  expect(repo.sprintCohort).not.toHaveBeenCalled();
});

it("burndown: defaults to the first sprint offered and to points", async () => {
  repo.burndownSprints.mockResolvedValue([sprint(), sprint({ id: "s-2" })] as never);
  repo.sprintCohort.mockResolvedValue([
    { id: "a", status: "DONE", storyPoints: 3, estimateMinutes: 120 },
  ] as never);
  repo.statusHistory.mockResolvedValue([
    {
      entityId: "a",
      beforeData: { status: "TODO" },
      afterData: { status: "DONE" },
      createdAt: new Date("2026-08-05T10:00:00.000Z"),
    },
  ] as never);

  const data = burndown(await ReportService.runReport(actor, "p-1", "burndown"));
  expect(data.selectedSprintId).toBe("s-1");
  expect(data.unit).toBe("points");
  expect(data.series!.scope).toBe(3);
  // Open days 3-4, done from the 5th.
  expect(data.series!.points.map((p) => p.remaining)).toEqual([3, 3, 0, 0, 0]);
});

it("burndown: honours the requested sprint and unit", async () => {
  repo.burndownSprints.mockResolvedValue([sprint(), sprint({ id: "s-2", name: "Sprint 13" })] as never);
  repo.sprintCohort.mockResolvedValue([
    { id: "a", status: "TODO", storyPoints: null, estimateMinutes: 90 },
  ] as never);
  repo.statusHistory.mockResolvedValue([] as never);

  const data = burndown(
    await ReportService.runReport(actor, "p-1", "burndown", { sprintId: "s-2", unit: "hours" }),
  );
  expect(data.selectedSprintId).toBe("s-2");
  expect(data.sprintName).toBe("Sprint 13");
  expect(data.unit).toBe("hours");
  expect(data.series!.scope).toBe(90); // minutes; the axis formats them
});

it("burndown: falls back rather than erroring on an unknown sprint id", async () => {
  repo.burndownSprints.mockResolvedValue([sprint()] as never);
  repo.sprintCohort.mockResolvedValue([] as never);
  repo.statusHistory.mockResolvedValue([] as never);

  const data = burndown(
    await ReportService.runReport(actor, "p-1", "burndown", { sprintId: "not-mine" }),
  );
  expect(data.selectedSprintId).toBe("s-1");
});

it("burndown: ignores an unrecognised unit instead of drawing nothing", async () => {
  repo.burndownSprints.mockResolvedValue([sprint()] as never);
  repo.sprintCohort.mockResolvedValue([
    { id: "a", status: "TODO", storyPoints: 2, estimateMinutes: null },
  ] as never);
  repo.statusHistory.mockResolvedValue([] as never);

  const data = burndown(
    await ReportService.runReport(actor, "p-1", "burndown", { unit: "bananas" }),
  );
  expect(data.unit).toBe("points");
  expect(data.series!.scope).toBe(2);
});

it("burndown: carries the honesty counters through to the DTO", async () => {
  repo.burndownSprints.mockResolvedValue([sprint()] as never);
  repo.sprintCohort.mockResolvedValue([
    { id: "a", status: "DONE", storyPoints: null, estimateMinutes: null },
    { id: "b", status: "TODO", storyPoints: 5, estimateMinutes: 60 },
  ] as never);
  repo.statusHistory.mockResolvedValue([] as never);

  const data = burndown(await ReportService.runReport(actor, "p-1", "burndown"));
  expect(data.issueCount).toBe(2);
  expect(data.unsized).toBe(1); // "a" has no story points
  expect(data.untrackedDone).toBe(1); // "a" is Done with no recorded transition
});

it("burndown: refuses to plot a sprint with no dates", async () => {
  repo.burndownSprints.mockResolvedValue([
    sprint({ startDate: null, endDate: null }),
  ] as never);

  const data = burndown(await ReportService.runReport(actor, "p-1", "burndown"));
  expect(data.series).toBeNull();
  expect(data.reason).toMatch(/no start and end date/i);
});
