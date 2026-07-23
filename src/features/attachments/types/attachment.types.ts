// DTOs returned to the client — never the raw Prisma model.

export interface AttachmentUploaderDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

// The attachment shape. Designed to grow (ADR-0017): future `scanStatus`,
// `previewUrl`, `hash`, `version` are optional additions that won't break clients.
export interface AttachmentDto {
  id: string;
  issueId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: AttachmentUploaderDto;
  createdAt: string;
  // Download is always via the RBAC-gated route (never a public URL).
  downloadUrl: string;
  // The viewer's rights on this attachment, resolved server-side.
  canDelete: boolean;
}

export interface AttachmentListDto {
  items: AttachmentDto[];
  // Whether the viewer may upload (MEMBER/LEAD on a non-archived project).
  canUpload: boolean;
  // Per-file upload ceiling in bytes, resolved server-side (config-driven). The
  // client uses it for the label + an instant pre-check; the server still
  // enforces it as the security boundary.
  maxUploadBytes: number;
}
