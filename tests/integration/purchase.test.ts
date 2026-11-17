import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteCategory, listCategories, updateCategory } from "@/modules/categories/categories";
import { seedDatabase } from "@/modules/categories/seed";
import { updateList } from "@/modules/history/purchase";
import { getListSnapshot } from "@/modules/list/snapshot";
import { addProduct, deleteProduct, setChecked } from "@/modules/products/products";
import { validateProduct } from "@/modules/products/validation";
import { resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  await seedDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

async function categoryId(name: string) {
  const category = (await listCategories()).find((item) => item.name === name);
  if (!category) throw new Error(`no category ${name}`);
  return category;
}

/** Adds products to a category; checked ones are checked off. Returns name → id. */
async function list(
  category: string,
  items: { name: string; quantity?: number; checked?: boolean }[],
) {
  const { id } = await categoryId(category);
  const ids: Record<string, string> = {};
  for (const item of items) {
    const result = validateProduct({
      name: item.name,
      quantity: item.quantity ?? 1,
      categoryId: id,
    });
    if (!result.ok) throw new Error("invalid");
    await addProduct(result.draft);
    const product = await prisma.product.findFirstOrThrow({ where: { name: item.name } });
    if (item.checked) await setChecked(product.id, true);
    ids[item.name] = product.id;
  }
  return ids;
}

async function remaining() {
  return (await prisma.product.findMany({ select: { name: true }, orderBy: { name: "asc" } })).map(
    (product) => product.name,
  );
}

async function records() {
  return prisma.purchaseRecord.findMany({
    include: { items: { orderBy: { position: "asc" } } },
  });
}

describe("updateList", () => {
  it("records the checked products, in list order, removes them, and keeps the rest", async () => {
    const drinks = await list("משקאות", [{ name: "מים", quantity: 6, checked: true }]);
    const dairy = await list("מוצרי חלב", [
      { name: "חלב", quantity: 2, checked: true },
      { name: "גבינה" },
      { name: "יוגורט", quantity: 4, checked: true },
    ]);
    const before = (await getListSnapshot()).revision;

    const outcome = await updateList([drinks["מים"], dairy["חלב"], dairy["יוגורט"]]);
    expect(outcome).toMatchObject({ purchased: 3, skipped: 0 });
    expect(await remaining()).toEqual(["גבינה"]);

    const [record] = await records();
    expect(record.id).toBe(outcome.recordId);
    // Dairy comes before drinks in the category order.
    expect(
      record.items.map((item) => [
        item.productName,
        item.quantity,
        item.categoryName,
        item.position,
      ]),
    ).toEqual([
      ["חלב", 2, "מוצרי חלב", 0],
      ["יוגורט", 4, "מוצרי חלב", 1],
      ["מים", 6, "משקאות", 2],
    ]);
    expect(record.items[0]).toMatchObject({ categoryColor: "blue", categoryIcon: "🥛" });
    expect((await getListSnapshot()).revision).toBe(before + 1);
  });

  it("buys only what the user saw checked and is still checked", async () => {
    const ids = await list("כללי", [
      { name: "seen and checked", checked: true },
      { name: "unchecked meanwhile", checked: true },
      { name: "checked meanwhile, not seen" },
      { name: "deleted meanwhile", checked: true },
    ]);
    const seen = [ids["seen and checked"], ids["unchecked meanwhile"], ids["deleted meanwhile"]];
    // Meanwhile, on the other phone:
    await setChecked(ids["unchecked meanwhile"], false);
    await setChecked(ids["checked meanwhile, not seen"], true);
    await deleteProduct(ids["deleted meanwhile"]);

    expect(await updateList(seen)).toMatchObject({ purchased: 1, skipped: 2 });
    expect(await remaining()).toEqual(["checked meanwhile, not seen", "unchecked meanwhile"]);
    const [record] = await records();
    expect(record.items.map((item) => item.productName)).toEqual(["seen and checked"]);
  });

  it("creates no record, and changes nothing, when nothing is left to buy", async () => {
    const ids = await list("כללי", [{ name: "לחם", checked: true }]);
    await setChecked(ids["לחם"], false);
    const before = (await getListSnapshot()).revision;

    expect(await updateList([ids["לחם"]])).toEqual({ purchased: 0, skipped: 1, recordId: null });
    expect(await updateList([])).toEqual({ purchased: 0, skipped: 0, recordId: null });
    expect(await records()).toEqual([]);
    expect(await remaining()).toEqual(["לחם"]);
    expect((await getListSnapshot()).revision).toBe(before);
  });

  it("keeps history as it was after the category is renamed or deleted", async () => {
    const ids = await list("קפואים", [{ name: "גלידה", checked: true }]);
    await updateList([ids["גלידה"]]);
    const frozen = await categoryId("קפואים");
    await updateCategory(frozen.id, frozen.version, {
      name: "מוקפאים",
      normalizedName: "מוקפאים",
      color: "red",
      icon: "🍦",
    });
    const renamed = await categoryId("מוקפאים");
    await deleteCategory(renamed.id, renamed.version, 0);

    const [record] = await records();
    expect(record.items[0]).toMatchObject({
      productName: "גלידה",
      categoryId: frozen.id,
      categoryName: "קפואים",
      categoryColor: "sky",
      categoryIcon: "🧊",
    });
  });

  it("buys each product once, even when both phones update at the same moment", async () => {
    const ids = await list("כללי", [
      { name: "א", checked: true },
      { name: "ב", checked: true },
    ]);
    const both = [ids["א"], ids["ב"]];
    const outcomes = await Promise.all([updateList(both), updateList(both)]);

    expect(outcomes.map((outcome) => outcome.purchased).sort()).toEqual([0, 2]);
    const all = await records();
    expect(all).toHaveLength(1);
    expect(all[0].items).toHaveLength(2);
    expect(await remaining()).toEqual([]);
  });
});
