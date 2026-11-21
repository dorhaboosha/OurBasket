"use client";

import { Button, Flex, Link } from "@chakra-ui/react";
import { ChevronRight, Printer } from "lucide-react";
import NextLink from "next/link";
import { useEffect } from "react";

type Props = {
  /** Opened from the list's "print / PDF": open the print dialog at once. */
  autoPrint: boolean;
  labels: { print: string; back: string };
};

/** Back to the list, and print again. On screen only: not part of the printed page. */
export function PrintToolbar({ autoPrint, labels }: Props) {
  useEffect(() => {
    if (!autoPrint) return;
    // A reload of this page shouldn't print again.
    window.history.replaceState(null, "", "/print");
    let cancelled = false;
    // After the font has loaded, so the page prints in it.
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint]);

  return (
    <Flex
      justify="space-between"
      align="center"
      gap="3"
      wrap="wrap"
      css={{ "@media print": { display: "none" } }}
    >
      {/* At least 44px high, to tap on a phone (spec 5.2). */}
      <Link asChild color="brand" minH="11" alignItems="center">
        <NextLink href="/">
          {/* Back, in a right-to-left page. */}
          <ChevronRight aria-hidden size={18} />
          {labels.back}
        </NextLink>
      </Link>
      <Button
        size="lg"
        bg="brand"
        color="white"
        _hover={{ bg: "brandHover" }}
        onClick={() => window.print()}
      >
        <Printer aria-hidden />
        {labels.print}
      </Button>
    </Flex>
  );
}
