import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { AttachmentService } from "@/features/attachments/services/attachment.service";
import { WorkLogService } from "@/features/time-tracking/services/work-log.service";
import { LabelService } from "@/features/labels/services/label.service";
import { ComponentService } from "@/features/components/services/component.service";
import { NotFoundError } from "@/shared/lib/errors";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";
import { IssueClassification } from "@/features/issues/components/issue-classification";
import { CommentsSection } from "@/features/comments/components/comments-section";
import { AttachmentsSection } from "@/features/attachments/components/attachments-section";
import { TimeTrackingPanel } from "@/features/time-tracking/components/time-tracking-panel";

export default async function IssueDetailPage({
  params,
}: {
  params: { projectId: string; issueId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const [
      issue,
      members,
      comments,
      attachments,
      labelCatalog,
      componentCatalog,
      issueLabels,
      issueComponents,
      timeTracking,
    ] = await Promise.all([
      IssueService.get(actor, params.issueId),
      ProjectService.listMembers(actor, params.projectId),
      CommentService.list(actor, params.issueId, {}),
      AttachmentService.list(actor, params.issueId),
      LabelService.list(actor),
      ComponentService.list(actor, params.projectId),
      LabelService.listForIssue(actor, params.issueId),
      ComponentService.listForIssue(actor, params.issueId),
      WorkLogService.list(actor, params.issueId, {}),
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
        <div className="mt-8">
          <IssueClassification
            issueId={params.issueId}
            canWrite={issue.canEdit}
            initialLabels={issueLabels}
            labelCatalog={labelCatalog}
            initialComponents={issueComponents}
            componentCatalog={componentCatalog}
          />
        </div>
        <TimeTrackingPanel issueId={params.issueId} initial={timeTracking} />
        <AttachmentsSection issueId={params.issueId} initial={attachments} />
        <CommentsSection issueId={params.issueId} initialPage={comments} />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
