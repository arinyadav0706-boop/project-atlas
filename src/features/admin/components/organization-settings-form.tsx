"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  updateOrganizationSchema,
  type UpdateOrganizationInput,
} from "@/features/admin/validation/admin.schemas";
import type { OrgSettingsDto } from "@/features/admin/types/admin.types";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export function OrganizationSettingsForm({ settings }: { settings: OrgSettingsDto }) {
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: { name: settings.name, domain: settings.domain },
  });

  async function onSubmit(input: UpdateOrganizationInput) {
    setSubmitting(true);
    try {
      await apiRequest<OrgSettingsDto>("/api/admin/organization", {
        method: "PATCH",
        body: input,
      });
      toast.success("Organization settings saved");
      form.reset(input);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-5">
      <div>
        <Label htmlFor="org-name">Organization name</Label>
        <Input
          id="org-name"
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
        <Label htmlFor="org-domain">
          Email domain <span className="font-normal">(informational)</span>
        </Label>
        <Input id="org-domain" placeholder="example.com" {...form.register("domain")} />
        {form.formState.errors.domain && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {form.formState.errors.domain.message}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Metadata only. Sign-in restriction is controlled by the deployment&apos;s
          <code className="mx-1 rounded bg-muted px-1">ALLOWED_EMAIL_DOMAINS</code>
          environment variable, not this field.
        </p>
      </div>

      <Button type="submit" loading={submitting} disabled={!form.formState.isDirty}>
        Save changes
      </Button>
    </form>
  );
}
