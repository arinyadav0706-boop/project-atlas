import type { Prisma } from "@prisma/client";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { ResolvedPredicate } from "@/features/custom-fields/lib/field-predicate";
import { customFieldWhere } from "@/features/custom-fields/repositories/field-predicate.repository";

// The single translation from `IssueFilter` to a Prisma `where` (ADR-0008).
//
// Named `.repository.ts` because it deals in Prisma types, which the
// architecture confines to that suffix (Feature Architecture §4) — it holds no
// queries of its own. Board and Backlog both call it, so adding a filter is
// one change here plus one control in the shared filter bar, and the two
// surfaces cannot disagree about what a filter means.

/**
 * The projects this query may read.
 *
 * Resolved by the SERVICE from the viewer's membership and then intersected
 * with any `filter.projectIds` (ADR-0040 §1). It is passed in rather than read
 * off the filter on purpose: a saved view is shared between people, and the
 * rows it returns must depend on who is looking, not on what was saved.
 * `filter.projectIds` is deliberately ignored here.
 */
export interface IssueQueryScope {
  projectIds: string[];
}

export function issueFilterWhere(
  scope: IssueQueryScope,
  filter: IssueFilter,
  /**
   * Custom-field predicates WITH their types already resolved by the service
   * (ADR-0043 §2). Like `scope`, this is passed in rather than read off the
   * filter: `filter.customFields` is untrusted and carries no type.
   */
  resolvedCustomFields: ResolvedPredicate[] = [],
): Prisma.IssueWhereInput {
  const customFieldClauses = customFieldWhere(resolvedCustomFields);
  return {
    // Each predicate is its OWN clause. Merging them would ask for one value
    // row satisfying every condition, which across two fields is never true.
    ...(customFieldClauses.length ? { AND: customFieldClauses } : {}),
    // A single-project surface passes one id; `in` with one element plans the
    // same as equality, so Board and Backlog lose nothing by sharing this.
    projectId: { in: scope.projectIds },
    deletedAt: null,
    // `status` beats `openOnly`: asking for "In Review" is a narrower question
    // than "not done", and applying both would be redundant at best.
    ...(filter.status
      ? { status: filter.status }
      : filter.openOnly
        ? { status: { not: "DONE" as const } }
        : {}),
    // Tri-state: absent means "don't care", which is why this tests against
    // undefined rather than truthiness.
    ...(filter.hasEstimate === undefined
      ? {}
      : filter.hasEstimate
        ? { estimateMinutes: { not: null } }
        : { estimateMinutes: null }),
    ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(filter.sprintId ? { sprintId: filter.sprintId } : {}),
    ...(filter.epicId ? { epicId: filter.epicId } : {}),
    ...(filter.componentIds?.length
      ? { components: { some: { componentId: { in: filter.componentIds } } } }
      : {}),
    ...(filter.labelIds?.length
      ? { labels: { some: { labelId: { in: filter.labelIds } } } }
      : {}),
    // Substring rather than full-text: this filters a list the reader is
    // already looking at. Global discovery is the ⌘K palette's job (ADR-0021),
    // which uses the FTS indexes.
    ...(filter.search
      ? { title: { contains: filter.search, mode: "insensitive" } }
      : {}),
  };
}

/** True when the filter would narrow anything — drives the "Clear" affordance. */
export function isIssueFilterActive(filter: IssueFilter): boolean {
  return (
    (filter.projectIds?.length ?? 0) > 0 ||
    filter.status !== undefined ||
    filter.openOnly === true ||
    filter.hasEstimate !== undefined ||
    (filter.customFields?.length ?? 0) > 0 ||
    filter.assigneeId !== undefined ||
    filter.type !== undefined ||
    filter.priority !== undefined ||
    filter.sprintId !== undefined ||
    filter.epicId !== undefined ||
    (filter.labelIds?.length ?? 0) > 0 ||
    (filter.componentIds?.length ?? 0) > 0 ||
    (filter.search?.length ?? 0) > 0
  );
}
