// The typed audit-action taxonomy (ADR-0022 §2). New admin writes use these
// constants instead of free strings so actions are enumerable and typo-proof.
// Existing string actions across other services (ISSUE_STATUS_CHANGED, etc.)
// keep working and migrate here opportunistically — no big-bang rewrite.
export const AuditAction = {
  ORG_SETTINGS_CHANGED: "ORG_SETTINGS_CHANGED",
  FEATURE_FLAG_CHANGED: "FEATURE_FLAG_CHANGED",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
