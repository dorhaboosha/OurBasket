import { Container, Heading, Skeleton, Stack } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { requireUser } from "@/modules/auth/current-user";
import { listHistory } from "@/modules/history/history";
import { HistoryList } from "./history-list";

// The purchase history (spec 10.2): one card per "update list", newest first. The heading
// renders at once; the cards stream in behind a Suspense boundary.
export default function HistoryPage() {
  const t = useTranslations("history");
  return (
    <Container as="main" maxW="3xl" py={{ base: 4, md: 8 }} px={{ base: 3, md: 6 }}>
      <Stack gap="4">
        <Heading as="h1" size="2xl">
          {t("title")}
        </Heading>
        <Suspense fallback={<Skeleton h="64" />}>
          <Cards />
        </Suspense>
      </Stack>
    </Container>
  );
}

async function Cards() {
  await requireUser();
  return <HistoryList initial={await listHistory()} />;
}
