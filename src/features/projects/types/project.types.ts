// Explicit DTOs returned to the client — never the raw Prisma model
// (Feature Architecture §5: prevents leaking internals like deletedAt).

export type ProjectRoleDto = "LEAD" | "MEMBER" | "VIEWER";
export type ProjectStatusDto = "ACTIVE" | "ARCHIVED";

export interface ProjectDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatusDto;
  createdAt: string;
  // The requesting user's role in this project; null when they're not a
  // member (all employees can view active projects — 03_projects.md BR-7).
  myRole: ProjectRoleDto | null;
}

export interface ProjectMemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: ProjectRoleDto;
}
