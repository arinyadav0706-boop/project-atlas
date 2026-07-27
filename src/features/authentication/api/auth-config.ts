import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { env, getAllowedEmailDomains } from "@/shared/lib/env";
import { UserRepository } from "@/features/authentication/repositories/user.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { credentialsSchema } from "@/features/authentication/validation/credentials.schema";

// ADR-0003 (SSO-first, password fallback) + ADR-0005 (deferred, config-
// driven domain restriction). See docs/02_Modules/01_authentication.md.

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

async function rejectAndLog(reason: string, email: string) {
  const org = await UserRepository.findDefaultOrganization();
  if (org) {
    await AuditLogService.record({
      organizationId: org.id,
      actorId: null,
      action: reason,
      entityType: "User",
      entityId: email,
    });
  }
  return false;
}

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  // Required for any deployment fronted by a reverse proxy / load balancer
  // (Docker on Azure, per ADR-0004) where the request host isn't Vercel's
  // auto-detected one. Without this, Auth.js rejects the request as an
  // UntrustedHost — see the fail-safe check in src/app/page.tsx and
  // src/app/(app)/layout.tsx for what happens if auth() ever errors here.
  trustHost: true,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    MicrosoftEntraID({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      issuer: env.AZURE_AD_TENANT_ID
        ? `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`
        : undefined,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await UserRepository.findByEmail(parsed.data.email);
        if (!user || !user.passwordHash || !user.isActive) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      const allowedDomains = getAllowedEmailDomains();
      if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain(user.email))) {
        return rejectAndLog("SIGNIN_REJECTED_DOMAIN", user.email);
      }

      let dbUser = await UserRepository.findByEmail(user.email);

      if (!dbUser && account?.provider !== "credentials") {
        const org = await UserRepository.findDefaultOrganization();
        if (!org) return false;
        dbUser = await UserRepository.createFromProvider({
          organizationId: org.id,
          email: user.email,
          name: user.name ?? user.email,
          avatarUrl: user.image,
        });
      }

      if (!dbUser) return false;

      if (!dbUser.isActive) {
        return rejectAndLog("SIGNIN_REJECTED_DEACTIVATED", user.email);
      }

      if (account && account.provider !== "credentials") {
        const existingLink = await UserRepository.findAuthAccount(
          account.provider === "google" ? "GOOGLE" : "MICROSOFT_ENTRA",
          account.providerAccountId,
        );
        if (!existingLink) {
          await UserRepository.linkAuthAccount(
            dbUser.id,
            account.provider === "google" ? "GOOGLE" : "MICROSOFT_ENTRA",
            account.providerAccountId,
          );
        }
      }

      await UserRepository.updateLastLogin(dbUser.id);
      return true;
    },

    async jwt({ token, user, trigger }) {
      if (user?.email) {
        const dbUser = await UserRepository.findByEmail(user.email);
        if (dbUser) {
          token.userId = dbUser.id;
          token.orgRole = dbUser.orgRole;
          token.organizationId = dbUser.organizationId;
          token.name = dbUser.name;
          token.picture = dbUser.avatarUrl ?? null;
        }
      }
      // A profile save (name/avatar) triggers a client session update; re-read
      // those identity claims so the top bar refreshes without a re-login
      // (ADR-0027). Only name/avatar are re-read — role/tenant never change here.
      if (trigger === "update" && token.userId) {
        const fresh = await UserRepository.findSessionIdentity(token.userId as string);
        if (fresh) {
          token.name = fresh.name;
          token.picture = fresh.avatarUrl ?? null;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.orgRole = token.orgRole as string;
        session.user.organizationId = token.organizationId as string;
        if (token.name) session.user.name = token.name;
        session.user.image = (token.picture as string | null) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
