import { signIn } from "@/features/authentication/api/auth-config";
import { Button } from "@/shared/components/ui/button";

// Screen #1 — docs/05_UI/02_Screens_and_Information_Architecture.md.
// SSO is the intended default path (ADR-0003); email/password is a
// secondary, collapsed fallback, not a coin-flip choice.
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
          <p className="mb-4 rounded-md bg-muted px-3 py-2 text-center text-sm text-foreground">
            {errorMessage}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" variant="outline" className="mb-3 w-full">
            Continue with Google
          </Button>
        </form>

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
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
            await signIn("credentials", {
              email: formData.get("email"),
              password: formData.get("password"),
              redirectTo: "/dashboard",
            });
          }}
          className="space-y-3"
        >
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
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
    case "AccessDenied":
      return "Sign-in was rejected. Contact your admin if you believe this is an error.";
    case "CredentialsSignin":
      return "Invalid email or password.";
    default:
      return null;
  }
}
