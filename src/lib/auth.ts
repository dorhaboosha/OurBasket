import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import {
  assignConfigKey,
  rejectSessionForUnlistedUser,
  rejectUnlistedOrUnverified,
} from "@/modules/auth/hooks";

// Sign-in with Google only, asking for basic identity (openid, email, profile).
// No email/password sign-in: Better Auth leaves it off unless enabled.
// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment by Better Auth.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Always show the account chooser, so signing in with the wrong account is easy to fix.
      prompt: "select_account",
    },
  },
  user: {
    validateUserInfo: rejectUnlistedOrUnverified,
    additionalFields: {
      // Set by the server only (input: false); clients can never choose it.
      configKey: { type: "string", required: false, input: false },
    },
  },
  account: {
    encryptOAuthTokens: true,
  },
  databaseHooks: {
    user: { create: { before: assignConfigKey } },
    session: { create: { before: rejectSessionForUnlistedUser } },
  },
  onAPIError: {
    // Failed sign-ins land back on the login page with ?error=<code>.
    errorURL: "/login",
  },
  // Must stay last: lets Server Actions set the session cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
