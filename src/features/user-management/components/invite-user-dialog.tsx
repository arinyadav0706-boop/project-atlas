"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  inviteUserSchema,
  type InviteUserInput,
} from "@/features/user-management/validation/user-management.schemas";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import type { ManagedUserDto } from "@/features/user-management/types/user-management.types";

export function InviteUserDialog({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: "", name: "", orgRole: "MEMBER" },
  });

  async function onSubmit(input: InviteUserInput) {
    setSubmitting(true);
    try {
      const user = await apiRequest<ManagedUserDto>("/api/admin/users", {
        method: "POST",
        body: input,
      });
      toast.success(`Invited ${user.name}`);
      setOpen(false);
      form.reset();
      onInvited();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not invite the user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Invite user</DialogTitle>
        <DialogDescription>
          Creates the account now; they sign in later with this email.
        </DialogDescription>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" autoFocus {...form.register("name")} />
            {form.formState.errors.name && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="invite-role">Org role</Label>
            <Select
              value={form.watch("orgRole")}
              onValueChange={(v) => form.setValue("orgRole", v as InviteUserInput["orgRole"])}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Admins can manage the whole organization and act as lead on every project.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Send invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
