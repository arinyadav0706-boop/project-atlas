-- Backfill and provider authentication (ADR-0054, 35_code_backfill.md §3).
--
-- Purely additive: four new tables, three new enums, two new columns on
-- `code_connections` that both carry defaults. Every existing connection stays
-- WEBHOOK_ONLY, which is exactly what it was before this migration, so nothing
-- starts making outbound calls because a migration ran.
--
-- `code_credentials.accessToken`/`refreshToken` hold CIPHERTEXT, never tokens
-- (35/BR-4) — the column type says nothing about that, so the encryption is
-- enforced in the repository layer and asserted by a test.
--
-- `code_auth_states` is keyed BY the state value: a replayed callback is then a
-- primary-key miss after the first use deletes the row, rather than a race two
-- requests can both win (35/BR-14).

-- CreateEnum
CREATE TYPE "CodeAuthMode" AS ENUM ('WEBHOOK_ONLY', 'APP');

-- CreateEnum
CREATE TYPE "BackfillStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BackfillPhase" AS ENUM ('MERGE_REQUESTS', 'BRANCHES', 'COMMITS', 'DONE');

-- AlterTable
ALTER TABLE "code_connections" ADD COLUMN     "authMode" "CodeAuthMode" NOT NULL DEFAULT 'WEBHOOK_ONLY',
ADD COLUMN     "backfillDays" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "code_credentials" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "installationId" TEXT,
    "externalAccount" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "code_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_repositories" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "defaultBranch" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastBackfillAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "code_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_backfill_runs" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "status" "BackfillStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" "BackfillPhase" NOT NULL DEFAULT 'MERGE_REQUESTS',
    "cursor" JSONB,
    "since" TIMESTAMP(3) NOT NULL,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "linked" INTEGER NOT NULL DEFAULT 0,
    "resumeAfter" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "code_backfill_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_auth_states" (
    "state" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "returnTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "code_auth_states_pkey" PRIMARY KEY ("state")
);

-- CreateIndex
CREATE UNIQUE INDEX "code_credentials_connectionId_key" ON "code_credentials"("connectionId");

-- CreateIndex
CREATE INDEX "code_repositories_connectionId_idx" ON "code_repositories"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "code_repositories_connectionId_externalId_key" ON "code_repositories"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "code_backfill_runs_status_resumeAfter_idx" ON "code_backfill_runs"("status", "resumeAfter");

-- CreateIndex
CREATE INDEX "code_backfill_runs_repositoryId_createdAt_idx" ON "code_backfill_runs"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "code_auth_states_expiresAt_idx" ON "code_auth_states"("expiresAt");

-- AddForeignKey
ALTER TABLE "code_credentials" ADD CONSTRAINT "code_credentials_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "code_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_repositories" ADD CONSTRAINT "code_repositories_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "code_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_backfill_runs" ADD CONSTRAINT "code_backfill_runs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "code_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

