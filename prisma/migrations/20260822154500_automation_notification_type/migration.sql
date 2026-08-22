-- A notification a RULE sent (ADR-0050 §5, action `NOTIFY`).
--
-- Its own type rather than reusing STATUS_CHANGED or ASSIGNED: the reader needs
-- to know an automation told them this, because the follow-up question ("who
-- decided that?") has a different answer. NOTIFICATION_TYPES in
-- notification.types.ts carries the same value, and an integration test
-- compares the two — the pair drifting apart is what shipped UNBLOCKED dead for
-- a whole commit (backlog DEP-7).

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AUTOMATION';
