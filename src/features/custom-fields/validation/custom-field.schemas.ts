import { z } from "zod";
import { CUSTOM_FIELD_TYPES } from "@/features/custom-fields/types/custom-field.types";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/24_custom_fields.md §7.

export const MAX_FIELD_NAME = 60;
export const MAX_OPTION_LABEL = 60;
export const MAX_OPTIONS = 100;
/** A form with more than this is not a form (BR-7). */
export const MAX_FIELDS_PER_PROJECT = 30;

export const customFieldType = z.enum(
  CUSTOM_FIELD_TYPES as unknown as [string, ...string[]],
);

const optionInput = z.object({
  /** Present when editing an existing option — absent means "create". Keeping
   *  the id is what makes a rename preserve every value pointing at it (BR-3). */
  id: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1, "Label is required").max(MAX_OPTION_LABEL),
});

export const createCustomFieldSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(MAX_FIELD_NAME),
  type: customFieldType,
  description: z.string().trim().max(300).nullable().optional(),
  required: z.boolean().default(false),
  options: z.array(optionInput).max(MAX_OPTIONS).default([]),
});

// `type` is absent on purpose: it is immutable (BR-2). A client that sends it
// gets a 422 from `.strict()` rather than a silent no-op, which is the
// difference between "we ignored you" and "that is not allowed".
export const updateCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_FIELD_NAME).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    required: z.boolean().optional(),
    options: z.array(optionInput).max(MAX_OPTIONS).optional(),
  })
  .strict();

/** Replace a project's enabled set and its order in one call. */
export const setProjectFieldsSchema = z.object({
  fieldIds: z
    .array(z.string().trim().min(1))
    .max(MAX_FIELDS_PER_PROJECT, `A project can show at most ${MAX_FIELDS_PER_PROJECT} fields.`)
    .transform((ids) => [...new Set(ids)]),
});

/**
 * Values arrive as `fieldId → value`. The value shape cannot be checked here —
 * it depends on the field's declared type, which the payload does not carry —
 * so this only bounds the envelope and `coerceValue` does the real work.
 */
export const setIssueFieldValuesSchema = z.object({
  values: z.record(z.string().trim().min(1), z.unknown()).refine(
    (v) => Object.keys(v).length <= MAX_FIELDS_PER_PROJECT,
    `At most ${MAX_FIELDS_PER_PROJECT} fields can be set at once.`,
  ),
});

export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
export type SetProjectFieldsInput = z.infer<typeof setProjectFieldsSchema>;
export type SetIssueFieldValuesInput = z.infer<typeof setIssueFieldValuesSchema>;
