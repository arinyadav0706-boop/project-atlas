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
  /**
   * Present when the write is being made BY an automation rule rather than by
   * a person (ADR-0050 §4, 31_automations BR-3).
   *
   * `userId` is then the RULE's id, not a user's — so every `updatedBy`, audit
   * `actorId` and notification `createdBy` names the rule that did it. Priya
   * moved a card; the rule reassigned it, and an activity feed that says
   * otherwise is an audit log that lies.
   *
   * Two places must know the difference, and only two: `RecentItemService`
   * (a rule has no "continue working" list) and comment authorship (a real FK
   * to `users`, so an automated comment is attributed by rule id instead —
   * 08_comments BR-9).
   *
   * It is also the loop guard (BR-2): an event whose actor carries this plans
   * nothing, so a rule can never react to another rule's work.
   */
  automation?: AutomationAttribution;
}

export interface AutomationAttribution {
  ruleId: string;
  ruleName: string;
  /**
   * How many automation hops produced this write. Capped at 1 in V1 — chaining
   * is a tracked opt-in (AUT-5), and the depth exists so that opting in later
   * cannot produce an unbounded cascade.
   */
  depth: number;
}

/** The actor an automation rule acts as. Never a real user (ADR-0050 §4). */
export function automationActor(
  organizationId: string,
  rule: { id: string; name: string },
  depth = 1,
): Actor {
  return {
    // The rule's own id. `elevate()` finds no project membership for it and
    // falls back to the org role, which is why that role is ADMIN: a rule a
    // lead configured acts with a lead's authority on its own project, and it
    // is only ever dispatched against that project.
    userId: rule.id,
    orgRole: "ADMIN",
    organizationId,
    automation: { ruleId: rule.id, ruleName: rule.name, depth },
  };
}
