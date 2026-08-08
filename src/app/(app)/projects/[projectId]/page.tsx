import { redirect } from "next/navigation";

// The project root has no page of its own — Issues is the default view.
export default async function ProjectIndexPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  redirect(`/projects/${params.projectId}/issues`);
}
