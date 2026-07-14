import { SignInScreen } from "@/features/authentication/components/sign-in-screen";

// Screen #1 — docs/05_UI/02_Screens_and_Information_Architecture.md.
// Thin server wrapper; the interactive split-screen UI lives in
// SignInScreen (client), which wires the real Auth.js server actions from
// features/authentication/api/sign-in-actions.ts.
export default function SignInPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return <SignInScreen error={searchParams?.error} />;
}
