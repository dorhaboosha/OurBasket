"use client";

import { Button, Flex, Link, Text } from "@chakra-ui/react";
import { ChevronRight, Printer } from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { PdfContent } from "@/modules/export/pdf-layout";

type Props = {
  /** Opened from the list's "print / PDF": open the print dialog at once. */
  autoPrint: boolean;
  /** The list, for the PDF made on an iPhone's home screen app. */
  pdf: PdfContent;
  labels: { print: string; back: string; preparing: string; shareFailed: string };
};

const FILE_NAME = "OurBasket.pdf";

/**
 * In an app added to an iPhone's (or iPad's) home screen, iOS ignores `window.print()`:
 * nothing opens and nothing fails. There the button shares a PDF of the list instead,
 * and the share sheet offers Print, Save to Files, WhatsApp and so on.
 */
function isIosHomeScreenApp() {
  const { standalone } = navigator as Navigator & { standalone?: boolean };
  // `standalone` is Safari's; touch tells an iPhone or iPad from a Mac's web app, which prints.
  return standalone === true && navigator.maxTouchPoints > 1;
}

const subscribeNever = () => () => {};

/** Back to the list, and print again. On screen only: not part of the printed page. */
export function PrintToolbar({ autoPrint, pdf, labels }: Props) {
  const sharesPdf = useSyncExternalStore(subscribeNever, isIosHomeScreenApp, () => false);
  // The PDF, made as soon as the page opens: the share sheet only opens straight from a tap.
  const [file, setFile] = useState<File | "unavailable" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sharesPdf) return;
    let cancelled = false;
    void import("@/modules/export/pdf")
      .then(({ makePdf }) => makePdf(pdf, getComputedStyle(document.body).fontFamily))
      .then((blob) => {
        const made = new File([blob], FILE_NAME, { type: "application/pdf" });
        if (!cancelled) setFile(navigator.canShare?.({ files: [made] }) ? made : "unavailable");
      })
      .catch((error: unknown) => {
        console.error("Making the PDF failed", error);
        if (!cancelled) setFile("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [sharesPdf, pdf]);

  useEffect(() => {
    if (!autoPrint) return;
    // A reload of this page shouldn't print again.
    window.history.replaceState(null, "", "/print");
    // On the iPhone's home screen app a tap opens the share sheet: it can't open by itself.
    if (isIosHomeScreenApp()) return;
    let cancelled = false;
    // After the font has loaded, so the page prints in it.
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint]);

  const preparing = sharesPdf && file === null;

  function print() {
    setFailed(false);
    if (!(file instanceof File)) {
      // On the home screen app the print dialog wouldn't open either: say so.
      if (sharesPdf) setFailed(true);
      else window.print();
      return;
    }
    navigator.share({ files: [file], title: pdf.title }).catch((error: unknown) => {
      // Closing the share sheet without choosing anything isn't a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Sharing the PDF failed", error);
      setFailed(true);
    });
  }

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
        onClick={print}
        loading={preparing}
        loadingText={labels.preparing}
        // For the tests: whether the PDF is ready to share.
        data-pdf={sharesPdf ? (file instanceof File ? "ready" : (file ?? "preparing")) : undefined}
      >
        <Printer aria-hidden />
        {labels.print}
      </Button>
      {failed && (
        <Text role="alert" width="full" color="red.700">
          {labels.shareFailed}
        </Text>
      )}
    </Flex>
  );
}
