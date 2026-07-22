import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalStorageAdapter } from "./local-storage-adapter";

describe("LocalStorageAdapter", () => {
  let dir: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "eagles-storage-"));
    adapter = new LocalStorageAdapter(dir);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("round-trips upload → getObject → delete", async () => {
    const buffer = Buffer.from("hello world");
    await adapter.upload({ storageKey: "attachments/a1.txt", buffer, mimeType: "text/plain" });

    const read = await adapter.getObject("attachments/a1.txt");
    expect(read?.toString()).toBe("hello world");

    await adapter.delete("attachments/a1.txt");
    expect(await adapter.getObject("attachments/a1.txt")).toBeNull();
  });

  it("returns null for a missing object", async () => {
    expect(await adapter.getObject("attachments/nope")).toBeNull();
  });

  it("rejects a path-traversal key", async () => {
    await expect(
      adapter.upload({ storageKey: "../escape", buffer: Buffer.from("x"), mimeType: "text/plain" }),
    ).rejects.toThrow(/invalid storage key/i);
  });
});
