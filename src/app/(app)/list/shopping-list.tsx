"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Input,
  InputGroup,
  Stack,
  Text,
  chakra,
} from "@chakra-ui/react";
import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, ListChecks, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toaster } from "@/components/toaster";
import type { PaletteColor } from "@/config/app.config";
import type { DeletedProduct } from "@/modules/products/products";
import type { ListCategory, ListProduct, ListSnapshot } from "@/modules/list/snapshot";
import {
  type Containers,
  type OptimisticChange,
  applyOptimistic,
  containerOf,
  containersOf,
  moveBetween,
  visibleCategories,
  withContainers,
} from "@/modules/list/view";
import { parseQuantity } from "@/modules/products/validation";
import {
  type ListActionResult,
  changeQuantityAction,
  moveProductAction,
  restoreProductAction,
  setCheckedAction,
  setQuantityAction,
} from "../list-actions";
import { useRealtime } from "../realtime";
import { ClearListDialog } from "./clear-list-dialog";
import { ExportMenu } from "./export-menu";
import { UpdateListDialog } from "./update-list-dialog";
import { ProductFormDialog } from "./product-form-dialog";
import { ProductRow } from "./product-row";

type Props = {
  initial: ListSnapshot;
  palette: readonly PaletteColor[];
  quantityMax: number;
};

type OpenDialog =
  | { kind: "add" }
  /** The product as last seen: kept if it's deleted meanwhile, so the form stays open. */
  | { kind: "edit"; product: ListProduct }
  /** The list as it was when the question was asked: only that list is cleared. */
  | { kind: "clear"; revision: number; productCount: number }
  /** The products checked when the question was asked: only those can be bought. */
  | { kind: "update"; checkedIds: string[] };

/** Which categories are closed on this device (spec 6.4): not synced between users. */
const COLLAPSED_KEY = "ourbasket:collapsed-categories";

/**
 * The shopping list (spec 6, 8): search, add, clear, and the products by category. Every
 * action answers with the whole list at its revision; an answer older than what is shown
 * is ignored (spec 12.2).
 */
export function ShoppingList({ initial, palette, quantityMax }: Props) {
  const t = useTranslations();
  const dndId = useId();
  const { reportRevision } = useRealtime();
  const [list, setList] = useState(initial);
  // A newer list rendered by the server (for example, coming back to this page).
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    if (initial.revision >= list.revision) setList(initial);
  }
  const [shown, showOptimistic] = useOptimistic(list, applyOptimistic);
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [drag, setDrag] = useState<{ containers: Containers; start: Containers } | null>(null);

  const searching = search.trim() !== "";
  const productCount = shown.categories.reduce((sum, c) => sum + c.products.length, 0);
  const checkedIds = shown.categories.flatMap((category) =>
    category.products.filter((product) => product.isChecked).map((product) => product.id),
  );
  const dragged = drag ? withContainers(shown, drag.containers) : shown;
  const sections = drag
    ? dragged.categories.filter((category) => category.id in drag.containers)
    : visibleCategories(shown, search);

  /** Shows a list from the server, unless the one shown is newer. */
  function apply(next: ListSnapshot) {
    setList((current) => (next.revision >= current.revision ? next : current));
    // The real-time event for this revision (our own change) needs no reload.
    reportRevision(next.revision);
  }

  /**
   * Shows an action's answer: its list, and its message (with "undo" after a delete). A
   * dialog shows its own errors, so they aren't repeated in a toast over its buttons.
   */
  function report(result: ListActionResult, fromDialog = false) {
    apply(result.list);
    if (!result.ok) {
      if (fromDialog) return;
      say({ type: "error", title: result.message, closable: true });
    } else if (result.message) {
      const undo = result.undo;
      say({
        type: undo ? "info" : "success",
        title: result.message,
        closable: true,
        duration: undo ? 10_000 : 4_000,
        action: undo ? { label: t("home.undo"), onClick: () => restore(undo) } : undefined,
      });
    }
  }

  /** Runs a list action; an optimistic change shows at once and goes when it's answered. */
  function run(action: () => Promise<ListActionResult>, change?: OptimisticChange) {
    startTransition(async () => {
      if (change) showOptimistic(change);
      try {
        const result = await action();
        startTransition(() => report(result));
      } catch {
        say({ type: "error", title: t("home.generic"), closable: true });
      }
    });
  }

  /**
   * One message at a time: a new one replaces the last, so "put back" and "deleted" never
   * show together.
   */
  function say(options: Parameters<typeof toaster.create>[0]) {
    toaster.dismiss();
    toaster.create(options);
  }

  function clearSearch() {
    setSearch("");
    // Back to the field, not lost on the page (the clear button itself goes away).
    searchRef.current?.focus();
  }

  function restore(deleted: DeletedProduct) {
    run(() => restoreProductAction(deleted));
  }

  function findProduct(id: string) {
    for (const category of shown.categories) {
      const product = category.products.find((p) => p.id === id);
      if (product) return { product, category };
    }
    return undefined;
  }

  // ---- drag and drop (spec 8.7) ----

  const sensors = useSensors(
    // A few pixels of movement first, so a tap on the handle isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart() {
    const start = containersOf(visibleCategories(shown, ""));
    setDrag({ containers: start, start });
  }

  // Into another category while dragging, so the drop shows where it lands. Within one
  // category, the sortable list animates the move itself; it is applied on drop.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDrag((current) => {
      if (!current) return current;
      const from = containerOf(current.containers, String(active.id));
      const to = containerOf(current.containers, String(over.id));
      if (!from || !to || from === to) return current;
      return {
        ...current,
        containers: moveBetween(current.containers, String(active.id), String(over.id)),
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = drag;
    setDrag(null);
    if (!current || !over) return;
    const id = String(active.id);
    const from = containerOf(current.start, id);
    // Into another category, onDragOver has already placed it; within its own category,
    // the drop decides its place.
    const containers =
      containerOf(current.containers, id) === from
        ? moveBetween(current.containers, id, String(over.id))
        : current.containers;
    const to = containerOf(containers, id);
    if (!to || !from) return;
    if (to === from && containers[to].join() === current.start[from].join()) return;
    // Shown at once until the server answers; if the answer is an error, or never comes,
    // the confirmed list shows again.
    const changed = { [from]: containers[from], [to]: containers[to] };
    run(() => moveProductAction(id, to, containers[to]), { kind: "order", containers: changed });
  }

  const nameOf = (id: UniqueIdentifier) => findProduct(String(id))?.product.name ?? "";
  const categoryNameOf = (id: UniqueIdentifier) => {
    const key = drag ? containerOf(drag.containers, String(id)) : undefined;
    return shown.categories.find((category) => category.id === key)?.name ?? "";
  };
  // Read aloud by screen readers while moving a product with the keyboard.
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("productReorder.start", { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("productReorder.over", {
            name: nameOf(active.id),
            target: nameOf(over.id) || categoryNameOf(over.id),
            category: categoryNameOf(over.id),
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("productReorder.end", {
            name: nameOf(active.id),
            category: categoryNameOf(active.id),
          })
        : undefined,
    onDragCancel: ({ active }) => t("productReorder.cancel", { name: nameOf(active.id) }),
  };

  // The product being edited, as it is now; none if it was deleted or bought on the other
  // phone meanwhile. The form then stays open with what was typed, and says so.
  const editing = dialog?.kind === "edit" ? findProduct(dialog.product.id)?.product : undefined;
  if (dialog?.kind === "edit" && editing && editing.version !== dialog.product.version) {
    setDialog({ kind: "edit", product: editing });
  }

  return (
    <Stack gap="4">
      <Flex gap="2" wrap="wrap">
        <InputGroup
          flex="1"
          minW="56"
          startElement={<Search aria-hidden size={18} />}
          endElement={
            searching ? (
              <IconButton
                aria-label={t("home.clearSearch")}
                variant="ghost"
                size="lg"
                me="-2"
                onClick={clearSearch}
              >
                <X aria-hidden />
              </IconButton>
            ) : undefined
          }
        >
          <Input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("home.search")}
            placeholder={t("home.search")}
            size="lg"
            // The field's own "x" is replaced by a 44px one (spec 5.2).
            css={{ "&::-webkit-search-cancel-button": { display: "none" } }}
          />
        </InputGroup>
        <Button
          size="lg"
          bg="brand"
          color="white"
          _hover={{ bg: "brandHover" }}
          onClick={() => setDialog({ kind: "add" })}
        >
          <Plus aria-hidden />
          {t("home.add")}
        </Button>
        {productCount > 0 && (
          // Disabled until something is checked off (spec 9.1).
          <Button
            size="lg"
            variant="outline"
            color="brand"
            borderColor="brand"
            disabled={checkedIds.length === 0}
            onClick={() => setDialog({ kind: "update", checkedIds })}
          >
            <ListChecks aria-hidden />
            {t("home.updateList")}
          </Button>
        )}
        {productCount > 0 && <ExportMenu categories={shown.categories} say={say} />}
        {productCount > 0 && (
          <Button
            size="lg"
            variant="outline"
            onClick={() => setDialog({ kind: "clear", revision: list.revision, productCount })}
          >
            {t("home.clear")}
          </Button>
        )}
      </Flex>

      {productCount === 0 ? (
        <Stack align="center" textAlign="center" gap="3" py="12" data-testid="empty-list">
          <Text fontSize="5xl" aria-hidden>
            🧺
          </Text>
          <Text fontSize="lg" fontWeight="semibold">
            {t("home.empty")}
          </Text>
          <Text color="fg.muted">{t("home.emptyHelp")}</Text>
          <Button
            size="lg"
            bg="brand"
            color="white"
            _hover={{ bg: "brandHover" }}
            onClick={() => setDialog({ kind: "add" })}
          >
            <Plus aria-hidden />
            {t("home.add")}
          </Button>
        </Stack>
      ) : sections.length === 0 ? (
        <Stack align="center" textAlign="center" gap="3" py="8" role="status">
          <Text>{t("home.noResults", { query: search.trim() })}</Text>
          <Button size="lg" variant="outline" onClick={clearSearch}>
            {t("home.clearSearch")}
          </Button>
        </Stack>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDrag(null)}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t("productReorder.instructions") },
          }}
        >
          <Stack gap="3">
            {sections.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                color={palette.find((c) => c.key === category.color)?.value ?? "gray"}
                open={searching || !collapsed.has(category.id)}
                searching={searching}
                onToggle={() => toggleCollapsed(category.id)}
              >
                <SortableContext
                  items={category.products.map((product) => product.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {category.products.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      draggable={!searching}
                      onCheck={(isChecked) =>
                        run(() => setCheckedAction(product.id, isChecked), {
                          kind: "checked",
                          productId: product.id,
                          isChecked,
                        })
                      }
                      onStep={(delta) => {
                        const quantity = product.quantity + delta;
                        const visible = quantity >= 1 && quantity <= quantityMax;
                        run(
                          () => changeQuantityAction(product.id, delta),
                          visible
                            ? { kind: "quantity", productId: product.id, quantity }
                            : undefined,
                        );
                      }}
                      onTypeQuantity={(text) => {
                        const quantity = parseQuantity(text);
                        if (quantity === null || quantity > quantityMax) {
                          say({
                            type: "error",
                            title: t("productErrors.quantityTyped", { max: quantityMax }),
                            closable: true,
                          });
                          return false;
                        }
                        run(
                          () => setQuantityAction(product.id, product.version, quantity),
                          quantity > 0
                            ? { kind: "quantity", productId: product.id, quantity }
                            : undefined,
                        );
                        // 0 isn't shown: the product goes once the server deletes it, or
                        // stays, showing its quantity, if the delete is refused.
                        return quantity > 0;
                      }}
                      onEdit={() => setDialog({ kind: "edit", product })}
                    />
                  ))}
                </SortableContext>
              </CategorySection>
            ))}
          </Stack>
        </DndContext>
      )}

      {dialog?.kind === "add" && (
        <ProductFormDialog
          categories={shown.categories}
          onClose={() => setDialog(null)}
          onResult={(result) => startTransition(() => report(result, true))}
        />
      )}
      {dialog?.kind === "edit" && (
        <ProductFormDialog
          product={editing ?? dialog.product}
          gone={!editing}
          categories={shown.categories}
          onClose={() => setDialog(null)}
          onResult={(result) => startTransition(() => report(result, true))}
        />
      )}
      {dialog?.kind === "update" && (
        <UpdateListDialog
          checkedIds={dialog.checkedIds}
          onClose={() => setDialog(null)}
          onResult={(result) => startTransition(() => report(result, true))}
        />
      )}
      {dialog?.kind === "clear" && (
        <ClearListDialog
          productCount={dialog.productCount}
          revision={dialog.revision}
          onClose={() => setDialog(null)}
          onResult={(result) =>
            startTransition(() => {
              report(result, true);
              // Refused because the list changed: ask again about the list as it is now.
              if (!result.ok) {
                setDialog({
                  kind: "clear",
                  revision: result.list.revision,
                  productCount: result.list.categories.reduce((n, c) => n + c.products.length, 0),
                });
              }
            })
          }
        />
      )}
    </Stack>
  );
}

/**
 * A category's part of the list (spec 6.1): its emoji, name, color and product count,
 * opened and closed with its header. Products can be dropped on it, even when closed.
 */
function CategorySection({
  category,
  color,
  open,
  searching,
  onToggle,
  children,
}: {
  category: ListCategory;
  color: string;
  open: boolean;
  searching: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("home");
  const id = useId();
  const { setNodeRef, isOver } = useDroppable({ id: category.id });
  const count = category.products.length;
  const checked = category.products.filter((product) => product.isChecked).length;

  const header = (
    <>
      <Text as="span" fontSize="xl" aria-hidden>
        {category.icon}
      </Text>
      <Text as="span" flex="1" textAlign="start" overflowWrap="anywhere">
        {category.name}
      </Text>
      <Text as="span" fontSize="sm" color="fg.muted" fontWeight="normal" whiteSpace="nowrap">
        {checked > 0 ? t("checkedCount", { checked, count }) : t("productCount", { count })}
      </Text>
    </>
  );

  return (
    <Box
      as="section"
      ref={setNodeRef}
      aria-labelledby={`${id}-heading`}
      bg="bg"
      borderWidth="1px"
      borderInlineStartWidth="6px"
      borderInlineStartColor={color}
      borderRadius="md"
      outline={isOver ? "2px dashed" : undefined}
      outlineColor="brand"
      data-testid="category-section"
    >
      <Heading as="h2" size="md" id={`${id}-heading`}>
        {searching ? (
          // While searching every category is open, so the header isn't a toggle.
          <Flex align="center" gap="2" minH="12" px="3">
            {header}
          </Flex>
        ) : (
          <chakra.button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`${id}-products`}
            w="full"
            minH="12"
            display="flex"
            alignItems="center"
            gap="2"
            px="3"
            cursor="pointer"
            borderRadius="md"
            _hover={{ bg: "bg.muted" }}
          >
            {header}
            <ChevronDown
              aria-hidden
              size={20}
              style={{ transform: open ? "rotate(180deg)" : undefined, flexShrink: 0 }}
            />
          </chakra.button>
        )}
      </Heading>
      <Box
        as="ul"
        id={`${id}-products`}
        hidden={!open}
        listStyle="none"
        borderTopWidth="1px"
        px="1"
      >
        {children}
      </Box>
    </Box>
  );
}

/** The closed categories, kept in this browser only. */
function useCollapsed(): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Read after the first render: the server can't know this device's choice.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state
      if (Array.isArray(saved)) setCollapsed(new Set(saved.filter((v) => typeof v === "string")));
    } catch {
      // Storage unavailable (private mode, blocked): every category starts open.
    }
  }, []);

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Not saved; it still works for this visit.
      }
      return next;
    });
  }

  return [collapsed, toggle];
}
