import { Box, Heading, Link, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

const SECTIONS = ["collect", "use", "realtime", "storage", "delete", "contact"] as const;
const REPO_URL = "https://github.com/dorhaboosha/OurBasket";

// Public page (no sign-in): linked from the login page, and needed to publish the
// Google OAuth app (spec 4).
export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <Box as="main" px={{ base: "4", md: "6" }} py="8" maxW="3xl" mx="auto">
      <Stack gap="6">
        <Stack gap="1">
          <Heading as="h1" size="2xl">
            {t("title")}
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            {t("updated")}
          </Text>
        </Stack>
        <Text>{t("intro")}</Text>
        {SECTIONS.map((key) => (
          <Stack as="section" key={key} gap="2">
            <Heading as="h2" size="md">
              {t(`sections.${key}.heading`)}
            </Heading>
            <Text>
              {t.rich(`sections.${key}.body`, {
                link: (chunks) => (
                  <Link
                    href={REPO_URL}
                    color="brand"
                    dir="ltr"
                    display="inline-flex"
                    minH="11"
                    alignItems="center"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </Text>
          </Stack>
        ))}
        <Link asChild color="brand" w="fit-content" minH="11" alignItems="center">
          <NextLink href="/login">{t("back")}</NextLink>
        </Link>
      </Stack>
    </Box>
  );
}
