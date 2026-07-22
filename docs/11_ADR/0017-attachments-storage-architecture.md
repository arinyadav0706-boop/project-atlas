# ADR-0017: Attachments — Provider-Agnostic Storage Architecture

**Status:** Accepted
**Date:** 2026-07-21
**Deciders:** Founding CTO; founder direction (Jira-class, portable, production-grade)

## Context

Attachments put binary files on an issue. Long-term this grows into: multiple file
types, drag-and-drop & bulk uploads, versioning, image/PDF previews, virus scanning,
deduplication, permissions/visibility, storage quotas, audit logs, **expiring share
links**, AI document processing, and **external storage integrations**.

Two hard constraints shape the design:
1. **Storage must stay provider-agnostic** — Supabase Storage today; S3/GCS/Azure or
   local disk (self-hosted, ADR-0006) tomorrow — with zero provider SDK leaking into
   feature code (ADR-0004 pre-defined a `StorageAdapter` seam for exactly this).
2. **The app server must not become a bottleneck for bytes**, and files must never be
   served from a permanently public URL (security).

This ADR fixes how bytes flow, how the provider is abstracted, and where the future
features attach — without building speculative machinery now (CLAUDE.md #10).

## Decision

**1. `StorageAdapter` is the only storage seam.** Feature code (service/repository)
depends solely on the interface; a **factory** picks the concrete adapter from
`STORAGE_PROVIDER`. Metadata (the `Attachment` row) is owned by Postgres; the adapter
owns only opaque blobs keyed by `storageKey`.

```
interface StorageAdapter {
  upload(input: { storageKey, buffer, mimeType }): Promise<void>
  getObject(storageKey): Promise<Buffer>   // MVP download (RBAC-proxied)
  delete(storageKey): Promise<void>
  // Future seam (documented, not MVP): getSignedUploadUrl() for direct-to-storage
  // uploads, getSignedDownloadUrl() for CDN redirects + expiring share links,
  // putVersion()/head() for versioning.
}
```

**2. Two adapters ship; both satisfy the same contract:**
- **`LocalStorageAdapter`** — reads/writes under `STORAGE_LOCAL_DIR`; the **dev +
  self-hosted default** (ADR-0006) and the one exercised by tests. `getObject` streams
  from disk.
- **`SupabaseStorageAdapter`** — the SaaS default; wraps the Supabase Storage SDK
  (`upload`/`download`/`remove`) against a private bucket. Config-gated (the build
  sandbox can't reach it); delivered for prod.
Adding S3/GCS/Azure later is a new class implementing the interface + a factory case —
**no feature-code change.**

**3. Upload is server-proxied for the MVP.** The client POSTs multipart to
`POST /issues/{id}/attachments`; the route reads the file, **validates size + MIME
allow-list server-side** (never trusting the client), generates an **opaque
`storageKey`** (never the raw filename — path-traversal/XSS safety), calls
`adapter.upload`, then records the `Attachment` row. This is uniform across every
provider and fully testable. **Direct-to-storage presigned upload** (client → bucket,
bypassing the server for large files) is the documented scale path — an additive
`getSignedUploadUrl` on the interface, not needed at MVP volumes.

**4. Download is RBAC-gated and byte-proxied for the MVP.**
`GET /attachments/{id}/download` authenticates + authorizes (F-1 + project membership),
then streams `adapter.getObject(key)` with the stored `mimeType` + a `Content-Disposition`
carrying the display `fileName`. No public URL exists — access is checked on every
request (strictly stronger than a leakable capability URL). The **short-lived
signed-URL redirect** (`getSignedDownloadUrl`) — which offloads bytes to the provider's
CDN and generalises into **expiring share links** — is the documented scale seam,
added when bandwidth/volume calls for it.

**5. Delete removes the row; the blob is best-effort.** Soft-delete the `Attachment`
row (audit/history), then attempt `adapter.delete`; a storage failure does not block
the user (orphan swept by a future cleanup job) — matches the draft's BR-6.

**6. Extension points — deferred by decision (each additive):**
- **Versioning** → an `attachment_versions` table or a `version` + immutable keys.
- **Deduplication** → a content hash (`sha256`) column + refcount; upload short-circuits
  on a hash hit.
- **Virus scanning** → a `scanStatus` enum + async worker; downloads gate on `CLEAN`.
- **Previews** → derived thumbnail objects keyed off the original.
- **Quotas** → per-org bytes sum vs a limit (the row already has `sizeBytes`).
- **Visibility / share links** → the signed-URL seam + a share record.
- **AI processing** → extracted-text/embeddings off the stored object.
The **`AttachmentDto` is designed to grow** (optional `scanStatus`, `previewUrl`,
`hash`, `version`) without breaking clients.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Bytes through the DB / app memory permanently** | Doesn't scale; blobs belong in object storage, metadata in Postgres. |
| **Presigned direct upload now** | More moving parts (CORS, client-side signing, confirm step) for no MVP benefit; kept as an additive interface method for scale. |
| **Serve files from a public bucket URL** | No access control; violates BR-5. Signed, short-lived URLs behind an RBAC route instead. |
| **Store under the raw filename** | Path traversal / collision / XSS; opaque keys + a `fileName` display column. |
| **Couple features to the Supabase SDK** | Kills portability (ADR-0004); everything goes through `StorageAdapter`. |

## Consequences

- **Positive:** feature code is storage-agnostic; swapping/adding a provider is one
  class; uploads/downloads are validated + access-controlled; the local adapter makes
  the whole flow testable in CI/self-host; every future feature (versioning, dedup,
  scanning, previews, quotas, share links, AI) is an additive column/table/adapter
  method behind the same seam.
- **Negative / trade-offs accepted:** MVP proxies upload bytes through the app (capped
  at 25 MB) rather than presigned direct-to-storage — deliberate, revisited when file
  sizes/volume demand it. The HMAC-signed local URL adds a small signing util (also the
  foundation for share links).
- **Follow-up actions:**
  1. `LocalStorageAdapter` + `SupabaseStorageAdapter` + `getStorageAdapter()` factory +
     HMAC signer + the public local file route.
  2. Feature: repository, service (RBAC + validation + orchestration), routes, UI.
  3. Config: `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR`, `STORAGE_URL_SECRET`, and (Supabase)
     bucket + service key — documented for prod (GL-4 adjacent).
