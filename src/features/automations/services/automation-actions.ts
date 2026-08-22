import { AutomationRepository } from "@/features/automations/repositories/automation.repository";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { describeAction } from "@/features/automations/lib/engine";
import type { Actor } from "@/shared/types/actor";
import type {
  AutomationAction,
  AutomationRunOutcomeDto,
} from "@/features/automations/types/automation.types";

// Performing a plan (ADR-0050 §9).
//
// Every action goes through the SERVICE layer, never a repository, so an
// automated write obeys every rule a person's write obeys — transition
// restrictions, the subtask-done guard, the status/category invariant, required
// fields, the unblock notification. An automation that wrote straight to the
// table would be a documented way round every rule the product has, which is
// how "the automation corrupted our data" happens.

export interface ActionOutcome {
  outcome: AutomationRunOutcomeDto;
  detail: string;
}

/**
 * The issue services, loaded on demand.
 *
 * `IssueService` dispatches automations after its writes, and automations write
 * through `IssueService` — a genuine cycle, and the only two honest ways out
 * are an indirection layer nobody else needs (rule 10) or this. A dynamic
 * import keeps the dependency real and readable, costs one cached module
 * lookup, and leaves the call sites plain.
 */
async function services() {
  const [{ IssueService }, { CommentService }] = await Promise.all([
    import("@/features/issues/services/issue.service"),
    import("@/features/comments/services/comment.service"),
  ]);
  return { IssueService, CommentService };
}

/**
 * Run one rule's actions, in order, and say what happened in one sentence.
 *
 * Failure semantics are BR-4 and acceptance criterion 3: an action that throws
 * stops the rest of THAT rule and logs `FAILED`, but the actions before it stay
 * applied and the person's own write is untouched. Half-applying is the
 * honest outcome — the alternative is undoing a status change somebody may
 * already have seen, which is a worse surprise than a logged failure.
 */
export async function runActions(input: {
  actor: Actor;
  issue: { id: string; key: string; projectId: string };
  actions: AutomationAction[];
  summary: string;
}): Promise<ActionOutcome> {
  const { actor, issue, actions } = input;
  const done: string[] = [];

  for (const action of actions) {
    try {
      done.push(await perform(actor, issue, action));
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      // BR-11: a rule referencing a status or a person that no longer exists
      // fails this run and leaves the issue alone. It does not disable itself —
      // a transient reference and a permanent one look identical from here.
      return {
        outcome: "FAILED",
        detail: done.length
          ? `${done.join("; ")}; then ${describeAction(action)} failed — ${why}`
          : `${describeAction(action)} failed — ${why}`,
      };
    }
  }
  return { outcome: "SUCCESS", detail: done.join("; ") || "Nothing to do." };
}

async function perform(
  actor: Actor,
  issue: { id: string; key: string; projectId: string },
  action: AutomationAction,
): Promise<string> {
  const { IssueService, CommentService } = await services();

  switch (action.kind) {
    case "SET_STATUS": {
      // BR-8: automation skips the optimistic-concurrency CHECK — there is no
      // stale client version to compare against — but not the increment. The
      // version is re-read immediately before each write, so a human edit that
      // lands in between still wins the next round rather than being silently
      // overwritten.
      const version = await requireVersion(issue.id);
      const row = await IssueService.transition(actor, issue.id, action.statusId, version);
      return `moved ${issue.key} to ${row.workflowStatus.name}`;
    }
    case "ASSIGN": {
      const version = await requireVersion(issue.id);
      const row = await IssueService.update(actor, issue.id, {
        assigneeId: action.userId,
        expectedVersion: version,
      });
      return action.userId
        ? `assigned ${issue.key} to ${row.assignee?.name ?? "someone"}`
        : `unassigned ${issue.key}`;
    }
    case "SET_PRIORITY": {
      const version = await requireVersion(issue.id);
      await IssueService.update(actor, issue.id, {
        priority: action.priority,
        expectedVersion: version,
      });
      return `set ${issue.key} to ${action.priority.toLowerCase()} priority`;
    }
    case "ADD_COMMENT": {
      // Authored by the RULE, not by whoever tripped the trigger (ADR-0050 §4).
      // `CommentService` reads that off the actor.
      await CommentService.create(actor, issue.id, { body: action.body });
      return `commented on ${issue.key}`;
    }
    case "NOTIFY": {
      const recipients = await resolveRecipients(issue.id, action);
      if (recipients.length === 0) {
        // Not a failure. "Notify the assignee" on an unassigned issue is a rule
        // working exactly as written on an issue that has nobody to tell.
        return `nobody to notify on ${issue.key}`;
      }
      await NotificationService.automationNotified(actor, {
        issueId: issue.id,
        issueKey: issue.key,
        ruleName: actor.automation?.ruleName ?? "an automation",
        recipientIds: recipients,
      });
      return `notified ${recipients.length} ${recipients.length === 1 ? "person" : "people"}`;
    }
  }
}

/**
 * The issue's version right now.
 *
 * Read per action rather than once per rule: action one changes the version
 * action two would send, and reusing a stale one would make every multi-action
 * rule fail its second step with a conflict.
 */
async function requireVersion(issueId: string): Promise<number> {
  const facts = await AutomationRepository.factsFor(issueId);
  if (!facts) throw new Error("the issue no longer exists");
  return facts.version;
}

async function resolveRecipients(
  issueId: string,
  action: Extract<AutomationAction, { kind: "NOTIFY" }>,
): Promise<string[]> {
  if (action.target === "USER") return action.userId ? [action.userId] : [];
  const facts = await AutomationRepository.factsFor(issueId);
  if (!facts) throw new Error("the issue no longer exists");
  const who = action.target === "ASSIGNEE" ? facts.assigneeId : facts.reporterId;
  return who ? [who] : [];
}
