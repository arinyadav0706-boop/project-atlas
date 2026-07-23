import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ReportMetaDto, ReportResultDto } from "@/features/reports/types/report.types";
import { REPORTS, REPORTS_BY_ID, reportMeta } from "@/features/reports/services/report.registry";

// Reports are read-only (ADR-0020). RBAC follows project visibility: any org
// member may view (VIEWER included); tenant scope (F-1) still applies.
async function requireProject(actor: Actor, projectId: string): Promise<void> {
  const context = await ProjectService.getContext(projectId);
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Project not found.");
  }
}

export const ReportService = {
  async listReports(actor: Actor, projectId: string): Promise<ReportMetaDto[]> {
    await requireProject(actor, projectId);
    return REPORTS.map(reportMeta);
  },

  async runReport(
    actor: Actor,
    projectId: string,
    reportId: string,
    params: Record<string, string> = {},
  ): Promise<ReportResultDto> {
    await requireProject(actor, projectId);
    const definition = REPORTS_BY_ID[reportId];
    if (!definition) throw new NotFoundError("Report not found.");
    return definition.compute(projectId, params);
  },
};
