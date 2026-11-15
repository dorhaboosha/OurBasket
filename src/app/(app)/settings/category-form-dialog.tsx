"use client";

import {
  Alert,
  Button,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
  chakra,
} from "@chakra-ui/react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { dialogFromMdUp } from "@/components/dialog-styles";
import type { PaletteColor } from "@/config/app.config";
import type { CategoryItem } from "@/modules/categories/categories";
import { type CategoryField, isSingleEmoji } from "@/modules/categories/validation";
import { createCategoryAction, updateCategoryAction } from "./actions";

type Props = {
  /** The category being edited; none for a new one. Always the latest loaded version. */
  category?: CategoryItem;
  initial: { name: string; color: string; icon: string };
  palette: readonly PaletteColor[];
  emojiSuggestions: readonly string[];
  nameMaxLength: number;
  onClose: () => void;
  /** The category was deleted meanwhile: close, and show this message on the page. */
  onGone: (message: string) => void;
};

/** Adds or edits a category: name, one of the palette colors, and an emoji (spec 7.1, 7.2). */
export function CategoryFormDialog({
  category,
  initial,
  palette,
  emojiSuggestions,
  nameMaxLength,
  onClose,
  onGone,
}: Props) {
  const t = useTranslations();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [icon, setIcon] = useState(initial.icon);
  // An emoji that isn't one of the suggestions is typed into its own field.
  const [customIcon, setCustomIcon] = useState(
    emojiSuggestions.includes(initial.icon) ? "" : initial.icon,
  );
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CategoryField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const colorValue = palette.find((swatch) => swatch.key === color)?.value;
  // The preview shows only a real emoji; while a typed one isn't, the last good one.
  const [previewIcon, setPreviewIcon] = useState(initial.icon);
  if (isSingleEmoji(icon) && icon !== previewIcon) setPreviewIcon(icon);

  /** An error goes away as soon as its field is changed. */
  function clearError(field: CategoryField) {
    if (fieldErrors[field])
      setFieldErrors((errors) => {
        const rest = { ...errors };
        delete rest[field];
        return rest;
      });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const input = { name, color, icon };
      const result = category
        ? await updateCategoryAction(category.id, category.version, input)
        : await createCategoryAction(input);
      if (result.ok) {
        onClose();
        return;
      }
      if ("fieldErrors" in result) {
        setFieldErrors(result.fieldErrors);
        if (result.fieldErrors.name) nameRef.current?.focus();
      } else if (result.reason === "notFound") {
        onGone(result.message);
      } else {
        setFieldErrors(result.reason === "nameTaken" ? { name: result.message } : {});
        if (result.reason !== "nameTaken") setMessage(result.message);
        else nameRef.current?.focus();
      }
    } catch {
      setMessage(t("categoryErrors.generic"));
    } finally {
      setPending(false);
    }
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
                  {t(category ? "categoryForm.editTitle" : "categoryForm.createTitle")}
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
                  <Field.Label>{t("categoryForm.name")}</Field.Label>
                  <Input
                    ref={nameRef}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      clearError("name");
                    }}
                    maxLength={nameMaxLength}
                    autoComplete="off"
                    size="lg"
                  />
                  <Field.ErrorText>{fieldErrors.name}</Field.ErrorText>
                </Field.Root>

                <Stack gap="2">
                  <Text id={`${id}-color`} fontWeight="medium">
                    {t("categoryForm.color")}
                  </Text>
                  <HStack gap="2" wrap="wrap" role="radiogroup" aria-labelledby={`${id}-color`}>
                    {palette.map((swatch) => {
                      const selected = swatch.key === color;
                      return (
                        <chakra.button
                          key={swatch.key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={t(`colors.${swatch.key}`)}
                          onClick={() => {
                            setColor(swatch.key);
                            clearError("color");
                          }}
                          bg={swatch.value}
                          color="white"
                          w="11"
                          h="11"
                          borderRadius="full"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          outline={selected ? "3px solid" : undefined}
                          outlineColor="fg"
                          outlineOffset="2px"
                          cursor="pointer"
                        >
                          {selected && <Check aria-hidden size={22} strokeWidth={3} />}
                        </chakra.button>
                      );
                    })}
                  </HStack>
                  {fieldErrors.color && (
                    <Text color="fg.error" fontSize="sm">
                      {fieldErrors.color}
                    </Text>
                  )}
                </Stack>

                <Stack gap="2">
                  <Text id={`${id}-icon`} fontWeight="medium">
                    {t("categoryForm.icon")}
                  </Text>
                  <HStack gap="1" wrap="wrap" role="radiogroup" aria-labelledby={`${id}-icon`}>
                    {emojiSuggestions.map((emoji) => {
                      const selected = !customIcon && emoji === icon;
                      return (
                        <chakra.button
                          key={emoji}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            setIcon(emoji);
                            setCustomIcon("");
                            clearError("icon");
                          }}
                          w="11"
                          h="11"
                          fontSize="2xl"
                          borderRadius="md"
                          borderWidth="2px"
                          borderColor={selected ? "brand" : "transparent"}
                          bg={selected ? "bg.muted" : undefined}
                          _hover={{ bg: "bg.muted" }}
                          cursor="pointer"
                        >
                          {emoji}
                        </chakra.button>
                      );
                    })}
                  </HStack>
                  <Field.Root invalid={!!fieldErrors.icon}>
                    <Field.Label fontWeight="normal">{t("categoryForm.customIcon")}</Field.Label>
                    <Input
                      value={customIcon}
                      onChange={(event) => {
                        setCustomIcon(event.target.value);
                        clearError("icon");
                        const typed = event.target.value.trim();
                        setIcon(typed || initial.icon);
                      }}
                      maxLength={32}
                      autoComplete="off"
                      w="24"
                      size="lg"
                      fontSize="2xl"
                      textAlign="center"
                    />
                    <Field.HelperText>{t("categoryForm.customIconHelp")}</Field.HelperText>
                    <Field.ErrorText>{fieldErrors.icon}</Field.ErrorText>
                  </Field.Root>
                </Stack>

                <Stack gap="2">
                  <Text fontWeight="medium">{t("categoryForm.preview")}</Text>
                  <HStack
                    gap="3"
                    borderWidth="1px"
                    borderInlineStartWidth="6px"
                    borderInlineStartColor={colorValue}
                    borderRadius="md"
                    px="3"
                    py="2"
                    data-testid="category-preview"
                  >
                    <Text fontSize="2xl" aria-hidden lineHeight="1">
                      {previewIcon}
                    </Text>
                    <Text fontWeight="medium" overflowWrap="anywhere">
                      {name.trim() || " "}
                    </Text>
                  </HStack>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" size="lg" onClick={onClose} disabled={pending}>
                  {t("categoryForm.cancel")}
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  loading={pending}
                  loadingText={t("categoryForm.saving")}
                  bg="brand"
                  color="white"
                  _hover={{ bg: "brandHover" }}
                >
                  {t(category ? "categoryForm.save" : "categoryForm.create")}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="lg" aria-label={t("categoryForm.close")} />
              </Dialog.CloseTrigger>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
