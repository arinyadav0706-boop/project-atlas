// The authenticated caller context every mutating service method receives
// (Coding Standards §7). Project-level roles are resolved per-project by
// each service — deliberately not carried here, since org ADMIN grants no
// implicit project powers (founder decision, docs/02_Modules/15_roles.md).
export interface Actor {
  userId: string;
  orgRole: "ADMIN" | "MEMBER";
}
