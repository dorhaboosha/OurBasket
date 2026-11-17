"use client";

import { Box, Flex, HStack, IconButton, Input, chakra } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Minus, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { ListProduct } from "@/modules/list/snapshot";

type Props = {
  product: ListProduct;
  /** False while searching: the order can't be changed on a filtered list. */
  draggable: boolean;
  onCheck: (isChecked: boolean) => void;
  onStep: (delta: 1 | -1) => void;
  /**
   * A typed quantity. Returns whether it now shows on its own (as an optimistic change);
   * if not (not a number, or 0 while its delete is pending), the field shows the saved one.
   */
  onTypeQuantity: (text: string) => boolean;
  onEdit: () => void;
};

/**
 * One product (spec 8.4, 8.6): a check box, the name, the quantity with - and +, and
 * edit. On phones the quantity goes under the name.
 */
export function ProductRow({ product, draggable, onCheck, onStep, onTypeQuantity, onEdit }: Props) {
  const t = useTranslations("home");
  const checkboxId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id, disabled: !draggable || product.isChecked });

  return (
    <HStack
      as="li"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      position="relative"
      zIndex={isDragging ? "docked" : undefined}
      shadow={isDragging ? "lg" : undefined}
      bg="bg"
      gap="1"
      py="1"
      pe="1"
      borderBottomWidth="1px"
      _last={{ borderBottomWidth: 0 }}
      data-testid="product-row"
      data-checked={product.isChecked || undefined}
    >
      {draggable && !product.isChecked ? (
        <IconButton
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("move", { name: product.name })}
          variant="ghost"
          size="lg"
          cursor={isDragging ? "grabbing" : "grab"}
          touchAction="none"
          color="fg.muted"
        >
          <GripVertical aria-hidden />
        </IconButton>
      ) : (
        // A checked product stays at the bottom: it isn't dragged.
        <Box w="11" flexShrink={0} />
      )}

      {/* A native check box stretched over the drawn one: the whole 44px square is tappable. */}
      <Box position="relative" w="11" h="11" flexShrink={0} display="grid" placeItems="center">
        <chakra.input
          id={checkboxId}
          type="checkbox"
          checked={product.isChecked}
          onChange={(event) => onCheck(event.target.checked)}
          position="absolute"
          inset="0"
          w="full"
          h="full"
          m="0"
          opacity="0"
          cursor="pointer"
          className="peer"
        />
        <Box
          aria-hidden
          w="6"
          h="6"
          borderRadius="sm"
          borderWidth="2px"
          borderColor={product.isChecked ? "brand" : "fg.muted"}
          bg={product.isChecked ? "brand" : "bg"}
          color="white"
          display="grid"
          placeItems="center"
          pointerEvents="none"
          _peerFocusVisible={{
            outline: "3px solid",
            outlineColor: "blue.600",
            outlineOffset: "2px",
          }}
        >
          {product.isChecked && <Check size={16} strokeWidth={3} />}
        </Box>
      </Box>

      <Flex
        flex="1"
        minW="0"
        direction={{ base: "column", sm: "row" }}
        align={{ base: "stretch", sm: "center" }}
        gap={{ base: "0", sm: "2" }}
      >
        {/* Checked: crossed out and muted, and the box is ticked (not color alone, spec 8.6). */}
        <chakra.label
          htmlFor={checkboxId}
          flex="1"
          minW="0"
          py="2"
          cursor="pointer"
          overflowWrap="anywhere"
          textDecoration={product.isChecked ? "line-through" : undefined}
          color={product.isChecked ? "fg.muted" : undefined}
        >
          {product.name}
        </chakra.label>
        <QuantityControl
          name={product.name}
          quantity={product.quantity}
          onStep={onStep}
          onType={onTypeQuantity}
        />
      </Flex>

      <IconButton
        aria-label={t("edit", { name: product.name })}
        variant="ghost"
        size="lg"
        onClick={onEdit}
      >
        <Pencil aria-hidden />
      </IconButton>
    </HStack>
  );
}

/**
 * - and + change the quantity by one; the number can also be typed (Enter or leaving the
 * field saves it, Escape undoes the typing).
 */
function QuantityControl({
  name,
  quantity,
  onStep,
  onType,
}: {
  name: string;
  quantity: number;
  onStep: (delta: 1 | -1) => void;
  onType: (text: string) => boolean;
}) {
  const t = useTranslations("home");
  const [text, setText] = useState(String(quantity));
  // A new quantity (from -, +, or the other device) replaces what is shown. Not a remount:
  // the - and + buttons keep keyboard focus between presses.
  const [shown, setShown] = useState(quantity);
  if (quantity !== shown) {
    setShown(quantity);
    setText(String(quantity));
  }

  function commit() {
    if (text.trim() === String(quantity)) {
      setText(String(quantity));
      return;
    }
    // A valid quantity shows at once (optimistic) and comes back as the new prop; anything
    // else shows the saved quantity again, so a refused delete never leaves "0" behind.
    if (!onType(text)) setText(String(quantity));
  }

  return (
    <HStack gap="0" alignSelf={{ base: "start", sm: "center" }} flexShrink={0}>
      <IconButton
        aria-label={t("decrease", { name })}
        variant="ghost"
        size="lg"
        onClick={() => onStep(-1)}
      >
        <Minus aria-hidden />
      </IconButton>
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setText(String(quantity));
        }}
        onFocus={(event) => event.currentTarget.select()}
        aria-label={t("quantity", { name })}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        w="14"
        size="lg"
        textAlign="center"
        px="1"
      />
      <IconButton
        aria-label={t("increase", { name })}
        variant="ghost"
        size="lg"
        onClick={() => onStep(1)}
      >
        <Plus aria-hidden />
      </IconButton>
    </HStack>
  );
}
