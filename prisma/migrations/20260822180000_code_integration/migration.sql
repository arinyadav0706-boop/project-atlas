-- Code integration (ADR-0053, docs/02_Modules/34_code_integration.md).
--
-- Additive only. Nothing existing changes shape, so this is safe in either
-- deploy order: old code never reads these tables.

-- One value today. Adding GITHUB is one ALTER TYPE plus one adapter file — the
-- provider interface, not this enum, is what makes that true.
CREATE TYPE "CodeProvider" AS ENUM ('GITLAB');
CREATE TYPE "CodeLinkKind" AS ENUM ('BRANCH', 'COMMIT', 'MERGE_REQUEST');
CREATE TYPE "CodeLinkState" AS ENUM ('OPEN', 'MERGED', 'CLOSED', 'NONE');

CREATE TABLE "code_connections" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "provider"        "CodeProvider" NOT NULL DEFAULT 'GITLAB',
    -- Self-managed GitLab is the common case, so the host is data.
    "baseUrl"         TEXT NOT NULL,
    -- Verified per provider: GitLab compares it verbatim, GitHub would HMAC the
    -- body with it. Shown to a human exactly once, at creation.
    "secret"          TEXT NOT NULL,
    "active"          BOOLEAN NOT NULL DEFAULT true,
    -- Null (the default) means do nothing on merge. A team that reviews after
    -- merge would otherwise find its board wrong every day.
    "onMergeStatusId" TEXT,
    "lastEventAt"     TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdBy"       TEXT,
    "updatedBy"       TEXT,
    "deletedAt"       TIMESTAMP(3),

    CONSTRAINT "code_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "code_connections_organizationId_idx" ON "code_connections"("organizationId");

ALTER TABLE "code_connections"
  ADD CONSTRAINT "code_connections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "code_links" (
    "id"             TEXT NOT NULL,
    "issueId"        TEXT NOT NULL,
    "connectionId"   TEXT NOT NULL,
    "provider"       "CodeProvider" NOT NULL,
    "kind"           "CodeLinkKind" NOT NULL,
    -- A merge-request iid, a commit sha, a branch name.
    "externalId"     TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "url"            TEXT NOT NULL,
    "state"          "CodeLinkState" NOT NULL DEFAULT 'NONE',
    "authorName"     TEXT,
    "repository"     TEXT NOT NULL,
    "pipelineStatus" TEXT,
    "occurredAt"     TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_links_pkey" PRIMARY KEY ("id")
);

-- The natural key that makes redelivery free: providers retry, and a panel
-- listing the same merge request four times is one nobody trusts.
CREATE UNIQUE INDEX "code_links_issueId_provider_kind_externalId_key"
  ON "code_links"("issueId", "provider", "kind", "externalId");
CREATE INDEX "code_links_issueId_idx" ON "code_links"("issueId");
CREATE INDEX "code_links_connectionId_idx" ON "code_links"("connectionId");

ALTER TABLE "code_links"
  ADD CONSTRAINT "code_links_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "issues"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "code_links"
  ADD CONSTRAINT "code_links_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "code_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
