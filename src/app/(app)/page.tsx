import { Container, Heading, Skeleton, Stack } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { appConfig } from "@/config/app.config";
import { requireUser } from "@/modules/auth/current-user";
import { getListSnapshot } from "@/modules/list/snapshot";
import { ShoppingList } from "./list/shopping-list";

// The list screen (spec 6). The heading renders at once; the list streams in behind a
// Suspense boundary, since it reads the database.
export default function HomePage() {
  const t = useTranslations("home");
  return (
    <Container as="main" maxW="3xl" py={{ base: 4, md: 8 }} px={{ base: 3, md: 6 }}>
      <Stack gap="4">
        <Heading as="h1" size="2xl">
          {t("title")}
        </Heading>
        <Suspense fallback={<Skeleton h="96" />}>
          <List />
        </Suspense>
      </Stack>
    </Container>
  );
}

async function List() {
  await requireUser();
  const initial = await getListSnapshot();
  return (
    <ShoppingList
      initial={initial}
      palette={appConfig.colorPalette}
      quantityMax={appConfig.limits.quantityMax}
    />
  );
}
