import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { NotFoundError } from "@/shared/lib/errors";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";

export default async function IssueDetailPage({
  params,
}: {
  params: { projectId: string; issueId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const [issue, members] = await Promise.all([
      IssueService.get(actor, params.issueId),
      ProjectService.listMembers(actor, params.projectId),
    ]);
    return (
      <div>
        <Link
          href={`/projects/${params.projectId}/issues`}
          className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          All issues
        </Link>
        <IssueDetailView
          projectId={params.projectId}
          issue={issue}
          members={members.map((m) => ({ userId: m.userId, name: m.name }))}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
