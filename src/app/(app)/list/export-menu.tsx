"use client";

import { Button, Dialog, Menu, Portal, Text, Textarea } from "@chakra-ui/react";
import { ChevronDown, Copy, Printer, Share2 } from "lucide-react";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { toaster } from "@/components/toaster";
import { exportText, toExport } from "@/modules/export/export";
import type { ListCategory } from "@/modules/list/snapshot";

type Props = {
  categories: ListCategory[];
  /** Shows a short message (the list screen's toast, one at a time). */
  say: (options: Parameters<typeof toaster.create>[0]) => void;
};

/**
 * "Export" (spec 11): copies the list as text for WhatsApp, or opens the print page.
 * Both include only what is still to buy, so it is disabled when nothing is.
 */
export function ExportMenu({ categories, say }: Props) {
  const t = useTranslations("export");
  const [manual, setManual] = useState<string | null>(null);
  const exported = toExport(categories);

  async function copy() {
    const text = exportText(t("title"), exported);
    try {
      await navigator.clipboard.writeText(text);
      say({ type: "success", title: t("copied"), closable: true, duration: 4_000 });
    } catch {
      // No clipboard (blocked, or not allowed here): the text, to copy by hand.
      setManual(text);
    }
  }

  return (
    <>
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger asChild>
          <Button size="lg" variant="outline" disabled={exported.length === 0}>
            <Share2 aria-hidden />
            {t("button")}
            <ChevronDown aria-hidden />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="56">
              <Menu.Item value="copy" minH="11" fontSize="md" onSelect={() => void copy()}>
                <Copy aria-hidden size={18} />
                {t("copy")}
              </Menu.Item>
              <Menu.Item value="print" minH="11" fontSize="md" asChild>
                <NextLink href="/print?print=1">
                  <Printer aria-hidden size={18} />
                  {t("print")}
                </NextLink>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      {manual !== null && <ManualCopyDialog text={manual} onClose={() => setManual(null)} />}
    </>
  );
}

/** When copying fails (spec 11.1): the text, selected, to copy by hand. */
function ManualCopyDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useTranslations("export");
  const textRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(details) => !details.open && onClose()}
      initialFocusEl={() => textRef.current}
      size="md"
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>{t("manualTitle")}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Text id="manual-copy-help">{t("manualHelp")}</Text>
              <Textarea
                ref={textRef}
                value={text}
                readOnly
                rows={10}
                aria-label={t("manualLabel")}
                aria-describedby="manual-copy-help"
                onFocus={(event) => event.currentTarget.select()}
                data-testid="manual-copy-text"
              />
            </Dialog.Body>
            <Dialog.Footer>
              <Button size="lg" variant="outline" onClick={onClose}>
                {t("close")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
