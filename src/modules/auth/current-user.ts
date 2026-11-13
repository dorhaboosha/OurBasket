import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUserConfig } from "@/config/app.config";
import { auth } from "@/lib/auth";
import { findAllowedUserKey } from "./allowlist";

/** The signed-in user, as pages and components need it. No email, tokens or other secrets. */
export type CurrentUser = {
  id: string;
  configKey: string;
  displayName: string;
};

/**
 * The signed-in user, or null. Validates the session cookie against the database, and
 * checks the allowlist on every request (spec 4): a user whose email was removed from
 * the environment is signed out at once, not only at their next sign-in.
 * Wrapped in React's cache(): the layout and the page share one lookup per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id, email, configKey } = session.user;
  const allowedKey = findAllowedUserKey(email);
  // The email must still be allowed, and still belong to the same user.
  if (!allowedKey || allowedKey !== configKey) return null;
  const config = getUserConfig(allowedKey);
  if (!config) return null;

  return { id, configKey: config.key, displayName: config.displayName };
});

/** The server-side authorization check: use it in every protected page, action and route. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
