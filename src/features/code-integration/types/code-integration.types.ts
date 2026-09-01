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
  /** WEBHOOK_ONLY until a provider app is installed (ADR-0054 §1). */
  authMode: "WEBHOOK_ONLY" | "APP";
  /** How far back a backfill reaches (35/BR-9). */
  backfillDays: number;
  /** Whose account the app is installed on, when there is one. */
  connectedAccount?: string | null;
}

export interface CodeRepositoryDto {
  id: string;
  path: string;
  defaultBranch: string | null;
  enabled: boolean;
  lastBackfillAt: string | null;
}

/**
 * Mirrors the Prisma enums, declared here rather than imported.
 *
 * `@prisma/client` is confined to `*.repository.ts` (Feature Architecture §4),
 * and a service that needs to name a phase should not be the exception that
 * drags the ORM into the service layer. An integration test compares these
 * against the database's own enum values so the pair cannot drift.
 */
export type BackfillStatusDto =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";
export type BackfillPhaseDto = "MERGE_REQUESTS" | "BRANCHES" | "COMMITS" | "DONE";

export interface BackfillRunDto {
  id: string;
  repositoryId: string;
  status: BackfillStatusDto;
  phase: BackfillPhaseDto;
  scanned: number;
  linked: number;
  /** Set while rate-limited, so the UI says when rather than showing red. */
  resumeAfter: string | null;
  error: string | null;
  since: string;
  finishedAt: string | null;
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
