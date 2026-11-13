import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_NOT_VERIFIED,
  NOT_ALLOWED,
  assignConfigKey,
  rejectSessionForUnlistedUser,
  rejectUnlistedOrUnverified,
} from "@/modules/auth/hooks";
import { createUser, resetDatabase } from "./helpers";

vi.stubEnv("USER_EMAIL_DOR", "dor@example.com");
vi.stubEnv("USER_EMAIL_MAAYAN", "maayan@example.com");

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("rejectUnlistedOrUnverified", () => {
  it("allows the two configured emails when Google verified them", () => {
    expect(
      rejectUnlistedOrUnverified({ user: { email: "dor@example.com", emailVerified: true } }),
    ).toBeUndefined();
    expect(
      rejectUnlistedOrUnverified({ user: { email: "Maayan@Example.com", emailVerified: true } }),
    ).toBeUndefined();
  });

  it("rejects an allowed email that Google did not verify", () => {
    for (const emailVerified of [false, undefined, "true"]) {
      expect(
        rejectUnlistedOrUnverified({ user: { email: "dor@example.com", emailVerified } }),
      ).toEqual({ error: EMAIL_NOT_VERIFIED });
    }
  });

  it("rejects any other email, or a missing one, verified or not", () => {
    expect(
      rejectUnlistedOrUnverified({ user: { email: "stranger@example.com", emailVerified: true } }),
    ).toEqual({ error: NOT_ALLOWED });
    expect(rejectUnlistedOrUnverified({ user: { emailVerified: true } })).toEqual({
      error: NOT_ALLOWED,
    });
  });
});

describe("assignConfigKey", () => {
  it("adds the matching user key to a new user", async () => {
    const result = await assignConfigKey({ email: "maayan@example.com", name: "Maayan" });
    expect(result).toEqual({
      data: { email: "maayan@example.com", name: "Maayan", configKey: "maayan" },
    });
  });

  it("blocks creating a user that is not on the allowlist", async () => {
    expect(await assignConfigKey({ email: "stranger@example.com" })).toBe(false);
  });
});

describe("rejectSessionForUnlistedUser", () => {
  it("allows a session for an allowed user", async () => {
    const dor = await createUser("dor", "dor@example.com");
    expect(await rejectSessionForUnlistedUser({ userId: dor.id })).toBeUndefined();
  });

  it("refuses a session once the user's email is no longer allowed", async () => {
    const old = await createUser("dor", "old-address@example.com");
    expect(await rejectSessionForUnlistedUser({ userId: old.id })).toBe(false);
  });

  it("refuses a session for a user that does not exist", async () => {
    expect(await rejectSessionForUnlistedUser({ userId: randomUUID() })).toBe(false);
  });
});

describe("users table", () => {
  it("allows only one user per config key", async () => {
    await createUser("dor", "a@example.com");
    await expect(createUser("dor", "b@example.com")).rejects.toMatchObject({ code: "P2002" });
  });

  it("deletes a user's sessions together with the user", async () => {
    const user = await createUser("dor");
    await prisma.session.create({
      data: {
        id: randomUUID(),
        token: randomUUID(),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("Better Auth configuration", () => {
  it("has no session without a cookie", async () => {
    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });

  it("sends sign-in to Google with identity-only scopes and our callback URL", async () => {
    const { url } = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/" },
    });
    const authorize = new URL(url!);

    expect(authorize.origin).toBe("https://accounts.google.com");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${process.env.BETTER_AUTH_URL}/api/auth/callback/google`,
    );
    expect(authorize.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
    expect(authorize.searchParams.get("prompt")).toBe("select_account");
    expect(authorize.searchParams.get("state")).toBeTruthy();
  });

  it("does not offer email/password sign-up", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "dor@example.com", password: "a-long-password-123", name: "Dor" },
      }),
    ).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });
});
