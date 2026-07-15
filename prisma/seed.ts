// One-time bootstrap: creates the single V1 Organization row and the
// first ADMIN user. There is no UI path to create the first admin from
// nothing (docs/02_Modules/01_authentication.md BR-2) — this script is it.
// Run: npm run prisma:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dev-only sample teammates so the app has real, loginable users to assign
// issues to and add as project members. NOT for production — gated behind
// SEED_DUMMY_USERS=true. They sign in with the credentials form using the
// shared password below.
const DUMMY_PASSWORD = process.env.SEED_DUMMY_PASSWORD ?? "Passw0rd!";
const DUMMY_USERS = [
  { email: "priya.mehta@consint.ai", name: "Priya Mehta" },
  { email: "arjun.rao@consint.ai", name: "Arjun Rao" },
  { email: "sara.khan@consint.ai", name: "Sara Khan" },
  { email: "dev.patel@consint.ai", name: "Dev Patel" },
];

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? "Consint AI";
  const orgDomain = process.env.SEED_ORG_DOMAIN ?? "consint.ai";
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Founder";

  if (!adminEmail) {
    throw new Error(
      "SEED_ADMIN_EMAIL is required, e.g.: SEED_ADMIN_EMAIL=you@example.com npm run prisma:seed",
    );
  }

  const org = await prisma.organization.upsert({
    where: { id: "seed-default-org" },
    update: {},
    create: { id: "seed-default-org", name: orgName, domain: orgDomain },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { orgRole: "ADMIN", isActive: true },
    create: {
      organizationId: org.id,
      email: adminEmail,
      name: adminName,
      orgRole: "ADMIN",
    },
  });

  console.log(`Seeded organization "${org.name}" and admin user "${admin.email}".`);

  if (process.env.SEED_DUMMY_USERS === "true") {
    const passwordHash = await bcrypt.hash(DUMMY_PASSWORD, 10);
    for (const u of DUMMY_USERS) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash, isActive: true },
        create: {
          organizationId: org.id,
          email: u.email,
          name: u.name,
          orgRole: "MEMBER",
          passwordHash,
        },
      });
    }
    console.log(
      `Seeded ${DUMMY_USERS.length} dummy users (password: "${DUMMY_PASSWORD}"): ` +
        DUMMY_USERS.map((u) => u.email).join(", "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
