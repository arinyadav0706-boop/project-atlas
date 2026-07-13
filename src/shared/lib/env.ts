import { z } from "zod";

// Fails fast at startup on missing/malformed config rather than surfacing
// a confusing runtime error deep in a request handler.
// See docs/06_Infrastructure/01_Infrastructure_Overview.md §4.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Only Prisma itself reads this (schema.prisma's directUrl) — included
  // here too so a missing value fails fast at app startup, consistent with
  // every other required var, rather than only surfacing during a migration.
  DIRECT_URL: z.string().min(1),
  // Optional: with authConfig.trustHost, Auth.js infers the URL from the
  // request (Vercel/proxied deployments). Set it explicitly in production
  // once the final domain is known; required-ness here would deadlock the
  // very first Vercel deploy, whose URL isn't known until it exists.
  NEXTAUTH_URL: z.string().optional().default(""),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  AZURE_AD_CLIENT_ID: z.string().optional().default(""),
  AZURE_AD_CLIENT_SECRET: z.string().optional().default(""),
  AZURE_AD_TENANT_ID: z.string().optional().default(""),
  // Deliberately optional/unset by default — see ADR-0005. Comma-separated
  // list of allowed email domains; empty means no restriction.
  ALLOWED_EMAIL_DOMAINS: z.string().optional().default(""),
  STORAGE_PROVIDER: z.enum(["local", "supabase", "azure"]).default("local"),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  SUPABASE_STORAGE_BUCKET: z.string().optional().default("attachments"),
});

export const env = envSchema.parse(process.env);

export function getAllowedEmailDomains(): string[] {
  return env.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}
