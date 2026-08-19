// The typed audit-action taxonomy (ADR-0022 §2). New admin writes use these
// constants instead of free strings so actions are enumerable and typo-proof.
// Existing string actions across other services (ISSUE_STATUS_CHANGED, etc.)
// keep working and migrate here opportunistically — no big-bang rewrite.
export const AuditAction = {
  ORG_SETTINGS_CHANGED: "ORG_SETTINGS_CHANGED",
  FEATURE_FLAG_CHANGED: "FEATURE_FLAG_CHANGED",
  // User lifecycle (14_user_management.md).
  USER_INVITED: "USER_INVITED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  // Teams & Hierarchy (20_teams.md).
  TEAM_CREATED: "TEAM_CREATED",
  TEAM_UPDATED: "TEAM_UPDATED",
  TEAM_DELETED: "TEAM_DELETED",
  TEAM_MEMBER_ADDED: "TEAM_MEMBER_ADDED",
  TEAM_MEMBER_REMOVED: "TEAM_MEMBER_REMOVED",
  // Custom fields (24_custom_fields.md). Definitions are audited; individual
  // VALUE changes are not — those are issue history, not control-plane
  // changes, and one audit row per keystroke-saved field would drown the log.
  CUSTOM_FIELD_CREATED: "CUSTOM_FIELD_CREATED",
  CUSTOM_FIELD_UPDATED: "CUSTOM_FIELD_UPDATED",
  CUSTOM_FIELD_DELETED: "CUSTOM_FIELD_DELETED",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
