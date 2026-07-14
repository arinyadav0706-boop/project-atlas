import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/features/authentication/api/auth-config";
import { Button } from "@/shared/components/ui/button";

// Screen #1 — docs/05_UI/02_Screens_and_Information_Architecture.md.
// SSO is the intended default path (ADR-0003); email/password is a
// secondary, collapsed fallback, not a coin-flip choice.
//
// Auth.js's signIn() signals failure by THROWING (CredentialsSignin etc.),
// and signals success by throwing Next's internal redirect. So: catch
// AuthError and turn it into a friendly ?error= redirect, but always
// re-throw everything else or successful sign-ins would break.
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

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorMessage = mapAuthError(searchParams?.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-center text-xl font-semibold text-foreground">EAGLES</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Sign in to continue
        </p>

        {errorMessage && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signInWithProvider("google");
          }}
        >
          <Button type="submit" variant="outline" className="mb-3 w-full">
            Continue with Google
          </Button>
        </form>

        <form
          action={async () => {
            "use server";
            await signInWithProvider("microsoft-entra-id");
          }}
        >
          <Button type="submit" variant="outline" className="w-full">
            Continue with Microsoft
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            await signInWithProvider("credentials", formData);
          }}
          className="space-y-3"
        >
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            aria-label="Email"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-accent"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            aria-label="Password"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-accent"
          />
          <Button type="submit" variant="ghost" className="w-full">
            Sign in with email
          </Button>
        </form>
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
