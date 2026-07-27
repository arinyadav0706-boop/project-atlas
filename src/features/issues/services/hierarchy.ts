import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ValidationError } from "@/shared/lib/errors";
import type { IssueTypeDto } from "@/features/issues/types/issue.types";

// The single epic-parent guard (BR-4, ADR-0026), shared by every write that can
// set an issue's parent — issue create/update AND the backlog/sprint moves that
// reassign an epic. One definition, no duplication. Single level: a child may
// point to one Epic in the same project; an Epic never has a parent; nothing is
// its own parent; cross-project/non-epic parents are rejected. Cycles are
// impossible by construction (only non-epics can have a parent).
export async function assertValidEpicParent(
  projectId: string,
  epicId: string | null | undefined,
  self: { type: IssueTypeDto; id?: string },
): Promise<void> {
  if (!epicId) return;
  if (self.type === "EPIC") {
    throw new ValidationError("An Epic cannot have a parent epic.");
  }
  if (self.id && epicId === self.id) {
    throw new ValidationError("An issue cannot be its own parent.");
  }
  const epic = await IssueRepository.findEpic(projectId, epicId);
  if (!epic) {
    throw new ValidationError("Parent epic must be an Epic in this project.");
  }
}
