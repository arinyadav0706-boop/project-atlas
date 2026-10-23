import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { HomeService, parseActivityTab, parseWorkTab } from "@/features/home/services/home.service";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { AppFrame, Workspace, WorkspaceHeader } from "@/shared/components/layout/app-frame";
import { MyWorkSection } from "@/features/home/components/sections/my-work-section";
import { AttentionSection } from "@/features/home/components/sections/attention-section";
import { ContinueWorkingSection } from "@/features/home/components/sections/continue-working-section";
import { FocusSection } from "@/features/home/components/sections/focus-section";
import { SummarySection } from "@/features/home/components/sections/summary-section";
import { ActivitySection } from "@/features/home/components/sections/activity-section";
import { UpcomingSection } from "@/features/home/components/sections/upcoming-section";
import { WorkloadSection } from "@/features/home/components/sections/workload-section";
import type { HomeActivityTab, HomeWorkTab } from "@/features/home/types/home.types";
import { ProjectStripSection } from "@/features/home/components/sections/project-strip-section";

// Home — the personal work dashboard (ADR-0057, 02_home.md). Each panel is an
// independent async server component in its own <Suspense> boundary, so the
// shell + fast panels paint immediately and slower ones stream in. The panel set
// is CLOSED; future modules feed it, never adding new panels. Panels appear only
// once real data backs them (BR-12) — Quick actions are still to come.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, session, params] = await Promise.all([getActor(), getSession(), searchParams]);
  if (!actor) redirect("/sign-in");
  const firstName = (session?.user?.name ?? "there").split(" ")[0];
  // One membership query for the whole page; sections receive the scope and
  // stream independently (BR-7).
  const projectIds = await HomeService.memberProjectIds(actor);
  // Panel tabs live in the URL (BR-13, BR-14): each tab link changes its own
  // parameter and keeps the other, so switching one panel never resets another.
  const tabs = { work: parseWorkTab(params.work), activity: parseActivityTab(params.activity) };
  const workHref = (work: HomeWorkTab) => homeHref({ ...tabs, work });
  const activityHref = (activity: HomeActivityTab) => homeHref({ ...tabs, activity });

  return (
    <AppFrame>
      {/* The greeting IS the page title. It used to be a 28px line with a
          15px sentence under it — 92px of chrome to say hello, on the screen
          people see most often. The sentence said nothing the panels below do
          not say better, so it is gone rather than demoted. */}
      <WorkspaceHeader
        title={`${greeting()}, ${firstName}`}
        actions={<span className="text-meta text-muted-foreground">{today()}</span>}
      />

      <Workspace className="p-4">
        <div className="flex flex-col gap-4">
          <Suspense fallback={<SummarySkeleton />}>
            <SummarySection actor={actor} projectIds={projectIds} />
          </Suspense>

          {/*
            Main column + right rail, the approved mockup's arrangement. The rail
            holds the "what next" lists; the main column holds the work itself.
            Below xl the rail drops under the main column rather than squeezing
            both — a 20rem rail beside a 600px column is two cramped lists.

            `items-start` matters: without it the grid stretches every panel in a
            row to the tallest, so a five-item panel beside a ten-item one grows a
            large empty area under its last row.
          */}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Suspense fallback={<SectionSkeleton rows={5} />}>
                  <MyWorkSection
                    actor={actor}
                    projectIds={projectIds}
                    tab={tabs.work}
                    hrefFor={workHref}
                  />
                </Suspense>
                <Suspense fallback={<SectionSkeleton rows={5} />}>
                  <AttentionSection actor={actor} projectIds={projectIds} />
                </Suspense>
              </div>
              <Suspense fallback={<SectionSkeleton rows={3} grid />}>
                <ProjectStripSection actor={actor} />
              </Suspense>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Suspense fallback={<SectionSkeleton rows={5} />}>
                  <ActivitySection
                    actor={actor}
                    projectIds={projectIds}
                    tab={tabs.activity}
                    hrefFor={activityHref}
                  />
                </Suspense>
                <Suspense fallback={<SectionSkeleton rows={3} />}>
                  <WorkloadSection actor={actor} />
                </Suspense>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Suspense fallback={<SectionSkeleton rows={5} />}>
                <FocusSection actor={actor} projectIds={projectIds} />
              </Suspense>
              <Suspense fallback={<SectionSkeleton rows={4} />}>
                <UpcomingSection actor={actor} projectIds={projectIds} />
              </Suspense>
              <Suspense fallback={<SectionSkeleton rows={4} />}>
                <ContinueWorkingSection actor={actor} projectIds={projectIds} />
              </Suspense>
            </div>
          </div>
        </div>
      </Workspace>
    </AppFrame>
  );
}

/**
 * Time-of-day greeting, from the server clock.
 *
 * Correct only while the org shares a timezone with the deployment region —
 * true today (one company, Vercel in Mumbai) and the reason this is not a
 * client component: computing it in the browser would either flash a
 * placeholder on first paint or need a hydration suppression, for a word.
 * If EAGLES ever serves people across timezones this has to move client-side,
 * because "Good morning" at 11pm is a visible bug.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** `/home` with only the non-default tabs in the query, so the plain URL stays plain. */
function homeHref(tabs: { work: HomeWorkTab; activity: HomeActivityTab }): string {
  const query = new URLSearchParams();
  if (tabs.work !== "assigned") query.set("work", tabs.work);
  if (tabs.activity !== "all") query.set("activity", tabs.activity);
  const qs = query.toString();
  return qs ? `/home?${qs}` : "/home";
}

/** Today's date for the header, from the same server clock as greeting(). */
function today(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Same grid and tile height as SummarySection, so streaming in shifts nothing.
function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

// Matches the real panel: an h-11 header rule, then rows at the row height the
// sections use. A skeleton that is a different shape from what replaces it is
// a layout shift with extra steps.
function SectionSkeleton({ rows, grid = false }: { rows: number; grid?: boolean }) {
  return (
    <div className="rounded-panel border border-border bg-background shadow-card">
      <div className="flex h-11 items-center border-b border-border-subtle px-3">
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="p-2">
        {grid ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-control" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-row-compact rounded-control" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
