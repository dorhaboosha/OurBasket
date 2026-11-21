import { Box, HStack, Text } from "@chakra-ui/react";
import { getTranslations } from "next-intl/server";

// The bar at the top of every signed-in page: the app's name and who is signed in.
// Signing out is in the settings (spec 14).
export async function AppHeader({ displayName }: { displayName: string }) {
  const t = await getTranslations();

  return (
    <Box as="header" borderBottomWidth="1px" px={{ base: "4", md: "6" }} h="14">
      <HStack justify="space-between" h="full" gap="4">
        <HStack gap="2">
          {/* The logo, next to the name that says it (spec 13). */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG, nothing to optimize */}
          <img src="/logo.svg" alt="" width={28} height={28} />
          <Text fontWeight="bold" fontSize="xl" color="brand">
            {t("app.name")}
          </Text>
        </HStack>
        <Text>{t("header.signedInAs", { name: displayName })}</Text>
      </HStack>
    </Box>
  );
}
