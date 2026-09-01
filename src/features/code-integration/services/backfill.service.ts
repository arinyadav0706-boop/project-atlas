import { randomBytes } from "node:crypto";
import {
  BackfillRepository,
  type CodeRepositoryRow,
  type DecryptedCredential,
} from "@/features/code-integration/repositories/backfill.repository";
import { CodeIntegrationRepository } from "@/features/code-integration/repositories/code-integration.repository";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { apiClientFor, credentialFor } from "@/features/code-integration/lib/registry";
import { RateLimitedError } from "@/features/code-integration/lib/http";
import { findIssueKeysIn } from "@/features/code-integration/lib/issue-keys";
import { searchableText, type CodeEvent, type CodeProviderId } from "@/features/code-integration/lib/provider";
import type { Page } from "@/features/code-integration/lib/api-client";
import type { BackfillPhaseDto } from "@/features/code-integration/types/code-integration.types";
import { encryptionAvailable } from "@/shared/lib/secret-box";
import { assertProviderUrl } from "@/shared/lib/outbound-url";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { logSwallowed } from "@/shared/lib/swallowed";
import type { Actor } from "@/shared/types/actor";

// Walking a repository's history (ADR-0054, 35_code_backfill.md).
//
// The shape to keep in mind: a run is a ROW, not a process. Every slice claims
// the row, does a bounded amount of work, writes back a phase and a cursor, and
// releases it. Nothing lives in memory between slices, so a container dying
// mid-walk costs one slice rather than the whole repository — which is the
// property that makes a 40-minute walk survivable on a platform that recycles
// containers whenever it likes.

/**
 * How many provider pages one slice will fetch.
 *
 * Bounded so a slice fits comfortably inside a scheduler tick and inside the
 * request that "Run now" makes. Higher finishes sooner and risks a timeout
 * halfway through; lower is slower but never in doubt.
 */
const PAGES_PER_SLICE = 5;

/** Runs drained per tick. More would starve recurrences and webhook retries. */
const RUNS_PER_TICK = 3;

const PHASE_ORDER: BackfillPhaseDto[] = ["MERGE_REQUESTS", "BRANCHES", "COMMITS", "DONE"];

/** Cursor for the COMMITS phase, which walks a list of branches one at a time. */
interface CommitCursor {
  branches: string[];
  index: number;
  inner: string | null;
}

interface SliceOutcome {
  status: "PROGRESSED" | "DONE" | "PAUSED" | "FAILED";
  scanned: number;
  linked: number;
  resumeAfter?: Date;
  error?: string;
}

export const BackfillService = {
  // ── Install ───────────────────────────────────────────────────────────────

  /**
   * Begin an app install / OAuth handshake.
   *
   * The encryption check happens HERE, before the browser leaves, rather than
   * on the way back: discovering the key is missing after somebody has already
   * authorised an app means a granted credential we cannot store and an install
   * they have to undo by hand on the git host.
   */
  async startAuthorization(
    actor: Actor,
    connectionId: string,
    input: { redirectUri: string; returnTo?: string },
  ): Promise<{ url: string }> {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    if (!encryptionAvailable()) {
      throw new ValidationError(
        "This deployment cannot store git-host credentials yet: CREDENTIAL_ENCRYPTION_KEY is not set.",
      );
    }
    assertProviderUrl(connection.baseUrl);

    const credential = credentialFor(connection.provider as CodeProviderId);
    if (!credential.configured()) {
      throw new ValidationError(credential.configurationHint());
    }

    const state = randomBytes(32).toString("base64url");
    const started = credential.authorizeUrl({
      baseUrl: connection.baseUrl,
      redirectUri: input.redirectUri,
      state,
    });

    await BackfillRepository.createAuthState({
      state,
      connectionId: connection.id,
      codeVerifier: started.codeVerifier ?? null,
      returnTo: input.returnTo ?? null,
      // Long enough to read a consent screen, short enough that a state left in
      // a browser tab overnight is not still usable.
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      actorId: actor.userId,
    });
    // Opportunistic, and cheap: without it the table only ever grows.
    void BackfillRepository.purgeExpiredAuthStates(new Date()).catch((error) =>
      logSwallowed("backfill.purgeAuthStates", error),
    );

    return { url: started.url };
  },

  /**
   * Finish the handshake.
   *
   * Deliberately takes no `Actor`: this is a redirect from the git host, and
   * the thing that authorises it is the single-use state, not a session
   * (35/BR-14). Consuming the state is a `DELETE … RETURNING`, so a replayed
   * callback finds nothing.
   */
  async completeAuthorization(input: {
    state: string;
    code?: string;
    installationId?: string;
    redirectUri: string;
  }): Promise<{ connectionId: string; returnTo: string | null }> {
    const pending = await BackfillRepository.consumeAuthState(input.state);
    if (!pending) throw new NotFoundError("That authorisation link has already been used.");
    if (pending.expiresAt.getTime() < Date.now()) {
      throw new ValidationError("That authorisation link has expired. Start again.");
    }

    const connection = await CodeIntegrationRepository.findById(pending.connectionId);
    if (!connection) throw new NotFoundError("Connection not found.");
    assertProviderUrl(connection.baseUrl);

    const credential = credentialFor(connection.provider as CodeProviderId);
    const granted = await credential.exchange({
      baseUrl: connection.baseUrl,
      redirectUri: input.redirectUri,
      code: input.code,
      codeVerifier: pending.codeVerifier,
      installationId: input.installationId,
    });

    await BackfillRepository.upsertCredential({
      connectionId: connection.id,
      ...granted,
      // Attributed to whoever started the handshake — carried on the state row,
      // because the callback itself arrives without a session.
      actorId: pending.createdBy ?? connection.id,
    });
    await CodeIntegrationRepository.setAuthMode(connection.id, "APP");

    return { connectionId: connection.id, returnTo: pending.returnTo };
  },

  async disconnect(actor: Actor, connectionId: string): Promise<void> {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    await BackfillRepository.deleteCredential(connection.id);
    await CodeIntegrationRepository.setAuthMode(connection.id, "WEBHOOK_ONLY");
  },

  // ── Token access ──────────────────────────────────────────────────────────

  /**
   * A token good for the next few minutes, refreshing if needed.
   *
   * The ordering here is 35/BR-3 and it is not negotiable: for GitLab the
   * refresh token is **dead the instant `refresh()` returns**, so the new pair
   * is persisted before the access token is handed to anybody. Using the token
   * first and saving after would, on a crash in between, leave a connection
   * that can never refresh again and can only be fixed by a human
   * re-authorising it.
   */
  async accessToken(connection: { id: string; provider: string; baseUrl: string }): Promise<string> {
    const stored = await BackfillRepository.findCredential(connection.id);
    if (!stored) {
      throw new ValidationError("This connection is not linked to a git host account.");
    }
    const credential = credentialFor(connection.provider as CodeProviderId);
    if (!credential.needsRefresh(toStored(stored), new Date())) {
      return stored.accessToken;
    }

    const granted = await credential.refresh({
      baseUrl: connection.baseUrl,
      current: toStored(stored),
    });
    await BackfillRepository.upsertCredential({
      connectionId: connection.id,
      ...granted,
      installationId: granted.installationId ?? stored.installationId,
      actorId: connection.id,
    });
    return granted.accessToken;
  },

  // ── Repositories ──────────────────────────────────────────────────────────

  /** Ask the provider what this install can see, and reconcile our list. */
  async refreshRepositories(actor: Actor, connectionId: string) {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    const token = await this.accessToken(connection);
    const client = apiClientFor(connection.provider as CodeProviderId);

    const seen: { externalId: string; path: string; defaultBranch: string | null }[] = [];
    let cursor: string | null = null;
    // Bounded: an install on an organisation with thousands of repositories
    // should fill a picker, not walk forever.
    for (let fetched = 0; fetched < 20; fetched++) {
      const page = await client.listRepositories({
        baseUrl: connection.baseUrl,
        accessToken: token,
        cursor,
      });
      seen.push(...page.items);
      cursor = page.cursor;
      if (!cursor || page.shouldPause) break;
    }

    await BackfillRepository.syncRepositories(connection.id, seen, actor.userId);
    return BackfillRepository.listRepositories(connection.id);
  },

  async listRepositories(actor: Actor, connectionId: string) {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    return BackfillRepository.listRepositories(connection.id);
  },

  async setRepositoriesEnabled(
    actor: Actor,
    connectionId: string,
    input: { ids: string[]; enabled: boolean },
  ) {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    await BackfillRepository.setRepositoryEnabled(
      connection.id,
      input.ids,
      input.enabled,
      actor.userId,
    );
    return BackfillRepository.listRepositories(connection.id);
  },

  // ── Runs ──────────────────────────────────────────────────────────────────

  /**
   * Queue a run per enabled repository, then drain one slice immediately.
   *
   * The immediate slice is 35/BR-12: GL-10 says the scheduler is not configured
   * in production, and a button that queues work nothing will ever pick up is a
   * button that gets reported as broken.
   */
  async start(actor: Actor, connectionId: string) {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    if (connection.authMode !== "APP") {
      throw new ValidationError("Connect this git host before backfilling.");
    }
    const repositories = await BackfillRepository.listEnabledRepositories(connection.id);
    if (repositories.length === 0) {
      throw new ValidationError("Choose at least one repository to scan.");
    }

    const since = new Date(Date.now() - connection.backfillDays * 24 * 60 * 60 * 1000);
    const queued: string[] = [];
    for (const repository of repositories) {
      // One active run per repository — a second click must not double the work.
      const active = await BackfillRepository.findActiveRun(repository.id);
      if (active) continue;
      const run = await BackfillRepository.createRun({
        repositoryId: repository.id,
        since,
        actorId: actor.userId,
      });
      queued.push(run.id);
    }

    await this.runDue(new Date(), 1);
    return { queued: queued.length, repositories: repositories.length };
  },

  async status(actor: Actor, connectionId: string) {
    const connection = await CodeIntegrationService.require(actor, connectionId);
    const repositories = await BackfillRepository.listRepositories(connection.id);
    const runs = await BackfillRepository.listRuns(repositories.map((r) => r.id));
    return { repositories, runs };
  },

  /**
   * The scheduler's entry point, and "Run now"'s. Same function, two callers
   * (35/BR-12).
   */
  async runDue(now = new Date(), limit = RUNS_PER_TICK) {
    const due = await BackfillRepository.dueRuns(now, limit);
    let processed = 0;
    for (const run of due) {
      const claimed = await BackfillRepository.claim(run.id, run.version, now);
      // Lost the race to another tick. Not an error — the other one has it.
      if (!claimed) continue;
      processed++;
      try {
        await this.slice(run.id, run.repository);
      } catch (error) {
        logSwallowed(`backfill.slice(${run.id})`, error);
        await BackfillRepository.finish(run.id, "FAILED", {
          error: String(error).slice(0, 500),
          finishedAt: new Date(),
        });
      }
    }
    return { claimed: processed, due: due.length };
  },

  /** One bounded unit of work against one repository. */
  async slice(runId: string, repository: CodeRepositoryRow): Promise<SliceOutcome> {
    const connection = await CodeIntegrationRepository.findById(repository.connectionId);
    if (!connection) {
      await BackfillRepository.finish(runId, "FAILED", {
        error: "The connection was deleted.",
        finishedAt: new Date(),
      });
      return { status: "FAILED", scanned: 0, linked: 0 };
    }

    const runs = await BackfillRepository.listRuns([repository.id], 1);
    const run = runs.find((r) => r.id === runId);
    if (!run) return { status: "FAILED", scanned: 0, linked: 0 };

    const provider = connection.provider as CodeProviderId;
    const client = apiClientFor(provider);
    const projectKeys = await CodeIntegrationRepository.projectKeys(connection.organizationId);

    let token: string;
    try {
      token = await this.accessToken(connection);
    } catch (error) {
      await BackfillRepository.finish(runId, "FAILED", {
        error: `Could not get an access token: ${String(error).slice(0, 300)}`,
        finishedAt: new Date(),
      });
      return { status: "FAILED", scanned: 0, linked: 0 };
    }

    let phase = run.phase;
    let cursor = run.cursor as unknown;
    let scanned = run.scanned;
    let linked = run.linked;

    for (let fetched = 0; fetched < PAGES_PER_SLICE && phase !== "DONE"; fetched++) {
      let page: Page<CodeEvent>;
      try {
        page = await this.fetchPage({
          client,
          phase,
          cursor,
          connection,
          repository,
          token,
          since: run.since,
        });
      } catch (error) {
        if (error instanceof RateLimitedError) {
          // Not a failure (35/BR-11). The cursor is untouched, so the next tick
          // picks up exactly where this one stopped.
          await BackfillRepository.saveProgress(runId, { phase, scanned, linked });
          await BackfillRepository.finish(runId, "PAUSED", { resumeAfter: error.resumeAfter });
          return { status: "PAUSED", scanned, linked, resumeAfter: error.resumeAfter };
        }
        throw error;
      }

      for (const event of page.items) {
        scanned++;
        linked += await this.link(connection, event, projectKeys);
      }

      if (page.cursor) {
        cursor = this.advanceCursor(phase, cursor, page.cursor);
      } else {
        const next = this.nextCursorForPhase(phase, cursor);
        if (next.samePhase) {
          cursor = next.cursor;
        } else {
          phase = PHASE_ORDER[PHASE_ORDER.indexOf(phase) + 1]!;
          cursor = await this.startCursorFor(phase, repository, connection, token, client, run.since);
        }
      }

      await BackfillRepository.saveProgress(runId, {
        phase,
        cursor: (cursor ?? null) as never,
        scanned,
        linked,
      });

      if (page.shouldPause) {
        // Quota is nearly gone. Stop politely rather than taking the last of it
        // — the webhook path and the interactive screens need it more.
        await BackfillRepository.finish(runId, "PAUSED", {
          resumeAfter: new Date(Date.now() + 15 * 60 * 1000),
        });
        return { status: "PAUSED", scanned, linked };
      }
    }

    if (phase === "DONE") {
      await BackfillRepository.markRepositoryBackfilled(repository.id, new Date());
      await BackfillRepository.finish(runId, "SUCCEEDED", { finishedAt: new Date() });
      return { status: "DONE", scanned, linked };
    }

    // Out of slice budget with work left: back to QUEUED so the next tick
    // claims it. The cursor is already saved.
    await BackfillRepository.finish(runId, "QUEUED");
    return { status: "PROGRESSED", scanned, linked };
  },

  // ── Internals ─────────────────────────────────────────────────────────────

  async fetchPage(input: {
    client: ReturnType<typeof apiClientFor>;
    phase: BackfillPhaseDto;
    cursor: unknown;
    connection: { baseUrl: string };
    repository: CodeRepositoryRow;
    token: string;
    since: Date;
  }): Promise<Page<CodeEvent>> {
    const base = {
      baseUrl: input.connection.baseUrl,
      accessToken: input.token,
      repositoryPath: input.repository.path,
      since: input.since,
    };
    if (input.phase === "MERGE_REQUESTS") {
      return input.client.listMergeRequests({ ...base, cursor: asString(input.cursor) });
    }
    if (input.phase === "BRANCHES") {
      return input.client.listBranches({ ...base, cursor: asString(input.cursor) });
    }
    const commits = input.cursor as CommitCursor | null;
    const branch = commits?.branches[commits.index];
    if (!branch) return { items: [], cursor: null, shouldPause: false };
    return input.client.listCommits({ ...base, cursor: commits!.inner, branch });
  },

  /**
   * Link one event exactly as a webhook would (35/BR-6).
   *
   * Through `CodeIntegrationService.linkEvent`, not a copy of it: two writers
   * is how a backfilled merge request slowly stops matching a webhooked one.
   */
  async link(
    connection: { id: string; provider: string; organizationId: string },
    event: CodeEvent,
    projectKeys: string[],
  ): Promise<number> {
    const matches = findIssueKeysIn(searchableText(event), projectKeys);
    if (matches.length === 0) return 0;
    const issues = await CodeIntegrationRepository.findIssuesByKeys(
      connection.organizationId,
      matches.map((m) => m.key),
    );
    let linked = 0;
    for (const issue of issues) {
      linked += await CodeIntegrationService.linkEvent(connection, issue, event, projectKeys);
    }
    return linked;
  },

  advanceCursor(phase: BackfillPhaseDto, current: unknown, next: string): unknown {
    if (phase !== "COMMITS") return next;
    const commits = (current ?? { branches: [], index: 0, inner: null }) as CommitCursor;
    return { ...commits, inner: next };
  },

  /** Within COMMITS, moving to the next branch is not a phase change. */
  nextCursorForPhase(
    phase: BackfillPhaseDto,
    current: unknown,
  ): { samePhase: boolean; cursor: unknown } {
    if (phase !== "COMMITS") return { samePhase: false, cursor: null };
    const commits = current as CommitCursor | null;
    if (!commits) return { samePhase: false, cursor: null };
    const index = commits.index + 1;
    if (index >= commits.branches.length) return { samePhase: false, cursor: null };
    return { samePhase: true, cursor: { ...commits, index, inner: null } };
  },

  /**
   * What the COMMITS phase walks.
   *
   * The default branch, plus branches whose names contain a known key. NOT
   * every branch: a repository with 800 stale branches would be 800 walks, and
   * the commits anybody cares about are either on a feature branch named after
   * the issue or already merged to the default one.
   *
   * The gap this leaves is real and recorded (backlog BF-4): a commit naming an
   * issue, on a branch that does not, never merged, is not found.
   */
  async startCursorFor(
    phase: BackfillPhaseDto,
    repository: CodeRepositoryRow,
    connection: { baseUrl: string; organizationId: string },
    token: string,
    client: ReturnType<typeof apiClientFor>,
    since: Date,
  ): Promise<unknown> {
    if (phase !== "COMMITS") return null;
    const projectKeys = await CodeIntegrationRepository.projectKeys(connection.organizationId);
    const branches = new Set<string>();
    if (repository.defaultBranch) branches.add(repository.defaultBranch);

    let cursor: string | null = null;
    for (let fetched = 0; fetched < 5; fetched++) {
      const page = await client.listBranches({
        baseUrl: connection.baseUrl,
        accessToken: token,
        repositoryPath: repository.path,
        since,
        cursor,
      });
      for (const event of page.items) {
        if (event.kind !== "PUSH") continue;
        if (findIssueKeysIn([event.branch], projectKeys).length > 0) branches.add(event.branch);
      }
      cursor = page.cursor;
      if (!cursor || page.shouldPause) break;
    }
    return { branches: [...branches], index: 0, inner: null } satisfies CommitCursor;
  },
};

function asString(cursor: unknown): string | null {
  return typeof cursor === "string" ? cursor : null;
}

function toStored(credential: DecryptedCredential) {
  return {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    expiresAt: credential.expiresAt,
    installationId: credential.installationId,
  };
}

/** Only an org ADMIN reaches any of this (35/BR-13) — enforced by `require`. */
export function assertBackfillAdmin(actor: Actor): void {
  if (actor.orgRole !== "ADMIN") {
    throw new ForbiddenError("Only an organisation admin can manage code backfill.");
  }
}
