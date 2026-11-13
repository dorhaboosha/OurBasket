import { Center, Heading, Link, Spinner, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getCurrentUser } from "@/modules/auth/current-user";
import { EMAIL_NOT_VERIFIED, NOT_ALLOWED } from "@/modules/auth/hooks";
import { GoogleSignInButton } from "./google-sign-in-button";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Center as="main" minH="100vh" px="4">
      <Stack gap="6" maxW="sm" w="full" textAlign="center">
        <Suspense fallback={<Spinner size="lg" mx="auto" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </Stack>
    </Center>
  );
}

const ERROR_MESSAGES: Record<string, "notAllowed" | "emailNotVerified"> = {
  [NOT_ALLOWED]: "notAllowed",
  [EMAIL_NOT_VERIFIED]: "emailNotVerified",
};

// Reads the session and ?error=..., which are request-time data, so it renders
// behind the Suspense boundary.
async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  if (await getCurrentUser()) redirect("/");

  const t = await getTranslations("login");
  const { error } = await searchParams;
  const errorKey = typeof error === "string" ? (ERROR_MESSAGES[error] ?? "generic") : undefined;

  return (
    <>
      <Heading as="h1" size="2xl">
        🛒 {t("title")}
      </Heading>
      {/* Says plainly what the site is, so the page doesn't read like a fake Google login. */}
      <Text>{t("about")}</Text>
      <Text color="fg.muted">{t("subtitle")}</Text>
      {errorKey && (
        <Text role="alert" color="fg.error">
          {t(`errors.${errorKey}`)}
        </Text>
      )}
      <GoogleSignInButton label={t("google")} />
      <Text color="fg.muted" fontSize="sm">
        {t("googleNote")}
      </Text>
      {/* At least 44px high, to tap on a phone (spec 5.2). */}
      <Link asChild color="brand" fontSize="sm" mx="auto" minH="11" alignItems="center">
        <NextLink href="/privacy">{t("privacyLink")}</NextLink>
      </Link>
    </>
  );
}
