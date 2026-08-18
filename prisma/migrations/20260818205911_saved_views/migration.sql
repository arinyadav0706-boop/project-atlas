-- CreateEnum
CREATE TYPE "SavedViewVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "SavedViewSort" AS ENUM ('UPDATED_DESC', 'UPDATED_ASC', 'CREATED_DESC', 'CREATED_ASC', 'DUE_DATE_ASC', 'DUE_DATE_DESC', 'PRIORITY_DESC', 'PRIORITY_ASC', 'KEY_ASC');

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "sort" "SavedViewSort" NOT NULL DEFAULT 'UPDATED_DESC',
    "visibility" "SavedViewVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_views_organizationId_visibility_deletedAt_idx" ON "saved_views"("organizationId", "visibility", "deletedAt");

-- CreateIndex
CREATE INDEX "saved_views_ownerId_deletedAt_idx" ON "saved_views"("ownerId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_ownerId_name_key" ON "saved_views"("ownerId", "name");

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
