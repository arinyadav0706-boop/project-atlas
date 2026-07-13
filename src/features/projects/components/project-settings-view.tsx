"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Trash2 } from "lucide-react";
import { z } from "zod";
import type {
  ProjectDto,
  ProjectMemberDto,
} from "@/features/projects/types/project.types";
import {
  addProjectMemberSchema,
  type AddProjectMemberInput,
} from "@/features/projects/validation/project.schemas";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";

// Screen #4 (Project settings) — General / Members / Danger Zone.
// All buttons hidden for non-LEADs are conveniences; the server re-checks
// every action (Coding Standards §7).

async function apiCall(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(payload?.message ?? "Request failed.");
  }
}

const generalFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(2000),
});
type GeneralFormInput = z.infer<typeof generalFormSchema>;

export function ProjectSettingsView({
  project,
  members,
}: {
  project: ProjectDto;
  members: ProjectMemberDto[];
}) {
  const isLead = project.myRole === "LEAD";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/projects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <Badge variant="accent">{project.key}</Badge>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {project.name}
        </h1>
        {project.status === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
      </div>

      <div className="space-y-10">
        <GeneralSection project={project} isLead={isLead} />
        <MembersSection project={project} members={members} isLead={isLead} />
        {isLead && <DangerZone project={project} />}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function GeneralSection({
  project,
  isLead,
}: {
  project: ProjectDto;
  isLead: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const form = useForm<GeneralFormInput>({
    resolver: zodResolver(generalFormSchema),
    defaultValues: {
      name: project.name,
      description: project.description ?? "",
    },
  });

  async function onSubmit(input: GeneralFormInput) {
    setSaving(true);
    try {
      await apiCall(`/api/projects/${project.id}`, "PATCH", {
        name: input.name,
        description: input.description || null,
      });
      toast.success("Project updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="General" description="Name and description of this project.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input disabled={!isLead} {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="mt-1 text-xs text-red-600">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <Textarea disabled={!isLead} {...form.register("description")} />
        </div>
        {isLead && (
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </form>
    </SectionCard>
  );
}

function MembersSection({
  project,
  members,
  isLead,
}: {
  project: ProjectDto;
  members: ProjectMemberDto[];
  isLead: boolean;
}) {
  const router = useRouter();

  async function changeRole(member: ProjectMemberDto, role: string) {
    try {
      await apiCall(
        `/api/projects/${project.id}/members/${member.id}`,
        "PATCH",
        { role },
      );
      toast.success(`${member.name} is now ${role.toLowerCase()}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Change failed.");
      router.refresh();
    }
  }

  async function removeMember(member: ProjectMemberDto) {
    try {
      await apiCall(`/api/projects/${project.id}/members/${member.id}`, "DELETE");
      toast.success(`${member.name} removed from the project`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed.");
    }
  }

  return (
    <SectionCard
      title="Members"
      description="Who can work in this project, and with which role."
    >
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 py-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
              <AvatarFallback className="text-xs">
                {member.name
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {member.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {isLead ? (
              <>
                <select
                  value={member.role}
                  onChange={(event) => changeRole(member, event.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="LEAD">Lead</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button
                  onClick={() => removeMember(member)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                  title="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Badge>{member.role.charAt(0) + member.role.slice(1).toLowerCase()}</Badge>
            )}
          </li>
        ))}
      </ul>

      {isLead && project.status !== "ARCHIVED" && (
        <div className="mt-3 border-t border-border pt-4">
          <AddMemberDialog projectId={project.id} />
        </div>
      )}
    </SectionCard>
  );
}

function AddMemberDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<AddProjectMemberInput>({
    resolver: zodResolver(addProjectMemberSchema),
    defaultValues: { email: "", role: "MEMBER" },
  });

  async function onSubmit(input: AddProjectMemberInput) {
    setSubmitting(true);
    try {
      await apiCall(`/api/projects/${projectId}/members`, "POST", input);
      toast.success("Member added");
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Add a member</DialogTitle>
        <DialogDescription>
          They must already have an EAGLES account (signed in at least once,
          or invited by an admin).
        </DialogDescription>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <Input placeholder="colleague@company.com" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Role
            </label>
            <select
              {...form.register("role")}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="MEMBER">Member — can create and edit issues</option>
              <option value="LEAD">Lead — manages the project</option>
              <option value="VIEWER">Viewer — read-only</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DangerZone({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const archived = project.status === "ARCHIVED";

  async function toggleArchive() {
    setWorking(true);
    try {
      await apiCall(`/api/projects/${project.id}`, "PATCH", {
        status: archived ? "ACTIVE" : "ARCHIVED",
      });
      toast.success(archived ? "Project restored" : "Project archived");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteProject() {
    setWorking(true);
    try {
      await apiCall(`/api/projects/${project.id}`, "DELETE");
      toast.success(`Project ${project.key} deleted`);
      router.push("/projects");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
      setWorking(false);
    }
  }

  return (
    <SectionCard
      title="Danger zone"
      description="Archiving makes the project read-only; deleting hides it everywhere (data is retained for audit)."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" size="sm" onClick={toggleArchive} disabled={working}>
          {archived ? "Restore project" : "Archive project"}
        </Button>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              Delete project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Delete {project.key}?</DialogTitle>
            <DialogDescription>
              The project disappears from every list and search. Its data is
              retained for audit purposes and an admin can ask for it to be
              restored, but there is no self-service undo.
            </DialogDescription>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setDeleteOpen(false)}
                disabled={working}
              >
                Cancel
              </Button>
              <Button
                onClick={deleteProject}
                disabled={working}
                className="bg-red-600 text-white hover:bg-red-600/90"
              >
                {working ? "Deleting…" : "Delete project"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SectionCard>
  );
}
