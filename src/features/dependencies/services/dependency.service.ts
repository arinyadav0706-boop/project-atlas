import type { Actor } from "@/shared/types/actor";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/errors";
import { canWriteContent, elevate } from "@/features/authorization/permission";
import { logSwallowed } from "@/shared/lib/swallowed";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { SavedViewRepository } from "@/features/saved-views/repositories/saved-view.repository";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { DependencyRepository } from "@/features/dependencies/repositories/dependency.repository";
import { MAX_LINKS_PER_ISSUE } from "@/features/dependencies/validation/dependency.schemas";
import type { CreateLinkInput } from "@/features/dependencies/validation/dependency.schemas";
import type {
  IssueLinkDto,
  IssueLinksDto,
  IssueLinkTypeDto,
  LinkRelationDto,
  LinkedIssueDto,
} from "@/features/dependencies/types/dependency.types";

// Business rules: docs/02_Modules/27_dependencies.md (ADR-0046).
//
// One table, read from both ends. Everything here is about keeping the two
// readings of one row consistent, and about being honest when the far end is an
// issue the viewer is not allowed to see.

type LinkRow = Awaited<ReturnType<typeof DependencyRepository.listForIssue>>[number];
type Endpoint = LinkRow["source"];

/** The sentence a stored row makes, from the end you are standing on. */
function relationFor(type: IssueLinkTypeDto, isSource: boolean): LinkRelationDto {
  if (type === "RELATES_TO") return "RELATES_TO";
  if (type === "BLOCKS") return isSource ? "BLOCKS" : "IS_BLOCKED_BY";
  return isSource ? "DUPLICATES" : "IS_DUPLICATED_BY";
}

export const DependencyService = {
  /** Every link on an issue, both directions, with unviewable ends masked. */
  async list(actor: Actor, issueId: string): Promise<IssueLinksDto> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    await this.assertCanView(actor, issue.projectId);

    const [rows, visible] = await Promise.all([
      DependencyRepository.listForIssue(issueId),
      this.visibleProjectIds(actor),
    ]);
    const visibleSet = new Set(visible);

    const links: IssueLinkDto[] = rows.map((row) => {
      const isSource = row.sourceId === issueId;
      const other = isSource ? row.target : row.source;
      const relation = relationFor(row.type, isSource);
      return {
        id: row.id,
        relation,
        issue: toLinkedIssue(other, visibleSet),
        // "Blocking" means: this row is a blocker of the issue being viewed,
        // and it is not finished. A blocker that is Done is not blocking.
        blocking: relation === "IS_BLOCKED_BY" && other.status !== "DONE",
      };
    });

    return {
      links,
      // Keys, not ids: this drives a sentence a human reads ("VWP-12 is still
      // blocking this"). A restricted blocker still counts — it blocks you
      // whether or not you may read it — and is named generically.
      openBlockerKeys: links
        .filter((l) => l.blocking)
        .map((l) => (l.issue.restricted ? "a restricted issue" : l.issue.key)),
    };
  },

  /**
   * Link two issues (BR-1..BR-7, BR-10, BR-11).
   *
   * `direction` decides which end of the stored row this issue occupies, so
   * "blocks" and "is blocked by" are one endpoint rather than two that would
   * eventually disagree about validation.
   */
  async create(actor: Actor, issueId: string, input: CreateLinkInput): Promise<IssueLinkDto> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");

    const other = input.targetId
      ? await IssueRepository.findProjectId(input.targetId)
      : await DependencyRepository.findByKey(actor.organizationId, input.targetKey!);
    if (!other) throw new ValidationError("That issue doesn't exist, or isn't in your organisation.");
    if (other.id === issueId) {
      throw new ValidationError("An issue can't be linked to itself.");
    }

    // BR-5: both ends inside the tenant, and the caller must be able to SEE
    // both — you cannot wire your work to an issue you have no business
    // knowing exists.
    await this.assertCanView(actor, issue.projectId);
    await this.assertCanView(actor, other.projectId);

    // BR-11: write access to at least one side. Requiring both would make a
    // cross-team dependency impossible to record by exactly the person who
    // needs to record it — the one being blocked.
    const canWriteEither =
      (await this.canWrite(actor, issue.projectId)) ||
      (await this.canWrite(actor, other.projectId));
    if (!canWriteEither) {
      throw new ForbiddenError("You need write access to one of these projects to link them.");
    }

    // Resolve the stored direction. `inward` flips the row so the OTHER issue
    // is the source — "this is blocked by that" is "that blocks this".
    let sourceId = input.direction === "inward" ? other.id : issueId;
    let targetId = input.direction === "inward" ? issueId : other.id;

    // BR-3: symmetric links get one canonical orientation, or the unique index
    // cannot tell that A↔B and B↔A are the same fact.
    if (input.type === "RELATES_TO" && sourceId > targetId) {
      [sourceId, targetId] = [targetId, sourceId];
    }

    if ((await DependencyRepository.countForIssue(issueId)) >= MAX_LINKS_PER_ISSUE) {
      throw new ConflictError(
        `An issue can hold at most ${MAX_LINKS_PER_ISSUE} links. Remove one before adding another.`,
      );
    }

    // BR-7. Only BLOCKS forms an ordering, so only BLOCKS can be unschedulable
    // — the walk is skipped entirely for the other two.
    if (input.type === "BLOCKS") {
      const cycle = await DependencyRepository.findBlockingPath(sourceId, targetId);
      if (cycle.found) {
        throw new ConflictError(
          cycle.path
            // The path is the EXISTING chain; the new edge is what would close
            // it. Repeating the first key at the end makes the ring visible —
            // "A → B → C" alongside the words "a loop" reads as a
            // contradiction unless you already know what is being added.
            ? `That would create a blocking loop: ${[...cycle.path, cycle.path[0]].join(" → ")}. Nothing in a loop can ever start.`
            : "That would create a blocking loop, or the chain is too long to verify. Simplify the existing links first.",
        );
      }
    }

    try {
      const row = await DependencyRepository.create({
        organizationId: actor.organizationId,
        sourceId,
        targetId,
        type: input.type,
        actorId: actor.userId,
      });
      const isSource = row.sourceId === issueId;
      const far = isSource ? row.target : row.source;
      const relation = relationFor(row.type, isSource);
      return {
        id: row.id,
        relation,
        issue: toLinkedIssue(far, new Set([far.projectId])),
        blocking: relation === "IS_BLOCKED_BY" && far.status !== "DONE",
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("These two issues are already linked that way.");
      }
      throw error;
    }
  },

  /** Remove a link (BR-11). */
  async remove(actor: Actor, linkId: string): Promise<void> {
    const link = await DependencyRepository.findById(linkId);
    // Someone else's tenant is indistinguishable from absent.
    if (!link || link.organizationId !== actor.organizationId) {
      throw new NotFoundError("Link not found.");
    }
    const canWriteEither =
      (await this.canWrite(actor, link.source.projectId)) ||
      (await this.canWrite(actor, link.target.projectId));
    if (!canWriteEither) {
      throw new ForbiddenError("You need write access to one of these projects to unlink them.");
    }
    await DependencyRepository.remove(linkId);
  },

  /** Open blocker keys for one issue — the badge and the confirm (BR-8). */
  async openBlockerKeys(issueId: string): Promise<string[]> {
    const rows = await DependencyRepository.openBlockersOf(issueId);
    return rows.map((r) => r.source.key);
  },

  /**
   * BR-9 — tell whoever was waiting that they no longer are.
   *
   * Called by the issue service right after a successful move to DONE. The
   * highest-value half of this whole module: a dependency you have to poll is
   * one you find out about late. Best-effort like all notifications (ADR-0019),
   * so it can never fail the transition that triggered it.
   */
  async notifyUnblocked(
    actor: Actor,
    blocker: { id: string; key: string },
  ): Promise<void> {
    try {
      const targets = await DependencyRepository.newlyUnblockedTargets(blocker.id);
      for (const target of targets) {
        await NotificationService.issueUnblocked(actor, {
          issueId: target.id,
          issueKey: target.key,
          issueTitle: target.title,
          blockerKey: blocker.key,
          recipientIds: [target.assigneeId, target.reporterId],
        });
      }
    } catch (error) {
      logSwallowed("dependencies.notifyUnblocked", error);
    }
  },

  // ── shared guards ─────────────────────────────────────────────────────────

  /** The issue's project must exist in this tenant and be visible. */
  async assertCanView(actor: Actor, projectId: string): Promise<void> {
    const context = await ProjectService.getContext(projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Issue not found.");
    }
  },

  async canWrite(actor: Actor, projectId: string): Promise<boolean> {
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
    return canWriteContent(role);
  },

  /** The viewer's projects — the same rule as ADR-0040 §1. */
  async visibleProjectIds(actor: Actor): Promise<string[]> {
    if (actor.orgRole === "ADMIN") {
      return (await SavedViewRepository.allProjectIds(actor.organizationId)).map((p) => p.id);
    }
    return (
      await SavedViewRepository.memberProjectIds(actor.organizationId, actor.userId)
    ).map((m) => m.projectId);
  },
};

/**
 * The far end of a link, masked when the viewer cannot see its project (BR-6).
 *
 * The link itself still appears. Dropping the row would make the panel silently
 * incomplete — "nothing is blocking this" is a much worse lie than "something
 * you can't see is".
 */
function toLinkedIssue(row: Endpoint, visibleProjectIds: Set<string>): LinkedIssueDto {
  if (!visibleProjectIds.has(row.projectId)) {
    return { restricted: true, id: null, key: null };
  }
  return {
    restricted: false,
    id: row.id,
    key: row.key,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    projectId: row.projectId,
    projectKey: row.project.key,
    assignee: row.assignee,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
