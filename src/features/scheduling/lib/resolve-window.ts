// The resolution chain (ADR-0035 §2): given what a team actually records about
// an issue, when does its remaining effort happen?
//
// Ordered, first match wins. Jira's precedence (an explicit date beats an
// inferred one), Asana's fallback (no start date means "from today"), ClickUp's
// bucket for work carrying no dates at all.
import { startOfUtcDay } from "@/features/scheduling/lib/weeks";
import type {
  DateSource,
  ResolvedWindow,
  SchedulableIssue,
} from "@/features/scheduling/types/scheduling.types";

interface Candidate {
  from: Date;
  to: Date;
  source: DateSource;
}

// The chain, before the today-relative adjustments below.
function candidate(issue: SchedulableIssue, today: Date): Candidate | null {
  // 1. The issue's own range. Dormant until `Issue.startDate` exists (WL-4):
  //    the caller always passes null today. Written now because it is the whole
  //    cost of adding the field later — one branch, in one function.
  if (issue.startDate && issue.dueDate) {
    return { from: issue.startDate, to: issue.dueDate, source: "ISSUE_DATES" };
  }

  // 2. A due date and nothing else. Asana spreads such a task from today to the
  //    due date rather than lumping it in the due week, which would invent a
  //    quiet month followed by one impossible week.
  if (issue.dueDate) {
    return { from: today, to: issue.dueDate, source: "DUE_ONLY" };
  }

  // 3. The sprint's window. Committing to a sprint is a date commitment, and
  //    this is Jira's "use sprint dates when work items don't have start and
  //    end dates" — inferred, so the UI marks it.
  if (issue.sprintStartDate && issue.sprintEndDate) {
    return { from: issue.sprintStartDate, to: issue.sprintEndDate, source: "SPRINT_DATES" };
  }

  return null;
}

export function resolveWindow(issue: SchedulableIssue, now: Date): ResolvedWindow {
  const today = startOfUtcDay(now);
  const match = candidate(issue, today);
  if (!match) return { kind: "UNSCHEDULED" };

  const to = startOfUtcDay(match.to);

  // The window closed before today. Covers a missed due date and an issue still
  // open in a sprint that has already ended — both are work that should already
  // have happened, and neither belongs in a future week.
  if (to.getTime() < today.getTime()) return { kind: "OVERDUE", source: match.source };

  // Effort cannot be scheduled into days that have already passed: a sprint
  // that started three days ago has three fewer days to spread across.
  const from = startOfUtcDay(match.from);
  return {
    kind: "SCHEDULED",
    from: from.getTime() < today.getTime() ? today : from,
    to,
    source: match.source,
  };
}
