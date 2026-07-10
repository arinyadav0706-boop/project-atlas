// Provider-agnostic storage seam (ADR-0004, NFR-8). Feature code depends
// only on this interface, never on a Supabase or Azure SDK directly.
// docs/02_Modules/09_attachments.md is the first feature that will use it.

export interface UploadInput {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
}

export interface StorageAdapter {
  upload(input: UploadInput): Promise<void>;
  getSignedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
}
