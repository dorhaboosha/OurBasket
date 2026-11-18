"use client";

import { Box, Text } from "@chakra-ui/react";
import { WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import Pusher from "pusher-js";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  LIST_CHANGED_EVENT,
  REALTIME_AUTH_ENDPOINT,
  REALTIME_CHANNEL,
  revisionOf,
} from "@/modules/realtime/channel";

/** Reloads closer together than this are merged into one (spec 12.3: no double loads). */
const MIN_GAP_MS = 1_000;

type RealtimeContextValue = {
  /** A screen got the list at this revision (an action's answer): events up to it are old. */
  reportRevision: (revision: number) => void;
};

const RealtimeContext = createContext<RealtimeContextValue>({ reportRevision: () => {} });

/** For screens that receive the list themselves (the shopping list). */
export function useRealtime() {
  return useContext(RealtimeContext);
}

type Props = {
  /** The revision this page was rendered at. */
  revision: number;
  /** Null: real-time is off (tests, CI); reloading on return still works. */
  pusherKey: string | null;
  pusherCluster: string;
  offlineMessage: string;
  children: ReactNode;
};

/**
 * Keeps every signed-in screen current (spec 12): on "list changed" from the other phone,
 * and when coming back to the app (visible again, back online, reconnected), it reloads
 * the page's data from the server. Screens keep what is being typed and open dialogs: a
 * reload only brings them newer data, which they ignore if it is older than theirs.
 */
export function Realtime({ revision, pusherKey, pusherCluster, offlineMessage, children }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const known = useRef(revision);
  const lastReload = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    known.current = Math.max(known.current, revision);
  }, [revision]);

  /**
   * Reloads the page's data. Requests close together become one: a coming-back reload
   * soon after another is skipped; a change event soon after one waits, then reloads, so
   * the newest change is never missed.
   */
  const reload = useCallback(
    (kind: "returned" | "changed") => {
      const wait = lastReload.current + MIN_GAP_MS - Date.now();
      if (wait > 0) {
        if (kind === "changed" && !pending.current) {
          pending.current = setTimeout(() => {
            pending.current = null;
            lastReload.current = Date.now();
            startTransition(() => router.refresh());
          }, wait);
        }
        return;
      }
      lastReload.current = Date.now();
      startTransition(() => router.refresh());
    },
    [router],
  );

  // Coming back: the app was in the background, or offline, and may have missed events.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload("returned");
    };
    const onOnline = () => reload("returned");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (pending.current) clearTimeout(pending.current);
    };
  }, [reload]);

  // The other phone's changes, as they happen.
  useEffect(() => {
    if (!pusherKey) return;
    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      channelAuthorization: { endpoint: REALTIME_AUTH_ENDPOINT, transport: "ajax" },
    });
    const channel = pusher.subscribe(REALTIME_CHANNEL);
    channel.bind(LIST_CHANGED_EVENT, (payload: unknown) => {
      const eventRevision = revisionOf(payload);
      // Ours, or already seen: the screen has it (spec 12.2).
      if (eventRevision === null || eventRevision <= known.current) return;
      known.current = eventRevision;
      reload("changed");
    });
    let wasConnected = false;
    pusher.connection.bind("state_change", ({ current }: { previous: string; current: string }) => {
      if (current !== "connected") return;
      // Reconnected after a drop: events may have been missed (spec 12.3).
      if (wasConnected) reload("returned");
      wasConnected = true;
    });
    return () => pusher.disconnect();
  }, [pusherKey, pusherCluster, reload]);

  const reportRevision = useCallback((value: number) => {
    known.current = Math.max(known.current, value);
  }, []);

  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  return (
    <RealtimeContext.Provider value={{ reportRevision }}>
      {!online && (
        <Box
          role="status"
          position="sticky"
          top="0"
          zIndex="banner"
          bg="orange.800"
          color="white"
          px="4"
          py="2"
          display="flex"
          alignItems="center"
          gap="2"
          data-testid="offline-banner"
        >
          <WifiOff aria-hidden size={18} />
          <Text fontSize="sm">{offlineMessage}</Text>
        </Box>
      )}
      {children}
    </RealtimeContext.Provider>
  );
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
