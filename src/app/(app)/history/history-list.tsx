"use client";

import { Box, Button, HStack, Link, Stack, Text } from "@chakra-ui/react";
import { ChevronLeft, ListChecks } from "lucide-react";
import NextLink from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toaster } from "@/components/toaster";
import type { HistoryCard, HistoryPage } from "@/modules/history/history";
import { PURCHASE_DATE } from "@/modules/history/format";
import { loadHistoryAction } from "./actions";

/** The purchase cards (spec 10.2), with "load more" for older ones. */
export function HistoryList({ initial }: { initial: HistoryPage }) {
  const t = useTranslations("history");
  const [cards, setCards] = useState(initial.cards);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  // A page left for another stays alive (Next.js keeps visited pages, with their state):
  // when the server sends the history again (a purchase was made meanwhile), show it.
  const [seen, setSeen] = useState(initial);
  // Which history the cards are from: a "load more" answer for an older one is dropped.
  const generation = useRef(initial);
  if (initial !== seen) {
    setSeen(initial);
    setCards(initial.cards);
    setNextCursor(initial.nextCursor);
  }
  const [loading, startLoading] = useTransition();
  useEffect(() => {
    generation.current = initial;
  }, [initial]);

  function loadMore() {
    if (!nextCursor) return;
    const from = initial;
    startLoading(async () => {
      try {
        const page = await loadHistoryAction(nextCursor);
        // The history was sent again meanwhile: this page belongs to the old one.
        if (generation.current !== from) return;
        // A card can already be shown if purchases were deleted in between: once only.
        setCards((current) => {
          const shown = new Set(current.map((card) => card.id));
          return [...current, ...page.cards.filter((card) => !shown.has(card.id))];
        });
        setNextCursor(page.nextCursor);
      } catch {
        toaster.create({ type: "error", title: t("generic"), closable: true });
      }
    });
  }

  if (cards.length === 0) {
    return (
      <Stack align="center" textAlign="center" gap="3" py="12" data-testid="empty-history">
        <Text fontSize="5xl" aria-hidden>
          🧾
        </Text>
        <Text fontSize="lg" fontWeight="semibold">
          {t("empty")}
        </Text>
        <Text color="fg.muted">{t("emptyHelp")}</Text>
        <Button asChild size="lg" bg="brand" color="white" _hover={{ bg: "brandHover" }}>
          <NextLink href="/">
            <ListChecks aria-hidden />
            {t("toList")}
          </NextLink>
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="3">
      <Stack as="ul" gap="3" listStyle="none">
        {cards.map((card) => (
          <li key={card.id}>
            <PurchaseCard card={card} />
          </li>
        ))}
      </Stack>
      {nextCursor && (
        <Button
          size="lg"
          variant="outline"
          alignSelf="center"
          onClick={loadMore}
          loading={loading}
          loadingText={t("loading")}
        >
          {t("loadMore")}
        </Button>
      )}
    </Stack>
  );
}

/** One purchase: when, how many products and categories, and a link to its details. */
function PurchaseCard({ card }: { card: HistoryCard }) {
  const t = useTranslations("history");
  const format = useFormatter();

  return (
    <Link
      asChild
      display="flex"
      alignItems="center"
      gap="3"
      p={{ base: "3", md: "4" }}
      minH="16"
      borderWidth="1px"
      borderRadius="md"
      bg="bg"
      color="fg"
      textDecoration="none"
      _hover={{ bg: "bg.muted", textDecoration: "none" }}
      data-testid="purchase-card"
    >
      <NextLink href={`/history/${card.id}`}>
        <Stack gap="1" flex="1" minW="0">
          <Text as="span" fontWeight="semibold">
            {format.dateTime(card.purchasedAt, PURCHASE_DATE)}
          </Text>
          <Text as="span" fontSize="sm" color="fg.muted">
            {t("summary", { products: card.productCount, categories: card.categoryCount })}
          </Text>
        </Stack>
        <HStack gap="1" aria-hidden fontSize="lg" flexWrap="wrap" justify="end" maxW="40%">
          {card.icons.slice(0, 6).map((icon, index) => (
            <Box as="span" key={index}>
              {icon}
            </Box>
          ))}
        </HStack>
        {/* Forward, in a right-to-left page. */}
        <ChevronLeft aria-hidden size={20} style={{ flexShrink: 0 }} />
      </NextLink>
    </Link>
  );
}
