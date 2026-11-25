import { describe, expect, it } from "vitest";
import type { ListSnapshot } from "./snapshot";
import {
  applyOptimistic,
  containerOf,
  containersOf,
  moveBetween,
  newerList,
  visibleCategories,
  withContainers,
} from "./view";

function product(id: string, categoryId: string, name = id) {
  return { id, categoryId, name, quantity: 1, isChecked: false, version: 1 };
}

const list: ListSnapshot = {
  revision: 5,
  categories: [
    {
      id: "dairy",
      name: "מוצרי חלב",
      color: "blue",
      icon: "🥛",
      isSystem: false,
      products: [product("milk", "dairy", "חלב"), product("cheese", "dairy", "גבינה צהובה")],
    },
    { id: "frozen", name: "קפואים", color: "sky", icon: "🧊", isSystem: false, products: [] },
    {
      id: "general",
      name: "כללי",
      color: "slate",
      icon: "🛒",
      isSystem: true,
      products: [product("cola", "general", "Coca Cola")],
    },
  ],
};

describe("applyOptimistic", () => {
  it("sets a check mark or a quantity, and is the same when applied twice", () => {
    const checked = applyOptimistic(list, { kind: "checked", productId: "milk", isChecked: true });
    expect(checked.categories[0].products[0].isChecked).toBe(true);
    const once = applyOptimistic(list, { kind: "quantity", productId: "cola", quantity: 4 });
    expect(applyOptimistic(once, { kind: "quantity", productId: "cola", quantity: 4 })).toEqual(
      once,
    );
    expect(once.categories[2].products[0].quantity).toBe(4);
    expect(list.categories[2].products[0].quantity).toBe(1);
  });
});

describe("visibleCategories", () => {
  it("hides empty categories", () => {
    expect(visibleCategories(list, "").map((c) => c.id)).toEqual(["dairy", "general"]);
  });

  it("filters by name, ignoring spaces and English case", () => {
    expect(visibleCategories(list, "  COCA ").map((c) => c.products.map((p) => p.id))).toEqual([
      ["cola"],
    ]);
    expect(visibleCategories(list, "צהובה")[0].products.map((p) => p.id)).toEqual(["cheese"]);
    expect(visibleCategories(list, "אין כזה")).toEqual([]);
  });
});

describe("moveBetween", () => {
  const containers = containersOf(list.categories);

  it("reorders within a category", () => {
    expect(moveBetween(containers, "cheese", "milk").dairy).toEqual(["cheese", "milk"]);
  });

  it("moves to another category, before the product it is over", () => {
    const moved = moveBetween(containers, "cola", "cheese");
    expect(moved.dairy).toEqual(["milk", "cola", "cheese"]);
    expect(moved.general).toEqual([]);
  });

  it("moves to the end of a category it is over", () => {
    const moved = moveBetween(containers, "milk", "frozen");
    expect(moved.frozen).toEqual(["milk"]);
    expect(containerOf(moved, "milk")).toBe("frozen");
  });

  it("changes nothing over itself or something unknown", () => {
    expect(moveBetween(containers, "milk", "milk")).toBe(containers);
    expect(moveBetween(containers, "milk", "nowhere")).toBe(containers);
  });
});

describe("withContainers", () => {
  it("shows a move at once, with the product's new category", () => {
    const moved = withContainers(list, moveBetween(containersOf(list.categories), "cola", "milk"));
    expect(moved.categories[0].products.map((p) => [p.id, p.categoryId])).toEqual([
      ["cola", "dairy"],
      ["milk", "dairy"],
      ["cheese", "dairy"],
    ]);
    expect(moved.categories[2].products).toEqual([]);
    expect(moved.revision).toBe(5);
  });
});

describe("newerList", () => {
  const at = (revision: number): ListSnapshot => ({ ...list, revision });

  it("shows a list from the server that is as new or newer", () => {
    expect(newerList(at(5), at(6)).revision).toBe(6);
    // The same revision again: the server's copy, which has nothing optimistic in it.
    const same = at(5);
    expect(newerList(at(5), same)).toBe(same);
  });

  it("keeps the list shown when an older one arrives late", () => {
    const shown = at(7);
    expect(newerList(shown, at(6))).toBe(shown);
  });
});
