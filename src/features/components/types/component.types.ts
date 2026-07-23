// DTOs returned to the client — never the raw Prisma model.

export interface ComponentLeadDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

// A component as shown in pickers, chips, filters, and the management screen.
export interface ComponentDto {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  // Default owner — new work under this component routes here (BR-3).
  lead: ComponentLeadDto | null;
}

export interface ComponentListDto {
  items: ComponentDto[];
  // Whether the viewer may create/edit/delete components (project LEAD, BR-1).
  canManage: boolean;
}
