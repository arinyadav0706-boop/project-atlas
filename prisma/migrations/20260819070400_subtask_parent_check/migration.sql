-- Subtasks (ADR-0045 §2): the SUBTASK type and `parentId` must always agree.
--
-- This lives in its OWN migration, not with the ALTER TYPE that added the enum
-- value: PostgreSQL refuses to use a newly added enum value inside the same
-- transaction that added it ("unsafe use of new value of enum type"), and
-- Prisma wraps each migration file in one transaction.
--
-- Enforced in the database as well as in the service because a SUBTASK with no
-- parent is a row no query knows how to interpret — the backlog hides it and
-- the board shows it parentless. The invariant must not depend on application
-- code being the only writer (a script, a fixture, a future import).
--
-- The FK is ON DELETE SET NULL. Nothing hard-deletes an issue (everything is a
-- soft delete), but if something ever did, this constraint turns what would be
-- a silent orphan into a loud, refused delete. That is the outcome we want.
ALTER TABLE "issues"
  ADD CONSTRAINT "issues_subtask_parent_check"
  CHECK (("type" = 'SUBTASK') = ("parentId" IS NOT NULL));
