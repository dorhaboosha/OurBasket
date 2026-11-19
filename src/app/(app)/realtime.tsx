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
   * Reloads the page's data, soon. Requests close together become one: requests at the
   * same moment share one reload, and a request soon after a reload waits for the gap to
   * end, then reloads once more, so nothing that happened meanwhile is missed.
   */
  const reload = useCallback(() => {
    if (pending.current) return; // One is coming, and will load the newest.
    const wait = Math.max(0, lastReload.current + MIN_GAP_MS - Date.now());
    pending.current = setTimeout(() => {
      pending.current = null;
      lastReload.current = Date.now();
      startTransition(() => router.refresh());
    }, wait);
  }, [router]);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  // Coming back: the app was in the background, or offline, and may have missed events.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reload);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reload);
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
      reload();
    });
    // Listening from now on, first and after every reconnect. Changes made before it (since
    // the page loaded, or while disconnected) sent no event here: load them (spec 12.3).
    channel.bind("pusher:subscription_succeeded", reload);
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
