import { Box, Container, Heading, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import { ChevronRight } from "lucide-react";
import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { appConfig } from "@/config/app.config";
import { requireUser } from "@/modules/auth/current-user";
import { PURCHASE_DATE } from "@/modules/history/format";
import { groupByCategory } from "@/modules/history/group";
import { getHistoryRecord } from "@/modules/history/history";
import { RecordActions } from "./record-actions";

// One purchase (spec 10.3): its products grouped by category, as they were when bought,
// with "add to list" and delete. Reads the record (request-time data) behind a Suspense
// boundary.
export default function PurchasePage({ params }: PageProps<"/history/[id]">) {
  return (
    <Container as="main" maxW="3xl" py={{ base: 4, md: 8 }} px={{ base: 3, md: 6 }}>
      <Suspense fallback={<Skeleton h="96" />}>
        <Purchase params={params} />
      </Suspense>
    </Container>
  );
}

async function Purchase({ params }: Pick<PageProps<"/history/[id]">, "params">) {
  await requireUser();
  const { id } = await params;
  const t = await getTranslations("history");
  const format = await getFormatter();
  const record = await getHistoryRecord(id);

  const back = (
    // At least 44px high, to tap on a phone (spec 5.2).
    <Link asChild color="brand" minH="11" alignSelf="start" alignItems="center">
      <NextLink href="/history">
        {/* Back, in a right-to-left page. */}
        <ChevronRight aria-hidden size={18} />
        {t("back")}
      </NextLink>
    </Link>
  );

  if (!record) {
    return (
      <Stack gap="4">
        {back}
        <Heading as="h1" size="xl">
          {t("notFound")}
        </Heading>
      </Stack>
    );
  }

  const date = format.dateTime(record.purchasedAt, PURCHASE_DATE);
  const groups = groupByCategory(record.items);

  return (
    <Stack gap="5">
      {back}
      <Stack gap="1">
        <Heading as="h1" size="2xl">
          {date}
        </Heading>
        <Text color="fg.muted">
          {t("summary", { products: record.items.length, categories: groups.length })}
        </Text>
      </Stack>
      <RecordActions id={record.id} date={date} productCount={record.items.length} />
      <Stack gap="3">
        {groups.map((group) => (
          <Box
            as="section"
            key={group.key}
            aria-labelledby={`category-${group.key}`}
            borderWidth="1px"
            borderInlineStartWidth="6px"
            borderInlineStartColor={
              appConfig.colorPalette.find((c) => c.key === group.color)?.value ?? "gray"
            }
            borderRadius="md"
            data-testid="purchase-category"
          >
            <Heading
              as="h2"
              size="md"
              id={`category-${group.key}`}
              display="flex"
              alignItems="center"
              gap="2"
              px="3"
              minH="12"
            >
              <Text as="span" fontSize="xl" aria-hidden>
                {group.icon}
              </Text>
              {group.name}
            </Heading>
            <Box as="ul" listStyle="none" borderTopWidth="1px" px="3">
              {group.items.map((item) => (
                <Box
                  as="li"
                  key={item.id}
                  display="flex"
                  justifyContent="space-between"
                  gap="3"
                  py="2"
                  borderBottomWidth="1px"
                  _last={{ borderBottomWidth: 0 }}
                  data-testid="purchase-item"
                >
                  <Text overflowWrap="anywhere">{item.productName}</Text>
                  <Text color="fg.muted" whiteSpace="nowrap">
                    {t("quantity", { count: item.quantity })}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
