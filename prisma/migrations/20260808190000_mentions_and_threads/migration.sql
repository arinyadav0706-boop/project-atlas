-- ADR-0038: mentions, participation, threads.
-- Purely additive: one new table and three new indexes. Safe to run anytime;
-- with no rows the app behaves exactly as before.

CREATE TABLE "comment_mentions" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("id")
);

-- One row per person per comment, however many times they are named in it.
CREATE UNIQUE INDEX "comment_mentions_commentId_userId_key"
    ON "comment_mentions"("commentId", "userId");

-- "Mentions of me", newest first.
CREATE INDEX "comment_mentions_userId_createdAt_idx"
    ON "comment_mentions"("userId", "createdAt");

ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_commentId_fkey"
    FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Per-root reply counts and ordered reply pages (ADR-0038 §4). Replaces the
-- bare (parentCommentId) index, which could not serve the ordering.
DROP INDEX IF EXISTS "comments_parentCommentId_idx";
CREATE INDEX "comments_parentCommentId_createdAt_idx"
    ON "comments"("parentCommentId", "createdAt");

-- Top-level comments for an issue: the list query filters on all three.
CREATE INDEX "comments_issueId_parentCommentId_createdAt_idx"
    ON "comments"("issueId", "parentCommentId", "createdAt");

-- PERF-9: the notifications history page sorts by (createdAt, id), which the
-- existing (userId, isRead) index cannot satisfy — it filtered, then sorted.
CREATE INDEX "notifications_userId_createdAt_id_idx"
    ON "notifications"("userId", "createdAt", "id");
