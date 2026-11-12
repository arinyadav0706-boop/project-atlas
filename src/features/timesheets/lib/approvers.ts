// Approver resolution at submit (ADR-0059 §6.3, 37_timesheets BR-29/BR-30).
// Pure: the service loads the people, this decides who is asked.

export type Relation = "REPORTING" | "FUNCTIONAL" | "PROJECT";

export interface ApproverInputs {
  ownerId: string;
  relations: Relation[];
  // The owner's team manager (ADR-0032), if any.
  reportingManagerId: string | null;
  functionalManagerId: string | null;
  // Projects that have lines this week, with their LEADs (any order).
  projects: { projectId: string; leadIds: string[] }[];
  // Lines with no project (an HR activity, say) go to the reporting manager
  // (Q3) — even when the policy has REPORTING switched off.
  hasLinesWithoutProject: boolean;
  orgAdminIds: string[];
}

export interface ApproverSlot {
  relation: Relation;
  projectId: string | null;
  approverId: string;
  // Set when the slot was filled by a fallback rather than its own relation.
  fallbackFrom: Relation | null;
  sequence: number;
}

export type ApproverPlan =
  | { kind: "SLOTS"; slots: ApproverSlot[] }
  // Nobody but the owner could approve (e.g. a one-admin startup): the week is
  // approved automatically and audited, never silently (Q5).
  | { kind: "AUTO_APPROVE" };

const RELATION_ORDER: Relation[] = ["REPORTING", "FUNCTIONAL", "PROJECT"];

function firstOther(ids: (string | null)[], ownerId: string): string | null {
  for (const id of ids) if (id && id !== ownerId) return id;
  return null;
}

export function planApprovers(i: ApproverInputs): ApproverPlan {
  const enabled = RELATION_ORDER.filter((r) => i.relations.includes(r));
  const admins = [...i.orgAdminIds].sort();
  const adminFallback = firstOther(admins, i.ownerId);
  const reporting = firstOther([i.reportingManagerId], i.ownerId);
  const slots: ApproverSlot[] = [];

  const push = (s: Omit<ApproverSlot, "sequence">) => slots.push({ ...s, sequence: slots.length });

  for (const relation of enabled) {
    if (relation === "REPORTING") {
      const approverId = reporting ?? adminFallback;
      if (approverId) {
        push({ relation, projectId: null, approverId, fallbackFrom: reporting ? null : "REPORTING" });
      }
    } else if (relation === "FUNCTIONAL") {
      const own = firstOther([i.functionalManagerId], i.ownerId);
      const approverId = own ?? adminFallback;
      if (approverId) {
        push({ relation, projectId: null, approverId, fallbackFrom: own ? null : "FUNCTIONAL" });
      }
    } else {
      for (const p of [...i.projects].sort((a, b) => a.projectId.localeCompare(b.projectId))) {
        // Another LEAD → the reporting manager → an org admin. Never the owner,
        // including a LEAD's own lines on their own project.
        const lead = firstOther([...p.leadIds].sort(), i.ownerId);
        const approverId = lead ?? reporting ?? adminFallback;
        if (approverId) {
          push({
            relation,
            projectId: p.projectId,
            approverId,
            fallbackFrom: lead ? null : "PROJECT",
          });
        }
      }
    }
  }

  const wholeWeekCovered = slots.some((s) => s.relation !== "PROJECT");
  if (!wholeWeekCovered && i.hasLinesWithoutProject) {
    const approverId = reporting ?? adminFallback;
    if (approverId) {
      push({ relation: "REPORTING", projectId: null, approverId, fallbackFrom: reporting ? null : "REPORTING" });
    }
  }

  // A week must never end up with no approver at all.
  if (slots.length === 0) {
    const approverId = reporting ?? adminFallback;
    if (!approverId) return { kind: "AUTO_APPROVE" };
    push({ relation: "REPORTING", projectId: null, approverId, fallbackFrom: reporting ? null : "REPORTING" });
  }
  return { kind: "SLOTS", slots };
}

// Which rows a given approver's slots cover. A PROJECT-only approver sees and
// decides only rows of their project(s); anyone holding a whole-week slot
// covers everything.
export function coveredProjectIds(
  slots: Pick<ApproverSlot, "relation" | "projectId" | "approverId">[],
  approverId: string,
): { wholeWeek: boolean; projectIds: Set<string> } {
  const mine = slots.filter((s) => s.approverId === approverId);
  return {
    wholeWeek: mine.some((s) => s.relation !== "PROJECT"),
    projectIds: new Set(mine.flatMap((s) => (s.projectId ? [s.projectId] : []))),
  };
}
