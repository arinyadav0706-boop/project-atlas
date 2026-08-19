"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { CustomFieldControl } from "@/features/custom-fields/components/custom-field-control";
import type {
  CustomFieldValueDto,
  IssueCustomFieldDto,
} from "@/features/custom-fields/types/custom-field.types";

// Custom fields on the issue detail rail (24_custom_fields.md §5).
//
// Each field saves on its own, immediately — this is a metadata rail, not a
// form with a submit button, and the built-in fields beside it behave the same
// way. The server still validates the whole batch it is given; a batch here
// just happens to be one field.
export function IssueCustomFields({
  issueId,
  initial,
  canEdit,
}: {
  issueId: string;
  initial: IssueCustomFieldDto[];
  canEdit: boolean;
}) {
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  if (fields.length === 0) return null;

  async function commit(fieldId: string, value: CustomFieldValueDto) {
    setSaving(fieldId);
    try {
      // The response is the full, re-read set, so a USER field's resolved name
      // and any server-side normalisation land without a second request.
      const updated = await apiRequest<IssueCustomFieldDto[]>(
        `/api/issues/${issueId}/custom-fields`,
        { method: "PUT", body: { values: { [fieldId]: value } } },
      );
      setFields(updated);
    } catch (error) {
      // The message names the field ("Contract value must be a number"), so it
      // is shown as-is rather than replaced with something generic.
      toast.error(error instanceof Error ? error.message : "Couldn't save that field.");
      // Re-render from the last known-good state, so a rejected value does not
      // linger in the control looking saved.
      setFields((prev) => [...prev]);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const missingRequired = field.required && isEmpty(field.value);
        return (
          <div key={field.fieldId}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {field.name}
              </h2>
              {/* Required is enforced at CREATE only (ADR-0042 §4). On an
                  existing issue it is a prompt, not a block — which is why it
                  is a marker here rather than a disabled save button. */}
              {missingRequired && (
                <span
                  className="text-xs font-medium text-warning"
                  title="This field is required for new issues"
                >
                  Required
                </span>
              )}
              {saving === field.fieldId && (
                <span className="text-[11px] text-muted-foreground">Saving…</span>
              )}
            </div>
            <div className={cn(saving === field.fieldId && "opacity-60")}>
              <CustomFieldControl
                field={field}
                disabled={!canEdit || saving === field.fieldId}
                onCommit={(value) => commit(field.fieldId, value)}
              />
            </div>
            {field.description && (
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                {field.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** `false` and `0` are values, not emptiness — hence not a truthiness check. */
function isEmpty(value: CustomFieldValueDto): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}
