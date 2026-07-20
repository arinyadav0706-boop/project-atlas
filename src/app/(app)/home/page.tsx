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
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-foreground">
        Good to see you, {firstName}
      </h1>

      <Suspense fallback={<SectionSkeleton rows={4} />}>
        <MyWorkSection actor={actor} projectIds={projectIds} />
      </Suspense>
      <Suspense fallback={null}>
        <AttentionSection actor={actor} projectIds={projectIds} />
      </Suspense>
      <Suspense fallback={null}>
        <ContinueWorkingSection actor={actor} projectIds={projectIds} />
      </Suspense>
      <Suspense fallback={null}>
        <DueSoonSection actor={actor} projectIds={projectIds} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton rows={2} grid />}>
        <ProjectStripSection actor={actor} />
      </Suspense>
    </div>
  );
}

function SectionSkeleton({ rows, grid = false }: { rows: number; grid?: boolean }) {
  return (
    <div className="mb-8">
      <Skeleton className="mb-3 h-4 w-28" />
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
