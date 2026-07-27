import { ValidationError } from "@/shared/lib/errors";

// Avatar upload constraints (16_profile.md BR-4, ADR-0027). Images only, small.
// This is the security boundary — an allow-list, enforced server-side — the
// client's declared MIME is only a hint; the served bytes are sniffed (below).

const DEFAULT_MAX_AVATAR_BYTES = 2_000_000; // 2 MB
const configuredMax = Number(process.env.AVATAR_MAX_BYTES);
export const MAX_AVATAR_BYTES =
  Number.isFinite(configuredMax) && configuredMax > 0
    ? configuredMax
    : DEFAULT_MAX_AVATAR_BYTES;

export const MAX_AVATAR_MB = Math.round(MAX_AVATAR_BYTES / 1_000_000);

export const ALLOWED_AVATAR_MIME_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function assertValidAvatar(mimeType: string, sizeBytes: number): void {
  if (sizeBytes <= 0) {
    throw new ValidationError("The image is empty.");
  }
  if (sizeBytes > MAX_AVATAR_BYTES) {
    throw new ValidationError(`Image is too large — the limit is ${MAX_AVATAR_MB} MB.`);
  }
  if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new ValidationError("Avatars must be a PNG, JPEG, WebP, or GIF image.");
  }
}

// We don't persist the avatar's content-type (no schema field — ADR-0027), so
// the serving route derives it from the bytes. Magic-number sniff of the four
// allowed formats; unknown → a safe generic type. This never trusts a
// client-declared type, closing the "declares image/png, sends HTML" gap.
export function sniffImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii").startsWith("GIF8")) {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}
