-- Public REST API and webhooks (ADR-0052, docs/02_Modules/33_public_api.md).
--
-- Additive only. Nothing existing changes shape, so this is safe in either
-- deploy order: old code never reads these tables.

CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- A personal access token. Acts as its owner and can never exceed them (BR-2).
CREATE TABLE "api_tokens" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    -- The lookup half of `eag_<publicId>_<secret>`. Indexed, not secret:
    -- without it, verifying a token means hashing against every row.
    "publicId"       TEXT NOT NULL,
    -- SHA-256 of the secret half. Shown once at creation, unrecoverable after.
    "secretHash"     TEXT NOT NULL,
    "scopes"         TEXT[],
    "lastUsedAt"     TIMESTAMP(3),
    "expiresAt"      TIMESTAMP(3),
    "revokedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdBy"      TEXT,
    "updatedBy"      TEXT,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- Every authenticated request is one point read on this.
CREATE UNIQUE INDEX "api_tokens_publicId_key" ON "api_tokens"("publicId");
CREATE INDEX "api_tokens_organizationId_idx" ON "api_tokens"("organizationId");
CREATE INDEX "api_tokens_userId_idx" ON "api_tokens"("userId");

ALTER TABLE "api_tokens"
  ADD CONSTRAINT "api_tokens_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_tokens"
  ADD CONSTRAINT "api_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- An outbound webhook, per organization.
CREATE TABLE "webhooks" (
    "id"                  TEXT NOT NULL,
    "organizationId"      TEXT NOT NULL,
    "url"                 TEXT NOT NULL,
    -- Stored in the clear, unlike a token secret: signing REQUIRES the original
    -- bytes, where a token only ever needs to be compared.
    "secret"              TEXT NOT NULL,
    "events"              TEXT[],
    "active"              BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledReason"      TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "createdBy"           TEXT,
    "updatedBy"           TEXT,
    "deletedAt"           TIMESTAMP(3),

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhooks_organizationId_idx" ON "webhooks"("organizationId");

ALTER TABLE "webhooks"
  ADD CONSTRAINT "webhooks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- One attempt-tracked delivery. A row rather than an in-process retry loop: the
-- request that produced the event has already returned, so the retry has to
-- survive the process ending. The scheduler tick (ADR-0051) drains this.
CREATE TABLE "webhook_deliveries" (
    "id"            TEXT NOT NULL,
    "webhookId"     TEXT NOT NULL,
    "event"         TEXT NOT NULL,
    "payload"       JSONB NOT NULL,
    "status"        "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "responseCode"  INTEGER,
    "error"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- The scheduler's only read: what is pending and due.
CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx"
  ON "webhook_deliveries"("status", "nextAttemptAt");
CREATE INDEX "webhook_deliveries_webhookId_createdAt_idx"
  ON "webhook_deliveries"("webhookId", "createdAt");

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_webhookId_fkey"
  FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
