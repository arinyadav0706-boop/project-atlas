// DTOs for global search (12_search.md, ADR-0021). Deliberately lean — each
// item carries only what the command palette renders, never a full entity.

export interface SearchIssueResult {
  id: string;
  key: string;
  title: string;
  projectKey: string;
  href: string;
}

export interface SearchProjectResult {
  id: string;
  key: string;
  name: string;
  href: string;
}

export interface SearchResponseDto {
  issues: SearchIssueResult[];
  projects: SearchProjectResult[];
}

// The shape the swappable SearchRepository returns (ADR-0021 §2). Rows are
// pre-ranked by the repository; the service maps them to the DTO above. A
// future external-engine adapter returns the same rows behind this interface.
export interface SearchIssueRow {
  id: string;
  key: string;
  title: string;
  projectId: string;
  projectKey: string;
}

export interface SearchProjectRow {
  id: string;
  key: string;
  name: string;
}
