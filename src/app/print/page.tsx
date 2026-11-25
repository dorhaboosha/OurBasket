import { Box, Container, Heading, Stack, Text } from "@chakra-ui/react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireUser } from "@/modules/auth/current-user";
import { toExport } from "@/modules/export/export";
import { PURCHASE_DATE } from "@/modules/history/format";
import { getListSnapshot } from "@/modules/list/snapshot";
import { PrintToolbar } from "./print-toolbar";

// Also the PDF's suggested file name.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("export");
  return { title: t("title") };
}

/**
 * The list to print or save as PDF (spec 11.2): what is still to buy, by category, with
 * an empty box to check off by hand. Outside the app's layout: no navigation, no colors.
 * Opened with ?print=1, it opens the browser's print dialog by itself.
 */
export default function PrintPage({ searchParams }: PageProps<"/print">) {
  return (
    <Container as="main" maxW="2xl" py={{ base: 4, md: 8 }} px={{ base: 4, md: 6 }} bg="white">
      {/* A margin on every printed page, not only around the page's content. */}
      <style>{"@page { margin: 15mm; }"}</style>
      <Suspense fallback={null}>
        <PrintList searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function PrintList({ searchParams }: Pick<PageProps<"/print">, "searchParams">) {
  await requireUser();
  const t = await getTranslations("export");
  const format = await getFormatter();
  const { print } = await searchParams;
  const categories = toExport((await getListSnapshot()).categories);
  const created = format.dateTime(new Date(), PURCHASE_DATE);

  return (
    <Stack gap="6" color="black">
      <PrintToolbar
        autoPrint={print === "1"}
        pdf={{
          title: t("title"),
          created: t("created", { date: created }),
          empty: t("empty"),
          categories: categories.map((category) => ({
            icon: category.icon,
            name: category.name,
            products: category.products.map((product) => ({
              name: product.name,
              quantity: t("quantity", { count: product.quantity }),
            })),
          })),
        }}
        labels={{
          print: t("printButton"),
          back: t("back"),
          preparing: t("preparing"),
          shareFailed: t("shareFailed"),
        }}
      />
      <Box as="header" borderBottomWidth="2px" borderColor="black" pb="3">
        <Heading as="h1" size="2xl">
          {t("title")}
        </Heading>
        <Text mt="1">{t("created", { date: created })}</Text>
      </Box>

      {categories.length === 0 ? (
        <Text fontSize="lg" data-testid="print-empty">
          {t("empty")}
        </Text>
      ) : (
        categories.map((category) => (
          <Box
            as="section"
            key={category.id}
            aria-labelledby={`print-${category.id}`}
            data-testid="print-category"
          >
            <Heading
              as="h2"
              id={`print-${category.id}`}
              size="lg"
              display="flex"
              alignItems="center"
              gap="2"
              pb="1"
              borderBottomWidth="1px"
              borderColor="gray.500"
              // Never cut, and never alone at the bottom of a page (spec 11.2).
              css={{ breakInside: "avoid", breakAfter: "avoid" }}
            >
              <span aria-hidden>{category.icon}</span>
              {category.name}
            </Heading>
            <Box as="ul" listStyle="none">
              {category.products.map((product) => (
                <Box
                  as="li"
                  key={product.id}
                  display="flex"
                  alignItems="center"
                  gap="3"
                  py="2"
                  borderBottomWidth="1px"
                  borderColor="gray.300"
                  // A product is never cut between pages (spec 11.2).
                  css={{ breakInside: "avoid" }}
                  data-testid="print-item"
                >
                  {/* An empty box, to check off with a pen. */}
                  <Box
                    aria-hidden
                    flexShrink={0}
                    w="5"
                    h="5"
                    borderWidth="2px"
                    borderColor="black"
                    borderRadius="sm"
                  />
                  <Text flex="1" overflowWrap="anywhere">
                    {product.name}
                  </Text>
                  <Text whiteSpace="nowrap">{t("quantity", { count: product.quantity })}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        ))
      )}
    </Stack>
  );
}
