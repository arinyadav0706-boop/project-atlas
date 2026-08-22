-- Automated comments are attributed to the RULE, never to a user (ADR-0050 §4).
--
-- `authorId` becomes nullable and gains a sibling. Exactly one of the two is
-- set on any row: a person's comment has an author, a rule's comment has a
-- rule. The alternative — a fake "Automation" user — would need a row in
-- `users`, which leaks into every member picker, mention list, workload chart
-- and seat count in the product.
--
-- No backfill: every existing comment has an author and keeps it.

ALTER TABLE "comments" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "comments" ADD COLUMN "automationRuleId" TEXT;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_automationRuleId_fkey"
  FOREIGN KEY ("automationRuleId") REFERENCES "automation_rules"("id")
  -- RESTRICT, not SET NULL: nulling it would leave a comment with no author of
  -- either kind, which the CHECK below forbids. Rules are soft-deleted anyway
  -- (CLAUDE.md rule 9), so this only ever fires against a manual hard delete.
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The invariant, in the database rather than only in the service: a comment
-- authored by nobody at all is a row no UI can render.
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_one_author"
  CHECK (("authorId" IS NOT NULL) <> ("automationRuleId" IS NOT NULL));
