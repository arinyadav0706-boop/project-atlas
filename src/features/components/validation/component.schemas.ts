import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §7).
export const componentNameSchema = z
  .string()
  .trim()
  .min(1, "A component needs a name.")
  .max(50, "Keep component names under 50 characters.");

export const componentDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Keep the description under 500 characters.");

export const createComponentSchema = z.object({
  name: componentNameSchema,
  description: componentDescriptionSchema.optional(),
  // Optional default assignee ("owner"); null clears it. Membership validated
  // server-side.
  ownerId: z.string().min(1).nullable().optional(),
});

export const updateComponentSchema = z
  .object({
    name: componentNameSchema.optional(),
    description: componentDescriptionSchema.nullable().optional(),
    ownerId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.ownerId !== undefined,
    { message: "Nothing to update." },
  );

// Replace the full set of components on an issue (idempotent PUT, BR-2).
export const setIssueComponentsSchema = z.object({
  componentIds: z.array(z.string().min(1)).max(50),
});

export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
export type SetIssueComponentsInput = z.infer<typeof setIssueComponentsSchema>;
