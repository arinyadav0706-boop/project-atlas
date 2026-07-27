// DTO enums are local string-literal types — Prisma types stay inside
// repositories (Feature Architecture §2). These mirror the schema enums.
export type OrgRoleDto = "ADMIN" | "MEMBER";
export type ProjectRoleDto = "LEAD" | "MEMBER" | "VIEWER";

// A project the caller belongs to, with their role in it. Read-only on the
// Profile screen (16_profile.md BR-3) — surfaced so a user understands their own
// access without being able to change it.
export interface ProfileMembershipDto {
  projectId: string;
  projectKey: string;
  projectName: string;
  role: ProjectRoleDto;
}

// The caller's own profile (16_profile.md). Editable: name, avatarUrl,
// notificationsEnabled. Read-only: email, orgRole, memberships.
export interface ProfileDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  orgRole: OrgRoleDto;
  memberships: ProfileMembershipDto[];
}
