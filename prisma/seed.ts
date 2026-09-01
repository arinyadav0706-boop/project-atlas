// Bootstrap: creates the single V1 Organization and the first admin — the only
// way to mint an admin from nothing (docs/02_Modules/01_authentication.md BR-2).
// Run: npm run prisma:seed
//
// PRODUCTION SAFETY (GL-1): this script carries NO hardcoded credentials. The
// admin is taken from env; the demo teammates (a shared dev password, for
// exercising RBAC locally) seed only when you are NOT bootstrapping a real admin
// and NOT in production. To seed production:
//   NODE_ENV=production SEED_DEMO=false SEED_ADMIN_EMAIL=you@org.com \
//   SEED_ADMIN_PASSWORD=... npm run prisma:seed
// (omit SEED_ADMIN_PASSWORD for an SSO-only admin.)
import { PrismaClient, type OrgRole, type ProjectRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_STATUSES } from "../src/features/workflow/lib/defaults";

const prisma = new PrismaClient();

const isProd = process.env.NODE_ENV === "production";

// Admin from env only. In non-prod, fall back to a clearly-placeholder local
// admin (never a real person). In prod, refuse to seed without an explicit email.
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? (isProd ? null : "admin@eagles.local");
const adminName = process.env.SEED_ADMIN_NAME ?? "Platform Admin";
const usingDevFallbackAdmin = !process.env.SEED_ADMIN_EMAIL && !isProd;
// A password enables the credentials form; omit it for an SSO-only admin.
const adminPassword =
  process.env.SEED_ADMIN_PASSWORD ?? (usingDevFallbackAdmin ? "changeme-dev-only" : null);

// Demo teammates + demo project (shared dev password) are for local RBAC
// testing. Seed them only when explicitly asked, or — by default — when we're
// not in prod AND not bootstrapping a real admin. Providing SEED_ADMIN_EMAIL
// (a real bootstrap) turns them off automatically, which closes the "ran the
// seed against prod without NODE_ENV set" footgun.
const seedDemo =
  process.env.SEED_DEMO != null
    ? process.env.SEED_DEMO === "true"
    : !isProd && !process.env.SEED_ADMIN_EMAIL;

const DEMO_PASSWORD = "Passw0rd!";
const DEMO_TEAM: { email: string; name: string; orgRole: OrgRole }[] = [
  { email: "aditi.sharma@consint.ai", name: "Aditi Sharma", orgRole: "ADMIN" },
  { email: "kavya.iyer@consint.ai", name: "Kavya Iyer", orgRole: "MEMBER" },
  { email: "ananya.reddy@consint.ai", name: "Ananya Reddy", orgRole: "MEMBER" },
  { email: "diya.nair@consint.ai", name: "Diya Nair", orgRole: "MEMBER" },
  { email: "meera.joshi@consint.ai", name: "Meera Joshi", orgRole: "MEMBER" },
];

// Who gets which project role in the demo project. Meera is intentionally left
// out so "non-member can view but not edit" is testable too.
const DEMO_ROLES: Record<string, ProjectRole> = {
  "kavya.iyer@consint.ai": "LEAD",
  "ananya.reddy@consint.ai": "MEMBER",
  "aditi.sharma@consint.ai": "MEMBER",
  "diya.nair@consint.ai": "VIEWER",
};

async function main() {
  if (!adminEmail) {
    throw new Error(
      "Refusing to seed production without SEED_ADMIN_EMAIL. Set SEED_ADMIN_EMAIL " +
        "(and SEED_ADMIN_PASSWORD for credentials login, or omit it for SSO-only).",
    );
  }

  const org = await prisma.organization.upsert({
    where: { id: "seed-default-org" },
    update: {},
    create: {
      id: "seed-default-org",
      name: process.env.SEED_ORG_NAME ?? "EAGLES",
      domain: process.env.SEED_ORG_DOMAIN ?? "eagles.local",
    },
  });

  const passwordHash = adminPassword ? await bcrypt.hash(adminPassword, 10) : null;
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    // Never clobber an existing admin's password with null on re-seed.
    update: {
      orgRole: "ADMIN",
      isActive: true,
      ...(passwordHash ? { passwordHash } : {}),
    },
    create: {
      organizationId: org.id,
      email: adminEmail,
      name: adminName,
      orgRole: "ADMIN",
      passwordHash,
    },
  });

  console.log(`Seeded organization "${org.name}".`);
  console.log(
    `Admin: ${admin.email}${isProd ? "" : ` (password: ${adminPassword ?? "— SSO only —"})`}`,
  );
  if (!passwordHash) {
    console.warn(
      "  ⚠ No admin password set — this admin can only sign in via SSO (Google/Microsoft).",
    );
  }

  if (!seedDemo) return;

  console.warn(
    "\n⚠ Seeding DEMO accounts with a shared, known password — for local testing " +
      "ONLY. Never run this against a production database (set SEED_DEMO=false).",
  );

  const teamHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const usersByEmail = new Map<string, string>();
  for (const t of DEMO_TEAM) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { orgRole: t.orgRole, isActive: true, passwordHash: teamHash },
      create: {
        organizationId: org.id,
        email: t.email,
        name: t.name,
        orgRole: t.orgRole,
        passwordHash: teamHash,
        createdBy: admin.id,
      },
    });
    usersByEmail.set(t.email, user.id);
  }

  const project = await prisma.project.upsert({
    where: { id: "seed-demo-project" },
    update: {},
    create: {
      id: "seed-demo-project",
      organizationId: org.id,
      key: "DEMO",
      name: "EAGLES Demo",
      description: "Sample project for exercising roles and the Issues workflow.",
      createdBy: admin.id,
    },
  });

  // Workflow statuses for the demo project (30_workflow BR-7).
  //
  // This was missing, and the consequence was not subtle: statuses became data
  // in module 30, `ProjectRepository.create` seeds them for every project made
  // through the app, and this seed writes the project row directly — so the
  // demo project had none. Creating an issue on it returned a 500 with
  // "Project seed-demo-project has no default status", which is exactly what
  // anyone following the local-dev instructions would hit on their first click,
  // and what made the E2E suite's most important test fail.
  //
  // Reuses DEFAULT_STATUSES rather than restating the four, for the reason that
  // module's own comment gives: the migration that seeded existing projects and
  // the code that seeds new ones must agree by construction, not by memory.
  const statusCount = await prisma.workflowStatus.count({
    where: { projectId: project.id, deletedAt: null },
  });
  if (statusCount === 0) {
    await prisma.workflowStatus.createMany({
      data: DEFAULT_STATUSES.map((status) => ({
        ...status,
        projectId: project.id,
        organizationId: org.id,
        createdBy: admin.id,
        updatedBy: admin.id,
      })),
    });
  }

  for (const [email, role] of Object.entries(DEMO_ROLES)) {
    const userId = usersByEmail.get(email);
    if (!userId) continue;
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      update: { role, deletedAt: null },
      create: { projectId: project.id, userId, role, createdBy: admin.id },
    });
  }

  await seedDemoIssues(project.id, admin.id, usersByEmail);

  console.log(`Demo team (password: ${DEMO_PASSWORD}):`);
  for (const t of DEMO_TEAM) {
    const role = DEMO_ROLES[t.email] ?? "non-member";
    console.log(`  - ${t.name} <${t.email}> — org ${t.orgRole}, demo project: ${role}`);
  }
}

// Sample issues for the demo project.
//
// The seed used to create a project with no issues in it, which meant /issues,
// the board and every report opened empty on a fresh checkout — and the E2E
// specs that assert on a populated list only passed because OTHER specs had
// created issues first. A test that depends on another test's side effects is
// not a safety net; it is a coincidence that holds until someone runs one spec
// on its own.
//
// Deliberately small and deliberately varied: every type, every priority, all
// four statuses, some assigned and some not, some overdue and some with no due
// date — enough for the filters to have something to do.
const DEMO_ISSUES: {
  type: "EPIC" | "STORY" | "TASK" | "BUG" | "SUBTASK";
  title: string;
  status: "To Do" | "In Progress" | "In Review" | "Done";
  priority: "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";
  assignee?: string;
  dueInDays?: number;
  points?: number;
}[] = [
  { type: "EPIC", title: "Onboarding for new joiners", status: "In Progress", priority: "HIGH" },
  { type: "STORY", title: "As a new joiner, I can see my first-week checklist", status: "In Progress", priority: "HIGH", assignee: "kavya.iyer@consint.ai", dueInDays: 5, points: 5 },
  { type: "STORY", title: "As an admin, I can invite a teammate by email", status: "To Do", priority: "MEDIUM", assignee: "ananya.reddy@consint.ai", points: 3 },
  { type: "TASK", title: "Write the welcome email copy", status: "Done", priority: "LOW", assignee: "aditi.sharma@consint.ai", dueInDays: -6 },
  { type: "TASK", title: "Add an index on issues(assigneeId, status)", status: "Done", priority: "MEDIUM", assignee: "kavya.iyer@consint.ai", points: 2 },
  { type: "BUG", title: "Due date shows a day early in the IST timezone", status: "In Review", priority: "HIGHEST", assignee: "ananya.reddy@consint.ai", dueInDays: -2 },
  { type: "BUG", title: "Saved view loses its sort after a refresh", status: "To Do", priority: "HIGH", dueInDays: 3 },
  { type: "BUG", title: "Avatar upload fails silently over 5 MB", status: "To Do", priority: "MEDIUM", assignee: "aditi.sharma@consint.ai" },
  { type: "TASK", title: "Document the local Postgres setup", status: "To Do", priority: "LOWEST" },
  { type: "STORY", title: "As a lead, I can reorder the backlog by drag", status: "In Progress", priority: "HIGH", assignee: "kavya.iyer@consint.ai", points: 8 },
  { type: "TASK", title: "Retire the legacy status enum from reports", status: "In Review", priority: "LOW", assignee: "aditi.sharma@consint.ai", points: 3 },
  { type: "BUG", title: "Bulk edit reports zero updated when nothing changed", status: "Done", priority: "LOW", dueInDays: -12 },
];

async function seedDemoIssues(
  projectId: string,
  adminId: string,
  usersByEmail: Map<string, string>,
) {
  // Idempotent by presence, not by upsert-per-row: re-running the seed on a
  // project someone has been clicking around in must not resurrect issues they
  // deleted or reset the ones they edited.
  const existing = await prisma.issue.count({ where: { projectId } });
  if (existing > 0) return;

  const statuses = await prisma.workflowStatus.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, name: true, category: true },
  });
  const byName = new Map(statuses.map((s) => [s.name, s]));

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const [i, seed] of DEMO_ISSUES.entries()) {
    const status = byName.get(seed.status);
    if (!status) continue;
    await prisma.issue.create({
      data: {
        projectId,
        key: `DEMO-${i + 1}`,
        type: seed.type,
        title: seed.title,
        statusId: status.id,
        // Denormalised category, written in the same statement as `statusId` —
        // the invariant module 30 pins.
        status: status.category,
        priority: seed.priority,
        assigneeId: seed.assignee ? (usersByEmail.get(seed.assignee) ?? null) : null,
        reporterId: adminId,
        storyPoints: seed.points ?? null,
        dueDate: seed.dueInDays === undefined ? null : new Date(now + seed.dueInDays * day),
        // Ranks only have to be unique within (project, status) and sort
        // sensibly; a zero-padded ordinal satisfies both without pulling the
        // fractional-indexing generator into the seed.
        rank: `a${String(i).padStart(4, "0")}`,
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { issueKeyCounter: DEMO_ISSUES.length },
  });

  console.log(`Seeded ${DEMO_ISSUES.length} demo issues.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
