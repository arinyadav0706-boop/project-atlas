import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/components/ui/page-header";

// The frame every Workload detail route shares.
//
// The pattern this establishes, deliberately, for the rest of EAGLES: a summary
// card on a dashboard shows the top few rows and links to a ROUTE that holds
// the complete list. It does not scroll you to an anchor further down the same
// page. An anchor cannot be linked to from elsewhere, cannot be bookmarked,
// gives no back button, and — the thing that actually made it feel broken —
// looks identical to the page having simply jumped.
export function WorkloadDetailShell({
  title,
  subtitle,
  teamName,
  backHref,
  children,
}: {
  title: string;
  subtitle: string;
  /** Which team this list is for; a detail route is always scoped to one. */
  teamName?: string;
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Workload
      </Link>

      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          teamName && (
            <span className="rounded-xl border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground shadow-card">
              {teamName}
            </span>
          )
        }
      />

      <div className="mt-6">{children}</div>
    </div>
  );
}
