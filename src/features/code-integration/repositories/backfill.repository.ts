import { Prisma } from "@prisma/client";
import type { BackfillPhase, BackfillStatus } from "@prisma/client";
import { prisma } from "@/shared/lib/db";
import { isSealed, open, seal } from "@/shared/lib/secret-box";

// Credentials, repositories and backfill runs (ADR-0054). Prisma lives only in
// `*.repository.ts` (Feature Architecture §4).

const credentialSelect = {
  id: true,
  connectionId: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
  scope: true,
  installationId: true,
  externalAccount: true,
} as const;

const repositorySelect = {
  id: true,
  connectionId: true,
  externalId: true,
  path: true,
  defaultBranch: true,
  enabled: true,
  lastBackfillAt: true,
} as const;

const runSelect = {
  id: true,
  repositoryId: true,
  status: true,
  phase: true,
  cursor: true,
  since: true,
  scanned: true,
  linked: true,
  resumeAfter: true,
  error: true,
  startedAt: true,
  finishedAt: true,
  version: true,
} as const;

/** A credential with its tokens already decrypted. Never persisted in this shape. */
export interface DecryptedCredential {
  id: string;
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  installationId: string | null;
  externalAccount: string | null;
}

export const BackfillRepository = {
  // ── Credentials ───────────────────────────────────────────────────────────

  /**
   * Encrypt on the way in — the ONLY place a token becomes a column value.
   *
   * Sealing here rather than in the service is deliberate: a service that
   * forgets is a plaintext token in the database, and there is no second chance
   * once a backup exists. A test asserts the stored value is unreadable.
   */
  async upsertCredential(data: {
    connectionId: string;
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scope?: string | null;
    installationId?: string | null;
    externalAccount?: string | null;
    actorId: string;
  }) {
    const fields = {
      accessToken: seal(data.accessToken),
      refreshToken: data.refreshToken ? seal(data.refreshToken) : null,
      expiresAt: data.expiresAt ?? null,
      scope: data.scope ?? null,
      installationId: data.installationId ?? null,
      externalAccount: data.externalAccount ?? null,
    };
    return prisma.codeCredential.upsert({
      where: { connectionId: data.connectionId },
      create: { connectionId: data.connectionId, ...fields, createdBy: data.actorId, updatedBy: data.actorId },
      // `externalAccount` is only looked up at install time, so a refresh that
      // does not carry one must not blank the label already on screen.
      update: {
        ...fields,
        externalAccount: data.externalAccount ?? undefined,
        updatedBy: data.actorId,
      },
      select: credentialSelect,
    });
  },

  async findCredential(connectionId: string): Promise<DecryptedCredential | null> {
    const row = await prisma.codeCredential.findUnique({
      where: { connectionId },
      select: credentialSelect,
    });
    if (!row) return null;
    return {
      id: row.id,
      connectionId: row.connectionId,
      accessToken: open(row.accessToken),
      refreshToken: row.refreshToken ? open(row.refreshToken) : null,
      expiresAt: row.expiresAt,
      installationId: row.installationId,
      externalAccount: row.externalAccount,
    };
  },

  /** For the admin screen: is there a credential, and whose, without decrypting. */
  async credentialSummary(connectionId: string) {
    return prisma.codeCredential.findUnique({
      where: { connectionId },
      select: { externalAccount: true, expiresAt: true, scope: true, createdAt: true },
    });
  },

  deleteCredential(connectionId: string) {
    return prisma.codeCredential.deleteMany({ where: { connectionId } });
  },

  /** Guards the invariant the column type cannot: stored tokens are ciphertext. */
  async storedTokenIsSealed(connectionId: string): Promise<boolean> {
    const row = await prisma.codeCredential.findUnique({
      where: { connectionId },
      select: { accessToken: true },
    });
    return row ? isSealed(row.accessToken) : false;
  },

  // ── Auth handshake state ──────────────────────────────────────────────────

  createAuthState(data: {
    state: string;
    connectionId: string;
    codeVerifier?: string | null;
    returnTo?: string | null;
    expiresAt: Date;
    actorId: string;
  }) {
    return prisma.codeAuthState.create({
      data: {
        state: data.state,
        connectionId: data.connectionId,
        codeVerifier: data.codeVerifier ?? null,
        returnTo: data.returnTo ?? null,
        expiresAt: data.expiresAt,
        createdBy: data.actorId,
      },
    });
  },

  /**
   * Read and destroy in one statement — this is what makes the state
   * single-use (35/BR-14).
   *
   * `deleteMany` returning a count would not give us the row, and a
   * find-then-delete is a race two concurrent callbacks can both win.
   * `RETURNING` settles it in the database.
   */
  async consumeAuthState(state: string) {
    const rows = await prisma.$queryRaw<
      {
        state: string;
        connectionId: string;
        codeVerifier: string | null;
        returnTo: string | null;
        expiresAt: Date;
        createdBy: string | null;
      }[]
    >`DELETE FROM "code_auth_states" WHERE "state" = ${state} RETURNING *`;
    return rows[0] ?? null;
  },

  purgeExpiredAuthStates(now: Date) {
    return prisma.codeAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  },

  // ── Repositories ──────────────────────────────────────────────────────────

  listRepositories(connectionId: string) {
    return prisma.codeRepository.findMany({
      where: { connectionId, deletedAt: null },
      select: repositorySelect,
      orderBy: [{ enabled: "desc" }, { path: "asc" }],
    });
  },

  listEnabledRepositories(connectionId: string) {
    return prisma.codeRepository.findMany({
      where: { connectionId, deletedAt: null, enabled: true },
      select: repositorySelect,
    });
  },

  findRepository(id: string) {
    return prisma.codeRepository.findFirst({
      where: { id, deletedAt: null },
      select: { ...repositorySelect, connection: { select: { id: true, organizationId: true } } },
    });
  },

  /**
   * Reconcile what the provider reports against what we have.
   *
   * Upsert rather than replace: `enabled` is a human's choice and must survive
   * a repository listing being refreshed.
   */
  async syncRepositories(
    connectionId: string,
    repositories: { externalId: string; path: string; defaultBranch: string | null }[],
    actorId: string,
  ) {
    for (const repository of repositories) {
      await prisma.codeRepository.upsert({
        where: {
          connectionId_externalId: { connectionId, externalId: repository.externalId },
        },
        create: {
          connectionId,
          externalId: repository.externalId,
          path: repository.path,
          defaultBranch: repository.defaultBranch,
          createdBy: actorId,
          updatedBy: actorId,
        },
        // A rename changes the path; the external id is what identifies it.
        update: {
          path: repository.path,
          defaultBranch: repository.defaultBranch,
          deletedAt: null,
          updatedBy: actorId,
        },
      });
    }
  },

  setRepositoryEnabled(connectionId: string, ids: string[], enabled: boolean, actorId: string) {
    return prisma.codeRepository.updateMany({
      where: { connectionId, id: { in: ids } },
      data: { enabled, updatedBy: actorId },
    });
  },

  markRepositoryBackfilled(id: string, at: Date) {
    return prisma.codeRepository.updateMany({
      where: { id },
      data: { lastBackfillAt: at },
    });
  },

  // ── Runs ──────────────────────────────────────────────────────────────────

  createRun(data: { repositoryId: string; since: Date; actorId: string }) {
    return prisma.codeBackfillRun.create({
      data: {
        repositoryId: data.repositoryId,
        since: data.since,
        createdBy: data.actorId,
        updatedBy: data.actorId,
      },
      select: runSelect,
    });
  },

  /** An unfinished run for this repository, so a second "Backfill now" is a no-op. */
  findActiveRun(repositoryId: string) {
    return prisma.codeBackfillRun.findFirst({
      where: { repositoryId, status: { in: ["QUEUED", "RUNNING", "PAUSED"] } },
      select: runSelect,
      orderBy: { createdAt: "desc" },
    });
  },

  listRuns(repositoryIds: string[], take = 20) {
    return prisma.codeBackfillRun.findMany({
      where: { repositoryId: { in: repositoryIds } },
      select: runSelect,
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  /** Runnable now: queued, or paused with its resume time passed. */
  dueRuns(now: Date, take: number) {
    return prisma.codeBackfillRun.findMany({
      where: {
        OR: [
          { status: "QUEUED" },
          { status: "PAUSED", resumeAfter: { lte: now } },
          // A RUNNING row whose claim is old means a container died mid-slice.
          // Reclaimable, because the cursor is already persisted.
          { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) } },
        ],
      },
      select: { ...runSelect, repository: { select: repositorySelect } },
      orderBy: { createdAt: "asc" },
      take,
    });
  },

  /**
   * Take ownership of a run (35/BR-8, ADR-0011).
   *
   * The conditional update is the whole concurrency story: two ticks racing for
   * the same row, one wins, the loser gets `count: 0` and moves on. No locks,
   * no queue, and safe to run from as many workers as exist.
   */
  async claim(id: string, expectedVersion: number, now: Date): Promise<boolean> {
    const result = await prisma.codeBackfillRun.updateMany({
      where: { id, version: expectedVersion },
      data: {
        status: "RUNNING",
        version: { increment: 1 },
        startedAt: now,
        resumeAfter: null,
        error: null,
      },
    });
    return result.count === 1;
  },

  /** Persist progress mid-run. Bumps `version` so a stale claim cannot resume. */
  saveProgress(
    id: string,
    data: {
      phase?: BackfillPhase;
      cursor?: Prisma.InputJsonValue | null;
      scanned?: number;
      linked?: number;
    },
  ) {
    return prisma.codeBackfillRun.update({
      where: { id },
      data: {
        ...(data.phase !== undefined ? { phase: data.phase } : {}),
        ...(data.cursor !== undefined
          ? { cursor: data.cursor === null ? Prisma.DbNull : data.cursor }
          : {}),
        ...(data.scanned !== undefined ? { scanned: data.scanned } : {}),
        ...(data.linked !== undefined ? { linked: data.linked } : {}),
        version: { increment: 1 },
      },
      select: runSelect,
    });
  },

  finish(
    id: string,
    status: BackfillStatus,
    data: { error?: string | null; resumeAfter?: Date | null; finishedAt?: Date | null } = {},
  ) {
    return prisma.codeBackfillRun.update({
      where: { id },
      data: {
        status,
        error: data.error ?? null,
        resumeAfter: data.resumeAfter ?? null,
        finishedAt: data.finishedAt ?? null,
        version: { increment: 1 },
      },
      select: runSelect,
    });
  },
};

export type BackfillRunRow = Prisma.CodeBackfillRunGetPayload<{ select: typeof runSelect }>;
export type CodeRepositoryRow = Prisma.CodeRepositoryGetPayload<{
  select: typeof repositorySelect;
}>;
