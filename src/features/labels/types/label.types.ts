// DTOs returned to the client — never the raw Prisma model.

// A label as shown in pickers, chips, and filters. `canManage` is resolved
// server-side (org ADMIN or a project LEAD) so the UI never guesses who may
// rename/delete (ADR-0018 BR-2).
export interface LabelDto {
  id: string;
  name: string;
  color: string;
}

export interface LabelListDto {
  items: LabelDto[];
  // Whether the viewer may create labels (any org member, BR-1).
  canCreate: boolean;
  // Whether the viewer may rename/recolor/delete labels (BR-2).
  canManage: boolean;
}
