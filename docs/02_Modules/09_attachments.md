# Module: Attachments

**Status:** v2.0 (MVP spec) · **Owner:** Founding CTO · **Last Updated:** 2026-07-21
· **Decisions:** ADR-0004 (storage portability), ADR-0017 (attachments/storage architecture)

## Overview

File upload/download on issues, stored via the provider-agnostic **`StorageAdapter`**
seam (ADR-0004/0017). Two adapters ship behind one interface: a **`LocalStorageAdapter`**
(disk; dev + self-hosted default, and the one tests exercise) and a
**`SupabaseStorageAdapter`** (SaaS); the concrete one is picked by `STORAGE_PROVIDER`.
Adding S3/GCS/Azure later is one new class — no feature-code change. The MVP proxies
upload bytes through the app (validated, ≤ `ATTACHMENT_MAX_BYTES`, default 4 MB) and
serves downloads via an RBAC-gated proxy route; presigned direct-to-storage upload —
which also lifts the per-file ceiling past the host's request-body limit — is a
documented scale seam (ADR-0017). No provider SDK ever leaks into feature code.

## Business Rules

- BR-1: Any project member (`MEMBER`/`LEAD`) can upload/delete their own
  attachments; `LEAD` can delete any attachment on the project (parity
  with Comments moderation).
- BR-2: Max file size per file, config-driven via `ATTACHMENT_MAX_BYTES`
  (default **4 MB**). While uploads pass *through* the app server the ceiling
  must stay under the host's request-body limit (many serverless platforms cap
  it at ~4.5 MB) — a larger value would look valid but be rejected at the
  platform edge. Raising the ceiling meaningfully (toward the 25 MB long-term
  target and beyond) is unlocked by **direct-to-storage upload** (ADR-0017 §4),
  where bytes bypass the app server entirely. The resolved limit is returned to
  the client (`AttachmentListDto.maxUploadBytes`) so the UI label + pre-check
  never drift from the server rule.
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

- Given a file over `ATTACHMENT_MAX_BYTES` (default 4 MB), when a user attempts
  to upload it, then the client rejects it instantly with a clear message and the
  server rejects it too with `422` (the security boundary).
- Given a `.exe` file, when a user attempts to upload it, then the API
  rejects it with `422` (not in the allow-list).
- Given an attachment, when a user clicks download, then the bytes are served
  through the RBAC-gated proxy route, never a permanent public link.

## Validation

Server-side: `mimeType` against the BR-3 allow-list, `sizeBytes <=
25_000_000`. `fileName` sanitized (no path traversal characters) before
being used as the display name; the actual storage key is a generated
opaque identifier, never the raw file name (Security Architecture §4).

## Future Scope (all additive behind the same seam — ADR-0017)

- **Presigned direct-to-storage upload** (`getSignedUploadUrl`) for large files/scale.
- **Versioning** (`attachment_versions`); **deduplication** (content `sha256` + refcount);
  **virus scanning** (`scanStatus` + async worker, download gates on `CLEAN`);
  **image/PDF previews** (derived thumbnails); **storage quotas** (per-org bytes sum);
  **expiring share links** (the signed-URL seam + a share record); **visibility**;
  **AI document processing** (extracted text/embeddings); **external storage integrations**
  (new `StorageAdapter` implementations); **drag-and-drop bulk uploads**.
