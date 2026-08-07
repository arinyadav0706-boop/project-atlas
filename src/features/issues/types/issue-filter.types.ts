import type { IssuePriorityDto, IssueTypeDto } from "@/features/issues/types/issue.types";

// The composable issue filter, shared by every project-level list view
// (ADR-0008, generalised). Any subset may be empty; present fields combine
// with AND.
//
// This lives in `features/issues` rather than in the Board because the Board is
// not its owner — it was merely its first consumer. Backlog now reads the same
// shape, and a new consumer (list view, saved filters, an export) adds a
// consumer, not a second filter language. One type, one `where` builder
// (`issue-filter.repository.ts`), so two surfaces cannot drift into disagreeing
// about what "assignee = X" means.
export interface IssueFilter {
  sprintId?: string;
  epicId?: string;
  assigneeId?: string;
  type?: IssueTypeDto;
  priority?: IssuePriorityDto;
  labelIds?: string[];
  componentIds?: string[];
  /** Case-insensitive substring of the title. */
  search?: string;
}

// Longest reasonable free-text query. Bounded so a filter can never become an
// unbounded scan driver, and so the value is safe to echo back to the client.
export const MAX_ISSUE_SEARCH_LENGTH = 100;
