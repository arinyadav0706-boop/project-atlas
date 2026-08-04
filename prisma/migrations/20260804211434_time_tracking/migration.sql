-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "estimateMinutes" INTEGER;

-- CreateTable
CREATE TABLE "work_logs" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_logs_issueId_deletedAt_idx" ON "work_logs"("issueId", "deletedAt");

-- CreateIndex
CREATE INDEX "work_logs_userId_workDate_idx" ON "work_logs"("userId", "workDate");

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
