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

  for (const [email, role] of Object.entries(DEMO_ROLES)) {
    const userId = usersByEmail.get(email);
    if (!userId) continue;
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      update: { role, deletedAt: null },
      create: { projectId: project.id, userId, role, createdBy: admin.id },
    });
  }

  console.log(`Demo team (password: ${DEMO_PASSWORD}):`);
  for (const t of DEMO_TEAM) {
    const role = DEMO_ROLES[t.email] ?? "non-member";
    console.log(`  - ${t.name} <${t.email}> — org ${t.orgRole}, demo project: ${role}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
