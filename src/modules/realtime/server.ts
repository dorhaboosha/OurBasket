import "server-only";
import { after } from "next/server";
import Pusher from "pusher";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/modules/auth/current-user";
import { LIST_CHANGED_EVENT, type ListChangedPayload, REALTIME_CHANNEL } from "./channel";

// Real-time sync, server side (spec 12): tells both phones that the list changed, and lets
// only the two signed-in users listen. Pusher only notifies; the database stays the source
// of truth, and every screen reloads from it.

type PusherEnv = { appId: string; key: string; secret: string; cluster: string };

function env(): Partial<PusherEnv> {
  // Empty counts as unset (the test environments blank them on purpose).
  const read = (name: string) => process.env[name] || undefined;
  return {
    appId: read("PUSHER_APP_ID"),
    key: read("PUSHER_KEY"),
    secret: read("PUSHER_SECRET"),
    cluster: read("PUSHER_CLUSTER"),
  };
}

let sender: Pusher | null | undefined;

/** The client that sends events, or null when Pusher isn't configured (tests, CI). */
function pusherSender(): Pusher | null {
  if (sender === undefined) {
    const { appId, key, secret, cluster } = env();
    sender =
      appId && key && secret && cluster
        ? new Pusher({ appId, key, secret, cluster, useTLS: true })
        : null;
  }
  return sender;
}

/**
 * Call from a Server Action after it saved a change. Once the response has been sent (so
 * the transaction has committed, spec 12.2), sends the list's current revision to both
 * phones. A failure is only logged: the change is saved, and the other phone also reloads
 * when it comes back to the app (spec 12.3).
 */
export function notifyListChanged() {
  const pusher = pusherSender();
  if (!pusher) return;
  after(async () => {
    try {
      const state = await prisma.listState.findUnique({
        where: { id: 1 },
        select: { revision: true },
      });
      const payload: ListChangedPayload = { revision: state?.revision ?? 0 };
      await pusher.trigger(REALTIME_CHANNEL, LIST_CHANGED_EVENT, payload);
    } catch (error) {
      console.error("Couldn't send the real-time event", error);
    }
  });
}

export type AuthorizeResult = { status: number; body: unknown };

/**
 * The private channel's permission check (spec 12.2): only a signed-in, allowed user, and
 * only for the app's channel. Signing needs only the key and secret (no network).
 */
export function authorizeChannel(
  user: CurrentUser | null,
  socketId: unknown,
  channel: unknown,
): AuthorizeResult {
  if (!user) return { status: 403, body: { error: "not signed in" } };
  if (channel !== REALTIME_CHANNEL) return { status: 403, body: { error: "unknown channel" } };
  const { appId, key, secret, cluster } = env();
  if (!key || !secret) return { status: 503, body: { error: "real-time is not configured" } };
  if (typeof socketId !== "string" || !/^\d+\.\d+$/.test(socketId)) {
    return { status: 400, body: { error: "invalid socket id" } };
  }
  const signer = new Pusher({ appId: appId ?? "unused", key, secret, cluster: cluster ?? "eu" });
  return { status: 200, body: signer.authorizeChannel(socketId, channel) };
}
