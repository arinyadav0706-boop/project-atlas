import { z } from "zod";

// Shared between the credentials sign-in form and the Auth.js authorize()
// callback (Coding Standards §3 — one schema per shape).
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
