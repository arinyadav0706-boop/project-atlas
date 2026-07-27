"use client";

import { SessionProvider } from "next-auth/react";

// Client-side session context for the authenticated app shell. It lets the
// Profile screen call useSession().update() after a save so the top-bar name and
// avatar refresh without a re-login (ADR-0027). The session strategy is JWT, so
// the provider fetches the current session from the Auth.js session endpoint.
export function AppProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
