"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  createProjectSchema,
  type CreateProjectInput,
} from "@/features/projects/validation/project.schemas";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";

export function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { key: "", name: "", description: "" },
  });

  async function onSubmit(input: CreateProjectInput) {
    setSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "Could not create the project.");
      }
      toast.success(`Project ${input.key} created`);
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create a project</DialogTitle>
        <DialogDescription>
          The key becomes part of every issue number (e.g. ENG-42) and can’t
          be changed later.
        </DialogDescription>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Key
              </label>
              <Input
                placeholder="ENG"
                autoCapitalize="characters"
                {...form.register("key", {
                  onChange: (event) => {
                    event.target.value = String(event.target.value).toUpperCase();
                  },
                })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input placeholder="Engineering" {...form.register("name")} />
            </div>
          </div>
          {(form.formState.errors.key || form.formState.errors.name) && (
            <p className="text-xs text-red-600">
              {form.formState.errors.key?.message ??
                form.formState.errors.name?.message}
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Description <span className="font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="What is this project about?"
              {...form.register("description")}
            />
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
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
