import type { IssueStatusDto } from "@/features/issues/types/issue.types";

// The one fixed V1 workflow (docs/02_Modules/04_issues.md BR-5). Kept as a
// pure, dependency-free module so the transition rules are trivially
// unit-testable and shared between server validation and client UI (which
// only offers legal next states). Uses the DTO status union, not the Prisma
// enum, so it stays importable from client components (Feature Arch §4).
const TRANSITIONS: Record<IssueStatusDto, IssueStatusDto[]> = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["TODO", "IN_REVIEW"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: ["IN_REVIEW", "TODO"],
};

export const ISSUE_STATUSES: IssueStatusDto[] = [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];

export function allowedTransitions(from: IssueStatusDto): IssueStatusDto[] {
  return TRANSITIONS[from];
}

export function canTransition(from: IssueStatusDto, to: IssueStatusDto): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}
