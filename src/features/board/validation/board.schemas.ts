// The board's filter parsing now lives in the shared issue filter schema
// (`features/issues/validation/issue-filter.schemas.ts`) — Backlog parses the
// same query contract, and two hand-written parsers would drift. Re-exported
// under the board's own names so existing imports and docs still read.
export {
  issueFilterSchema as boardFilterSchema,
  parseIssueFilter,
  type IssueFilterInput as BoardFilterInput,
} from "@/features/issues/validation/issue-filter.schemas";
