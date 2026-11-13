import { Box, HStack, Text } from "@chakra-ui/react";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "./sign-out-button";

// Temporary header until the navigation (bottom bar on phones, sidebar on computers)
// arrives with the screens it links to.
export async function AppHeader({ displayName }: { displayName: string }) {
  const t = await getTranslations();

  return (
    <Box as="header" borderBottomWidth="1px" px={{ base: "4", md: "6" }} py="2">
      <HStack justify="space-between" maxW="6xl" mx="auto" gap="4">
        <Text fontWeight="bold" fontSize="xl" color="brand">
          🛒 {t("app.name")}
        </Text>
        <HStack gap="3">
          <Text>{t("header.signedInAs", { name: displayName })}</Text>
          <SignOutButton label={t("header.signOut")} />
        </HStack>
      </HStack>
    </Box>
  );
}
