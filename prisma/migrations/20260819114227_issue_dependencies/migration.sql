-- CreateEnum
CREATE TYPE "IssueLinkType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATES');

-- CreateTable
CREATE TABLE "issue_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "IssueLinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_links_targetId_type_idx" ON "issue_links"("targetId", "type");

-- CreateIndex
CREATE INDEX "issue_links_sourceId_type_idx" ON "issue_links"("sourceId", "type");

-- CreateIndex
CREATE INDEX "issue_links_organizationId_idx" ON "issue_links"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_links_sourceId_targetId_type_key" ON "issue_links"("sourceId", "targetId", "type");

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
