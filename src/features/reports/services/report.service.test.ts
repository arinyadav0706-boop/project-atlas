import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import type {
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
  expect(metas.map((m) => m.id)).toEqual(["velocity", "status-breakdown", "cycle-time"]);
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
