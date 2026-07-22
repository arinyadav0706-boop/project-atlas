-- Comments extensibility (ADR-0016): body format for future rich text, an
-- "edited" indicator, OCC version, and ordered/threading indexes. Additive.
CREATE TYPE "CommentBodyFormat" AS ENUM ('PLAIN', 'MARKDOWN');

ALTER TABLE "comments"
  ADD COLUMN "bodyFormat" "CommentBodyFormat" NOT NULL DEFAULT 'MARKDOWN',
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Swap the plain issueId index for an ordered one that serves the keyset list.
DROP INDEX IF EXISTS "comments_issueId_idx";
CREATE INDEX "comments_issueId_createdAt_idx" ON "comments"("issueId", "createdAt");
CREATE INDEX "comments_parentCommentId_idx" ON "comments"("parentCommentId");
