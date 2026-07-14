"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";

// `withHotkey` wires the "C" shortcut (Linear-style) on the projects list;
// ignored while typing in an input/textarea or when a dialog is open.
export function CreateProjectDialog({ withHotkey = false }: { withHotkey?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { key: "", name: "", description: "" },
  });

  useEffect(() => {
    if (!withHotkey) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key.toLowerCase() === "c" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [withHotkey]);

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
          {withHotkey && (
            <kbd className="ml-1 hidden rounded border border-white/25 px-1 text-[10px] font-normal opacity-75 sm:inline-block">
              C
            </kbd>
          )}
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
              <Label htmlFor="new-project-key">Key</Label>
              <Input
                id="new-project-key"
                placeholder="ENG"
                autoFocus
                autoCapitalize="characters"
                aria-invalid={Boolean(form.formState.errors.key)}
                {...form.register("key", {
                  onChange: (event) => {
                    event.target.value = String(event.target.value).toUpperCase();
                  },
                })}
              />
            </div>
            <div>
              <Label htmlFor="new-project-name">Name</Label>
              <Input
                id="new-project-name"
                placeholder="Engineering"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register("name")}
              />
            </div>
          </div>
          {form.formState.errors.key && (
            <p role="alert" className="text-xs text-destructive">
              Key: {form.formState.errors.key.message}
            </p>
          )}
          {form.formState.errors.name && (
            <p role="alert" className="text-xs text-destructive">
              Name: {form.formState.errors.name.message}
            </p>
          )}

          <div>
            <Label htmlFor="new-project-description">
              Description <span className="font-normal">(optional)</span>
            </Label>
            <Textarea
              id="new-project-description"
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
            <Button type="submit" loading={submitting}>
              Create project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
