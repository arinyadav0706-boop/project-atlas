// Bootstrap: creates the single V1 Organization, the admin user(s), and a
// small set of teammates + a demo project so RBAC (org ADMIN/MEMBER and
// project LEAD/MEMBER/VIEWER) can be exercised end-to-end. There is no UI
// path to create the first admin from nothing (docs/02_Modules/01_authentication.md
// BR-2) — this script is it. Run: npm run prisma:seed
import { PrismaClient, type OrgRole, type ProjectRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// The requested platform admin — signs in with the credentials form.
const ADMIN = {
  email: "arin.yadav2021@vitalumn.ac.in",
  name: "Arin Yadav",
  password: "ARIN@321",
};

// Sample teammates. Shared password for convenience while testing; each is
// given a distinct role via the demo project below so every RBAC branch has
// a real user behind it.
const TEAM_PASSWORD = "Passw0rd!";
const TEAM: { email: string; name: string; orgRole: OrgRole }[] = [
  { email: "aditi.sharma@consint.ai", name: "Aditi Sharma", orgRole: "ADMIN" },
  { email: "kavya.iyer@consint.ai", name: "Kavya Iyer", orgRole: "MEMBER" },
  { email: "ananya.reddy@consint.ai", name: "Ananya Reddy", orgRole: "MEMBER" },
  { email: "diya.nair@consint.ai", name: "Diya Nair", orgRole: "MEMBER" },
  { email: "meera.joshi@consint.ai", name: "Meera Joshi", orgRole: "MEMBER" },
];

// Who gets which project role in the demo project. Meera is intentionally
// left out so "non-member can view but not edit" is testable too.
const DEMO_ROLES: Record<string, ProjectRole> = {
  "kavya.iyer@consint.ai": "LEAD",
  "ananya.reddy@consint.ai": "MEMBER",
  "aditi.sharma@consint.ai": "MEMBER",
  "diya.nair@consint.ai": "VIEWER",
};

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? "Consint AI";
  const orgDomain = process.env.SEED_ORG_DOMAIN ?? "consint.ai";

  const org = await prisma.organization.upsert({
    where: { id: "seed-default-org" },
    update: {},
    create: { id: "seed-default-org", name: orgName, domain: orgDomain },
  });

  const adminHash = await bcrypt.hash(ADMIN.password, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN.email },
    update: { orgRole: "ADMIN", isActive: true, passwordHash: adminHash },
    create: {
      organizationId: org.id,
      email: ADMIN.email,
      name: ADMIN.name,
      orgRole: "ADMIN",
      passwordHash: adminHash,
    },
  });

  // Optional OAuth founder admin (no password) — kept for the Google/MS path.
  if (process.env.SEED_ADMIN_EMAIL) {
    await prisma.user.upsert({
      where: { email: process.env.SEED_ADMIN_EMAIL },
      update: { orgRole: "ADMIN", isActive: true },
      create: {
        organizationId: org.id,
        email: process.env.SEED_ADMIN_EMAIL,
        name: process.env.SEED_ADMIN_NAME ?? "Founder",
        orgRole: "ADMIN",
      },
    });
  }

  const teamHash = await bcrypt.hash(TEAM_PASSWORD, 10);
  const usersByEmail = new Map<string, string>();
  for (const t of TEAM) {
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

  // Demo project, led by Kavya, so project-role RBAC is exercisable.
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

  console.log(`Seeded organization "${org.name}".`);
  console.log(`Admin: ${admin.email} (password: ${ADMIN.password})`);
  console.log(`Team (password: ${TEAM_PASSWORD}):`);
  for (const t of TEAM) {
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
