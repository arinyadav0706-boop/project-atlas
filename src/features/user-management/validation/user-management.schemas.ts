import { z } from "zod";

const orgRole = z.enum(["ADMIN", "MEMBER"]);

// Invite (14_user_management.md BR-2/BR-3). Domain allow-list is checked in the
// service (it needs env), not here.
export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().min(1).max(100),
  orgRole: orgRole.default("MEMBER"),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// Update org role and/or active status — at least one field required.
export const updateUserAdminSchema = z
  .object({
    orgRole: orgRole.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.orgRole !== undefined || v.isActive !== undefined, {
    message: "Provide orgRole and/or isActive.",
  });
export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;

// List query (coerced from string params); pageSize bounded.
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().min(1).max(100).optional(),
  role: orgRole.optional(),
  status: z.enum(["active", "inactive"]).optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
