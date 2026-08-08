// Pure, deterministic generator for the VERUS demo company (ADR-0033). Produces
// an in-memory dataset of Prisma createMany inputs — NO database access — so it
// can be unit-tested / dry-run and re-run to the exact same company.
//
// Rank imported by relative path (not the "@/" alias) so it resolves under tsx
// without tsconfig-paths.
import type { Prisma } from "@prisma/client";
import type {
  IssueStatus,
  IssueType,
  IssuePriority,
  SprintStatus,
  ProjectRole,
  OrgRole,
} from "@prisma/client";
import { ranksBetween } from "../../src/shared/lib/rank";
import { Prng } from "./prng";
import {
  ORG_ID,
  ORG_NAME,
  ORG_DOMAIN,
  GOOGLE_ADMIN,
  CREDENTIALS_ADMIN,
  TOTAL_USERS,
  EXTRA_ADMINS,
  NOW,
  TEAMS,
  PROJECTS,
  FIRST_NAMES,
  LAST_NAMES,
  VERBS,
  NOUNS,
  ROLES,
  CONTEXTS,
  BUG_PROBLEMS,
  TASK_TEMPLATES,
  DESCRIPTIONS,
  COMMENTS,
  LABELS,
  type ProjectSpec,
} from "./data";

export const GOOGLE_ADMIN_ID = "verus-admin-google";
export const CREDS_ADMIN_ID = "verus-admin-creds";
const SEED = 0x5eed_1234;
const DAY = 86_400_000;

export interface AdminSeed {
  id: string;
  email: string;
  name: string;
  credentials: boolean; // true → password login, false → SSO only
}

export interface VerusDataset {
  org: Prisma.OrganizationCreateManyInput;
  admins: AdminSeed[];
  cast: Prisma.UserCreateManyInput[];
  teams: Prisma.TeamCreateManyInput[];
  memberships: Prisma.TeamMembershipCreateManyInput[];
  projects: Prisma.ProjectCreateManyInput[];
  projectMembers: Prisma.ProjectMemberCreateManyInput[];
  components: Prisma.ComponentCreateManyInput[];
  labels: Prisma.LabelCreateManyInput[];
  sprints: Prisma.SprintCreateManyInput[];
  epics: Prisma.IssueCreateManyInput[];
  issues: Prisma.IssueCreateManyInput[];
  issueComponents: Prisma.IssueComponentCreateManyInput[];
  issueLabels: Prisma.IssueLabelCreateManyInput[];
  comments: Prisma.CommentCreateManyInput[];
  workLogs: Prisma.WorkLogCreateManyInput[];
  auditLogs: Prisma.AuditLogCreateManyInput[];
  recentItems: Prisma.RecentItemCreateManyInput[];
  favorites: Prisma.FavoriteCreateManyInput[];
  stats: Record<string, number>;
}

const STATUS_WEIGHTS: ReadonlyArray<readonly [IssueStatus, number]> = [
  ["DONE", 45],
  ["TODO", 30],
  ["IN_PROGRESS", 15],
  ["IN_REVIEW", 10],
];
const PRIORITY_WEIGHTS: ReadonlyArray<readonly [IssuePriority, number]> = [
  ["LOWEST", 6],
  ["LOW", 20],
  ["MEDIUM", 44],
  ["HIGH", 22],
  ["HIGHEST", 8],
];
const NON_EPIC_TYPE_WEIGHTS: ReadonlyArray<readonly [Exclude<IssueType, "EPIC">, number]> = [
  ["STORY", 42],
  ["TASK", 36],
  ["BUG", 22],
];
const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;
const ESTIMATE_MINUTES = [30, 60, 90, 120, 180, 240, 360, 480, 720] as const;
const SPRINT_GOALS = [
  "Ship the release candidate", "Burn down the bug backlog", "Close out the epic",
  "Hit the performance budget", "Stabilise the new API", "Improve onboarding conversion",
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number, w = 3): string => String(n).padStart(w, "0");

// Multiplier on a label's base weight for a given issue type. Without it every
// label sprays evenly across the backlog and a filter like `regression` returns
// a set with no character — half of it stories. Anything not listed keeps its
// base rate (1).
const LABEL_AFFINITY: Readonly<Record<string, Partial<Record<Exclude<IssueType, "EPIC">, number>>>> = {
  regression: { BUG: 3, STORY: 0.1, TASK: 0.2 },
  "flaky-test": { BUG: 2.5, TASK: 1.2, STORY: 0.1 },
  "customer-reported": { BUG: 2.5, STORY: 0.6, TASK: 0.3 },
  "needs-design": { STORY: 2.5, BUG: 0.3, TASK: 0.4 },
  "tech-debt": { TASK: 2.2, STORY: 0.5 },
  documentation: { TASK: 2, BUG: 0.3 },
};

function labelAffinity(name: string, type: Exclude<IssueType, "EPIC">): number {
  return LABEL_AFFINITY[name]?.[type] ?? 1;
}

// Epics carry curated per-project names (see ProjectSpec.epics); everything else
// is composed from the word banks, with a context clause on roughly half of them
// so the cross-product stays far larger than the issue count.
function issueTitle(rng: Prng, type: Exclude<IssueType, "EPIC">): string {
  const noun = rng.pick(NOUNS);
  const base =
    type === "STORY"
      ? `As a ${rng.pick(ROLES)}, I can ${rng.pick(VERBS)} the ${noun}`
      : type === "TASK"
        ? rng.pick(TASK_TEMPLATES).replace("{noun}", noun)
        : `${cap(noun)} ${rng.pick(BUG_PROBLEMS)}`;
  return rng.bool(0.5) ? `${base} ${rng.pick(CONTEXTS)}` : base;
}

export function generateVerus(): VerusDataset {
  const rng = new Prng(SEED);
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
  const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY);

  const org: Prisma.OrganizationCreateManyInput = {
    id: ORG_ID,
    name: ORG_NAME,
    domain: ORG_DOMAIN,
    createdAt: daysAgo(365),
  };

  // ---- People ----
  const admins: AdminSeed[] = [
    { id: GOOGLE_ADMIN_ID, ...GOOGLE_ADMIN, credentials: false },
    { id: CREDS_ADMIN_ID, ...CREDENTIALS_ADMIN, credentials: true },
  ];

  const castCount = TOTAL_USERS - admins.length;
  const cast: Prisma.UserCreateManyInput[] = [];
  const usedEmails = new Set<string>([GOOGLE_ADMIN.email, CREDENTIALS_ADMIN.email]);
  const allUserIds: string[] = [...admins.map((a) => a.id)];

  for (let i = 0; i < castCount; i++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    let email = `${first}.${last}@${ORG_DOMAIN}`.toLowerCase();
    let n = 2;
    while (usedEmails.has(email)) email = `${first}.${last}${n++}@${ORG_DOMAIN}`.toLowerCase();
    usedEmails.add(email);
    const id = `verus-u-${pad(i)}`;
    const orgRole: OrgRole = i < EXTRA_ADMINS ? "ADMIN" : "MEMBER";
    cast.push({
      id,
      organizationId: ORG_ID,
      email,
      name: `${first} ${last}`,
      orgRole,
      createdAt: daysAgo(rng.int(200, 360)),
      createdBy: GOOGLE_ADMIN_ID,
    });
    allUserIds.push(id);
  }

  // ---- Teams (people axis) ----
  // Managers: the two owner accounts run the two biggest branches so "My Team"
  // is rich when logged in as either; the rest go to senior cast members.
  const managerPool = rng.shuffle(cast.slice(0, 24).map((u) => u.id!));
  let mgrCursor = 0;
  const nextManager = () => managerPool[mgrCursor++ % managerPool.length]!;
  const managerByTeam: Record<string, string> = {
    eng: CREDS_ADMIN_ID, // alumni admin manages all of Engineering (deepest tree)
    pd: GOOGLE_ADMIN_ID, // google admin manages Product & Design
  };

  const teams: Prisma.TeamCreateManyInput[] = TEAMS.map((t) => ({
    id: `verus-team-${t.key}`,
    organizationId: ORG_ID,
    name: t.name,
    parentTeamId: t.parentKey ? `verus-team-${t.parentKey}` : null,
    managerId: managerByTeam[t.key] ?? nextManager(),
    createdAt: daysAgo(rng.int(150, 340)),
    createdBy: GOOGLE_ADMIN_ID,
  }));

  // ---- Team memberships: every user in exactly one team (unique userId). ----
  const teamWeights: ReadonlyArray<readonly [string, number]> = TEAMS.map(
    (t) => [`verus-team-${t.key}`, t.weight] as const,
  );
  const memberships: Prisma.TeamMembershipCreateManyInput[] = allUserIds.map((userId, i) => ({
    id: `verus-tm-${pad(i, 4)}`,
    teamId: rng.weighted(teamWeights),
    userId,
    createdBy: GOOGLE_ADMIN_ID,
    createdAt: daysAgo(rng.int(120, 320)),
  }));

  // ---- Labels (org-scoped, so they live outside the project loop) ----
  // Components are per-project and get created inside it; labels are shared by
  // the whole org (ADR-0018 §2), which is exactly the distinction the demo
  // should make visible — the same `regression` chip on a VMOB card and an OPS
  // card is the same label row.
  const labels: Prisma.LabelCreateManyInput[] = LABELS.map((spec, i) => ({
    id: `verus-label-${pad(i)}`,
    organizationId: ORG_ID,
    name: spec.name,
    color: spec.color,
    createdAt: daysAgo(rng.int(240, 320)),
    createdBy: GOOGLE_ADMIN_ID,
  }));

  // ---- Projects, members, components, sprints ----
  const projects: Prisma.ProjectCreateManyInput[] = [];
  const projectMembers: Prisma.ProjectMemberCreateManyInput[] = [];
  const components: Prisma.ComponentCreateManyInput[] = [];
  const sprints: Prisma.SprintCreateManyInput[] = [];
  const allIssues: Prisma.IssueCreateManyInput[] = [];
  const issueComponents: Prisma.IssueComponentCreateManyInput[] = [];
  const issueLabels: Prisma.IssueLabelCreateManyInput[] = [];
  const comments: Prisma.CommentCreateManyInput[] = [];
  const workLogs: Prisma.WorkLogCreateManyInput[] = [];
  const auditLogs: Prisma.AuditLogCreateManyInput[] = [];

  let commentCounter = 0;
  let workLogCounter = 0;
  let auditCounter = 0;
  let icCounter = 0;
  let ilCounter = 0;
  const memberSizeByKey: Record<string, number> = { VWP: 70, VMOB: 45, VDP: 45, OPS: 40 };
  const AUDIT_CAP = 3600; // bound the transition history we synthesise

  for (const spec of PROJECTS) {
    const projectId = `verus-proj-${spec.key}`;
    projects.push({
      id: projectId,
      organizationId: ORG_ID,
      key: spec.key,
      name: spec.name,
      description: spec.description,
      status: "ACTIVE",
      issueKeyCounter: spec.issueCount,
      createdAt: daysAgo(rng.int(300, 360)),
      createdBy: GOOGLE_ADMIN_ID,
    });

    // Members: both owner accounts LEAD on VWP; a realistic role mix elsewhere.
    const memberIds = rng.sample(allUserIds, memberSizeByKey[spec.key] ?? 40);
    for (const forced of [GOOGLE_ADMIN_ID, CREDS_ADMIN_ID]) {
      if (!memberIds.includes(forced)) memberIds.push(forced);
    }
    memberIds.forEach((userId, i) => {
      let role: ProjectRole = rng.weighted<ProjectRole>([
        ["LEAD", 10],
        ["MEMBER", 75],
        ["VIEWER", 15],
      ]);
      if (spec.key === "VWP" && (userId === GOOGLE_ADMIN_ID || userId === CREDS_ADMIN_ID)) {
        role = "LEAD";
      }
      projectMembers.push({
        id: `verus-pm-${spec.key}-${pad(i)}`,
        projectId,
        userId,
        role,
        createdAt: daysAgo(rng.int(150, 300)),
        createdBy: GOOGLE_ADMIN_ID,
      });
    });

    // Components.
    const componentIds: string[] = spec.components.map((name, i) => {
      const id = `verus-comp-${spec.key}-${i}`;
      components.push({
        id,
        projectId,
        name,
        leadId: rng.bool(0.7) ? rng.pick(memberIds) : null,
        createdAt: daysAgo(rng.int(200, 300)),
        createdBy: GOOGLE_ADMIN_ID,
      });
      return id;
    });

    // Sprints (scrum only).
    const completedSprintIds: string[] = [];
    const plannedSprintIds: string[] = [];
    let activeSprintId: string | null = null;
    let sprintNo = 0;
    // Sprint windows, so a DONE issue's transition can be placed INSIDE the
    // sprint that owns it. Without this the synthesised completion date came
    // from the issue's own createdAt and scattered across ~200 days, so almost
    // nothing landed inside any 14-day sprint and every burndown drew flat.
    const sprintWindows: Record<string, { start: Date; end: Date }> = {};
    const addSprint = (status: SprintStatus, start: Date, end: Date) => {
      sprintNo += 1;
      const id = `verus-sprint-${spec.key}-${sprintNo}`;
      sprintWindows[id] = { start, end };
      sprints.push({
        id,
        projectId,
        name: `${spec.key} Sprint ${sprintNo}`,
        goal: rng.pick(SPRINT_GOALS),
        status,
        startDate: start,
        endDate: end,
        position: sprintNo,
        createdAt: start,
        createdBy: GOOGLE_ADMIN_ID,
      });
      return id;
    };
    // Oldest → newest completed, back-to-back ending just before the active one.
    for (let k = spec.completedSprints; k >= 1; k--) {
      const end = daysAgo(8 + (k - 1) * 14);
      completedSprintIds.push(addSprint("COMPLETED", daysAgo(8 + (k - 1) * 14 + 14), end));
    }
    if (spec.activeSprints > 0) activeSprintId = addSprint("ACTIVE", daysAgo(7), daysFromNow(7));
    for (let k = 0; k < spec.plannedSprints; k++) {
      const start = daysFromNow(8 + k * 14);
      plannedSprintIds.push(addSprint("PLANNED", start, daysFromNow(8 + k * 14 + 14)));
    }

    // ---- Issues ----
    const epicCount = spec.epics.length;
    const projectEpicIds: string[] = [];
    let keyNo = 0;

    const pushIssue = (input: Omit<Prisma.IssueCreateManyInput, "rank"> & { rank?: string }) => {
      allIssues.push({ ...input, rank: "" }); // rank filled after grouping
    };

    // Epics first (so children can reference them; also FK-safe on insert).
    for (let i = 0; i < epicCount; i++) {
      keyNo += 1;
      const key = `${spec.key}-${keyNo}`;
      const id = `verus-issue-${key}`;
      projectEpicIds.push(id);
      const reporterId = rng.pick(memberIds);
      pushIssue({
        id,
        projectId,
        key,
        type: "EPIC",
        title: spec.epics[i]!,
        description: rng.pick(DESCRIPTIONS) || null,
        status: rng.weighted(STATUS_WEIGHTS),
        priority: rng.weighted(PRIORITY_WEIGHTS),
        assigneeId: rng.bool(0.8) ? rng.pick(memberIds) : null,
        reporterId,
        sprintId: null,
        epicId: null,
        createdAt: daysAgo(rng.int(150, 340)),
        createdBy: reporterId,
      });
    }

    // The rest.
    for (let i = epicCount; i < spec.issueCount; i++) {
      keyNo += 1;
      const key = `${spec.key}-${keyNo}`;
      const id = `verus-issue-${key}`;
      const type = rng.weighted(NON_EPIC_TYPE_WEIGHTS);
      const status = rng.weighted(STATUS_WEIGHTS);
      const reporterId = rng.pick(memberIds);
      // Bias assignment toward the owner accounts a little so their Home/board
      // are populated; otherwise a random member, 85% assigned.
      let assigneeId: string | null = null;
      if (rng.bool(0.85)) {
        assigneeId = rng.bool(0.06)
          ? rng.pick([GOOGLE_ADMIN_ID, CREDS_ADMIN_ID])
          : rng.pick(memberIds);
      }

      // Sprint assignment by shape + status.
      let sprintId: string | null = null;
      if (spec.shape === "scrum") {
        // Some finished work belongs to the sprint currently running — without
        // it the active sprint holds only unfinished issues, so its burndown
        // has nothing to burn down and draws a flat line at full scope.
        if (status === "DONE" && activeSprintId && rng.bool(0.3)) {
          sprintId = activeSprintId;
        } else if (status === "DONE" && completedSprintIds.length > 0 && rng.bool(0.85)) {
          sprintId = rng.pick(completedSprintIds);
        } else if ((status === "IN_PROGRESS" || status === "IN_REVIEW") && activeSprintId && rng.bool(0.85)) {
          sprintId = activeSprintId;
        } else if (status === "TODO" && plannedSprintIds.length > 0 && rng.bool(0.4)) {
          sprintId = rng.pick(plannedSprintIds);
        }
      }

      const createdAt = daysAgo(rng.int(1, 200));
      // Due dates: some future, some overdue (only meaningful when not DONE).
      let dueDate: Date | null = null;
      if (rng.bool(0.3)) {
        dueDate = rng.bool(0.4) ? daysAgo(rng.int(1, 30)) : daysFromNow(rng.int(1, 45));
      }

      pushIssue({
        id,
        projectId,
        key,
        type,
        title: issueTitle(rng, type),
        description: rng.pick(DESCRIPTIONS) || null,
        status,
        priority: rng.weighted(PRIORITY_WEIGHTS),
        assigneeId,
        reporterId,
        sprintId,
        epicId: rng.bool(0.7) && projectEpicIds.length > 0 ? rng.pick(projectEpicIds) : null,
        storyPoints:
          (type === "STORY" || type === "TASK") && rng.bool(0.6) ? rng.pick(STORY_POINTS) : null,
        estimateMinutes: rng.bool(0.4) ? rng.pick(ESTIMATE_MINUTES) : null,
        dueDate,
        createdAt,
        createdBy: reporterId,
      });

      const issueRef = { id, projectId, status, createdAt, assigneeId, reporterId, key };

      // Components: 0–2 per issue.
      const compsForIssue = rng.sample(componentIds, rng.weighted([[0, 2], [1, 5], [2, 3]]));
      for (const componentId of compsForIssue) {
        issueComponents.push({
          issueId: id,
          componentId,
          createdAt,
          createdBy: reporterId,
        });
        icCounter += 1;
      }

      // Labels: an independent roll per label rather than "pick N of them", so
      // the count per issue falls out of the weights instead of being imposed.
      // With this pool that leaves ~⅓ of issues unlabelled, most of the rest on
      // one or two, and a thin tail carrying enough to exercise the chip
      // overflow (`+N`) and a multi-label filter.
      LABELS.forEach((spec, li) => {
        if (!rng.bool((spec.weight / 100) * labelAffinity(spec.name, type))) return;
        issueLabels.push({
          issueId: id,
          labelId: `verus-label-${pad(li)}`,
          createdAt,
          createdBy: reporterId,
        });
        ilCounter += 1;
      });

      // Comments: ~35% of issues, 1–4 each.
      if (rng.bool(0.35)) {
        const count = rng.int(1, 4);
        for (let c = 0; c < count; c++) {
          const at = new Date(
            createdAt.getTime() + rng.int(1, Math.max(1, Math.floor((NOW.getTime() - createdAt.getTime()) / DAY))) * DAY,
          );
          comments.push({
            id: `verus-cmt-${pad(commentCounter++, 6)}`,
            issueId: id,
            authorId: rng.pick(memberIds),
            body: rng.pick(COMMENTS),
            bodyFormat: "MARKDOWN",
            editedAt: rng.bool(0.1) ? at : null,
            createdAt: at > NOW ? NOW : at,
            createdBy: reporterId,
          });
        }
      }

      // Work logs on issues that have seen activity.
      if ((status === "IN_PROGRESS" || status === "IN_REVIEW" || status === "DONE") && rng.bool(0.55)) {
        const count = rng.int(1, 3);
        for (let w = 0; w < count; w++) {
          workLogs.push({
            id: `verus-wl-${pad(workLogCounter++, 6)}`,
            issueId: id,
            userId: assigneeId ?? rng.pick(memberIds),
            minutes: rng.pick([15, 30, 45, 60, 90, 120, 180, 240]),
            workDate: daysAgo(rng.int(0, 60)),
            note: rng.bool(0.4) ? rng.pick(COMMENTS) : null,
            createdBy: assigneeId ?? reporterId,
          });
        }
      }

      // Status history for DONE issues — feeds cycle time AND burndown.
      // A DONE issue that sits in a sprint ALWAYS gets history regardless of
      // the cap: those are precisely the rows the reports replay, and starving
      // them is what made every burndown flat. The cap still bounds the
      // unsprinted long tail, which no report reads day by day.
      const window = sprintId ? sprintWindows[sprintId] : undefined;
      if (status === "DONE" && (window || auditCounter < AUDIT_CAP)) {
        const actor = issueRef.assigneeId ?? reporterId;
        let clampedStarted: Date;
        let clampedDone: Date;

        if (window) {
          // Finish somewhere inside the sprint's own window (and never in the
          // future), so the curve actually descends across those days.
          const from = window.start.getTime();
          const to = Math.min(window.end.getTime(), NOW.getTime());
          const span = Math.max(1, Math.round((to - from) / DAY));
          clampedDone = new Date(from + rng.int(1, span) * DAY);
          if (clampedDone.getTime() > to) clampedDone = new Date(to);
          // Started a little before it finished, never before the issue existed.
          const startedAt = Math.max(
            createdAt.getTime(),
            clampedDone.getTime() - rng.int(1, 6) * DAY,
          );
          clampedStarted = new Date(Math.min(startedAt, clampedDone.getTime() - 1));
        } else {
          const started = new Date(createdAt.getTime() + rng.int(1, 10) * DAY);
          const done = new Date(started.getTime() + rng.int(1, 20) * DAY);
          clampedStarted = started > NOW ? daysAgo(20) : started;
          clampedDone = done > NOW ? daysAgo(2) : done;
        }
        auditLogs.push({
          id: `verus-audit-${pad(auditCounter++, 6)}`,
          organizationId: ORG_ID,
          actorId: actor,
          action: "ISSUE_STATUS_CHANGED",
          entityType: "Issue",
          entityId: id,
          beforeData: { status: "TODO" },
          afterData: { status: "IN_PROGRESS" },
          createdAt: clampedStarted,
        });
        auditLogs.push({
          id: `verus-audit-${pad(auditCounter++, 6)}`,
          organizationId: ORG_ID,
          actorId: actor,
          action: "ISSUE_STATUS_CHANGED",
          entityType: "Issue",
          entityId: id,
          beforeData: { status: "IN_PROGRESS" },
          afterData: { status: "DONE" },
          createdAt: clampedDone,
        });
      }
    }
  }

  // ---- Assign ranks per (projectId, status) column (unique by construction). ----
  const byColumn = new Map<string, Prisma.IssueCreateManyInput[]>();
  for (const issue of allIssues) {
    const k = `${issue.projectId}::${issue.status ?? "TODO"}`;
    const bucket = byColumn.get(k);
    if (bucket) bucket.push(issue);
    else byColumn.set(k, [issue]);
  }
  for (const bucket of byColumn.values()) {
    const keys = ranksBetween(null, null, bucket.length);
    bucket.forEach((issue, i) => {
      issue.rank = keys[i]!;
    });
  }

  const epics = allIssues.filter((i) => i.type === "EPIC");
  const issues = allIssues.filter((i) => i.type !== "EPIC");

  // ---- Home signals for the owner accounts (rich dashboards). ----
  const recentItems: Prisma.RecentItemCreateManyInput[] = [];
  const favorites: Prisma.FavoriteCreateManyInput[] = [];
  let riCounter = 0;
  let favCounter = 0;
  for (const adminId of [GOOGLE_ADMIN_ID, CREDS_ADMIN_ID]) {
    for (const spec of rng.sample(PROJECTS, 3)) {
      favorites.push({
        id: `verus-fav-${favCounter++}`,
        userId: adminId,
        entityType: "PROJECT",
        entityId: `verus-proj-${spec.key}`,
      });
      recentItems.push({
        id: `verus-ri-${riCounter++}`,
        userId: adminId,
        entityType: "PROJECT",
        entityId: `verus-proj-${spec.key}`,
        interactionType: "VIEWED",
        lastInteractedAt: daysAgo(rng.int(0, 5)),
      });
    }
    for (const issue of rng.sample(issues, 12)) {
      recentItems.push({
        id: `verus-ri-${riCounter++}`,
        userId: adminId,
        entityType: "ISSUE",
        entityId: issue.id!,
        interactionType: rng.pick(["VIEWED", "EDITED", "COMMENTED"] as const),
        lastInteractedAt: daysAgo(rng.int(0, 10)),
      });
    }
  }

  const stats: Record<string, number> = {
    users: admins.length + cast.length,
    teams: teams.length,
    memberships: memberships.length,
    projects: projects.length,
    projectMembers: projectMembers.length,
    components: components.length,
    labels: labels.length,
    sprints: sprints.length,
    epics: epics.length,
    issues: issues.length,
    totalIssues: epics.length + issues.length,
    issueComponents: icCounter,
    issueLabels: ilCounter,
    comments: comments.length,
    workLogs: workLogs.length,
    auditLogs: auditLogs.length,
    recentItems: recentItems.length,
    favorites: favorites.length,
  };

  return {
    org, admins, cast, teams, memberships, projects, projectMembers, components, labels, sprints,
    epics, issues, issueComponents, issueLabels, comments, workLogs, auditLogs, recentItems,
    favorites, stats,
  };
}

// Convenience for the writer's summary.
export function summarizeProjects(): Array<Pick<ProjectSpec, "key" | "name" | "shape" | "issueCount">> {
  return PROJECTS.map((p) => ({ key: p.key, name: p.name, shape: p.shape, issueCount: p.issueCount }));
}
