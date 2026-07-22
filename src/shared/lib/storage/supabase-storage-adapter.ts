import type { StorageAdapter, UploadInput } from "./storage-adapter";

// Supabase Storage via its REST API using plain `fetch` — deliberately NOT the
// Supabase JS SDK, so no provider SDK leaks into the codebase (ADR-0004). Only
// constructed when STORAGE_PROVIDER=supabase; config-gated so a misconfigured
// prod fails loudly at first use, not silently.
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly serviceKey: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (!url || !key || !bucket) {
      throw new Error(
        "Supabase storage requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.",
      );
    }
    this.baseUrl = url.replace(/\/$/, "");
    this.serviceKey = key;
    this.bucket = bucket;
  }

  private objectUrl(storageKey: string): string {
    return `${this.baseUrl}/storage/v1/object/${this.bucket}/${storageKey}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey };
  }

  async upload(input: UploadInput): Promise<void> {
    const res = await fetch(this.objectUrl(input.storageKey), {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": input.mimeType,
        "x-upsert": "true",
      },
      // Buffer is a Uint8Array at runtime; view it as one for the fetch BodyInit type.
      body: new Uint8Array(input.buffer),
    });
    if (!res.ok) {
      throw new Error(`Storage upload failed (${res.status}).`);
    }
  }

  async getObject(storageKey: string): Promise<Buffer | null> {
    const res = await fetch(this.objectUrl(storageKey), { headers: this.authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage download failed (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(storageKey: string): Promise<void> {
    const res = await fetch(this.objectUrl(storageKey), {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Storage delete failed (${res.status}).`);
    }
  }
}
