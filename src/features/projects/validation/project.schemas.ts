import { z } from "zod";

// Shared between client forms (zodResolver) and server route validation —
// one schema per action (Coding Standards §3). Constraints come from
// docs/02_Modules/03_projects.md §Validation.

export const createProjectSchema = z.object({
  key: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9]{1,9}$/,
      "2–10 characters, uppercase letters/digits, starting with a letter (e.g. ENG)",
    ),
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const addProjectMemberSchema = z.object({
  email: z.string().email("Enter a valid email of an existing user"),
  role: z.enum(["LEAD", "MEMBER", "VIEWER"]),
});

export const updateProjectMemberSchema = z.object({
  role: z.enum(["LEAD", "MEMBER", "VIEWER"]),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
