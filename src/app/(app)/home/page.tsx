import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { HomeService } from "@/features/home/services/home.service";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { AppFrame, Workspace, WorkspaceHeader } from "@/shared/components/layout/app-frame";
import { MyWorkSection } from "@/features/home/components/sections/my-work-section";
import { AttentionSection } from "@/features/home/components/sections/attention-section";
import { ContinueWorkingSection } from "@/features/home/components/sections/continue-working-section";
import { DueSoonSection } from "@/features/home/components/sections/due-soon-section";
import { ProjectStripSection } from "@/features/home/components/sections/project-strip-section";

// Home — the personal action launchpad (ADR-0012, 02_home.md). Each section is
// an independent async server component in its own <Suspense> boundary, so the
// shell + fast sections paint immediately and slower ones stream in. The set of
// sections is FIXED; future modules feed them, never adding new ones.
export default async function HomePage() {
  const [actor, session] = await Promise.all([getActor(), getSession()]);
  if (!actor) redirect("/sign-in");
  const firstName = (session?.user?.name ?? "there").split(" ")[0];
  // One membership query for the whole page; sections receive the scope and
  // stream independently (BR-7).
  const projectIds = await HomeService.memberProjectIds(actor);

  return (
    <AppFrame>
      {/* The greeting IS the page title. It used to be a 28px line with a
          15px sentence under it — 92px of chrome to say hello, on the screen
          people see most often. The sentence said nothing the panels below do
          not say better, so it is gone rather than demoted. */}
      <WorkspaceHeader title={`${greeting()}, ${firstName}`} />

      <Workspace className="p-4">
        {/*
          One column, two from `lg`, THREE from `2xl`.

          The three-up row is what the width is for: at 1920 a two-column grid
          made each panel ~830px wide to hold a list of five one-line rows, and
          pushed Projects below the fold. At 2xl the three lists that answer
          "what should I be doing right now" — my work, what needs me, what is
          due — sit on one row, and the two navigational panels follow.

          `items-start` matters: without it the grid stretches every panel in a
          row to the tallest, so a five-item panel beside a ten-item one grows a
          large empty area under its last row.
        */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <Suspense fallback={<SectionSkeleton rows={5} />}>
            <MyWorkSection actor={actor} projectIds={projectIds} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={5} />}>
            <AttentionSection actor={actor} projectIds={projectIds} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={5} />}>
            <DueSoonSection actor={actor} projectIds={projectIds} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={4} />}>
            <ContinueWorkingSection actor={actor} projectIds={projectIds} />
          </Suspense>
          <div className="lg:col-span-2">
            <Suspense fallback={<SectionSkeleton rows={3} grid />}>
              <ProjectStripSection actor={actor} />
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
