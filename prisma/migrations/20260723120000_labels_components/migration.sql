-- Labels & Components (ADR-0018, 17_labels.md, 18_components.md).

-- Labels: replace the case-SENSITIVE unique with a case-INSENSITIVE partial
-- unique index over LIVE rows only, so `Bug` == `bug` (BR-3) and a soft-deleted
-- label's name can be reused. Prisma can't express lower()/partial in-schema.
DROP INDEX "labels_organizationId_name_key";
CREATE UNIQUE INDEX "labels_org_lower_name_live_key"
    ON "labels" ("organizationId", lower("name"))
    WHERE "deletedAt" IS NULL;

-- CreateTable
CREATE TABLE "components" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_components" (
    "issueId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "issue_components_pkey" PRIMARY KEY ("issueId","componentId")
);

-- CreateIndex
CREATE INDEX "components_projectId_idx" ON "components"("projectId");

-- Case-insensitive uniqueness per project over live rows (BR-4).
CREATE UNIQUE INDEX "components_project_lower_name_live_key"
    ON "components" ("projectId", lower("name"))
    WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "issue_components_componentId_idx" ON "issue_components"("componentId");

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_components" ADD CONSTRAINT "issue_components_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_components" ADD CONSTRAINT "issue_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
