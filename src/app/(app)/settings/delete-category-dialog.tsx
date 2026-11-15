"use client";

import { Alert, Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { CategoryItem } from "@/modules/categories/categories";
import { deleteCategoryAction } from "./actions";

type Props = {
  /** Always the latest loaded version, so the product count is current. */
  category: CategoryItem;
  onClose: () => void;
  onDeleted: () => void;
  /** Deleted meanwhile: close, and show this message on the page. */
  onGone: (message: string) => void;
};

/**
 * Asks before deleting a category, with its name and how many products go with it
 * (spec 7.3). Focus starts on "cancel", so Enter alone never deletes.
 */
export function DeleteCategoryDialog({ category, onClose, onDeleted, onGone }: Props) {
  const t = useTranslations();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteCategoryAction(
        category.id,
        category.version,
        category.productCount,
      );
      if (result.ok) {
        onDeleted();
        return;
      }
      if (result.reason === "notFound") onGone(result.message);
      else setError(result.message);
    } catch {
      setError(t("categoryErrors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open
      role="alertdialog"
      onOpenChange={(details) => !details.open && onClose()}
      initialFocusEl={() => cancelRef.current}
      size="sm"
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{t("deleteCategory.title")}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap="3">
              <Text overflowWrap="anywhere">
                {t("deleteCategory.body", { name: `${category.icon} ${category.name}` })}
              </Text>
              {category.productCount > 0 && (
                <Text fontWeight="semibold">
                  {t("deleteCategory.products", { count: category.productCount })}
                </Text>
              )}
              <Text color="fg.muted">{t("deleteCategory.history")}</Text>
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
                {t("deleteCategory.cancel")}
              </Button>
              <Button
                colorPalette="red"
                size="lg"
                onClick={confirm}
                loading={pending}
                loadingText={t("deleteCategory.deleting")}
              >
                {t("deleteCategory.confirm")}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
