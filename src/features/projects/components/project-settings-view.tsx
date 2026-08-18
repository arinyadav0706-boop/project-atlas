"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
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
import { LabelsManager } from "@/features/labels/components/labels-manager";
import { ComponentsManager } from "@/features/components/components/components-manager";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

// Screen #4 (Project settings) — General / Members / Danger Zone.
// Buttons hidden for non-LEADs are conveniences; the server re-checks
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
  currentUserId,
}: {
  project: ProjectDto;
  members: ProjectMemberDto[];
  currentUserId: string;
}) {
  const isLead = project.myRole === "LEAD";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="max-w-3xl">
        {!isLead && (
          <p className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
            You&apos;re viewing this project&apos;s settings
            {project.myRole
              ? ` as a ${project.myRole.toLowerCase()}`
              : " without being a member"}
            . Only a project lead can make changes here.
          </p>
        )}

        <div className="space-y-10">
          <GeneralSection project={project} isLead={isLead} />
          <MembersSection
            project={project}
            members={members}
            isLead={isLead}
            currentUserId={currentUserId}
          />
          <SectionCard
            title="Components"
            description="Sub-systems of this project. A component's owner is the default assignee for new work tagged with it."
          >
            <ComponentsManager
              projectId={project.id}
              members={members.map((m) => ({ userId: m.userId, name: m.name }))}
            />
          </SectionCard>
          <SectionCard
            title="Labels"
            description="Org-wide tags for grouping and filtering issues across every project."
          >
            <LabelsManager />
          </SectionCard>
          {isLead && <DangerZone project={project} />}
        </div>
      </div>
    </TooltipProvider>
  );
}

function SectionCard({
  title,
  description,
  destructive,
  children,
}: {
  title: string;
  description: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        destructive
          ? "rounded-2xl border border-destructive/25 bg-background shadow-card"
          : "rounded-2xl border border-border bg-background shadow-card"
      }
    >
      <div
        className={
          destructive
            ? "border-b border-destructive/25 px-5 py-4"
            : "border-b border-border px-5 py-4"
        }
      >
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
  const isDirty = form.formState.isDirty;

  async function onSubmit(input: GeneralFormInput) {
    setSaving(true);
    try {
      await apiCall(`/api/projects/${project.id}`, "PATCH", {
        name: input.name,
        description: input.description || null,
      });
      toast.success("Project updated");
      form.reset(input);
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
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            disabled={!isLead}
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            disabled={!isLead}
            {...form.register("description")}
          />
        </div>
        {isLead && (
          <div className="flex items-center justify-end gap-3">
            {isDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button type="submit" size="sm" loading={saving} disabled={!isDirty}>
              Save changes
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
  currentUserId,
}: {
  project: ProjectDto;
  members: ProjectMemberDto[];
  isLead: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [removeTarget, setRemoveTarget] = useState<ProjectMemberDto | null>(null);
  const [removing, setRemoving] = useState(false);

  async function changeRole(member: ProjectMemberDto, role: string) {
    try {
      await apiCall(`/api/projects/${project.id}/members/${member.id}`, "PATCH", {
        role,
      });
      toast.success(`${member.name} is now ${role.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Change failed.");
    } finally {
      router.refresh();
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await apiCall(
        `/api/projects/${project.id}/members/${removeTarget.id}`,
        "DELETE",
      );
      toast.success(`${removeTarget.name} removed from the project`);
      setRemoveTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Remove failed.");
    } finally {
      setRemoving(false);
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
              <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
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
              <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                {member.name}
                {member.userId === currentUserId && (
                  <Badge className="shrink-0">You</Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {isLead && project.status !== "ARCHIVED" ? (
              <>
                <Select
                  value={member.role}
                  onValueChange={(role) => changeRole(member, role)}
                >
                  <SelectTrigger className="w-[110px]" aria-label="Change role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEAD">Lead</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setRemoveTarget(member)}
                      aria-label={`Remove ${member.name}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Remove from project</TooltipContent>
                </Tooltip>
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

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
          <DialogDescription>
            They lose access to this project&apos;s issues and board. Their
            past work and comments stay attributed to them, and a lead can
            add them back anytime.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove} loading={removing}>
              Remove member
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              placeholder="colleague@company.com"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="member-role">Role</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(role) =>
                form.setValue("role", role as AddProjectMemberInput["role"])
              }
            >
              <SelectTrigger id="member-role" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member — creates and edits issues</SelectItem>
                <SelectItem value="LEAD">Lead — manages the project</SelectItem>
                <SelectItem value="VIEWER">Viewer — read-only</SelectItem>
              </SelectContent>
            </Select>
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
            <Button type="submit" loading={submitting}>
              Add member
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

  async function setStatus(status: "ACTIVE" | "ARCHIVED") {
    await apiCall(`/api/projects/${project.id}`, "PATCH", { status });
    router.refresh();
  }

  // Archiving is reversible, so it gets the toast+Undo pattern
  // (Design Principles §5) instead of a blocking confirmation.
  async function toggleArchive() {
    setWorking(true);
    const next = archived ? "ACTIVE" : "ARCHIVED";
    try {
      await setStatus(next);
      toast.success(archived ? "Project restored" : "Project archived", {
        action: {
          label: "Undo",
          onClick: () => {
            void setStatus(archived ? "ARCHIVED" : "ACTIVE").catch(() =>
              toast.error("Could not undo."),
            );
          },
        },
      });
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
      destructive
      title="Danger zone"
      description="Archiving makes the project read-only; deleting hides it everywhere (data is retained for audit)."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" size="sm" onClick={toggleArchive} loading={working}>
          {archived ? "Restore project" : "Archive project"}
        </Button>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive-outline" size="sm">
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
              <Button variant="destructive" onClick={deleteProject} loading={working}>
                Delete project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </SectionCard>
  );
}
