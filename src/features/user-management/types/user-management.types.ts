// DTOs for User Management (14_user_management.md). Never leak Prisma types.

export type OrgRoleDto = "ADMIN" | "MEMBER";

export interface ManagedUserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  orgRole: OrgRoleDto;
  isActive: boolean;
  lastLoginAt: string | null;
  // True once the user has completed a sign-in (has a password or has logged
  // in) — lets the UI show an "Invited" pill for pre-provisioned accounts.
  hasSignedIn: boolean;
  createdAt: string;
}

export interface PaginationDto {
  page: number;
  pageSize: number;
  total: number;
}

export interface ManagedUserPageDto {
  data: ManagedUserDto[];
  pagination: PaginationDto;
}
