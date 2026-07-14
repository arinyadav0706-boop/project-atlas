import { Skeleton } from "@/shared/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-8">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border p-4">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
