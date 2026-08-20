-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "startDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "issues_projectId_startDate_idx" ON "issues"("projectId", "startDate");
