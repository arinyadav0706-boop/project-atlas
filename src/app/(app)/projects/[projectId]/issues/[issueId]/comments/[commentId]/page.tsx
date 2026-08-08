import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { NotFoundError } from "@/shared/lib/errors";
import { CommentThreadView } from "@/features/comments/components/comment-thread-view";

// One comment thread's own page (ADR-0038 §4). Reached from "View all N
// replies" on the issue, and linkable in its own right — the reason this is a
// route rather than an in-place expansion.
export default async function CommentThreadPage({
  params,
}: {
  params: { projectId: string; issueId: string; commentId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const thread = await CommentService.thread(actor, params.commentId, {});
    // A thread reached via the wrong issue's URL is a 404, not a redirect: the
    // path asserts a relationship, and the service already scoped by tenant.
    if (thread.issue.id !== params.issueId) notFound();
    return <CommentThreadView initial={thread} />;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
