// One-time bootstrap: creates the single V1 Organization row and the
// first ADMIN user. There is no UI path to create the first admin from
// nothing (docs/02_Modules/01_authentication.md BR-2) — this script is it.
// Run: npm run prisma:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? "Consit AI";
  const orgDomain = process.env.SEED_ORG_DOMAIN ?? "consit.ai";
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
