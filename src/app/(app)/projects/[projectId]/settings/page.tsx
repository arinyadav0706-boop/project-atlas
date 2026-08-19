import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ProjectSettingsView } from "@/features/projects/components/project-settings-view";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { ProjectCustomFields } from "@/features/custom-fields/components/project-custom-fields";
import { loadPageData } from "@/shared/lib/load-page-data";

export default async function ProjectSettingsPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const [project, members, customFields] = await loadPageData(() =>
    Promise.all([
      ProjectService.get(actor, params.projectId),
      ProjectService.listMembers(actor, params.projectId),
      CustomFieldService.forProject(actor, params.projectId),
    ]),
  );

  return (
    <div className="space-y-5">
      <ProjectSettingsView
        project={project}
        members={members}
        currentUserId={actor.userId}
      />
      {/* Which of the org's custom fields this project shows (BR-5). Its own
          card, because enabling a field is a different decision from renaming
          the project or managing its members. */}
      <section className="rounded-2xl border border-border bg-background p-5 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Custom fields</h2>
        <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">
          Pick which of the organisation&apos;s fields appear on this project&apos;s
          issues, and in what order.
        </p>
        <ProjectCustomFields projectId={params.projectId} initial={customFields} />
      </section>
    </div>
  );
}
