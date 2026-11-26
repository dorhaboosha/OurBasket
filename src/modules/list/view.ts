// How the list screen shows the list: search, optimistic changes and drag-and-drop
// moves. Pure functions on a ListSnapshot, used in the browser.

import { normalizeName } from "@/lib/names";
import type { ListCategory, ListSnapshot } from "./snapshot";

/**
 * A change shown before the server confirms it, so checking and +/- feel instant (spec
 * 19). Absolute values, not deltas: applying one twice (once on the old list, once on the
 * server's answer) gives the same result.
 */
export type OptimisticChange =
  | { kind: "checked"; productId: string; isChecked: boolean }
  | { kind: "quantity"; productId: string; quantity: number }
  /** A drag and drop: the products of the categories it changed, in their new order. */
  | { kind: "order"; containers: Containers };

/**
 * The list to show when the server sends one: the newer of the two. An answer or a
 * reload that arrives late never replaces a newer list (spec 12.2).
 */
export function newerList(shown: ListSnapshot, received: ListSnapshot): ListSnapshot {
  return received.revision >= shown.revision ? received : shown;
}

export function applyOptimistic(list: ListSnapshot, change: OptimisticChange): ListSnapshot {
  if (change.kind === "order") return withContainers(list, change.containers);
  return {
    ...list,
    categories: list.categories.map((category) => ({
      ...category,
      products: category.products.map((product) => {
        if (product.id !== change.productId) return product;
        return change.kind === "checked"
          ? { ...product, isChecked: change.isChecked }
          : { ...product, quantity: change.quantity };
      }),
    })),
  };
}

/**
 * The categories to show: only those with products, and while searching, only the
 * products whose name contains the search (spec 8.8), in every category, open or closed.
 */
export function visibleCategories(list: ListSnapshot, search: string): ListCategory[] {
  const query = normalizeName(search);
  return list.categories
    .map((category) =>
      query
        ? {
            ...category,
            products: category.products.filter((product) =>
              normalizeName(product.name).includes(query),
            ),
          }
        : category,
    )
    .filter((category) => category.products.length > 0);
}

/** Product ids per category: what drag and drop rearranges. */
export type Containers = Record<string, string[]>;

export function containersOf(categories: ListCategory[]): Containers {
  return Object.fromEntries(
    categories.map((category) => [category.id, category.products.map((product) => product.id)]),
  );
}

export function containerOf(containers: Containers, id: string): string | undefined {
  if (id in containers) return id;
  return Object.keys(containers).find((key) => containers[key].includes(id));
}

/**
 * Moves a product to where it is dragged over: before the product it is over, or to the
 * end of the category it is over. Returns the same object when nothing changes.
 */
export function moveBetween(containers: Containers, activeId: string, overId: string): Containers {
  const from = containerOf(containers, activeId);
  const to = containerOf(containers, overId);
  if (!from || !to || activeId === overId) return containers;

  const source = containers[from].filter((id) => id !== activeId);
  const target = from === to ? source : [...containers[to]];
  const overIndex = target.indexOf(overId);
  if (from === to) {
    const oldIndex = containers[from].indexOf(activeId);
    const newIndex = containers[from].indexOf(overId);
    if (newIndex === -1) return containers;
    const reordered = [...containers[from]];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, activeId);
    return { ...containers, [from]: reordered };
  }
  target.splice(overIndex === -1 ? target.length : overIndex, 0, activeId);
  return { ...containers, [from]: source, [to]: target };
}

/** The list with its products rearranged as in containers (to show a move at once). */
export function withContainers(list: ListSnapshot, containers: Containers): ListSnapshot {
  const products = new Map(
    list.categories.flatMap((category) => category.products.map((p) => [p.id, p] as const)),
  );
  return {
    ...list,
    categories: list.categories.map((category) =>
      category.id in containers
        ? {
            ...category,
            products: containers[category.id].flatMap((id) => {
              const product = products.get(id);
              return product ? [{ ...product, categoryId: category.id }] : [];
            }),
          }
        : category,
    ),
  };
}
