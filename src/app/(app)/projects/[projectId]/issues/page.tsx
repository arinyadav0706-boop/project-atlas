import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { IssuesView } from "@/features/issues/components/issues-view";
import { loadPageData } from "@/shared/lib/load-page-data";

export default async function ProjectIssuesPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const [project, page, members] = await loadPageData(() =>
    Promise.all([
      ProjectService.get(actor, params.projectId),
      IssueService.list(actor, params.projectId),
      ProjectService.listMembers(actor, params.projectId),
    ]),
  );
  const canWrite =
    project.status === "ACTIVE" &&
    (project.myRole === "LEAD" || project.myRole === "MEMBER");
  // Estimate is LEAD-only (ADR-0030 BR-5); org admins elevate to LEAD (ADR-0024).
  const canSetEstimate =
    project.status === "ACTIVE" &&
    (project.myRole === "LEAD" || actor.orgRole === "ADMIN");

  return (
    <IssuesView
      projectId={params.projectId}
      initialItems={page.items}
      initialCursor={page.nextCursor}
      counts={page.counts}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      canWrite={canWrite}
      canSetEstimate={canSetEstimate}
    />
  );
}
