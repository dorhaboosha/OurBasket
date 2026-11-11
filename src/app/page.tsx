import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { getTranslations } from "next-intl/server";

// Placeholder until the list screen (step 5).
export default async function HomePage() {
  const t = await getTranslations();
  return (
    <Container as="main" maxW="2xl" py={{ base: 10, md: 16 }}>
      <Stack gap={3}>
        <Heading as="h1" size="3xl" color="brand">
          🛒 {t("app.name")}
        </Heading>
        <Text fontSize="lg">{t("home.subtitle")}</Text>
        <Text color="fg.muted">{t("home.comingSoon")}</Text>
      </Stack>
    </Container>
  );
}
