import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteCategory, listCategories } from "@/modules/categories/categories";
import { seedDatabase } from "@/modules/categories/seed";
import { getListSnapshot } from "@/modules/list/snapshot";
import {
  addProduct,
  changeQuantity,
  clearList,
  deleteProduct,
  moveProduct,
  restoreProduct,
  setChecked,
  setQuantity,
  updateProduct,
} from "@/modules/products/products";
import { type ProductDraft, validateProduct } from "@/modules/products/validation";
import { resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  await seedDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

function draft(name: string, quantity = 1, categoryId: string | null = null): ProductDraft {
  const result = validateProduct({ name, quantity, categoryId });
  if (!result.ok) throw new Error(`invalid draft ${name}`);
  return result.draft;
}

async function categoryId(name: string) {
  const category = (await listCategories()).find((item) => item.name === name);
  if (!category) throw new Error(`no category ${name}`);
  return category.id;
}

async function product(name: string) {
  return prisma.product.findFirstOrThrow({ where: { name } });
}

async function revision() {
  return (await getListSnapshot()).revision;
}

/** Product names per category, as the list screen shows them. */
async function shown() {
  const { categories } = await getListSnapshot();
  return Object.fromEntries(
    categories
      .filter((category) => category.products.length > 0)
      .map((category) => [category.name, category.products.map((p) => p.name)]),
  );
}

describe("addProduct", () => {
  it("adds to the chosen category, at the end, and raises the revision", async () => {
    const dairy = await categoryId("מוצרי חלב");
    const before = await revision();
    expect(await addProduct(draft("חלב", 2, dairy))).toEqual({ kind: "created" });
    await addProduct(draft("גבינה", 1, dairy));
    expect(await shown()).toEqual({ "מוצרי חלב": ["חלב", "גבינה"] });
    expect((await product("חלב")).quantity).toBe(2);
    expect(await revision()).toBe(before + 2);
  });

  it("puts a product with no category, or a deleted one, in General", async () => {
    await addProduct(draft("סוללות"));
    const frozen = await categoryId("קפואים");
    await deleteCategory(frozen, 1, 0);
    await addProduct(draft("גלידה", 1, frozen));
    expect(await shown()).toEqual({ כללי: ["סוללות", "גלידה"] });
  });

  it("adds to an existing product instead, in its own category", async () => {
    const dairy = await categoryId("מוצרי חלב");
    await addProduct(draft("Coca Cola", 2, dairy));
    const result = await addProduct(draft("  coca   COLA ", 3, await categoryId("משקאות")));
    expect(result).toEqual({
      kind: "merged",
      name: "Coca Cola",
      quantity: 5,
      capped: false,
      categoryName: "מוצרי חלב",
    });
    expect(await prisma.product.count()).toBe(1);
    expect(await shown()).toEqual({ "מוצרי חלב": ["Coca Cola"] });
  });

  it("caps a merged quantity at 999", async () => {
    await addProduct(draft("מים", 990));
    expect(await addProduct(draft("מים", 20))).toMatchObject({ quantity: 999, capped: true });
    expect((await product("מים")).quantity).toBe(999);
  });

  it("never lists the same product twice, even when added at the same moment", async () => {
    const results = await Promise.all([
      addProduct(draft("לחם", 1)),
      addProduct(draft("לחם", 2)),
      addProduct(draft("לחם ", 3)),
    ]);
    expect(results.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(await prisma.product.count()).toBe(1);
    expect((await product("לחם")).quantity).toBe(6);
  });
});

describe("updateProduct", () => {
  it("saves name, quantity and category; a new category puts it at the end", async () => {
    const dairy = await categoryId("מוצרי חלב");
    const drinks = await categoryId("משקאות");
    await addProduct(draft("חלב", 1, dairy));
    await addProduct(draft("מים", 1, drinks));
    const milk = await product("חלב");

    expect(await updateProduct(milk.id, milk.version, draft("חלב סויה", 3, drinks))).toEqual({
      ok: true,
    });
    expect(await shown()).toEqual({ משקאות: ["מים", "חלב סויה"] });
    expect(await product("חלב סויה")).toMatchObject({ quantity: 3, version: milk.version + 1 });
  });

  it("refuses another product's name: no automatic merge", async () => {
    await addProduct(draft("חלב"));
    await addProduct(draft("גבינה"));
    const cheese = await product("גבינה");
    expect(await updateProduct(cheese.id, cheese.version, draft(" חלב "))).toEqual({
      ok: false,
      reason: "nameTaken",
    });
    expect(await prisma.product.count()).toBe(2);
  });

  it("refuses a save based on an older version", async () => {
    await addProduct(draft("חלב"));
    const milk = await product("חלב");
    await changeQuantity(milk.id, 1);
    expect(await updateProduct(milk.id, milk.version, draft("חלב", 5))).toEqual({
      ok: false,
      reason: "stale",
    });
    expect((await product("חלב")).quantity).toBe(2);
  });

  it("reports a deleted product or category", async () => {
    await addProduct(draft("חלב"));
    const milk = await product("חלב");
    const frozen = await categoryId("קפואים");
    await deleteCategory(frozen, 1, 0);
    expect(await updateProduct(milk.id, milk.version, draft("חלב", 1, frozen))).toEqual({
      ok: false,
      reason: "categoryNotFound",
    });
    await deleteProduct(milk.id);
    expect(await updateProduct(milk.id, milk.version, draft("חלב"))).toEqual({
      ok: false,
      reason: "notFound",
    });
  });
});

describe("changeQuantity", () => {
  it("counts every press, even at the same moment", async () => {
    await addProduct(draft("ביצים", 10));
    const eggs = await product("ביצים");
    await Promise.all([
      changeQuantity(eggs.id, 1),
      changeQuantity(eggs.id, 1),
      changeQuantity(eggs.id, 1),
      changeQuantity(eggs.id, -1),
    ]);
    expect(await product("ביצים")).toMatchObject({ quantity: 12, version: eggs.version + 4 });
  });

  it("stops at 999", async () => {
    await addProduct(draft("מים", 999));
    const water = await product("מים");
    expect(await changeQuantity(water.id, 1)).toEqual({ ok: true, atMax: true });
    expect((await product("מים")).quantity).toBe(999);
  });

  it("deletes the product below 1, and returns what undo needs", async () => {
    const dairy = await categoryId("מוצרי חלב");
    await addProduct(draft("חלב", 1, dairy));
    const milk = await product("חלב");
    await setChecked(milk.id, true);
    expect(await changeQuantity(milk.id, -1)).toEqual({
      ok: true,
      deleted: { name: "חלב", quantity: 1, categoryId: dairy, sortOrder: 0, isChecked: true },
    });
    expect(await prisma.product.count()).toBe(0);
    // Not a purchase: history stays empty.
    expect(await prisma.purchaseRecord.count()).toBe(0);
  });
});

describe("setQuantity", () => {
  it("saves a typed quantity at the version shown", async () => {
    await addProduct(draft("חלב"));
    const milk = await product("חלב");
    expect(await setQuantity(milk.id, milk.version, 7)).toEqual({ ok: true });
    expect((await product("חלב")).quantity).toBe(7);
  });

  it("refuses it if the quantity changed meanwhile", async () => {
    await addProduct(draft("חלב"));
    const milk = await product("חלב");
    await changeQuantity(milk.id, 1);
    expect(await setQuantity(milk.id, milk.version, 7)).toEqual({ ok: false, reason: "stale" });
    expect((await product("חלב")).quantity).toBe(2);
  });

  it("deletes the product at 0, keeping the quantity it had for undo", async () => {
    await addProduct(draft("חלב", 4));
    const milk = await product("חלב");
    const result = await setQuantity(milk.id, milk.version, 0);
    expect(result).toMatchObject({ ok: true, deleted: { name: "חלב", quantity: 4 } });
    expect(await prisma.product.count()).toBe(0);
  });
});

describe("setChecked", () => {
  it("moves a checked product to the bottom of its category, and back", async () => {
    for (const name of ["חלב", "גבינה", "יוגורט"]) await addProduct(draft(name));
    const milk = await product("חלב");
    expect(await setChecked(milk.id, true)).toEqual({ ok: true });
    expect(await shown()).toEqual({ כללי: ["גבינה", "יוגורט", "חלב"] });
    // A check mark doesn't conflict with an edit in progress.
    expect((await product("חלב")).version).toBe(milk.version);

    await setChecked(milk.id, false);
    expect(await shown()).toEqual({ כללי: ["חלב", "גבינה", "יוגורט"] });
  });

  it("reports a deleted product", async () => {
    expect(await setChecked(crypto.randomUUID(), true)).toEqual({
      ok: false,
      reason: "notFound",
    });
  });
});

describe("deleteProduct and restoreProduct", () => {
  it("puts a deleted product back in its place, with its quantity and check mark", async () => {
    for (const name of ["חלב", "גבינה", "יוגורט"]) await addProduct(draft(name, 2));
    const cheese = await product("גבינה");
    await setChecked(cheese.id, true);
    await setChecked(cheese.id, false);
    const result = await deleteProduct(cheese.id);
    if (!result.ok) throw new Error("delete failed");
    expect(await shown()).toEqual({ כללי: ["חלב", "יוגורט"] });

    expect(await restoreProduct(result.deleted)).toEqual({ kind: "created" });
    expect(await shown()).toEqual({ כללי: ["חלב", "גבינה", "יוגורט"] });
    expect((await product("גבינה")).quantity).toBe(2);
  });

  it("merges with a product of the same name added meanwhile", async () => {
    await addProduct(draft("חלב", 3));
    const result = await deleteProduct((await product("חלב")).id);
    if (!result.ok) throw new Error("delete failed");
    await addProduct(draft("חלב", 1));
    expect(await restoreProduct(result.deleted)).toMatchObject({ kind: "merged", quantity: 4 });
  });

  it("restores into General when the category was deleted meanwhile", async () => {
    const frozen = await categoryId("קפואים");
    await addProduct(draft("גלידה", 1, frozen));
    const result = await deleteProduct((await product("גלידה")).id);
    if (!result.ok) throw new Error("delete failed");
    await deleteCategory(frozen, 1, 0);
    await restoreProduct(result.deleted);
    expect(await shown()).toEqual({ כללי: ["גלידה"] });
  });
});

describe("moveProduct", () => {
  it("reorders within a category", async () => {
    for (const name of ["א", "ב", "ג"]) await addProduct(draft(name));
    const [a, b, c] = await Promise.all(["א", "ב", "ג"].map(product));
    expect(await moveProduct(c.id, c.categoryId, [c.id, a.id, b.id])).toEqual({ ok: true });
    expect(await shown()).toEqual({ כללי: ["ג", "א", "ב"] });
  });

  it("moves a product to another category, in the given place", async () => {
    const dairy = await categoryId("מוצרי חלב");
    await addProduct(draft("חלב", 1, dairy));
    await addProduct(draft("גבינה", 1, dairy));
    await addProduct(draft("שמנת"));
    const [milk, cheese, cream] = await Promise.all(["חלב", "גבינה", "שמנת"].map(product));

    expect(await moveProduct(cream.id, dairy, [milk.id, cream.id, cheese.id])).toEqual({
      ok: true,
    });
    expect(await shown()).toEqual({ "מוצרי חלב": ["חלב", "שמנת", "גבינה"] });
    expect((await product("שמנת")).version).toBe(cream.version + 1);
  });

  it("saves nothing if the category's products changed meanwhile", async () => {
    const dairy = await categoryId("מוצרי חלב");
    await addProduct(draft("חלב", 1, dairy));
    await addProduct(draft("שמנת"));
    const [milk, cream] = await Promise.all(["חלב", "שמנת"].map(product));
    await addProduct(draft("גבינה", 1, dairy)); // added on another device

    expect(await moveProduct(cream.id, dairy, [cream.id, milk.id])).toEqual({
      ok: false,
      reason: "orderChanged",
    });
    expect(await shown()).toEqual({ "מוצרי חלב": ["חלב", "גבינה"], כללי: ["שמנת"] });
  });
});

describe("clearList", () => {
  it("deletes every product, checked or not, and keeps history", async () => {
    await addProduct(draft("חלב"));
    await addProduct(draft("לחם"));
    await setChecked((await product("לחם")).id, true);
    await prisma.purchaseRecord.create({ data: {} });

    expect(await clearList(await revision())).toEqual({ ok: true });
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.purchaseRecord.count()).toBe(1);
  });

  it("deletes nothing if the list changed since the question", async () => {
    await addProduct(draft("חלב"));
    const asked = await revision();
    await addProduct(draft("לחם"));
    expect(await clearList(asked)).toEqual({ ok: false, reason: "listChanged" });
    expect(await prisma.product.count()).toBe(2);
  });
});

describe("getListSnapshot", () => {
  it("has every category in order, with products, at the current revision", async () => {
    await addProduct(draft("חלב", 2, await categoryId("מוצרי חלב")));
    const snapshot = await getListSnapshot();
    expect(snapshot.categories).toHaveLength(12);
    expect(snapshot.categories[0]).toMatchObject({
      name: "מוצרי חלב",
      icon: "🥛",
      products: [{ name: "חלב", quantity: 2, isChecked: false, version: 1 }],
    });
    expect(snapshot.revision).toBe(await revision());
  });
});
