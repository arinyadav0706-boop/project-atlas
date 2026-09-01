import { randomBytes } from "node:crypto";
import {
  CodeIntegrationRepository,
  type CodeConnectionRow,
  type CodeLinkRow,
} from "@/features/code-integration/repositories/code-integration.repository";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { logSwallowed } from "@/shared/lib/swallowed";
import { automationActor, type Actor } from "@/shared/types/actor";
import { adapterFor } from "@/features/code-integration/lib/registry";
import { providerSetup } from "@/features/code-integration/lib/provider-catalog";
import { findIssueKeysIn } from "@/features/code-integration/lib/issue-keys";
import {
  searchableText,
  type CodeEvent,
  type CodeProviderId,
} from "@/features/code-integration/lib/provider";
import type {
  CodeConnectionDto,
  CodeLinkDto,
  IngestOutcome,
} from "@/features/code-integration/types/code-integration.types";

// Code connections, and turning an inbound webhook into links (ADR-0053).

/** Enough for a company with several git hosts; not a fan-out. */
export const MAX_CONNECTIONS_PER_ORG = 5;

function toConnectionDto(row: CodeConnectionRow, appUrl?: string): CodeConnectionDto {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as CodeProviderId,
    baseUrl: row.baseUrl,
    active: row.active,
    onMergeStatusId: row.onMergeStatusId,
    lastEventAt: row.lastEventAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    webhookUrl: appUrl ? `${appUrl}/api/integrations/code/${row.id}` : null,
    eventsToEnable: providerSetup(row.provider as CodeProviderId).eventsToEnable,
    authMode: row.authMode,
    backfillDays: row.backfillDays,
  };
}

function toLinkDto(row: CodeLinkRow): CodeLinkDto {
  return {
    id: row.id,
    kind: row.kind,
    externalId: row.externalId,
    title: row.title,
    url: row.url,
    state: row.state,
    authorName: row.authorName,
    repository: row.repository,
    pipelineStatus: row.pipelineStatus,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/** Connections hold a secret and span the org, so org ADMIN only (BR-10). */
function requireAdmin(actor: Actor): void {
  if (actor.orgRole !== "ADMIN") {
    throw new ForbiddenError("Only an organisation admin can manage code connections.");
  }
}

export const CodeIntegrationService = {
  async list(actor: Actor, appUrl?: string): Promise<CodeConnectionDto[]> {
    requireAdmin(actor);
    const rows = await CodeIntegrationRepository.list(actor.organizationId);
    return Promise.all(
      rows.map(async (row) => {
        const dto = toConnectionDto(row, appUrl);
        if (row.authMode !== "APP") return dto;
        // Whose account the app is installed on. Read from the summary query,
        // which selects the label and NOT the tokens — a connection list is the
        // last place a credential should be one spread away from a response.
        const { BackfillRepository } = await import(
          "@/features/code-integration/repositories/backfill.repository"
        );
        const summary = await BackfillRepository.credentialSummary(row.id);
        return { ...dto, connectedAccount: summary?.externalAccount ?? null };
      }),
    );
  },

  async create(
    actor: Actor,
    input: { name: string; provider: CodeProviderId; baseUrl: string },
    appUrl?: string,
  ): Promise<CodeConnectionDto & { secret: string }> {
    requireAdmin(actor);
    const count = await CodeIntegrationRepository.countForOrg(actor.organizationId);
    if (count >= MAX_CONNECTIONS_PER_ORG) {
      throw new ValidationError(
        `This organisation already has ${MAX_CONNECTIONS_PER_ORG} connections, which is the limit.`,
      );
    }
    this.assertBaseUrl(input.baseUrl);

    const secret = randomBytes(32).toString("base64url");
    const row = await CodeIntegrationRepository.create({
      organizationId: actor.organizationId,
      name: input.name,
      provider: input.provider,
      baseUrl: input.baseUrl.replace(/\/+$/, ""),
      secret,
      actorId: actor.userId,
    });
    // Shown once, beside the webhook URL — the two things needed to configure
    // the other end, together, at the moment somebody is doing it (BR-11).
    return { ...toConnectionDto(row, appUrl), secret };
  },

  async update(
    actor: Actor,
    id: string,
    input: { name?: string; active?: boolean; onMergeStatusId?: string | null; baseUrl?: string },
    appUrl?: string,
  ): Promise<CodeConnectionDto> {
    await this.require(actor, id);
    if (input.baseUrl) this.assertBaseUrl(input.baseUrl);
    const row = await CodeIntegrationRepository.update(
      id,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.onMergeStatusId !== undefined
          ? { onMergeStatusId: input.onMergeStatusId }
          : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl.replace(/\/+$/, "") } : {}),
      },
      actor.userId,
    );
    return toConnectionDto(row, appUrl);
  },

  async delete(actor: Actor, id: string): Promise<void> {
    await this.require(actor, id);
    await CodeIntegrationRepository.softDelete(id, actor.userId);
  },

  async require(actor: Actor, id: string) {
    requireAdmin(actor);
    const row = await CodeIntegrationRepository.findById(id);
    // Tenant scope (F-1): another org's connection is absent, not forbidden.
    if (!row || row.organizationId !== actor.organizationId) {
      throw new NotFoundError("Connection not found.");
    }
    return row;
  },

  /** Only a real host, so the panel's outbound links cannot be javascript:. */
  assertBaseUrl(raw: string): void {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ValidationError("That is not a valid URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ValidationError("The host URL has to be http or https.");
    }
  },

  /** The Development panel's data. Visible to anyone who can see the issue (BR-13). */
  async linksForIssue(issueId: string): Promise<CodeLinkDto[]> {
    const rows = await CodeIntegrationRepository.listForIssue(issueId);
    return rows.map(toLinkDto);
  },

  // ── Ingest ────────────────────────────────────────────────────────────────

  /**
   * Turn one inbound delivery into links.
   *
   * Returns a reason rather than throwing for anything the sender could not
   * have done differently (BR-8). A git host that sees errors disables the
   * hook, and then nothing works and nobody knows why — so an unrecognised or
   * unmatched delivery is a successful "nothing to do".
   */
  async ingest(input: {
    connectionId: string;
    headers: Headers;
    rawBody: string;
  }): Promise<IngestOutcome> {
    const connection = await CodeIntegrationRepository.findForWebhook(input.connectionId);
    if (!connection) return { ok: false, status: 404, reason: "No such connection." };

    const adapter = adapterFor(connection.provider as CodeProviderId);
    // The one thing that IS the sender's fault, and the one thing that gets a
    // non-200: a wrong secret must be loud, or a misconfigured hook silently
    // posts into the void forever.
    if (!adapter.verify({ headers: input.headers, rawBody: input.rawBody, secret: connection.secret })) {
      return { ok: false, status: 401, reason: "Signature or token did not verify." };
    }
    if (!connection.active) return { ok: true, reason: "Connection is disabled.", linked: 0 };

    void CodeIntegrationRepository.touch(connection.id).catch((error) =>
      logSwallowed("codeIntegration.touch", error),
    );

    const event = adapter.parse({
      headers: input.headers,
      rawBody: input.rawBody,
      baseUrl: connection.baseUrl,
    });
    // Note hooks, issue hooks, a tag push… all real, none modelled.
    if (!event) return { ok: true, reason: "Nothing in this event to link.", linked: 0 };

    if (event.kind === "PIPELINE") {
      const updated = await CodeIntegrationRepository.setPipelineStatus(
        connection.id,
        event.ref,
        event.status,
      );
      return { ok: true, reason: `Pipeline ${event.status}.`, linked: updated.count };
    }

    // BR-3: candidates filtered against the keys this org actually has.
    const projectKeys = await CodeIntegrationRepository.projectKeys(connection.organizationId);
    const matches = findIssueKeysIn(searchableText(event), projectKeys);
    if (matches.length === 0) {
      return { ok: true, reason: "No issue keys found.", linked: 0 };
    }

    // BR-9: resolution is org-scoped, so one company's VWP-1 can never be
    // touched by another company's GitLab.
    const issues = await CodeIntegrationRepository.findIssuesByKeys(
      connection.organizationId,
      matches.map((m) => m.key),
    );
    if (issues.length === 0) {
      return { ok: true, reason: "Keys matched no issues here.", linked: 0 };
    }

    // Per issue AND per text: a commit is linked only when its OWN message
    // names the issue (BR-2, and what Jira does). Linking every commit in a
    // push because the BRANCH matched would attach "merge main into
    // feature/VWP-1" and every chore commit alongside it, which is the noise
    // that makes people stop reading the panel.
    let linked = 0;
    for (const issue of issues) {
      linked += await this.linkEvent(connection, issue, event, projectKeys);
    }

    // BR-7. Opt-in, and only on the transition into merged.
    if (
      event.kind === "MERGE_REQUEST" &&
      event.mergeRequest.state === "MERGED" &&
      connection.onMergeStatusId
    ) {
      for (const issue of issues) {
        await this.transitionOnMerge(connection, issue);
      }
    }

    return { ok: true, reason: `Linked ${linked}.`, linked };
  },

  /**
   * Write the links one event implies, for one issue.
   *
   * Each artefact is attributed by the text that actually names the issue: the
   * branch link only if the branch name does, each commit only if its own
   * message does. A push whose branch matches does NOT drag every commit in
   * with it — that would attach "merge main into feature/VWP-1" and every
   * unrelated chore, which is exactly the noise BR-3 exists to prevent.
   */
  async linkEvent(
    connection: { id: string; provider: string },
    issue: { id: string; key: string },
    event: CodeEvent,
    projectKeys: string[],
  ): Promise<number> {
    const provider = connection.provider as CodeProviderId;
    const issueId = issue.id;
    const names = (text: string | null | undefined) =>
      findIssueKeysIn([text], projectKeys).some((m) => m.key === issue.key);
    let written = 0;

    if (event.kind === "PUSH") {
      if (names(event.branch)) {
        await CodeIntegrationRepository.upsertLink({
          issueId,
          connectionId: connection.id,
          provider,
          kind: "BRANCH",
          externalId: event.branch,
          title: event.branch,
          url: event.branchUrl,
          state: "NONE",
          repository: event.repository.name,
          occurredAt: event.at,
        });
        written++;
      }
      for (const commit of event.commits) {
        if (!names(commit.message)) continue;
        await CodeIntegrationRepository.upsertLink({
          issueId,
          connectionId: connection.id,
          provider,
          kind: "COMMIT",
          externalId: commit.sha,
          // The first line only: a commit body can be paragraphs, and the panel
          // is a list, not a reader.
          title: commit.message.split("\n")[0]!.slice(0, 200),
          url: commit.url,
          state: "NONE",
          authorName: commit.authorName ?? null,
          repository: event.repository.name,
          occurredAt: commit.at,
        });
        written++;
      }
      return written;
    }

    if (event.kind === "MERGE_REQUEST") {
      await CodeIntegrationRepository.upsertLink({
        issueId,
        connectionId: connection.id,
        provider,
        kind: "MERGE_REQUEST",
        externalId: event.mergeRequest.externalId,
        title: event.mergeRequest.title,
        url: event.mergeRequest.url,
        state: event.mergeRequest.state,
        authorName: event.mergeRequest.authorName ?? null,
        repository: event.repository.name,
        occurredAt: event.mergeRequest.at,
      });
      return 1;
    }
    return 0;
  },

  /**
   * Move an issue because its merge request merged (BR-7).
   *
   * Through `IssueService`, so transition rules, the subtask-done guard and
   * notifications all apply — and best-effort, because a refused transition is
   * a legitimate answer, not a webhook failure. A project that forbids
   * To Do → Done must not have that rule bypassed just because the move came
   * from GitLab.
   */
  async transitionOnMerge(
    connection: { id: string; name: string; organizationId: string; onMergeStatusId: string | null },
    issue: { id: string; version: number },
  ): Promise<void> {
    if (!connection.onMergeStatusId) return;
    try {
      const { IssueService } = await import("@/features/issues/services/issue.service");
      await IssueService.transition(
        // Attributed to the connection rather than to whoever pushed: the
        // person who merged may not even have an EAGLES account, and claiming
        // they moved the issue would be the audit-log lie ADR-0050 §4 forbids.
        automationActor(connection.organizationId, {
          id: connection.id,
          name: connection.name,
        }),
        issue.id,
        connection.onMergeStatusId,
        issue.version,
      );
    } catch (error) {
      logSwallowed(`codeIntegration.transitionOnMerge(${issue.id})`, error);
    }
  },
};
