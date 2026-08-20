import type { Actor } from "@/shared/types/actor";
import { NotFoundError } from "@/shared/lib/errors";
import { canWriteContent, elevate } from "@/features/authorization/permission";
import { ProjectService } from "@/features/projects/services/project.service";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { CalendarRepository } from "@/features/calendar/repositories/calendar.repository";
import {
  MAX_CALENDAR_EVENTS,
  MAX_UNSCHEDULED_EVENTS,
} from "@/features/calendar/validation/calendar.schemas";
import type { CalendarWindowInput } from "@/features/calendar/validation/calendar.schemas";
import { startOfDay, toDayString } from "@/shared/lib/day";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type {
  CalendarDto,
  CalendarEventDto,
} from "@/features/calendar/types/calendar.types";

// Business rules: docs/02_Modules/29_calendar.md (ADR-0048).
//
// Read-only. Every write is `PATCH /api/issues/{id}/schedule`, which belongs to
// the Timeline (ADR-0048 §7) — one write path for one pair of dates, so the two
// views cannot disagree about who may change them or what a legal pair is.

type Event = Awaited<ReturnType<typeof CalendarRepository.eventsInWindow>>[number];

function toEvent(row: Event): CalendarEventDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    // Days on the wire, never instants (BR-11).
    startDate: row.startDate ? toDayString(row.startDate) : null,
    dueDate: row.dueDate ? toDayString(row.dueDate) : null,
    version: row.version,
    blockedBy: row._count.linksIn,
  };
}

export const CalendarService = {
  /** Everything the grid draws, in one response. */
  async get(
    actor: Actor,
    projectId: string,
    window: CalendarWindowInput,
    filter: IssueFilter,
  ): Promise<CalendarDto> {
    const { role } = await this.resolve(projectId, actor);
    const predicates = await CustomFieldService.resolvePredicates(actor, filter.customFields);

    const from = startOfDay(`${window.from}T00:00:00.000Z`);
    const to = startOfDay(`${window.to}T00:00:00.000Z`);

    const [eventsPlusOne, unscheduled] = await Promise.all([
      CalendarRepository.eventsInWindow(
        projectId,
        filter,
        predicates,
        from,
        to,
        MAX_CALENDAR_EVENTS,
      ),
      CalendarRepository.unscheduledIssues(
        projectId,
        filter,
        predicates,
        MAX_UNSCHEDULED_EVENTS,
      ),
    ]);

    const truncated = eventsPlusOne.length > MAX_CALENDAR_EVENTS;

    return {
      from: window.from,
      to: window.to,
      // BR-13: no rolled-up epics. The Timeline derives an epic's span from its
      // children because a Gantt is about hierarchy; a calendar is about what
      // lands on a day, and a computed six-week band across every cell is noise
      // that crowds out the work people are actually looking for. An epic with
      // its own dates is an ordinary event and appears here normally.
      events: eventsPlusOne.slice(0, MAX_CALENDAR_EVENTS).map(toEvent),
      unscheduled: unscheduled.map(toEvent),
      truncated,
      canEdit: canWriteContent(role),
    };
  },

  async resolve(projectId: string, actor: Actor) {
    const context = await ProjectService.getContext(projectId);
    // Tenant scope (F-1): a project outside the caller's org is absent, never
    // forbidden — a 403 confirms it exists.
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
    return { context, role };
  },
};
