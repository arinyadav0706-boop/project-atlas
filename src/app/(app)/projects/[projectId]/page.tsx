import { redirect } from "next/navigation";

// The project root has no page of its own — Issues is the default view.
export default function ProjectIndexPage({
  params,
}: {
  params: { projectId: string };
}) {
  redirect(`/projects/${params.projectId}/issues`);
}
