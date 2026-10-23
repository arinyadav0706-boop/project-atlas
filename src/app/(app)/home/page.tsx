import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { HomeService, parseActivityTab, parseWorkTab } from "@/features/home/services/home.service";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Sun } from "lucide-react";
import { AppFrame, Workspace } from "@/shared/components/layout/app-frame";
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
  const firstName = (session?.user?.name ?? "there").split(" ")[0] ?? "there";
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
      <Workspace className="p-4">
        {/*
          Main column + right rail, from the approved reference: the rail runs
          the full height beside everything, greeting included. It holds the
          "what next" lists; the main column holds the work itself. Below xl
          the rail drops under the main column rather than squeezing both.

          `items-start` matters: without it the grid stretches every panel in a
          row to the tallest, so a five-item panel beside a ten-item one grows a
          large empty area under its last row.
        */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17.5rem] 2xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Greeting name={firstName} />
            <Suspense fallback={<SummarySkeleton />}>
              <SummarySection actor={actor} projectIds={projectIds} />
            </Suspense>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
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

/**
 * The page's title block, as in the approved reference: a prominent greeting
 * with a quiet line under it, and the date opposite. It replaces the compact
 * 44px WorkspaceHeader the other pages use, on Home only (ADR-0057).
 */
function Greeting({ name }: { name: string }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning"
      >
        <Sun className="size-6" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-foreground">
          {`${greeting()}, ${name}`}
        </h1>
        <p className="text-[15px] leading-5 text-muted-foreground">
          Here&apos;s what&apos;s happening with your work today.
        </p>
      </div>
      <p className="ml-auto self-start pt-1 text-[13px] text-muted-foreground">{today()}</p>
    </header>
  );
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
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Same grid and tile height as SummarySection, so streaming in shifts nothing.
function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-[98px] rounded-panel" />
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
