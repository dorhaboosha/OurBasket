import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/modules/auth/current-user";
import { createUser, resetDatabase } from "./helpers";

// next/headers and next/navigation only work inside a Next.js request.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.stubEnv("USER_EMAIL_DOR", "dor@example.com");
vi.stubEnv("USER_EMAIL_MAAYAN", "maayan@example.com");

/** Makes Better Auth report the given user as signed in. */
function signIn(user: Awaited<ReturnType<typeof createUser>>) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user,
    session: { id: randomUUID(), userId: user.id, token: "t", expiresAt: new Date() },
  } as never);
}

beforeEach(resetDatabase);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("getCurrentUser", () => {
  it("returns null without a session", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("uses the display name from app.config.ts", async () => {
    const maayan = await createUser("maayan");
    signIn(maayan);
    expect(await getCurrentUser()).toEqual({
      id: maayan.id,
      configKey: "maayan",
      displayName: "מעיין",
    });
  });

  it("signs out a user whose email was removed from the allowlist", async () => {
    signIn(await createUser("dor", "dor@example.com"));
    vi.stubEnv("USER_EMAIL_DOR", "new-address@example.com");
    try {
      expect(await getCurrentUser()).toBeNull();
    } finally {
      vi.stubEnv("USER_EMAIL_DOR", "dor@example.com");
    }
  });

  it("signs out a user whose email now belongs to the other config key", async () => {
    signIn(await createUser("maayan", "dor@example.com"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("treats a user that is not in app.config.ts as signed out", async () => {
    signIn(await createUser("someone-else", "dor@example.com"));
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns no email or Google data", async () => {
    signIn(await createUser("dor"));
    expect(Object.keys((await getCurrentUser())!).sort()).toEqual([
      "configKey",
      "displayName",
      "id",
    ]);
  });
});

describe("requireUser", () => {
  it("redirects to /login without a session", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns the user when signed in", async () => {
    signIn(await createUser("dor"));
    expect((await requireUser()).configKey).toBe("dor");
  });
});
