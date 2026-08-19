import { prisma } from "@/shared/lib/db";
import { MAX_CYCLE_NODES } from "@/features/dependencies/validation/dependency.schemas";
import type { IssueLinkTypeDto } from "@/features/dependencies/types/dependency.types";

// Dependencies (ADR-0046). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).

/** Enough of the other issue to render a row, or to know it must be hidden. */
const endpointSelect = {
  id: true,
  key: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  projectId: true,
  deletedAt: true,
  project: { select: { key: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

const linkSelect = {
  id: true,
  type: true,
  sourceId: true,
  targetId: true,
  source: { select: endpointSelect },
  target: { select: endpointSelect },
} as const;

export const DependencyRepository = {
  /**
   * Every link touching this issue, from both ends, in one query.
   *
   * `OR` on source/target rather than two round-trips: the panel always wants
   * both directions, and the two indexes make each half a lookup.
   *
   * Soft-deleted issues at the far end are excluded here rather than filtered
   * in the service (BR-12) — a link to a deleted issue is not a link a reader
   * should ever see, and leaving that to a caller means one caller forgets.
   */
  listForIssue(issueId: string) {
    return prisma.issueLink.findMany({
      where: {
        OR: [{ sourceId: issueId }, { targetId: issueId }],
        source: { deletedAt: null },
        target: { deletedAt: null },
      },
      select: linkSelect,
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
  },

  findById(id: string) {
    return prisma.issueLink.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        sourceId: true,
        targetId: true,
        type: true,
        source: { select: { id: true, projectId: true } },
        target: { select: { id: true, projectId: true } },
      },
    });
  },

  countForIssue(issueId: string) {
    return prisma.issueLink.count({
      where: {
        OR: [{ sourceId: issueId }, { targetId: issueId }],
        source: { deletedAt: null },
        target: { deletedAt: null },
      },
    });
  },

  create(data: {
    organizationId: string;
    sourceId: string;
    targetId: string;
    type: IssueLinkTypeDto;
    actorId: string;
  }) {
    const { actorId, ...fields } = data;
    return prisma.issueLink.create({
      data: { ...fields, createdBy: actorId, updatedBy: actorId },
      select: linkSelect,
    });
  },

  /**
   * Hard delete, unlike almost everything else in the app.
   *
   * A link is an assertion, not a record of work: "these two are related" that
   * someone has retracted leaves nothing worth keeping, and a soft-deleted link
   * would have to be filtered out of the cycle walk, the blocked filter and
   * both ends of the panel — four places to forget. The audit log carries the
   * fact that it happened (rule 9's intent), the row does not need to.
   */
  remove(id: string) {
    return prisma.issueLink.delete({ where: { id }, select: { id: true } });
  },

  /** Open blockers of one issue — the badge, the filter and the confirm. */
  openBlockersOf(issueId: string) {
    return prisma.issueLink.findMany({
      where: {
        targetId: issueId,
        type: "BLOCKS",
        source: { deletedAt: null, status: { not: "DONE" } },
      },
      select: { id: true, source: { select: { id: true, key: true } } },
    });
  },

  /**
   * Issues this one was blocking that are now unblocked — the BR-9 fan-out.
   *
   * Called after a blocker closes, so it asks the question that actually
   * matters: which of my targets have no OTHER open blocker left? Notifying
   * someone they are unblocked while a second blocker is still open would be
   * worse than saying nothing.
   */
  async newlyUnblockedTargets(blockerId: string) {
    const links = await prisma.issueLink.findMany({
      where: {
        sourceId: blockerId,
        type: "BLOCKS",
        target: { deletedAt: null, status: { not: "DONE" } },
      },
      select: {
        target: { select: { id: true, key: true, title: true, assigneeId: true, reporterId: true } },
      },
    });
    if (links.length === 0) return [];

    const targetIds = links.map((l) => l.target.id);
    const stillBlocked = await prisma.issueLink.findMany({
      where: {
        targetId: { in: targetIds },
        type: "BLOCKS",
        sourceId: { not: blockerId },
        source: { deletedAt: null, status: { not: "DONE" } },
      },
      select: { targetId: true },
    });
    const blocked = new Set(stillBlocked.map((l) => l.targetId));
    return links.map((l) => l.target).filter((t) => !blocked.has(t.id));
  },

  /**
   * Would `source BLOCKS target` close a loop? (BR-7)
   *
   * Walks BLOCKS edges forward from `target` and reports the path if it reaches
   * `source`. Breadth-first with one batched query per level rather than a
   * recursive SQL CTE: it stays inside Prisma, it is directly unit-testable,
   * and real dependency chains are a handful of hops deep.
   *
   * Bounded by MAX_CYCLE_NODES. Hitting the ceiling returns a path of `null`,
   * which the service treats as "refuse" — on a graph too tangled to verify,
   * refusing a new blocking edge is the safe answer, not allowing it.
   */
  async findBlockingPath(
    sourceId: string,
    targetId: string,
  ): Promise<{ found: boolean; path: string[] | null }> {
    // `target` is where the new edge lands; if walking forward from there gets
    // back to `source`, adding the edge would close the ring.
    const cameFrom = new Map<string, string>();
    const visited = new Set<string>([targetId]);
    let frontier = [targetId];

    while (frontier.length > 0) {
      if (visited.size > MAX_CYCLE_NODES) return { found: true, path: null };

      const edges = await prisma.issueLink.findMany({
        where: {
          sourceId: { in: frontier },
          type: "BLOCKS",
          target: { deletedAt: null },
        },
        select: { sourceId: true, targetId: true, target: { select: { key: true } } },
      });

      const next: string[] = [];
      for (const edge of edges) {
        if (visited.has(edge.targetId)) continue;
        visited.add(edge.targetId);
        cameFrom.set(edge.targetId, edge.sourceId);
        if (edge.targetId === sourceId) {
          return { found: true, path: await walkBack(sourceId, targetId, cameFrom) };
        }
        next.push(edge.targetId);
      }
      frontier = next;
    }
    return { found: false, path: null };
  },

  /** Keys for a set of ids, for naming a cycle in the error message. */
  keysByIds(ids: string[]) {
    return prisma.issue.findMany({
      where: { id: { in: ids } },
      select: { id: true, key: true },
    });
  },

  /** Resolve a typed key ("VWP-42") inside one organisation. */
  findByKey(organizationId: string, key: string) {
    return prisma.issue.findFirst({
      where: {
        key: key.toUpperCase(),
        deletedAt: null,
        project: { organizationId },
      },
      select: { id: true, key: true, projectId: true },
    });
  },
};

/** Reconstruct the loop, in reading order, for the error message. */
async function walkBack(
  from: string,
  until: string,
  cameFrom: Map<string, string>,
): Promise<string[]> {
  const ids: string[] = [from];
  let cursor = from;
  // The map is acyclic by construction (each node is written once), so this
  // terminates; the guard is belt and braces against a future edit.
  while (cursor !== until && ids.length <= MAX_CYCLE_NODES) {
    const prev = cameFrom.get(cursor);
    if (!prev) break;
    ids.push(prev);
    cursor = prev;
  }
  const rows = await DependencyRepository.keysByIds(ids);
  const keyById = new Map(rows.map((r) => [r.id, r.key]));
  return ids.reverse().map((id) => keyById.get(id) ?? id);
}
