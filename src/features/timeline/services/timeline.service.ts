import type { Actor } from "@/shared/types/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import { canWriteContent, elevate } from "@/features/authorization/permission";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { TimelineRepository } from "@/features/timeline/repositories/timeline.repository";
import {
  MAX_TIMELINE_ROWS,
  MAX_UNSCHEDULED_ROWS,
} from "@/features/timeline/validation/timeline.schemas";
import type { ScheduleIssueInput } from "@/features/timeline/validation/timeline.schemas";
import { isConflict, spanOf, toDayString, unionSpan } from "@/features/timeline/lib/scale";
import type { Span } from "@/features/timeline/lib/scale";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type {
  TimelineDto,
  TimelineLinkDto,
  TimelineRowDto,
} from "@/features/timeline/types/timeline.types";

// Business rules: docs/02_Modules/28_timeline.md (ADR-0047).
//
// The chart is one request: bars, tray, sprint bands, arrows and conflicts.
// Splitting it would mean the arrows could arrive before the bars they point
// at, and a Gantt that renders in two stages flickers its way to correctness.

type Row = Awaited<ReturnType<typeof TimelineRepository.datedIssues>>[number];

function toRow(row: Row, override?: Span | null): TimelineRowDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    // Days on the wire, never instants — see timeline.types.ts.
    startDate: override ? toDayString(override.start) : row.startDate ? toDayString(row.startDate) : null,
    dueDate: override ? toDayString(override.end) : row.dueDate ? toDayString(row.dueDate) : null,
    version: row.version,
    rolledUp: Boolean(override),
    blockedBy: row._count.linksIn,
  };
}

export const TimelineService = {
  /** Everything the chart draws, in one response. */
  async get(actor: Actor, projectId: string, filter: IssueFilter): Promise<TimelineDto> {
    const { role } = await this.resolve(projectId, actor);
    const predicates = await CustomFieldService.resolvePredicates(actor, filter.customFields);

    // An explicit `type` filter for something other than EPIC means the reader
    // asked not to see epics; rolling them up anyway would put back exactly
    // what they filtered out.
    const wantsEpics = !filter.type || filter.type === "EPIC";

    const [datedPlusOne, unscheduled, sprints, undatedEpics] = await Promise.all([
      TimelineRepository.datedIssues(projectId, filter, predicates, MAX_TIMELINE_ROWS),
      TimelineRepository.unscheduledIssues(projectId, filter, predicates, MAX_UNSCHEDULED_ROWS),
      TimelineRepository.sprintsWithDates(projectId),
      wantsEpics
        ? TimelineRepository.undatedEpics(projectId, filter, predicates)
        : Promise.resolve([] as Row[]),
    ]);

    // BR-6 — an Epic with no dates of its own spans its children. Epics that DO
    // carry dates are left alone: somebody made a decision there, and a
    // computed span must not overwrite it.
    const rollupById = await this.rollUpEpics(undatedEpics.map((e) => e.id));
    const rolledRows = undatedEpics
      .map((e) => ({ row: e, span: rollupById.get(e.id) }))
      .filter((x): x is { row: Row; span: Span } => Boolean(x.span))
      .map(({ row, span }) => toRow(row, span));

    const datedRows = datedPlusOne.map((r) => toRow(r));

    // Combined, then sorted, then capped — in that order. Capping the dated
    // query alone would let a rolled-up epic push a real bar off the chart, or
    // leave the epic itself off while its children are drawn.
    const all = [...datedRows, ...rolledRows].sort((a, b) => {
      const aStart = a.startDate ?? a.dueDate ?? "";
      const bStart = b.startDate ?? b.dueDate ?? "";
      return aStart === bStart ? a.key.localeCompare(b.key) : aStart.localeCompare(bStart);
    });
    const truncated = all.length > MAX_TIMELINE_ROWS;
    const rows = truncated ? all.slice(0, MAX_TIMELINE_ROWS) : all;

    // Arrows only between bars that are actually drawn (BR-7).
    const spanById = new Map<string, Span | null>(
      rows.map((r) => [r.id, spanOf({ startDate: r.startDate, dueDate: r.dueDate })]),
    );
    const rawLinks = await TimelineRepository.linksAmong([...spanById.keys()]);
    const links: TimelineLinkDto[] = rawLinks.map((l) => ({
      id: l.id,
      blockerId: l.sourceId,
      dependentId: l.targetId,
      // BR-8, decided here rather than in the browser: one clock, one answer,
      // and the header's count cannot disagree with the arrows' colour.
      conflict: isConflict(spanById.get(l.sourceId) ?? null, spanById.get(l.targetId) ?? null),
    }));

    return {
      rows,
      unscheduled: unscheduled.map((r) => toRow(r)),
      sprints: sprints.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        startDate: toDayString(s.startDate!),
        endDate: toDayString(s.endDate!),
      })),
      links,
      conflictCount: links.filter((l) => l.conflict).length,
      truncated,
      canEdit: canWriteContent(role),
    };
  },

  /**
   * `epicId → span`, from each epic's children (BR-6).
   *
   * One query for all of them rather than one per epic: a project with thirty
   * epics on screen would otherwise be thirty round-trips for what is a
   * grouped min/max.
   */
  async rollUpEpics(epicIds: string[]): Promise<Map<string, Span>> {
    const result = new Map<string, Span>();
    if (epicIds.length === 0) return result;

    const children = await TimelineRepository.childDatesForEpics(epicIds);
    const byEpic = new Map<string, Span[]>();
    for (const child of children) {
      if (!child.epicId) continue;
      const span = spanOf({ startDate: child.startDate, dueDate: child.dueDate });
      if (!span) continue;
      const list = byEpic.get(child.epicId);
      if (list) list.push(span);
      else byEpic.set(child.epicId, [span]);
    }
    for (const [epicId, spans] of byEpic) {
      const union = unionSpan(spans);
      if (union) result.set(epicId, union);
    }
    return result;
  },

  /**
   * Reschedule one issue (BR-11).
   *
   * Deliberately its own endpoint rather than a corner of the issue PATCH: a
   * drag sends two dates and a version and nothing else, and keeping it narrow
   * means a dragged bar can never accidentally carry a stale title or assignee
   * from a form somebody had open.
   *
   * Nothing else moves. Dependents keep their dates even when the move creates
   * a conflict — the chart will say so in red, which is information rather than
   * fifteen silent rewrites (ADR-0047 §7).
   */
  async schedule(
    actor: Actor,
    issueId: string,
    input: ScheduleIssueInput,
  ): Promise<TimelineRowDto> {
    const existing = await IssueRepository.findDetail(issueId);
    if (!existing) throw new NotFoundError("Issue not found.");
    const { context, role } = await this.resolve(existing.projectId, actor);
    if (!canWriteContent(role)) {
      throw new ForbiddenError("You need to be a project member to reschedule issues.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }

    // BR-4 against the EFFECTIVE pair, not just the submitted one: sending only
    // a start that lands after an already-stored due date is the same illegal
    // state as sending both, and the schema alone cannot see the stored half.
    const nextStart =
      input.startDate === undefined ? existing.startDate : parseDay(input.startDate);
    const nextDue = input.dueDate === undefined ? existing.dueDate : parseDay(input.dueDate);
    if (nextStart && nextDue && nextStart.getTime() > nextDue.getTime()) {
      throw new ConflictError("A start date can't be after the due date.");
    }

    const row = await TimelineRepository.setScheduleWithVersion(
      issueId,
      input.expectedVersion,
      {
        ...(input.startDate !== undefined ? { startDate: parseDay(input.startDate) } : {}),
        ...(input.dueDate !== undefined ? { dueDate: parseDay(input.dueDate) } : {}),
      },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This issue was changed by someone else — refresh the timeline and try the move again.",
      );
    }
    return toRow(row);
  },

  async resolve(projectId: string, actor: Actor) {
    const context = await ProjectService.getContext(projectId);
    // Tenant scope (F-1): a project outside the caller's org is absent.
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
    return { context, role };
  },
};

/** `YYYY-MM-DD` → midnight UTC. Null passes through as "clear it". */
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}
