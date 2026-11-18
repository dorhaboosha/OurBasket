import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedDatabase } from "@/modules/categories/seed";
import { REALTIME_CHANNEL, revisionOf } from "@/modules/realtime/channel";
import { resetDatabase } from "./helpers";

// Pusher is never called for real: trigger is recorded, and after() runs at once.
const triggered: unknown[][] = [];
vi.mock("pusher", async (importOriginal) => {
  const Real = ((await importOriginal()) as { default: typeof import("pusher") }).default;
  class FakePusher extends Real {
    override async trigger(...args: unknown[]) {
      triggered.push(args);
      return {} as never;
    }
  }
  return { default: FakePusher };
});
const afterCallbacks: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: (callback: () => Promise<unknown>) => afterCallbacks.push(callback()),
}));

const user = { id: "u1", configKey: "dor", displayName: "דור" };
const SOCKET = "1234.5678";

function setPusherEnv(values: Record<string, string>) {
  for (const name of ["PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"]) {
    vi.stubEnv(name, values[name] ?? "");
  }
}

/** The module fresh, so it reads the environment set for the test. */
async function realtime() {
  vi.resetModules();
  return import("@/modules/realtime/server");
}

beforeEach(async () => {
  triggered.length = 0;
  afterCallbacks.length = 0;
  await resetDatabase();
  await seedDatabase(prisma);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("authorizeChannel", () => {
  beforeEach(() => setPusherEnv({ PUSHER_KEY: "key", PUSHER_SECRET: "secret" }));

  it("signs the app's channel for a signed-in user", async () => {
    const { authorizeChannel } = await realtime();
    const result = authorizeChannel(user, SOCKET, REALTIME_CHANNEL);
    const signature = createHmac("sha256", "secret")
      .update(`${SOCKET}:${REALTIME_CHANNEL}`)
      .digest("hex");
    expect(result).toEqual({ status: 200, body: { auth: `key:${signature}` } });
  });

  it("refuses a signed-out user, another channel, or a bad socket id", async () => {
    const { authorizeChannel } = await realtime();
    expect(authorizeChannel(null, SOCKET, REALTIME_CHANNEL).status).toBe(403);
    expect(authorizeChannel(user, SOCKET, "private-other").status).toBe(403);
    expect(authorizeChannel(user, SOCKET, "presence-ourbasket").status).toBe(403);
    expect(authorizeChannel(user, "nope", REALTIME_CHANNEL).status).toBe(400);
    expect(authorizeChannel(user, undefined, REALTIME_CHANNEL).status).toBe(400);
  });

  it("says so when real-time isn't configured", async () => {
    setPusherEnv({});
    const { authorizeChannel } = await realtime();
    expect(authorizeChannel(user, SOCKET, REALTIME_CHANNEL).status).toBe(503);
  });
});

describe("notifyListChanged", () => {
  it("sends the current revision on the app's channel, after the response", async () => {
    setPusherEnv({
      PUSHER_APP_ID: "1",
      PUSHER_KEY: "key",
      PUSHER_SECRET: "secret",
      PUSHER_CLUSTER: "eu",
    });
    await prisma.listState.update({ where: { id: 1 }, data: { revision: 41 } });
    const { notifyListChanged } = await realtime();

    notifyListChanged();
    await Promise.all(afterCallbacks);
    expect(triggered).toEqual([[REALTIME_CHANNEL, "list-changed", { revision: 41 }]]);
  });

  it("sends nothing when Pusher isn't configured (tests, CI)", async () => {
    setPusherEnv({ PUSHER_KEY: "key", PUSHER_SECRET: "secret" });
    const { notifyListChanged } = await realtime();
    notifyListChanged();
    await Promise.all(afterCallbacks);
    expect(afterCallbacks).toHaveLength(0);
    expect(triggered).toEqual([]);
  });
});

describe("revisionOf", () => {
  it("reads a valid revision and refuses anything else", () => {
    expect(revisionOf({ revision: 7 })).toBe(7);
    expect(revisionOf({ revision: 0 })).toBe(0);
    for (const payload of [null, {}, { revision: -1 }, { revision: 1.5 }, { revision: "7" }]) {
      expect(revisionOf(payload)).toBeNull();
    }
  });
});
