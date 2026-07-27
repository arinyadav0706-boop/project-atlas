// The authenticated caller context every mutating service method receives
// (Coding Standards §7). Project-level roles are resolved per-project by each
// service via elevate() — deliberately not carried here, since the effective
// role is project-dependent: an org ADMIN elevates to LEAD on every project in
// its org (ADR-0024, docs/02_Modules/15_roles.md), everyone else uses their
// membership role.
export interface Actor {
  userId: string;
  orgRole: "ADMIN" | "MEMBER";
  // The caller's organization. Every service scopes reads/writes to this so a
  // caller can never reach another tenant's data by ID (docs/08_Testing
  // finding F-1). Resolved in getActor from the session, with a DB fallback.
  organizationId: string;
}
