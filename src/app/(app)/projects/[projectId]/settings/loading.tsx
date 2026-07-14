import { Skeleton } from "@/shared/components/ui/skeleton";

export default function ProjectSettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <Skeleton className="mb-6 h-4 w-20" />
      <div className="mb-8 flex items-center gap-3">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="space-y-10">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border">
            <div className="border-b border-border px-5 py-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="mt-2 h-3.5 w-56" />
            </div>
            <div className="space-y-4 px-5 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
