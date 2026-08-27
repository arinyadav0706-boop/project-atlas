import type { CodeProviderId } from "@/features/code-integration/lib/provider";

// DTOs for code integration (ADR-0053, 34_code_integration.md).

export type { CodeProviderId };
export type CodeLinkKindDto = "BRANCH" | "COMMIT" | "MERGE_REQUEST";
export type CodeLinkStateDto = "OPEN" | "MERGED" | "CLOSED" | "NONE";

export interface CodeConnectionDto {
  id: string;
  name: string;
  provider: CodeProviderId;
  baseUrl: string;
  active: boolean;
  /** Null means "do nothing when a merge request merges" — the default (BR-7). */
  onMergeStatusId: string | null;
  /** Answers "is this hook actually wired up", the first question anybody asks. */
  lastEventAt: string | null;
  createdAt: string;
  /** Where the git host should POST. Built from the request's own origin. */
  webhookUrl: string | null;
  /** What to tick on the other side, in that provider's own words. */
  eventsToEnable: string[];
}

export interface CodeLinkDto {
  id: string;
  kind: CodeLinkKindDto;
  externalId: string;
  title: string;
  url: string;
  state: CodeLinkStateDto;
  authorName: string | null;
  repository: string;
  pipelineStatus: string | null;
  occurredAt: string;
}

/**
 * What one inbound delivery did.
 *
 * `ok` is about the SENDER, not about whether anything was linked: an event
 * with no issue key is a perfectly good delivery that produced nothing, and
 * telling GitLab otherwise gets the hook disabled (BR-8).
 */
export interface IngestOutcome {
  ok: boolean;
  status?: number;
  reason: string;
  linked?: number;
}
