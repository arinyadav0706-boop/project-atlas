-- CreateIndex
CREATE INDEX "issues_projectId_sprintId_rank_idx" ON "issues"("projectId", "sprintId", "rank");
