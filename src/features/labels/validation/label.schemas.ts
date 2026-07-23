import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §7). Names are
// trimmed and length-bounded; colors are strict #RRGGBB so chips render safely
// (no arbitrary CSS injected via the color field).
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const labelNameSchema = z
  .string()
  .trim()
  .min(1, "A label needs a name.")
  .max(50, "Keep label names under 50 characters.");

export const labelColorSchema = z
  .string()
  .regex(HEX_COLOR, "Color must be a hex value like #2563EB.");

export const createLabelSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
});

export const updateLabelSchema = z
  .object({
    name: labelNameSchema.optional(),
    color: labelColorSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, {
    message: "Nothing to update.",
  });

// Replace the full set of labels on an issue (idempotent PUT, BR-1).
export const setIssueLabelsSchema = z.object({
  labelIds: z.array(z.string().min(1)).max(50),
});

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type SetIssueLabelsInput = z.infer<typeof setIssueLabelsSchema>;
