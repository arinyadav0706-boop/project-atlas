import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { HomeService } from "@/features/home/services/home.service";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { AppFrame } from "@/shared/components/ui/app-frame";
import { MyWorkSection } from "@/features/home/components/sections/my-work-section";
import { AttentionSection } from "@/features/home/components/sections/attention-section";
import { ContinueWorkingSection } from "@/features/home/components/sections/continue-working-section";
import { DueSoonSection } from "@/features/home/components/sections/due-soon-section";
import { ProjectStripSection } from "@/features/home/components/sections/project-strip-section";

export default async function HomePage() {
  const [actor, session] = await Promise.all([getActor(), getSession()]);
  if (!actor) redirect("/sign-in");
  const firstName = (session?.user?.name ?? "there").split(" ")[0];
  const projectIds = await HomeService.memberProjectIds(actor);

  return (
    <AppFrame className="py-5">
      {/* Sleek Google/Apple Workspace Greeting */}
      <header className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span>{greeting()}, {firstName}</span>
          <span className="text-lg" aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Here&apos;s your personal action launchpad for today.
        </p>
      </header>

      {/* Full-bleed, high-density responsive grid */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Suspense fallback={<SectionSkeleton rows={4} />}>
          <MyWorkSection actor={actor} projectIds={projectIds} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton rows={4} />}>
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
    </AppFrame>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function SectionSkeleton({ rows, grid = false }: { rows: number; grid?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <Skeleton className="mb-3 h-4 w-28 rounded-sm" />
      {grid ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-subtle divide-y divide-border-subtle">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
