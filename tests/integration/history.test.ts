import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/modules/categories/categories";
import { seedDatabase } from "@/modules/categories/seed";
import {
  HISTORY_PAGE_SIZE,
  addRecordToList,
  deleteHistoryRecord,
  getHistoryRecord,
  listHistory,
} from "@/modules/history/history";
import { updateList } from "@/modules/history/purchase";
import { getListSnapshot } from "@/modules/list/snapshot";
import { addProduct, setChecked } from "@/modules/products/products";
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

async function category(name: string) {
  const found = (await listCategories()).find((item) => item.name === name);
  if (!found) throw new Error(`no category ${name}`);
  return found;
}

async function add(name: string, quantity: number, categoryName: string) {
  const result = validateProduct({ name, quantity, categoryId: (await category(categoryName)).id });
  if (!result.ok) throw new Error("invalid");
  await addProduct(result.draft);
  return prisma.product.findFirstOrThrow({ where: { name } });
}

/** Lists the products, checks them off and buys them: one history record. */
async function buy(items: [string, number, string][]) {
  const ids: string[] = [];
  for (const [name, quantity, categoryName] of items) {
    const product = await add(name, quantity, categoryName);
    await setChecked(product.id, true);
    ids.push(product.id);
  }
  const outcome = await updateList(ids);
  return outcome.recordId!;
}

/** Product → [quantity, category] on the active list. */
async function onList() {
  const { categories } = await getListSnapshot();
  return Object.fromEntries(
    categories.flatMap((c) => c.products.map((p) => [p.name, [p.quantity, c.name]])),
  );
}

describe("listHistory", () => {
  it("shows the newest purchase first, with product and category counts", async () => {
    const first = await buy([["חלב", 1, "מוצרי חלב"]]);
    const second = await buy([
      ["חלב", 2, "מוצרי חלב"],
      ["גבינה", 1, "מוצרי חלב"],
      ["מים", 6, "משקאות"],
    ]);
    await prisma.purchaseRecord.update({
      where: { id: first },
      data: { purchasedAt: new Date("2026-01-01T10:00:00Z") },
    });

    const { cards, nextCursor } = await listHistory();
    expect(cards.map((card) => card.id)).toEqual([second, first]);
    expect(cards[0]).toMatchObject({ productCount: 3, categoryCount: 2, icons: ["🥛", "🥤"] });
    expect(cards[1]).toMatchObject({ productCount: 1, categoryCount: 1 });
    expect(nextCursor).toBeNull();
  });

  it("comes a page at a time", async () => {
    const total = HISTORY_PAGE_SIZE + 3;
    await prisma.purchaseRecord.createMany({
      data: Array.from({ length: total }, (_, index) => ({
        purchasedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
    });
    const first = await listHistory();
    expect(first.cards).toHaveLength(HISTORY_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const second = await listHistory(first.nextCursor!);
    expect(second.cards).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    const all = [...first.cards, ...second.cards].map((card) => card.purchasedAt.getTime());
    expect(all).toEqual([...all].sort((a, b) => b - a));
    expect(new Set(all).size).toBe(total);
  });
});

describe("getHistoryRecord", () => {
  it("has the products as they were bought, in the list's order", async () => {
    const id = await buy([
      ["מים", 6, "משקאות"],
      ["חלב", 2, "מוצרי חלב"],
    ]);
    const record = await getHistoryRecord(id);
    expect(
      record?.items.map((item) => [item.productName, item.quantity, item.categoryName]),
    ).toEqual([
      ["חלב", 2, "מוצרי חלב"],
      ["מים", 6, "משקאות"],
    ]);
    expect(await getHistoryRecord(crypto.randomUUID())).toBeNull();
  });
});

describe("addRecordToList", () => {
  it("adds missing products to their categories, and adds up existing ones in theirs", async () => {
    const id = await buy([
      ["חלב", 2, "מוצרי חלב"],
      ["מים", 6, "משקאות"],
    ]);
    await add("חלב", 1, "כללי"); // listed again since, in another category
    const before = (await getListSnapshot()).revision;

    expect(await addRecordToList(id)).toEqual({ ok: true, added: 1, merged: 1, capped: 0 });
    expect(await onList()).toEqual({ חלב: [3, "כללי"], מים: [6, "משקאות"] });
    expect((await getListSnapshot()).revision).toBe(before + 1);
    // The record itself stays.
    expect(await getHistoryRecord(id)).not.toBeNull();
  });

  it("finds the category by id: renamed counts, a new one with the old name doesn't", async () => {
    const id = await buy([["גלידה", 1, "קפואים"]]);
    const frozen = await category("קפואים");
    await updateCategory(frozen.id, frozen.version, {
      name: "מוקפאים",
      normalizedName: "מוקפאים",
      color: "sky",
      icon: "🧊",
    });
    await createCategory({ name: "קפואים", normalizedName: "קפואים", color: "red", icon: "❄️" });

    await addRecordToList(id);
    expect(await onList()).toEqual({ גלידה: [1, "מוקפאים"] });
  });

  it("uses General when the category was deleted", async () => {
    const id = await buy([["גלידה", 1, "קפואים"]]);
    const frozen = await category("קפואים");
    await deleteCategory(frozen.id, frozen.version, 0);
    await addRecordToList(id);
    expect(await onList()).toEqual({ גלידה: [1, "כללי"] });
  });

  it("caps quantities at 999, and counts how many were capped", async () => {
    const id = await buy([["מים", 10, "משקאות"]]);
    await add("מים", 995, "משקאות");
    expect(await addRecordToList(id)).toEqual({ ok: true, added: 0, merged: 1, capped: 1 });
    expect(await onList()).toEqual({ מים: [999, "משקאות"] });
  });

  it("never lists a product twice when added from both phones at once", async () => {
    const id = await buy([
      ["חלב", 1, "מוצרי חלב"],
      ["לחם", 1, "לחמים ומאפים"],
    ]);
    const results = await Promise.all([addRecordToList(id), addRecordToList(id)]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await onList()).toEqual({ חלב: [2, "מוצרי חלב"], לחם: [2, "לחמים ומאפים"] });
  });

  it("reports a deleted record", async () => {
    expect(await addRecordToList(crypto.randomUUID())).toEqual({ ok: false, reason: "notFound" });
  });
});

describe("deleteHistoryRecord", () => {
  it("deletes the record and its items, and nothing on the list", async () => {
    const id = await buy([["חלב", 1, "מוצרי חלב"]]);
    await add("לחם", 1, "כללי");
    const before = (await getListSnapshot()).revision;

    expect(await deleteHistoryRecord(id)).toBe(true);
    expect(await prisma.purchaseRecordItem.count()).toBe(0);
    expect(await onList()).toEqual({ לחם: [1, "כללי"] });
    expect((await getListSnapshot()).revision).toBe(before + 1);
    expect(await deleteHistoryRecord(id)).toBe(false);
  });
});
