import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { signIn } from "@/features/authentication/api/auth-config";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { LogoMark } from "@/shared/components/brand/logo";
import { GoogleIcon, MicrosoftIcon } from "@/shared/components/brand/provider-icons";

// Screen #1 — docs/05_UI/02_Screens_and_Information_Architecture.md.
// Split brand panel + form, SSO-first (ADR-0003).
//
// Auth.js's signIn() signals failure by THROWING (CredentialsSignin etc.)
// and success by throwing Next's internal redirect. So: catch AuthError →
// friendly ?error= redirect, but re-throw everything else or successful
// sign-ins break.
async function signInWithProvider(
  provider: "google" | "microsoft-entra-id" | "credentials",
  formData?: FormData,
) {
  "use server";
  try {
    if (provider === "credentials") {
      await signIn("credentials", {
        email: formData?.get("email"),
        password: formData?.get("password"),
        redirectTo: "/dashboard",
      });
    } else {
      await signIn(provider, { redirectTo: "/dashboard" });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      const code = error.type === "CredentialsSignin" ? "CredentialsSignin" : "Default";
      redirect(`/sign-in?error=${code}`);
    }
    throw error;
  }
}

const brandPoints = [
  "Projects, issues, sprints — one clean workspace",
  "Enterprise sign-in with Google and Microsoft",
  "Your data stays portable and self-hostable",
];

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorMessage = mapAuthError(searchParams?.error);

  return (
    <main className="flex min-h-screen">
      {/* Brand panel — hidden on small screens */}
      <aside className="auth-surface relative hidden w-1/2 flex-col justify-between border-r border-border p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            EAGLES
          </span>
        </div>

        <div className="max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.12] tracking-tight text-foreground">
            Where your teams plan, track, and ship the work that matters.
          </h1>
          <ul className="mt-9 space-y-3.5">
            {brandPoints.map((point) => (
              <li key={point} className="flex items-center gap-3 text-[15px] text-foreground/80">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Enterprise Agile Governance, Lifecycle &amp; Execution System
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-[360px]">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <LogoMark className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              EAGLES
            </span>
          </div>

          <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
            Sign in
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Welcome back. Continue with your work account.
          </p>

          {errorMessage && (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}

          <div className="mt-7 space-y-2.5">
            <form action={async () => {
              "use server";
              await signInWithProvider("google");
            }}>
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full justify-center gap-3 text-[13.5px] font-medium"
              >
                <GoogleIcon className="h-[18px] w-[18px]" />
                Continue with Google
              </Button>
            </form>
            <form action={async () => {
              "use server";
              await signInWithProvider("microsoft-entra-id");
            }}>
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full justify-center gap-3 text-[13.5px] font-medium"
              >
                <MicrosoftIcon className="h-[18px] w-[18px]" />
                Continue with Microsoft
              </Button>
            </form>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or continue with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form
            action={async (formData: FormData) => {
              "use server";
              await signInWithProvider("credentials", formData);
            }}
            className="space-y-3.5"
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@consint.ai"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="h-11 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-7 text-center text-xs text-muted-foreground">
            Trouble signing in? Ask your workspace admin.
          </p>
        </div>
      </div>
    </main>
  );
}

function mapAuthError(code?: string): string | null {
  switch (code) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "AccessDenied":
      return "Sign-in was rejected. Contact your admin if you believe this is an error.";
    case "Default":
      return "Sign-in failed. Please try again.";
    default:
      return null;
  }
}
