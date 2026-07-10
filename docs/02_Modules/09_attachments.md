# Module: Attachments

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

File upload/download on issues, stored via the provider-agnostic
`StorageAdapter` interface (Supabase Storage today, Azure Blob later —
ADR-0004).

## Business Rules

- BR-1: Any project member (`MEMBER`/`LEAD`) can upload/delete their own
  attachments; `LEAD` can delete any attachment on the project (parity
  with Comments moderation).
- BR-2: Max file size: 25 MB per file (V1 default — revisit if usage
  demands otherwise; not user-configurable in V1).
- BR-3: Allowed MIME types (allow-list, not block-list, per Security
  Architecture §4): common office/image/doc formats — `image/png`,
  `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`,
  `application/msword`, `application/vnd.openxmlformats-officedocument.*`
  (Word/Excel/PowerPoint), `text/plain`, `text/csv`, `application/zip`.
- BR-4: Uploaded files are validated server-side for size and MIME type
  (BR-2, BR-3) regardless of client-side checks — the client check is a
  UX convenience only (Security Architecture §4).
- BR-5: Downloads are never served via a permanently public URL — the API
  issues a short-lived signed URL per request via the `StorageAdapter`.
- BR-6: Deleting an attachment removes both the DB row and the
  underlying storage object; if the storage delete fails, the DB row is
  still removed and the orphaned object is left for a periodic cleanup job
  (V2) rather than blocking the user-facing delete.

## Database

`Attachment` — `docs/03_Database/01_Database_Design.md §2.11`.

## API

`GET/POST /issues/{issueId}/attachments`, `DELETE /attachments/{attachmentId}`,
`GET /attachments/{attachmentId}/download` — `docs/04_API/openapi.yaml`.

## UI

Attachments section within the Issue detail panel (screen #10):
drag-and-drop drop zone plus a traditional file picker, a list of existing
attachments with file-type icon, name, size, and uploader, download and
delete affordances. Delete uses the toast+Undo pattern (Design Principles
§5) rather than a blocking confirm dialog, since the underlying object
isn't hard-deleted at the storage layer instantly in every failure path
(BR-6) — practically reversible within the undo window.

## Acceptance Criteria

- Given a 30 MB file, when a user attempts to upload it, then the API
  rejects it with `413` and the UI explains the 25 MB limit before
  attempting the request client-side too.
- Given a `.exe` file, when a user attempts to upload it, then the API
  rejects it with `415` (not in the allow-list).
- Given an attachment, when a user clicks download, then they're redirected
  to a signed URL that expires shortly after issuance, not a permanent
  public link.

## Validation

Server-side: `mimeType` against the BR-3 allow-list, `sizeBytes <=
25_000_000`. `fileName` sanitized (no path traversal characters) before
being used as the display name; the actual storage key is a generated
opaque identifier, never the raw file name (Security Architecture §4).

## Future Scope

- Virus/malware scanning integration before storage.
- Image thumbnail generation/preview.
- File versioning (replace vs. new attachment).
