"use client";

import { Alert, Badge, Box, Button, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import type { PaletteColor } from "@/config/app.config";
import type { CategoryItem } from "@/modules/categories/categories";
import { reorderCategoriesAction } from "./actions";
import { CategoryFormDialog } from "./category-form-dialog";
import { DeleteCategoryDialog } from "./delete-category-dialog";

type Props = {
  categories: CategoryItem[];
  palette: readonly PaletteColor[];
  emojiSuggestions: readonly string[];
  newCategory: { color: string; emoji: string };
  nameMaxLength: number;
};

type OpenDialog =
  { kind: "create" } | { kind: "edit"; id: string } | { kind: "delete"; id: string };

/** The categories in the settings (spec 7): add, edit, delete, and drag to reorder. */
export function CategoriesManager({
  categories,
  palette,
  emojiSuggestions,
  newCategory,
  nameMaxLength,
}: Props) {
  const t = useTranslations();
  const dndId = useId();
  // The order shown: the server's, or a new one while it is being saved. Every save
  // re-renders the page with the server's data, which then replaces it.
  const [items, setItems] = useState(categories);
  const [serverItems, setServerItems] = useState(categories);
  if (categories !== serverItems) {
    setServerItems(categories);
    setItems(categories);
  }
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const sensors = useSensors(
    // A few pixels of movement first, so a tap on the handle isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colorOf = (key: string) => palette.find((color) => color.key === key)?.value ?? "gray";
  const nameOf = (id: UniqueIdentifier) => items.find((item) => item.id === id)?.name ?? "";
  const positionOf = (id: UniqueIdentifier) => items.findIndex((item) => item.id === id) + 1;

  // Read aloud by screen readers while moving a category with the keyboard.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("reorder.start", {
        name: nameOf(active.id),
        position: positionOf(active.id),
        total: items.length,
      }),
    onDragOver: ({ active, over }) =>
      over
        ? t("reorder.over", {
            name: nameOf(active.id),
            position: positionOf(over.id),
            total: items.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("reorder.end", {
            name: nameOf(active.id),
            position: positionOf(over.id),
            total: items.length,
          })
        : undefined,
    onDragCancel: ({ active }) => t("reorder.cancel", { name: nameOf(active.id) }),
  };

  function reorder({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(items, positionOf(active.id) - 1, positionOf(over.id) - 1);
    setItems(next);
    setNotice(null);
    startSaving(async () => {
      try {
        const result = await reorderCategoriesAction(next.map((item) => item.id));
        if (!result.ok) setNotice(result.message);
      } catch {
        setItems(serverItems);
        setNotice(t("categoryErrors.generic"));
      }
    });
  }

  function closeWithNotice(message: string) {
    setDialog(null);
    setNotice(message);
  }

  const target = dialog && dialog.kind !== "create" ? items.find((c) => c.id === dialog.id) : null;
  const system = items.find((item) => item.isSystem);

  return (
    <Stack gap="4">
      <Text color="fg.muted">{t("settings.categories.help")}</Text>

      {notice && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Title>{notice}</Alert.Title>
        </Alert.Root>
      )}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={reorder}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("reorder.instructions") },
        }}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <Stack as="ul" gap="2" aria-label={t("settings.categories.listLabel")} listStyle="none">
            {items.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                color={colorOf(category.color)}
                onEdit={() => {
                  setNotice(null);
                  setDialog({ kind: "edit", id: category.id });
                }}
                onDelete={() => {
                  setNotice(null);
                  setDialog({ kind: "delete", id: category.id });
                }}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      {saving && (
        <Text role="status" color="fg.muted" fontSize="sm">
          {t("settings.categories.saving")}
        </Text>
      )}

      {system && (
        <Text color="fg.muted" fontSize="sm">
          {t("settings.categories.systemHelp", { name: system.name })}
        </Text>
      )}

      <Button
        ref={addButtonRef}
        alignSelf="start"
        size="lg"
        bg="brand"
        color="white"
        _hover={{ bg: "brandHover" }}
        onClick={() => {
          setNotice(null);
          setDialog({ kind: "create" });
        }}
      >
        <Plus aria-hidden />
        {t("settings.categories.add")}
      </Button>

      {dialog?.kind === "create" && (
        <CategoryFormDialog
          palette={palette}
          emojiSuggestions={emojiSuggestions}
          initial={{ name: "", color: newCategory.color, icon: newCategory.emoji }}
          nameMaxLength={nameMaxLength}
          onClose={() => setDialog(null)}
          onGone={closeWithNotice}
        />
      )}
      {dialog?.kind === "edit" && target && (
        <CategoryFormDialog
          category={target}
          palette={palette}
          emojiSuggestions={emojiSuggestions}
          initial={target}
          nameMaxLength={nameMaxLength}
          onClose={() => setDialog(null)}
          onGone={closeWithNotice}
        />
      )}
      {dialog?.kind === "delete" && target && (
        <DeleteCategoryDialog
          category={target}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null);
            // The delete button is gone with its row: keep keyboard focus on the list's
            // part of the page, after the dialog has given focus back.
            setTimeout(() => addButtonRef.current?.focus(), 0);
          }}
          onGone={closeWithNotice}
        />
      )}
    </Stack>
  );
}

function CategoryRow({
  category,
  color,
  onEdit,
  onDelete,
}: {
  category: CategoryItem;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("settings.categories");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  return (
    <HStack
      as="li"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      position="relative"
      zIndex={isDragging ? "docked" : undefined}
      shadow={isDragging ? "lg" : undefined}
      gap="1"
      bg="bg"
      borderWidth="1px"
      borderInlineStartWidth="6px"
      borderInlineStartColor={color}
      borderRadius="md"
      pe="1"
      data-testid="category-row"
    >
      {/* Drag with a mouse or finger; with the keyboard, Space picks up and puts down. */}
      <IconButton
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("move", { name: category.name })}
        variant="ghost"
        size="lg"
        cursor={isDragging ? "grabbing" : "grab"}
        touchAction="none"
        color="fg.muted"
      >
        <GripVertical aria-hidden />
      </IconButton>
      <Text fontSize="2xl" aria-hidden lineHeight="1">
        {category.icon}
      </Text>
      <Stack gap="0" flex="1" minW="0" ps="2" py="1">
        {/* Wraps rather than cuts off: long names must be readable on a phone. */}
        <Text fontWeight="medium" overflowWrap="anywhere">
          {category.name}
        </Text>
        <HStack gap="2" rowGap="1" wrap="wrap">
          <Text fontSize="sm" color="fg.muted" whiteSpace="nowrap">
            {t("productCount", { count: category.productCount })}
          </Text>
          {category.isSystem && (
            <Badge size="sm" variant="outline">
              {t("system")}
            </Badge>
          )}
        </HStack>
      </Stack>
      <IconButton
        aria-label={t("edit", { name: category.name })}
        variant="ghost"
        size="lg"
        onClick={onEdit}
      >
        <Pencil aria-hidden />
      </IconButton>
      {category.isSystem ? (
        // Keeps the columns lined up: the system category can't be deleted (spec 6.3).
        <Box w="11" flexShrink={0} />
      ) : (
        <IconButton
          aria-label={t("delete", { name: category.name })}
          variant="ghost"
          size="lg"
          color="fg.error"
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
        </IconButton>
      )}
    </HStack>
  );
}
