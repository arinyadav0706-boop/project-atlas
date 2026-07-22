// Provider-agnostic storage seam (ADR-0004 / ADR-0017, NFR-8). Feature code
// depends only on this interface, never on a Supabase / S3 / Azure SDK directly.
// Concrete adapters live beside this file; `getStorageAdapter()` picks one from
// STORAGE_PROVIDER. Metadata lives in Postgres (the `attachments` table); the
// adapter owns only opaque blobs keyed by `storageKey`.

export interface UploadInput {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
}

export interface StorageAdapter {
  // Store the bytes under an opaque key (never the raw filename — ADR-0017 §3).
  upload(input: UploadInput): Promise<void>;
  // Read the bytes back. The MVP download route is RBAC-gated and proxies this
  // (no public URL). Returns null if the object is missing.
  getObject(storageKey: string): Promise<Buffer | null>;
  // Best-effort blob removal (the DB row is the source of truth — ADR-0017 §5).
  delete(storageKey: string): Promise<void>;

  // --- Future seams (ADR-0017), not implemented in the MVP ---
  // getSignedUploadUrl(...)   → direct-to-storage upload at scale
  // getSignedDownloadUrl(...) → CDN redirect + expiring share links
}
