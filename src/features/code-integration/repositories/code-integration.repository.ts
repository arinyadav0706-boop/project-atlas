import type { CodeLinkKind, CodeLinkState, CodeProvider, Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";

// Code connections and links (ADR-0053). Prisma lives only in
// `*.repository.ts` (Feature Architecture §4).

const connectionSelect = {
  id: true,
  organizationId: true,
  name: true,
  provider: true,
  baseUrl: true,
  active: true,
  onMergeStatusId: true,
  lastEventAt: true,
  createdAt: true,
  // Module 35. Deliberately NOT the credential: this select feeds every admin
  // screen, and a token has no business being one careless spread away from a
  // response body.
  authMode: true,
  backfillDays: true,
} as const;

const linkSelect = {
  id: true,
  issueId: true,
  provider: true,
  kind: true,
  externalId: true,
  title: true,
  url: true,
  state: true,
  authorName: true,
  repository: true,
  pipelineStatus: true,
  occurredAt: true,
} as const;

export const CodeIntegrationRepository = {
  list(organizationId: string) {
    return prisma.codeConnection.findMany({
      where: { organizationId, deletedAt: null },
      select: connectionSelect,
      orderBy: [{ createdAt: "desc" }],
    });
  },

  /**
   * The inbound endpoint's only read, and it needs the secret.
   *
   * Selected here and nowhere else — the list query above deliberately cannot
   * see it, so no admin screen can leak it by accident.
   */
  findForWebhook(id: string) {
    return prisma.codeConnection.findFirst({
      where: { id, deletedAt: null },
      select: { ...connectionSelect, secret: true },
    });
  },

  findById(id: string) {
    return prisma.codeConnection.findFirst({
      where: { id, deletedAt: null },
      select: connectionSelect,
    });
  },

  countForOrg(organizationId: string) {
    return prisma.codeConnection.count({ where: { organizationId, deletedAt: null } });
  },

  create(data: {
    organizationId: string;
    name: string;
    provider: CodeProvider;
    baseUrl: string;
    secret: string;
    actorId: string;
  }) {
    const { actorId, ...fields } = data;
    return prisma.codeConnection.create({
      data: { ...fields, createdBy: actorId, updatedBy: actorId },
      select: connectionSelect,
    });
  },

  update(
    id: string,
    data: { name?: string; active?: boolean; onMergeStatusId?: string | null; baseUrl?: string },
    actorId: string,
  ) {
    return prisma.codeConnection.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
      select: connectionSelect,
    });
  },

  /** Flipped by the install flow, not by an admin form (ADR-0054 §1). */
  setAuthMode(id: string, authMode: "WEBHOOK_ONLY" | "APP") {
    return prisma.codeConnection.updateMany({ where: { id }, data: { authMode } });
  },

  softDelete(id: string, actorId: string) {
    return prisma.codeConnection.update({
      where: { id },
      data: { deletedAt: new Date(), active: false, updatedBy: actorId },
      select: { id: true },
    });
  },

  touch(id: string) {
    return prisma.codeConnection.updateMany({
      where: { id },
      data: { lastEventAt: new Date() },
    });
  },

  /** Project keys in one org — the filter that stops `UTF-8` linking (BR-3). */
  async projectKeys(organizationId: string): Promise<string[]> {
    const rows = await prisma.project.findMany({
      where: { organizationId, deletedAt: null },
      select: { key: true },
    });
    return rows.map((row) => row.key);
  },

  /**
   * Resolve issue keys to ids, scoped to one organization (BR-9).
   *
   * The org scope is the tenant boundary: a webhook from one company's GitLab
   * naming `VWP-1` must never touch another company's VWP-1.
   */
  findIssuesByKeys(organizationId: string, keys: string[]) {
    if (keys.length === 0) return Promise.resolve([]);
    return prisma.issue.findMany({
      where: {
        key: { in: keys },
        deletedAt: null,
        project: { organizationId },
      },
      select: { id: true, key: true, projectId: true, statusId: true, version: true },
    });
  },

  /**
   * Upsert one link (BR-5).
   *
   * On the natural key, so a redelivered webhook updates rather than
   * duplicates — providers retry, and a panel listing the same merge request
   * four times is one nobody trusts.
   */
  upsertLink(data: {
    issueId: string;
    connectionId: string;
    provider: CodeProvider;
    kind: CodeLinkKind;
    externalId: string;
    title: string;
    url: string;
    state: CodeLinkState;
    authorName?: string | null;
    repository: string;
    occurredAt: Date;
  }) {
    const { issueId, provider, kind, externalId, ...rest } = data;
    return prisma.codeLink.upsert({
      where: {
        issueId_provider_kind_externalId: { issueId, provider, kind, externalId },
      },
      create: { issueId, provider, kind, externalId, ...rest },
      // Title and state change over the life of a merge request; the panel
      // shows what is true now, not a history of notifications (BR-6).
      update: {
        title: rest.title,
        url: rest.url,
        state: rest.state,
        authorName: rest.authorName ?? null,
        occurredAt: rest.occurredAt,
      },
      select: linkSelect,
    });
  },

  /** Attach a pipeline result to whatever is already linked for that ref. */
  setPipelineStatus(connectionId: string, ref: string, status: string) {
    return prisma.codeLink.updateMany({
      where: {
        connectionId,
        // A pipeline runs on a ref, which is a branch here; merge-request links
        // are matched through the branch link that shares the name.
        kind: "BRANCH",
        externalId: ref,
      },
      data: { pipelineStatus: status },
    });
  },

  listForIssue(issueId: string) {
    return prisma.codeLink.findMany({
      where: { issueId },
      select: linkSelect,
      orderBy: [{ occurredAt: "desc" }],
    });
  },

  countForIssues(issueIds: string[]) {
    return prisma.codeLink.groupBy({
      by: ["issueId"],
      where: { issueId: { in: issueIds } },
      _count: { _all: true },
    });
  },
};

export type CodeConnectionRow = Prisma.CodeConnectionGetPayload<{
  select: typeof connectionSelect;
}>;
export type CodeLinkRow = Prisma.CodeLinkGetPayload<{ select: typeof linkSelect }>;
