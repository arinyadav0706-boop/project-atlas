import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageAdapter, UploadInput } from "./storage-adapter";

// Disk-backed storage (ADR-0017): the dev + self-hosted default, and the adapter
// exercised by tests. Blobs live under STORAGE_LOCAL_DIR, keyed by `storageKey`.
// Keys are opaque and generated server-side; still, resolve + contain them under
// the base dir so a crafted key can never escape it (path-traversal guard).
export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir = process.env.STORAGE_LOCAL_DIR ?? ".data/storage") {
    this.baseDir = path.resolve(baseDir);
  }

  private resolveKey(storageKey: string): string {
    const full = path.resolve(this.baseDir, storageKey);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + path.sep)) {
      throw new Error("Invalid storage key.");
    }
    return full;
  }

  async upload(input: UploadInput): Promise<void> {
    const full = this.resolveKey(input.storageKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.buffer);
  }

  async getObject(storageKey: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolveKey(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
