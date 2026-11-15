"use client";

import {
  Alert,
  Button,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Input,
  NativeSelect,
  Portal,
} from "@chakra-ui/react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { dialogFromMdUp } from "@/components/dialog-styles";
import type { ListCategory, ListProduct } from "@/modules/list/snapshot";
import type { ProductField } from "@/modules/products/validation";
import {
  type ListActionResult,
  addProductAction,
  deleteProductAction,
  updateProductAction,
} from "../list-actions";

type Props = {
  /** The product being edited; none for a new one. Always the latest loaded version. */
  product?: ListProduct;
  categories: ListCategory[];
  onClose: () => void;
  /** Every answer from the server: the list screen shows its list and message. */
  onResult: (result: ListActionResult) => void;
};

/**
 * Adds a product (spec 8.1) or edits one (8.3): name, quantity and category. With no
 * category, a new product goes to General. Editing also offers delete.
 */
export function ProductFormDialog({ product, categories, onClose, onResult }: Props) {
  const t = useTranslations();
  const nameRef = useRef<HTMLInputElement>(null);
  const general = categories.find((category) => category.isSystem);
  const initial = {
    name: product?.name ?? "",
    quantity: String(product?.quantity ?? 1),
    categoryId: product?.categoryId ?? "",
  };
  const [name, setName] = useState(initial.name);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  // When the product changes under the form (someone else saved it, and a refused save
  // reloaded it), a field the user hasn't touched takes the new value (as for categories).
  const [base, setBase] = useState({ ...initial, version: product?.version });
  if (product && product.version !== base.version) {
    const latest = {
      name: product.name,
      quantity: String(product.quantity),
      categoryId: product.categoryId,
    };
    if (name === base.name) setName(latest.name);
    if (quantity === base.quantity) setQuantity(latest.quantity);
    if (categoryId === base.categoryId) setCategoryId(latest.categoryId);
    setBase({ ...latest, version: product.version });
  }
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProductField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);

  async function run(kind: "save" | "delete", action: () => Promise<ListActionResult>) {
    setPending(kind);
    setMessage(null);
    try {
      const result = await action();
      onResult(result);
      if (result.ok) {
        onClose();
        return;
      }
      if (result.reason === "notFound") {
        onClose();
        return;
      }
      setFieldErrors(
        result.fieldErrors ?? (result.reason === "nameTaken" ? { name: result.message } : {}),
      );
      if (result.fieldErrors?.name || result.reason === "nameTaken") nameRef.current?.focus();
      if (!result.fieldErrors && result.reason !== "nameTaken") setMessage(result.message);
    } catch {
      setMessage(t("home.generic"));
    } finally {
      setPending(null);
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    // Only digits count as a number: "2.5" or "" is sent as is and refused by the server.
    const input = {
      name,
      quantity: /^\s*\d+\s*$/.test(quantity) ? Number(quantity) : quantity,
      categoryId: categoryId || null,
    };
    void run("save", () =>
      product ? updateProductAction(product.id, product.version, input) : addProductAction(input),
    );
  }

  function clearError(field: ProductField) {
    if (!fieldErrors[field]) return;
    setFieldErrors((errors) => {
      const rest = { ...errors };
      delete rest[field];
      return rest;
    });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(details) => !details.open && onClose()}
      initialFocusEl={() => nameRef.current}
      size={{ base: "full", md: "md" }}
      placement="center"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content asChild css={dialogFromMdUp}>
            <form onSubmit={save} noValidate>
              <Dialog.Header>
                <Dialog.Title>
                  {t(product ? "productForm.editTitle" : "productForm.createTitle")}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body display="flex" flexDirection="column" gap="5">
                {message && (
                  <Alert.Root status="warning">
                    <Alert.Indicator />
                    <Alert.Title>{message}</Alert.Title>
                  </Alert.Root>
                )}

                <Field.Root invalid={!!fieldErrors.name}>
                  <Field.Label>{t("productForm.name")}</Field.Label>
                  <Input
                    ref={nameRef}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      clearError("name");
                    }}
                    maxLength={60}
                    autoComplete="off"
                    size="lg"
                  />
                  <Field.ErrorText>{fieldErrors.name}</Field.ErrorText>
                </Field.Root>

                <Field.Root invalid={!!fieldErrors.quantity}>
                  <Field.Label>{t("productForm.quantity")}</Field.Label>
                  <Input
                    value={quantity}
                    onChange={(event) => {
                      setQuantity(event.target.value);
                      clearError("quantity");
                    }}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    w="24"
                    size="lg"
                  />
                  <Field.ErrorText>{fieldErrors.quantity}</Field.ErrorText>
                </Field.Root>

                <Field.Root>
                  <Field.Label>{t("productForm.category")}</Field.Label>
                  <NativeSelect.Root size="lg">
                    <NativeSelect.Field
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                    >
                      {!product && (
                        <option value="">
                          {t("productForm.noCategory", { general: general?.name ?? "" })}
                        </option>
                      )}
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.icon} {category.name}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              </Dialog.Body>
              <Dialog.Footer justifyContent="space-between" flexWrap="wrap" gap="3">
                {product ? (
                  <Button
                    variant="ghost"
                    size="lg"
                    color="fg.error"
                    onClick={() => run("delete", () => deleteProductAction(product.id))}
                    loading={pending === "delete"}
                    loadingText={t("productForm.deleting")}
                    disabled={pending === "save"}
                  >
                    <Trash2 aria-hidden />
                    {t("productForm.delete")}
                  </Button>
                ) : (
                  <span />
                )}
                <HStack gap="3">
                  <Button variant="outline" size="lg" onClick={onClose} disabled={!!pending}>
                    {t("productForm.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    loading={pending === "save"}
                    loadingText={t("productForm.saving")}
                    disabled={pending === "delete"}
                    bg="brand"
                    color="white"
                    _hover={{ bg: "brandHover" }}
                  >
                    {t(product ? "productForm.save" : "productForm.create")}
                  </Button>
                </HStack>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="lg" aria-label={t("productForm.close")} />
              </Dialog.CloseTrigger>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
