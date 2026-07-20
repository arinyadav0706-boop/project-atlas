-- CreateEnum
CREATE TYPE "RecentEntityType" AS ENUM ('ISSUE', 'PROJECT');

-- CreateEnum
CREATE TYPE "FavoriteEntityType" AS ENUM ('PROJECT');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('VIEWED', 'ASSIGNED', 'MENTIONED', 'COMMENTED', 'TRANSITIONED', 'EDITED');

-- CreateTable
CREATE TABLE "recent_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "RecentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "interactionType" "InteractionType" NOT NULL,
    "lastInteractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "FavoriteEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recent_items_userId_lastInteractedAt_idx" ON "recent_items"("userId", "lastInteractedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recent_items_userId_entityType_entityId_key" ON "recent_items"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "favorites_userId_entityType_idx" ON "favorites"("userId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_entityType_entityId_key" ON "favorites"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "recent_items" ADD CONSTRAINT "recent_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
