"use client";

import { Box, Flex, Link, Stack, Text } from "@chakra-ui/react";
import { History, ListChecks, Settings, type LucideIcon } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

export type NavLabels = { label: string; list: string; history: string; settings: string };

const ITEMS: { href: string; key: keyof Omit<NavLabels, "label">; icon: LucideIcon }[] = [
  { href: "/", key: "list", icon: ListChecks },
  { href: "/history", key: "history", icon: History },
  { href: "/settings", key: "settings", icon: Settings },
];

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The main navigation (spec 5.1): a sidebar on computers, a bar at the bottom of the
 * screen on phones. Both are rendered; CSS shows one, so only one is ever in the
 * accessibility tree.
 */
export function AppNav({ labels }: { labels: NavLabels }) {
  const pathname = usePathname();

  return (
    <>
      <Box
        as="nav"
        aria-label={labels.label}
        display={{ base: "none", md: "block" }}
        w="56"
        flexShrink={0}
        borderInlineEndWidth="1px"
        p="3"
      >
        <Stack gap="1" position="sticky" top="3">
          {ITEMS.map(({ href, key, icon: Icon }) => {
            const current = isCurrent(pathname, href);
            return (
              <Link
                key={href}
                asChild
                display="flex"
                alignItems="center"
                gap="3"
                minH="11"
                px="3"
                borderRadius="md"
                fontWeight={current ? "semibold" : "normal"}
                bg={current ? "brand" : "transparent"}
                color={current ? "white" : "fg"}
                textDecoration="none"
                _hover={{ bg: current ? "brand" : "bg.muted", textDecoration: "none" }}
              >
                <NextLink href={href} aria-current={current ? "page" : undefined}>
                  <Icon size={20} aria-hidden />
                  {labels[key]}
                </NextLink>
              </Link>
            );
          })}
        </Stack>
      </Box>

      <Flex
        as="nav"
        aria-label={labels.label}
        display={{ base: "flex", md: "none" }}
        position="fixed"
        insetX="0"
        bottom="0"
        zIndex="sticky"
        bg="bg"
        borderTopWidth="1px"
        pb="env(safe-area-inset-bottom)"
      >
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const current = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              asChild
              flex="1"
              minH="14"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap="0.5"
              color={current ? "brand" : "fg.muted"}
              fontWeight={current ? "semibold" : "normal"}
              textDecoration="none"
              _hover={{ textDecoration: "none" }}
            >
              <NextLink href={href} aria-current={current ? "page" : undefined}>
                <Icon size={22} aria-hidden strokeWidth={current ? 2.5 : 2} />
                <Text as="span" fontSize="xs">
                  {labels[key]}
                </Text>
              </NextLink>
            </Link>
          );
        })}
      </Flex>
    </>
  );
}
