// DTOs returned to the client — never the raw Prisma model.

export interface ComponentOwnerDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

// A component as shown in pickers, chips, filters, and the management screen.
// The API/UI term is "owner"; the underlying column is `leadId` (unchanged to
// avoid a no-op migration) — mapped to `owner` at the DTO boundary.
export interface ComponentDto {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  // Default assignee — new work under this component routes here (BR-3).
  owner: ComponentOwnerDto | null;
}

export interface ComponentListDto {
  items: ComponentDto[];
  // Whether the viewer may create/edit/delete components (project LEAD, BR-1).
  canManage: boolean;
}
