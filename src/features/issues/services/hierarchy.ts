import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ConflictError, ValidationError } from "@/shared/lib/errors";
import { MAX_SUBTASKS_PER_PARENT } from "@/features/issues/validation/issue.schemas";
import type { IssueTypeDto } from "@/features/issues/types/issue.types";

// The hierarchy guards, in one file, shared by every write that can change a
// parent — issue create/update, the backlog/sprint moves that reassign an epic,
// and subtask create/convert.
//
// Two levels, two pointers, two rule sets (ADR-0045 §4):
//
//   Epic          ←── epicId ──   Story | Task | Bug   ←── parentId ── Subtask
//
// Both are single-level and both are cycle-free BY CONSTRUCTION rather than by
// a runtime walk: an Epic cannot carry `epicId`, and a Subtask cannot be
// pointed at by `parentId`. There is no chain, so there is nothing to loop.

/**
 * The epic-parent guard (BR-4, ADR-0026).
 *
 * A child may point to one Epic in the same project; an Epic never has a
 * parent; nothing is its own parent; cross-project and non-epic parents are
 * rejected.
 */
export async function assertValidEpicParent(
  projectId: string,
  epicId: string | null | undefined,
  self: { type: IssueTypeDto; id?: string },
): Promise<void> {
  if (!epicId) return;
  if (self.type === "EPIC") {
    throw new ValidationError("An Epic cannot have a parent epic.");
  }
  // A subtask reaches its epic through its parent (BR-3). Letting it carry one
  // directly would give the same issue two answers to "which epic is this?".
  if (self.type === "SUBTASK") {
    throw new ValidationError(
      "A subtask belongs to its parent's epic — set the epic on the parent instead.",
    );
  }
  if (self.id && epicId === self.id) {
    throw new ValidationError("An issue cannot be its own parent.");
  }
  const epic = await IssueRepository.findEpic(projectId, epicId);
  if (!epic) {
    throw new ValidationError("Parent epic must be an Epic in this project.");
  }
}

/**
 * The subtask-parent guard (BR-2, BR-9, ADR-0045 §3).
 *
 * Returns the parent row, because every caller needs it straight afterwards —
 * to inherit the sprint (BR-4) and to report the project. Validating and then
 * re-reading would be two round-trips and a window in which they disagree.
 */
export async function assertValidSubtaskParent(
  projectId: string,
  parentId: string,
  self?: { id?: string },
): Promise<{ id: string; projectId: string; sprintId: string | null; status: string }> {
  if (self?.id && parentId === self.id) {
    throw new ValidationError("An issue cannot be its own parent.");
  }

  const parent = await IssueRepository.findSubtaskParentCandidate(projectId, parentId);
  if (!parent) {
    // One message for "not in this project", "deleted", "is an Epic" and "is
    // itself a subtask". They are the same answer to the reader — this is not
    // a thing you can put a subtask under — and enumerating which one leaks
    // the existence of issues in projects the caller may not be able to see.
    throw new ValidationError(
      "A subtask's parent must be a Story, Task or Bug in this project.",
    );
  }

  // Depth is capped by construction (a SUBTASK is excluded by the query above),
  // so this cannot be reached by nesting. It exists for the other direction:
  // converting an issue that already HAS subtasks into a subtask itself.
  if (self?.id) {
    const ownSubtasks = await IssueRepository.countSubtasks(self.id);
    if (ownSubtasks > 0) {
      throw new ConflictError(
        `This issue has ${ownSubtasks} ${ownSubtasks === 1 ? "subtask" : "subtasks"} of its own — subtasks cannot be nested. Move or remove them first.`,
      );
    }
  }

  // BR-9. Counted at the moment of the write rather than trusted from the page
  // the user is looking at, which may be minutes old.
  const existing = await IssueRepository.countSubtasks(parentId, self?.id);
  if (existing >= MAX_SUBTASKS_PER_PARENT) {
    throw new ConflictError(
      `A parent can hold at most ${MAX_SUBTASKS_PER_PARENT} subtasks. Break the work into separate issues instead.`,
    );
  }

  return parent;
}
