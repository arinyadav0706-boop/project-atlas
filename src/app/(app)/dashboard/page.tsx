import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FolderKanban } from "lucide-react";
import { getActor, getSession } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { Badge } from "@/shared/components/ui/badge";

// Interim dashboard: greeting + project shortcuts. The full module
// (assigned issues, recent activity — docs/02_Modules/02_dashboard.md)
// lands once the Issues module exists to feed it.
export default async function DashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const [session, projects] = await Promise.all([
    getSession(),
    ProjectService.list(actor),
  ]);
  const firstName = (session?.user?.name ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Welcome back, {firstName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Assigned issues and activity will appear here once the Issues module
        ships — your projects are ready below.
      </p>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Your projects</h2>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-accent transition-opacity hover:opacity-80"
          >
            All projects
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {projects.length === 0 ? (
          <Link
            href="/projects"
            className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-surface p-5 transition-colors hover:border-accent/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <FolderKanban className="h-5 w-5 text-accent" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Create your first project
              </p>
              <p className="text-[13px] text-muted-foreground">
                Projects hold your issues, sprints, and board.
              </p>
            </div>
          </Link>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}/issues`}
                className="rounded-xl border border-border bg-background p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
              >
                <Badge variant="accent">{project.key}</Badge>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {project.name}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
