import { z } from "zod";

// One schema per action, shared client/server (Coding Standards §3).
// Constraints from docs/02_Modules/20_teams.md §Validation.

const name = z.string().trim().min(1, "Team name is required").max(80);
const optionalId = z.string().min(1).nullable().optional();

export const createTeamSchema = z.object({
  name,
  managerId: optionalId,
  parentTeamId: optionalId,
});

export const updateTeamSchema = z.object({
  name: name.optional(),
  managerId: z.string().min(1).nullable().optional(),
  parentTeamId: z.string().min(1).nullable().optional(),
});

export const addTeamMemberSchema = z.object({
  userId: z.string().min(1),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
