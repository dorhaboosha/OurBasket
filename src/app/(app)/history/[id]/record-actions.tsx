"use client";

import { Alert, Button, Dialog, Flex, Portal, Text } from "@chakra-ui/react";
import { ListPlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toaster } from "@/components/toaster";
import { addRecordToListAction, deleteHistoryRecordAction } from "../actions";

type Props = {
  id: string;
  /** The purchase's date and time, as shown on the page. */
  date: string;
  productCount: number;
};

/** "Add to list" (spec 10.4) and delete (spec 10.5) for one purchase. */
export function RecordActions({ id, date, productCount }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function addToList() {
    setAdding(true);
    try {
      const result = await addRecordToListAction(id);
      toaster.dismiss();
      toaster.create({
        type: result.ok ? "success" : "error",
        title: result.message,
        closable: true,
        duration: 6_000,
        action: result.ok
          ? { label: t("history.toList"), onClick: () => router.push("/") }
          : undefined,
      });
    } catch {
      toaster.create({ type: "error", title: t("history.generic"), closable: true });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Flex gap="2" wrap="wrap" direction="column">
      <Flex gap="2" wrap="wrap">
        <Button
          size="lg"
          bg="brand"
          color="white"
          _hover={{ bg: "brandHover" }}
          onClick={addToList}
          loading={adding}
          loadingText={t("history.adding")}
        >
          <ListPlus aria-hidden />
          {t("history.addToList")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          color="fg.error"
          onClick={() => setConfirming(true)}
          disabled={adding}
        >
          <Trash2 aria-hidden />
          {t("history.delete")}
        </Button>
      </Flex>
      <Text fontSize="sm" color="fg.muted">
        {t("history.addHelp")}
      </Text>
      {confirming && (
        <DeleteRecordDialog
          id={id}
          date={date}
          productCount={productCount}
          onClose={() => setConfirming(false)}
          onDeleted={(message) => {
            toaster.dismiss();
            toaster.create({ type: "success", title: message, closable: true });
            router.push("/history");
          }}
        />
      )}
    </Flex>
  );
}

/**
 * Asks before deleting a purchase, with its date and product count (spec 10.5), and says
 * that nothing goes back to the list. Focus starts on "cancel".
 */
function DeleteRecordDialog({
  id,
  date,
  productCount,
  onClose,
  onDeleted,
}: Props & { onClose: () => void; onDeleted: (message: string) => void }) {
  const t = useTranslations();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteHistoryRecordAction(id);
      if (result.ok) onDeleted(result.message);
      else setError(result.message);
    } catch {
      setError(t("history.generic"));
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
              <Dialog.Title>{t("deleteRecord.title")}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Text fontWeight="semibold">
                {t("deleteRecord.body", { date, count: productCount })}
              </Text>
              <Text color="fg.muted">{t("deleteRecord.list")}</Text>
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
                {t("deleteRecord.cancel")}
              </Button>
              <Button
                colorPalette="red"
                size="lg"
                onClick={confirm}
                loading={pending}
                loadingText={t("deleteRecord.deleting")}
              >
                {t("deleteRecord.confirm")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
