// When does a piece of work happen? (ADR-0035 §2)
//
// This is deliberately not a workload type. Workload is the first consumer;
// Gantt/Timeline and Calendar (V2 Epic 6) must answer the same question the
// same way, and Jira's own architecture separates one scheduling engine from
// the views built on it.

// Where a resolved window's dates came from. Carried through to the UI so an
// inferred number can be marked as inferred — Jira renders an "S" beside a date
// it took from a sprint, and an inference engine that hides its inferences is
// not trustworthy.
export type DateSource =
  // The issue's own start and due dates. Dormant: `Issue.startDate` does not
  // exist yet (WL-4, owned by the Gantt module).
  | "ISSUE_DATES"
  // A due date with no start date. Spread from today, per Asana.
  | "DUE_ONLY"
  // Inferred from the sprint the issue is committed to, per Jira's
  // "use sprint dates when work items don't have start and end dates".
  | "SPRINT_DATES";

export type ResolvedWindow =
  // Work that falls in the future: spread evenly across the working days from
  // `from` to `to` inclusive.
  | { kind: "SCHEDULED"; from: Date; to: Date; source: DateSource }
  // The window closed before today — a missed due date, or an issue still open
  // in a sprint that has already ended.
  | { kind: "OVERDUE"; source: DateSource }
  // No dates anywhere. Not a failure: knowing how much work carries no date at
  // all is the most useful thing the grid tells a manager on day one.
  | { kind: "UNSCHEDULED" };

// The date-bearing fields the chain reads. A plain shape rather than the Prisma
// row, so this module never depends on the schema — and so `startDate` can be
// threaded through before the column exists.
export interface SchedulableIssue {
  startDate: Date | null;
  dueDate: Date | null;
  sprintStartDate: Date | null;
  sprintEndDate: Date | null;
}

// Effort placed against a fixed horizon of week buckets. `later` holds whatever
// spreads past the last bucket: our horizon is fixed where ClickUp's and
// Asana's scroll, so without it a task due ten weeks out would silently lose
// most of its effort (ADR-0035 §3).
export interface WeeklyDistribution {
  weeks: number[];
  later: number;
}
