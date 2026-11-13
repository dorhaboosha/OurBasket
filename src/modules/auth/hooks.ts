// Better Auth hooks that keep the app limited to the two allowed users.
// Kept separate from the Better Auth config so they can be tested directly.

import { prisma } from "@/lib/prisma";
import { findAllowedUserKey } from "./allowlist";

/** Error codes Better Auth puts in the redirect (/login?error=<code>). */
export const NOT_ALLOWED = "not_allowed";
export const EMAIL_NOT_VERIFIED = "email_not_verified";

/**
 * user.validateUserInfo: runs before a user is created, before an account is linked,
 * and on every Google sign-in, with what Google returned just now. Both conditions
 * must hold (spec 4): Google says the email is verified (email_verified = true), and
 * it is one of the two allowed emails. Otherwise no user and no session are created.
 */
export function rejectUnlistedOrUnverified({
  user,
}: {
  user: { email?: unknown; emailVerified?: unknown };
}) {
  const email = typeof user.email === "string" ? user.email : undefined;
  if (!findAllowedUserKey(email)) return { error: NOT_ALLOWED };
  if (user.emailVerified !== true) return { error: EMAIL_NOT_VERIFIED };
}

/** databaseHooks.user.create.before: link the new user to their entry in app.config.ts. */
export async function assignConfigKey<T extends { email: string }>(user: T) {
  const configKey = findAllowedUserKey(user.email);
  if (!configKey) return false;
  return { data: { ...user, configKey } };
}

/**
 * databaseHooks.session.create.before: refuse a session for a user whose email is no
 * longer on the allowlist (for example after the env var changed).
 */
export async function rejectSessionForUnlistedUser(session: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!findAllowedUserKey(user?.email)) return false;
}
