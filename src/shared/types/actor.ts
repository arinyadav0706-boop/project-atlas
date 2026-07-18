// The authenticated caller context every mutating service method receives
// (Coding Standards §7). Project-level roles are resolved per-project by
// each service — deliberately not carried here, since org ADMIN grants no
// implicit project powers (founder decision, docs/02_Modules/15_roles.md).
export interface Actor {
  userId: string;
  orgRole: "ADMIN" | "MEMBER";
  // The caller's organization. Every service scopes reads/writes to this so a
  // caller can never reach another tenant's data by ID (docs/08_Testing
  // finding F-1). Resolved in getActor from the session, with a DB fallback.
  organizationId: string;
}
