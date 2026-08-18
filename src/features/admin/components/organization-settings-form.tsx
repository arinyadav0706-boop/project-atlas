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
    defaultValues: {
      name: settings.name,
      domain: settings.domain,
      workingHoursPerDay: settings.workingHoursPerDay,
      workingDaysPerWeek: settings.workingDaysPerWeek,
    },
  });

  // Live preview of the week the capacity metrics will use.
  const hours = Number(form.watch("workingHoursPerDay")) || 0;
  const days = Number(form.watch("workingDaysPerWeek")) || 0;
  const weekly = hours * days;

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
    // On a card, not bare on the canvas: with the page body tinted, a naked
    // form read as inputs floating on grey with nothing holding them.
    //
    // The CARD is bounded, not the fields inside it. Constraining the fields
    // instead left a full-width card two-thirds empty — the same dead space
    // that made the first Home pass look unfinished. A short form gets a small
    // card.
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="max-w-xl space-y-5 rounded-2xl border border-border bg-background p-5 shadow-card"
    >
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

      <div className="border-t border-border pt-5">
        <h2 className="text-sm font-medium text-foreground">Working week</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The basis for every capacity figure — Workload calls two of these weeks
          &ldquo;overloaded&rdquo;. Set it to how your company actually works.
        </p>

        <div className="mt-3 flex items-end gap-3">
          <div className="w-32">
            <Label htmlFor="org-hours">Hours per day</Label>
            <Input
              id="org-hours"
              type="number"
              step="0.5"
              min={1}
              max={24}
              aria-invalid={Boolean(form.formState.errors.workingHoursPerDay)}
              {...form.register("workingHoursPerDay")}
            />
          </div>
          <div className="w-32">
            <Label htmlFor="org-days">Days per week</Label>
            <Input
              id="org-days"
              type="number"
              min={1}
              max={7}
              aria-invalid={Boolean(form.formState.errors.workingDaysPerWeek)}
              {...form.register("workingDaysPerWeek")}
            />
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            = <span className="font-medium text-foreground">{weekly || "—"}h</span> week
          </p>
        </div>

        {(form.formState.errors.workingHoursPerDay ||
          form.formState.errors.workingDaysPerWeek) && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {form.formState.errors.workingHoursPerDay?.message ??
              form.formState.errors.workingDaysPerWeek?.message}
          </p>
        )}
      </div>

      <Button type="submit" loading={submitting} disabled={!form.formState.isDirty}>
        Save changes
      </Button>
    </form>
  );
}
