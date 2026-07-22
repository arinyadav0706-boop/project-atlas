import { ValidationError } from "@/shared/lib/errors";

// Server-side upload constraints (docs/02_Modules/09_attachments.md BR-2/BR-3/BR-4).
// The client may pre-check for UX, but this is the security boundary — an
// allow-list, never a block-list (Security Architecture §4).

export const MAX_ATTACHMENT_BYTES = 25_000_000; // 25 MB (BR-2)

export const ALLOWED_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
]);

// Reject oversize / disallowed uploads (ValidationError → 422).
export function assertValidUpload(mimeType: string, sizeBytes: number): void {
  if (sizeBytes <= 0) {
    throw new ValidationError("The file is empty.");
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new ValidationError("File is too large — the limit is 25 MB.");
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`Files of type "${mimeType}" aren't allowed.`);
  }
}

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

// Use the file's own name only for display — never as the storage key (ADR-0017).
// Strip any path and control characters; cap the length.
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(CONTROL_CHARS, "").trim();
  return (cleaned || "file").slice(0, 255);
}
