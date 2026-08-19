-- CreateEnum
CREATE TYPE "DashboardVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "DashboardWidgetType" AS ENUM ('STAT', 'BREAKDOWN', 'LIST');

-- CreateEnum
CREATE TYPE "DashboardWidgetWidth" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "DashboardBreakdownBy" AS ENUM ('STATUS', 'PRIORITY', 'TYPE', 'ASSIGNEE');

-- CreateTable
CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" "DashboardVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DashboardWidgetType" NOT NULL,
    "width" "DashboardWidgetWidth" NOT NULL DEFAULT 'SMALL',
    "position" INTEGER NOT NULL,
    "filter" JSONB NOT NULL,
    "savedViewId" TEXT,
    "breakdownBy" "DashboardBreakdownBy",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboards_organizationId_visibility_deletedAt_idx" ON "dashboards"("organizationId", "visibility", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "dashboards_ownerId_name_key" ON "dashboards"("ownerId", "name");

-- CreateIndex
CREATE INDEX "dashboard_widgets_dashboardId_idx" ON "dashboard_widgets"("dashboardId");

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_savedViewId_fkey" FOREIGN KEY ("savedViewId") REFERENCES "saved_views"("id") ON DELETE SET NULL ON UPDATE CASCADE;
