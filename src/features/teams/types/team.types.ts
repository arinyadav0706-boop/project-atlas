// DTOs returned to the client — never the raw Prisma model.

export interface TeamManagerDto {
  id: string;
  name: string;
}

export interface TeamMemberDto {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

// A row in the admin Teams list.
export interface TeamListItemDto {
  id: string;
  name: string;
  manager: TeamManagerDto | null;
  parentTeamId: string | null;
  parentTeamName: string | null;
  memberCount: number;
}

// The admin detail (edit) view of one team.
export interface TeamDetailDto {
  id: string;
  name: string;
  managerId: string | null;
  parentTeamId: string | null;
  members: TeamMemberDto[];
}

// One report in a manager's "My Team" view.
export interface MyTeamReportDto {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  teamName: string;
}

// The caller's "My Team" payload — their reports across the teams they manage
// (direct + descendants, ADR-0032). `manages` gates the nav entry.
export interface MyTeamDto {
  manages: boolean;
  reports: MyTeamReportDto[];
}
