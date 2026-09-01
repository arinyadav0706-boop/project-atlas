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
  // Bearer token for POST /api/scheduler/tick (ADR-0051 §5). Optional so a
  // dev machine boots without one — the endpoint refuses every request while
  // it is unset, which is the right failure: an unauthenticated scheduler is
  // an unauthenticated issue factory.
  SCHEDULER_SECRET: z.string().optional().default(""),
  // Vercel Cron's own convention: when this is set, Vercel sends
  // `Authorization: Bearer $CRON_SECRET` with each scheduled request. Accepted
  // as an alias so a Vercel deployment needs one variable, not two that must be
  // kept equal.
  CRON_SECRET: z.string().optional().default(""),
  // Base64 of 32 random bytes — `openssl rand -base64 32`. Encrypts the git-host
  // credentials module 35 stores (ADR-0054 §3).
  //
  // Optional so a dev machine boots without one, and validated where it is used
  // rather than here: an installed app whose key later goes missing must fail
  // with "the key is gone", not with the whole app refusing to start. Connecting
  // a git host is refused up front while it is unset.
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional().default(""),
});

/** The token `POST|GET /api/scheduler/tick` accepts. Empty means "refuse all". */
export function schedulerSecret(): string {
  return env.SCHEDULER_SECRET || env.CRON_SECRET;
}

export const env = envSchema.parse(process.env);

export function getAllowedEmailDomains(): string[] {
  return env.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}
