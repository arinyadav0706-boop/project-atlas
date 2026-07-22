import type { StorageAdapter } from "./storage-adapter";
import { LocalStorageAdapter } from "./local-storage-adapter";
import { SupabaseStorageAdapter } from "./supabase-storage-adapter";

export type { StorageAdapter, UploadInput } from "./storage-adapter";

// One process-wide adapter, chosen by STORAGE_PROVIDER (ADR-0017). Default is
// `local` (dev + self-hosted, ADR-0006). Adding S3/GCS/Azure later is a new class
// + a case here — no feature-code change.
let cached: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;
  const provider = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  switch (provider) {
    case "supabase":
      cached = new SupabaseStorageAdapter();
      break;
    case "local":
      cached = new LocalStorageAdapter();
      break;
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${provider}".`);
  }
  return cached;
}
