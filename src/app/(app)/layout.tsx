import { Box, Center, Flex, Spinner } from "@chakra-ui/react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/toaster";
import { requireUser } from "@/modules/auth/current-user";
import { currentRevision } from "@/modules/list/revision";
import { AppHeader } from "./app-header";
import { AppNav } from "./app-nav";
import { Realtime } from "./realtime";

// Every page in the (app) group requires a signed-in user.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Center minH="100vh">
          <Spinner size="lg" />
        </Center>
      }
    >
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

// Reads the session (request-time data), so it renders behind the Suspense boundary.
// Children render only after the check passes; without a session requireUser redirects.
async function SignedIn({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const t = await getTranslations();
  const revision = await currentRevision();

  return (
    <Realtime
      revision={revision}
      // Read on the server at request time: set per environment, not baked into the build.
      pusherKey={process.env.NEXT_PUBLIC_PUSHER_KEY || null}
      pusherCluster={process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "eu"}
      offlineMessage={t("realtime.offline")}
    >
      <Box minH="100vh">
        <AppHeader displayName={user.displayName} />
        <Flex align="stretch" minH="calc(100vh - 3.5rem)">
          <AppNav
            labels={{
              label: t("nav.label"),
              list: t("nav.list"),
              history: t("nav.history"),
              settings: t("nav.settings"),
            }}
          />
          {/* On phones, room at the bottom for the fixed navigation bar. */}
          <Box flex="1" minW="0" pb={{ base: "24", md: "0" }}>
            {children}
          </Box>
        </Flex>
        <Toaster closeLabel={t("productForm.close")} />
      </Box>
    </Realtime>
  );
}
