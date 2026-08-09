import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { HomeService } from "@/features/home/services/home.service";
import { Skeleton } from "@/shared/components/ui/skeleton";
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
    <div className="mx-auto max-w-6xl">
      <header className="mb-7">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {greeting()}, {firstName} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Here&apos;s what&apos;s happening with your work today.
        </p>
      </header>

      {/* Two columns from `lg` up, matched in pairs: the two lists people scan
          first sit side by side, then the two time-based ones, then projects
          full width. Below `lg` it collapses to the original single column —
          the pairing is a convenience at width, not the information order.

          `items-start` matters: without it the grid stretches every card in a
          row to the tallest, so a five-item card beside an eight-item one grows
          a large empty area under its last row. Cards size to content. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <MyWorkSection actor={actor} projectIds={projectIds} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <AttentionSection actor={actor} projectIds={projectIds} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <ContinueWorkingSection actor={actor} projectIds={projectIds} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={3} />}>
          <DueSoonSection actor={actor} projectIds={projectIds} />
        </Suspense>
        <div className="lg:col-span-2">
          <Suspense fallback={<SectionSkeleton rows={3} grid />}>
            <ProjectStripSection actor={actor} />
          </Suspense>
        </div>
      </div>
    </div>
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

function SectionSkeleton({ rows, grid = false }: { rows: number; grid?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
      <Skeleton className="mb-4 h-4 w-28" />
      {grid ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-11 border-b border-border last:border-b-0" />
          ))}
        </div>
      )}
    </div>
  );
}
