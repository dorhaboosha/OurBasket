"use client";

import { Alert, Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type ListActionResult, clearListAction } from "../list-actions";

type Props = {
  productCount: number;
  /** The revision the question is about: if the list changes, nothing is deleted. */
  revision: number;
  onClose: () => void;
  onResult: (result: ListActionResult) => void;
};

/**
 * "Clear list" (spec 9.3): asks first, says how many products go, and that history stays.
 * Focus starts on "cancel", so Enter alone never clears.
 */
export function ClearListDialog({ productCount, revision, onClose, onResult }: Props) {
  const t = useTranslations();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await clearListAction(revision);
      onResult(result);
      if (result.ok) onClose();
      else setError(result.message);
    } catch {
      setError(t("home.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open
      role="alertdialog"
      // Not dismissed while a request is pending: its answer belongs to this dialog.
      onOpenChange={(details) => !details.open && !pending && onClose()}
      closeOnEscape={!pending}
      closeOnInteractOutside={!pending}
      initialFocusEl={() => cancelRef.current}
      size="sm"
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{t("clearList.title")}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Text fontWeight="semibold">{t("clearList.body", { count: productCount })}</Text>
              <Text color="fg.muted">{t("clearList.history")}</Text>
              {error && (
                <Alert.Root status="warning">
                  <Alert.Indicator />
                  <Alert.Title>{error}</Alert.Title>
                </Alert.Root>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                ref={cancelRef}
                variant="outline"
                size="lg"
                onClick={onClose}
                disabled={pending}
              >
                {t("clearList.cancel")}
              </Button>
              <Button
                colorPalette="red"
                size="lg"
                onClick={confirm}
                loading={pending}
                loadingText={t("clearList.clearing")}
              >
                {t("clearList.confirm")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
