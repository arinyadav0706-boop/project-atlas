"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/features/authentication/api/auth-config";

// Server actions imported by the (client) sign-in screen. Auth.js signals
// failure by throwing AuthError and success by throwing Next's internal
// redirect — so catch AuthError → friendly ?error= redirect, and re-throw
// everything else (including the success redirect).
async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AuthError) {
      const code = error.type === "CredentialsSignin" ? "CredentialsSignin" : "Default";
      redirect(`/sign-in?error=${code}`);
    }
    throw error;
  }
}

export async function signInWithGoogle() {
  await run(() => signIn("google", { redirectTo: "/home" }));
}

export async function signInWithMicrosoft() {
  await run(() => signIn("microsoft-entra-id", { redirectTo: "/home" }));
}

export async function signInWithCredentials(formData: FormData) {
  await run(() =>
    signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/home",
    }),
  );
}
