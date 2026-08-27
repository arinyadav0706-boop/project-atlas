-- GitHub as a second git host (ADR-0053 §9, 34_code_integration.md BR-1).
--
-- Additive only: an enum value, no table or column changes. Existing rows keep
-- GITLAB, which is still the column default, so nothing has to be backfilled
-- and the expand→contract dance ADR-0011 requires for column changes does not
-- apply here.
--
-- Postgres will not let a value added in a transaction be USED in the same
-- transaction, and Prisma runs each migration in one. That is fine: nothing
-- below writes a GITHUB row. The same pattern as the AUTOMATION notification
-- type added on 2026-08-22.

ALTER TYPE "CodeProvider" ADD VALUE IF NOT EXISTS 'GITHUB';
