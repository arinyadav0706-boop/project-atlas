// DTOs for the admin control plane (13_admin.md). Never leak Prisma types.

export interface OrgSettingsDto {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  updatedAt: string;
}

// A registered flag plus its effective state for one org (ADR-0023). `enabled`
// is the resolved value; `isOverridden` distinguishes an explicit per-org
// override from the code registry default.
export interface FeatureFlagDto {
  key: string;
  description: string;
  owner: string;
  defaultEnabled: boolean;
  enabled: boolean;
  isOverridden: boolean;
  updatedAt: string | null;
}

export interface AuditLogEntryDto {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginationDto {
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditLogPageDto {
  data: AuditLogEntryDto[];
  pagination: PaginationDto;
}
