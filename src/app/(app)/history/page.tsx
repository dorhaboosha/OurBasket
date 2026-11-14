import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { getTranslations } from "next-intl/server";

// Placeholder until the history screen (step 7), so the navigation has somewhere to go.
export default async function HistoryPage() {
  const t = await getTranslations("history");
  return (
    <Container as="main" maxW="2xl" py={{ base: 6, md: 10 }}>
      <Stack gap={3}>
        <Heading as="h1" size="2xl">
          {t("title")}
        </Heading>
        <Text color="fg.muted">{t("comingSoon")}</Text>
      </Stack>
    </Container>
  );
}
