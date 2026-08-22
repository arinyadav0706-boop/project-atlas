// DTOs for statuses and transitions (ADR-0049, docs/02_Modules/30_workflow.md).
//
// The category union is hand-written rather than imported from `@prisma/client`
// — Prisma is confined to `*.repository.ts` (Feature Architecture §2), and the
// same pattern already governs `IssueStatusDto`. An integration test asserts
// this union and the database enum stay in step, the way the notification-type
// parity test does.

export const STATUS_CATEGORIES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;

export type StatusCategoryDto = (typeof STATUS_CATEGORIES)[number];

export interface WorkflowStatusDto {
  id: string;
  name: string;
  category: StatusCategoryDto;
  color: string;
  position: number;
  isDefault: boolean;
}

/** The editor needs to know what a delete would move. */
export interface WorkflowStatusWithCountDto extends WorkflowStatusDto {
  issueCount: number;
}

export interface StatusTransitionDto {
  id: string;
  fromStatusId: string;
  toStatusId: string;
}

export interface WorkflowDto {
  statuses: WorkflowStatusWithCountDto[];
  transitions: StatusTransitionDto[];
  /** When false, any status may follow any status (BR-10). */
  enforceTransitions: boolean;
  /** Whether the viewer may administer these — LEAD or org ADMIN (BR-9). */
  canManage: boolean;
}
