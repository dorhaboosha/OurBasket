// Real-time sync (spec 12): names shared by the server and the browser.

/** The one private channel both users listen on ("private-" makes Pusher ask for auth). */
export const REALTIME_CHANNEL = "private-ourbasket";

/** Sent after every saved change. Carries only the new revision, never data (spec 12.2). */
export const LIST_CHANGED_EVENT = "list-changed";

/** Where the browser asks the server for permission to listen (spec 4, 12.2). */
export const REALTIME_AUTH_ENDPOINT = "/api/pusher/auth";

export type ListChangedPayload = { revision: number };

/** A revision from an event, or null if the event doesn't carry a valid one. */
export function revisionOf(payload: unknown): number | null {
  const revision = (payload as { revision?: unknown } | null)?.revision;
  return Number.isSafeInteger(revision) && (revision as number) >= 0 ? (revision as number) : null;
}
