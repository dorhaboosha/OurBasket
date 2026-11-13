import { Container, Heading, Stack, Text } from "@chakra-ui/react";
import { getTranslations } from "next-intl/server";

// Placeholder until the list screen (step 5). The (app) layout requires a signed-in user.
export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <Container as="main" maxW="2xl" py={{ base: 8, md: 12 }}>
      <Stack gap={3}>
        <Heading as="h1" size="2xl">
          {t("title")}
        </Heading>
        <Text color="fg.muted">{t("comingSoon")}</Text>
      </Stack>
    </Container>
  );
}
