"use client";

import { Alert, Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type ListActionResult, updateListAction } from "../list-actions";

type Props = {
  /** The products checked when the question was asked: only those can be bought. */
  checkedIds: string[];
  onClose: () => void;
  onResult: (result: ListActionResult) => void;
};

/**
 * "Update list" (spec 9.1): asks first, saying how many checked products will be recorded
 * in history and removed from the list. Focus starts on "cancel".
 */
export function UpdateListDialog({ checkedIds, onClose, onResult }: Props) {
  const t = useTranslations();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await updateListAction(checkedIds);
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
              <Dialog.Title>{t("updateList.title")}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Text fontWeight="semibold">
                {t("updateList.body", { count: checkedIds.length })}
              </Text>
              <Text color="fg.muted">{t("updateList.rest")}</Text>
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
                {t("updateList.cancel")}
              </Button>
              <Button
                size="lg"
                bg="brand"
                color="white"
                _hover={{ bg: "brandHover" }}
                onClick={confirm}
                loading={pending}
                loadingText={t("updateList.updating")}
              >
                {t("updateList.confirm")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
