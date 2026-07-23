"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Download, Trash2, Upload } from "lucide-react";
import type {
  AttachmentDto,
  AttachmentListDto,
} from "@/features/attachments/types/attachment.types";

// The Attachments panel on an issue (09_attachments.md). File picker + drag-drop
// upload, a bounded list, and RBAC-gated download/delete. Bytes never touch a
// public URL — download goes through the proxy route (ADR-0017). Bulk upload,
// previews, and versioning are documented seams, not built here.
export function AttachmentsSection({
  issueId,
  initial,
}: {
  issueId: string;
  initial: AttachmentListDto;
}) {
  const [items, setItems] = useState<AttachmentDto[]>(initial.items);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = initial.canUpload;
  const maxBytes = initial.maxUploadBytes;
  const maxMb = Math.floor(maxBytes / 1_000_000);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || uploading) return;
    setUploading(true);
    try {
      // Sequential keeps ordering deterministic and avoids a burst; the parallel
      // bulk path is a future optimization (ADR-0017 §5).
      for (const file of list) {
        // Reject oversize files instantly — the server enforces this too, but a
        // client pre-check avoids a doomed round-trip that the host would refuse
        // at the edge anyway (the bytes never fit through the upload path).
        if (file.size > maxBytes) {
          toast.error(`${file.name} is too large — the limit is ${maxMb} MB.`);
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/issues/${issueId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const message = await res
            .json()
            .then((b) => (b as { message?: string }).message)
            .catch(() => null);
          throw new Error(message ?? `Couldn't upload ${file.name}.`);
        }
        const created = (await res.json()) as AttachmentDto;
        setItems((prev) => [...prev, created]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete the file.");
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the file.");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Paperclip className="h-4 w-4" />
        Attachments{items.length > 0 && ` (${items.length})`}
      </h2>

      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No files attached.</p>
        )}
        {items.map((att) => (
          <AttachmentRow key={att.id} attachment={att} onDelete={() => remove(att.id)} />
        ))}
      </div>

      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
          }}
          className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/10" : "border-border"
          }`}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag files here, or{" "}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="font-medium text-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">Up to {maxMb} MB each.</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            aria-label="Upload files"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
            }}
          />
          {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
        </div>
      )}
    </section>
  );
}

function AttachmentRow({
  attachment,
  onDelete,
}: {
  attachment: AttachmentDto;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(attachment.sizeBytes)} · {attachment.uploadedBy.name}
        </p>
      </div>
      <a
        href={attachment.downloadUrl}
        className="rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Download ${attachment.fileName}`}
      >
        <Download className="h-4 w-4" />
      </a>
      {attachment.canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Delete ${attachment.fileName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
