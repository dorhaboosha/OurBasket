import { Container, Heading, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { appConfig } from "@/config/app.config";
import { requireUser } from "@/modules/auth/current-user";
import { listCategories } from "@/modules/categories/categories";
import { CategoriesManager } from "./categories-manager";
import { SignOutButton } from "./sign-out-button";

// Settings (spec 14): the categories, the account, and about the app. The page itself
// reads no data, so it renders at once; each part that does streams in behind its own
// Suspense boundary.
export default function SettingsPage() {
  const t = useTranslations("settings");

  return (
    <Container as="main" maxW="2xl" py={{ base: 6, md: 10 }}>
      <Stack gap="6">
        <Heading as="h1" size="2xl">
          {t("title")}
        </Heading>
        <SettingsSection id="categories" title={t("categories.heading")}>
          <Suspense fallback={<Skeleton h="96" />}>
            <Categories />
          </Suspense>
        </SettingsSection>
        <SettingsSection id="account" title={t("account.heading")}>
          <Suspense fallback={<Skeleton h="16" />}>
            <Account />
          </Suspense>
        </SettingsSection>
        <SettingsSection id="about" title={t("about.heading")}>
          <Text>{t("about.body")}</Text>
          {/* At least 44px high, to tap on a phone (spec 5.2). */}
          <Link asChild color="brand" minH="11" alignSelf="start">
            <NextLink href="/privacy">{t("about.privacy")}</NextLink>
          </Link>
        </SettingsSection>
      </Stack>
    </Container>
  );
}

/** A titled box; the title names the section for screen readers (role "region"). */
function SettingsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack
      as="section"
      aria-labelledby={`${id}-heading`}
      gap="4"
      borderWidth="1px"
      borderRadius="lg"
      p={{ base: "4", md: "6" }}
    >
      <Heading as="h2" size="lg" id={`${id}-heading`}>
        {title}
      </Heading>
      {children}
    </Stack>
  );
}

async function Categories() {
  await requireUser();
  const categories = await listCategories();
  return (
    <CategoriesManager
      categories={categories}
      palette={appConfig.colorPalette}
      emojiSuggestions={appConfig.emojiSuggestions}
      newCategory={appConfig.newCategory}
      nameMaxLength={appConfig.limits.nameMaxLength}
    />
  );
}

async function Account() {
  const user = await requireUser();
  const t = await getTranslations("settings.account");
  return (
    <Stack direction={{ base: "column", sm: "row" }} gap="3" justify="space-between">
      <Text alignSelf={{ sm: "center" }}>{t("signedInAs", { name: user.displayName })}</Text>
      <SignOutButton label={t("signOut")} />
    </Stack>
  );
}
