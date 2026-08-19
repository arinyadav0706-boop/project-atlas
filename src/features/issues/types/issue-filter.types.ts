import type {
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";
import type { CustomFieldPredicate } from "@/features/custom-fields/lib/field-predicate";

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
  /**
   * Narrows a cross-project query to these projects (ADR-0040 §1).
   *
   * It is NOT the query's scope. The service resolves what the viewer may see
   * from membership and intersects; a project named here that the viewer
   * cannot access is dropped. Project-scoped surfaces (Board, Backlog) ignore
   * this field — their project comes from the route.
   */
  projectIds?: string[];
  /**
   * Board expresses status as columns and Backlog ignores it, which is why the
   * shared filter did not need it until a flat cross-project list existed.
   */
  status?: IssueStatusDto;
  /**
   * Everything except DONE.
   *
   * "Open" is the single most-asked question in a tracker and cannot be spelled
   * with `status`, which holds one value. It also makes the Workload banner's
   * link mean what the banner says: that sentence counts OPEN unestimated
   * issues, and without this the link showed finished ones too.
   *
   * Ignored when `status` is set — the specific answer wins over the coarse one.
   */
  openOnly?: boolean;
  /**
   * Tri-state. `false` is "nobody has estimated this" — the query behind
   * Workload's estimate-coverage banner (UI-6).
   */
  hasEstimate?: boolean;
  sprintId?: string;
  epicId?: string;
  assigneeId?: string;
  type?: IssueTypeDto;
  /**
   * Whether subtasks take part in this query (ADR-0045 §6) — Jira's
   * `type != Sub-task`, as a first-class control rather than a type filter
   * someone has to remember.
   *
   * Absent means "include them", which is what a cross-project list, a saved
   * view and a dashboard widget should all do: a subtask is a real open issue
   * and hiding it from a count would make the count wrong.
   *
   * The Backlog pins `exclude` and does not let a caller override it — a
   * backlog listing subtasks is not a backlog (BR-5).
   */
  subtask?: "only" | "exclude";
  /**
   * Issues with at least one **open** blocker (ADR-0046 §7) — the query behind
   * "what is my team waiting on".
   *
   * Deliberately open blockers, not any blocker: an issue blocked by work that
   * is already finished is not blocked. `false` is the complement (nothing
   * unfinished is in its way), which is why this is tri-state rather than a
   * truthiness check.
   */
  blocked?: boolean;
  priority?: IssuePriorityDto;
  labelIds?: string[];
  componentIds?: string[];
  /** Case-insensitive substring of the title. */
  search?: string;
  /**
   * Custom-field predicates (ADR-0043). The open-ended part of an otherwise
   * closed shape.
   *
   * A predicate carries a field id but NOT its type: the service resolves that
   * from the definitions, because a client-supplied type could aim a NUMBER
   * field at the text column. Predicates naming an unknown or deleted field are
   * dropped rather than erroring, so a saved view outliving one of its fields
   * still opens.
   */
  customFields?: CustomFieldPredicate[];
}

// Longest reasonable free-text query. Bounded so a filter can never become an
// unbounded scan driver, and so the value is safe to echo back to the client.
export const MAX_ISSUE_SEARCH_LENGTH = 100;
