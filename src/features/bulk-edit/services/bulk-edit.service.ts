import type { Actor } from "@/shared/types/actor";
import { canWriteContent, elevate } from "@/features/authorization/permission";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { SprintRepository } from "@/features/sprints/repositories/sprint.repository";
import { canTransition } from "@/features/issues/services/issue-workflow";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { DependencyService } from "@/features/dependencies/services/dependency.service";
import { MAX_BULK_NOTIFICATIONS } from "@/features/bulk-edit/validation/bulk-edit.schemas";
import type { BulkEditChanges, BulkEditInput } from "@/features/bulk-edit/validation/bulk-edit.schemas";
import type {
  BulkEditResultDto,
  BulkFailureReason,
  BulkResultItemDto,
} from "@/features/bulk-edit/types/bulk-edit.types";
import {
  SUBTASK_PARENT_TYPES,
  type IssueStatusDto,
} from "@/features/issues/types/issue.types";

// Business rules: docs/02_Modules/23_bulk_edit.md (ADR-0041). Every rule is
// re-evaluated PER ISSUE, server-side: the client's selection is a request, not
// an authorisation.

type IssueRow = NonNullable<Awaited<ReturnType<typeof IssueRepository.findDetail>>>;

const MESSAGES: Record<BulkFailureReason, string> = {
  not_found: "This issue no longer exists.",
  forbidden: "You don't have permission to edit issues in this project.",
  archived: "This issue is in an archived project, which is read-only.",
  invalid_transition: "That status change skips a step in the workflow.",
  invalid_assignee: "The assignee isn't a member of this issue's project.",
  invalid_sprint: "That sprint doesn't belong to this issue's project.",
  open_subtasks: "This issue still has open subtasks, so it can't be marked done.",
  conflict: "This issue changed while the update was being applied.",
};

function fail(issueId: string, key: string | null, reason: BulkFailureReason): BulkResultItemDto {
  return { issueId, key, outcome: "failed", reason, message: MESSAGES[reason] };
}

/**
 * Per-project facts, resolved once per project rather than once per issue.
 *
 * A 100-issue selection usually spans a handful of projects; without this the
 * service would re-read the same project context and membership 100 times.
 */
interface ProjectFacts {
  organizationId: string;
  archived: boolean;
  canWrite: boolean;
  /** Members of this project, for validating an assignee (BR-8). */
  assigneeValid: Map<string, boolean>;
}

async function factsFor(
  projectId: string,
  actor: Actor,
  cache: Map<string, ProjectFacts | null>,
): Promise<ProjectFacts | null> {
  const cached = cache.get(projectId);
  if (cached !== undefined) return cached;

  const context = await ProjectService.getContext(projectId);
  // Cross-tenant is indistinguishable from absent (F-1) — the whole project
  // resolves to null and every issue in it reports not_found.
  if (!context || context.organizationId !== actor.organizationId) {
    cache.set(projectId, null);
    return null;
  }
  const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
  const facts: ProjectFacts = {
    organizationId: context.organizationId,
    archived: context.status === "ARCHIVED",
    canWrite: canWriteContent(role),
    assigneeValid: new Map(),
  };
  cache.set(projectId, facts);
  return facts;
}

/** Is the target assignee a member of this project? Memoised per project. */
async function assigneeAllowed(
  projectId: string,
  assigneeId: string,
  facts: ProjectFacts,
): Promise<boolean> {
  const known = facts.assigneeValid.get(assigneeId);
  if (known !== undefined) return known;
  const role = await ProjectService.getMemberRole(projectId, assigneeId);
  const allowed = role !== null;
  facts.assigneeValid.set(assigneeId, allowed);
  return allowed;
}

/** The subset of `changes` this issue does not already satisfy (BR-7). */
function pendingChanges(issue: IssueRow, changes: BulkEditChanges) {
  const pending: {
    status?: IssueStatusDto;
    priority?: BulkEditChanges["priority"];
    assigneeId?: string | null;
    sprintId?: string | null;
  } = {};
  if (changes.status !== undefined && issue.status !== changes.status) {
    pending.status = changes.status;
  }
  if (changes.priority !== undefined && issue.priority !== changes.priority) {
    pending.priority = changes.priority;
  }
  if (changes.assigneeId !== undefined && issue.assigneeId !== changes.assigneeId) {
    pending.assigneeId = changes.assigneeId;
  }
  if (changes.sprintId !== undefined && issue.sprintId !== changes.sprintId) {
    pending.sprintId = changes.sprintId;
  }
  return pending;
}

export const BulkEditService = {
  /**
   * Apply one change set across a selection (BR-3).
   *
   * Best effort: each issue succeeds or fails on its own. Sequential rather
   * than `Promise.all` — 100 concurrent transactions against a pooled
   * connection is how a bulk action takes the database down, and the
   * per-project caches only help if earlier issues have finished.
   */
  async apply(actor: Actor, input: BulkEditInput): Promise<BulkEditResultDto> {
    const { issueIds, changes } = input;
    const projectCache = new Map<string, ProjectFacts | null>();
    const sprintCache = new Map<string, boolean>();
    const results: BulkResultItemDto[] = [];
    let notified = 0;
    let notificationsSuppressed = false;

    for (const issueId of issueIds) {
      const issue = await IssueRepository.findDetail(issueId);
      if (!issue) {
        results.push(fail(issueId, null, "not_found"));
        continue;
      }

      const facts = await factsFor(issue.projectId, actor, projectCache);
      if (!facts) {
        results.push(fail(issueId, issue.key, "not_found"));
        continue;
      }
      if (!facts.canWrite) {
        results.push(fail(issueId, issue.key, "forbidden"));
        continue;
      }
      if (facts.archived) {
        results.push(fail(issueId, issue.key, "archived"));
        continue;
      }

      const pending = pendingChanges(issue, changes);
      if (Object.keys(pending).length === 0) {
        // Already there. No write, no audit row, no notification (BR-7).
        results.push({ issueId, key: issue.key, outcome: "skipped" });
        continue;
      }

      // The workflow is a rule, not a request error: "TODO → DONE" is a
      // legitimate thing to ask for and a legitimate thing to refuse (BR-6).
      if (pending.status && !canTransition(issue.status, pending.status)) {
        results.push(fail(issueId, issue.key, "invalid_transition"));
        continue;
      }

      // BR-7 applies here too, or bulk edit becomes the way round it. Reported
      // per issue like every other refusal (ADR-0041 §1), so a 40-issue "mark
      // done" still applies to the 37 that are legal.
      if (
        pending.status === "DONE" &&
        (SUBTASK_PARENT_TYPES as readonly string[]).includes(issue.type)
      ) {
        if ((await IssueRepository.countOpenSubtasks(issueId)) > 0) {
          results.push(fail(issueId, issue.key, "open_subtasks"));
          continue;
        }
      }

      if (pending.assigneeId) {
        if (!(await assigneeAllowed(issue.projectId, pending.assigneeId, facts))) {
          results.push(fail(issueId, issue.key, "invalid_assignee"));
          continue;
        }
      }

      if (pending.sprintId) {
        const cacheKey = `${issue.projectId}:${pending.sprintId}`;
        let ok = sprintCache.get(cacheKey);
        if (ok === undefined) {
          const sprint = await SprintRepository.findById(pending.sprintId);
          // Must exist AND belong to THIS issue's project — a cross-project
          // selection makes "move all of these into Sprint 5" ambiguous, and
          // silently skipping the ones that cannot would hide it (BR-9).
          ok = sprint !== null && sprint.projectId === issue.projectId;
          sprintCache.set(cacheKey, ok);
        }
        if (!ok) {
          results.push(fail(issueId, issue.key, "invalid_sprint"));
          continue;
        }
      }

      // No expectedVersion (ADR-0041 §2) — but `version` still increments, so a
      // detail page open on this issue will 409 on its next save exactly as it
      // should. Bulk edit opts out of CHECKING the version, never out of
      // maintaining it.
      const row = await IssueRepository.updateWithVersion(
        issueId,
        issue.version,
        {
          ...(pending.status !== undefined ? { status: pending.status } : {}),
          ...(pending.priority !== undefined ? { priority: pending.priority } : {}),
          ...(pending.assigneeId !== undefined ? { assigneeId: pending.assigneeId } : {}),
          ...(pending.sprintId !== undefined ? { sprintId: pending.sprintId } : {}),
        },
        actor.userId,
      );
      if (!row) {
        // Someone wrote to this issue between our read and our write. Rare, and
        // reported rather than retried: a silent retry would overwrite whatever
        // they just did.
        results.push(fail(issueId, issue.key, "conflict"));
        continue;
      }

      // Cycle time reads this trail, so a bulk transition must leave the same
      // record a single one does or the report grows a hole (BR-12).
      if (pending.status) {
        await AuditLogService.record({
          organizationId: facts.organizationId,
          actorId: actor.userId,
          action: "ISSUE_STATUS_CHANGED",
          entityType: "Issue",
          entityId: issueId,
          beforeData: { status: issue.status },
          afterData: { status: pending.status },
        });
      }

      // Closing a blocker in bulk unblocks people just as closing one singly
      // does (ADR-0046 §6). Not capped by MAX_BULK_NOTIFICATIONS: that cap
      // exists so a 100-issue reassignment does not land as 100 messages to
      // one person, whereas an unblock goes to a DIFFERENT person per issue
      // and is the thing they most need to hear.
      if (pending.status === "DONE") {
        await DependencyService.notifyUnblocked(actor, { id: issueId, key: row.key });
      }

      // Only a real reassignment to someone else, and only up to the cap: a
      // 100-issue reassignment must not land as 100 notifications (BR-13).
      if (pending.assigneeId && pending.assigneeId !== actor.userId) {
        if (notified < MAX_BULK_NOTIFICATIONS) {
          await NotificationService.issueAssigned(actor, {
            issueId,
            issueKey: row.key,
            issueTitle: row.title,
            assigneeId: pending.assigneeId,
          });
          notified += 1;
        } else {
          notificationsSuppressed = true;
        }
      }

      results.push({ issueId, key: issue.key, outcome: "updated" });
    }

    return {
      updated: results.filter((r) => r.outcome === "updated").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      results,
      notificationsSuppressed,
    };
  },
};
