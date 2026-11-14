import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "@/modules/categories/categories";
import { seedDatabase } from "@/modules/categories/seed";
import type { CategoryDraft } from "@/modules/categories/validation";
import { createProduct, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  await seedDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

const draft = (name: string, extra: Partial<CategoryDraft> = {}): CategoryDraft => ({
  name,
  normalizedName: name.toLowerCase(),
  color: "pink",
  icon: "🎉",
  ...extra,
});

async function revision() {
  return (await prisma.listState.findUniqueOrThrow({ where: { id: 1 } })).revision;
}

async function byName(name: string) {
  const category = (await listCategories()).find((item) => item.name === name);
  if (!category) throw new Error(`no category ${name}`);
  return category;
}

describe("listCategories", () => {
  it("lists the seeded categories in order, with product counts", async () => {
    const dairy = await byName("מוצרי חלב");
    await createProduct(dairy.id, { name: "חלב" });
    await createProduct(dairy.id, { name: "גבינה" });

    const categories = await listCategories();
    expect(categories).toHaveLength(12);
    expect(categories[0]).toMatchObject({ name: "מוצרי חלב", productCount: 2, icon: "🥛" });
    expect(categories.at(-1)).toMatchObject({ name: "כללי", isSystem: true, productCount: 0 });
  });
});

describe("createCategory", () => {
  it("adds the category at the end and raises the revision", async () => {
    const before = await revision();
    const result = await createCategory(draft("Party"));
    expect(result).toMatchObject({ ok: true, category: { name: "Party", productCount: 0 } });
    expect((await listCategories()).at(-1)?.name).toBe("Party");
    expect(await revision()).toBe(before + 1);
  });

  it("refuses a name another category has, after normalizing", async () => {
    await createCategory(draft("Party"));
    const before = await revision();
    expect(await createCategory(draft("PARTY", { normalizedName: "party" }))).toEqual({
      ok: false,
      reason: "nameTaken",
    });
    expect(await revision()).toBe(before);
  });
});

describe("updateCategory", () => {
  it("saves the change, raises the version and the revision", async () => {
    const dairy = await byName("מוצרי חלב");
    const before = await revision();
    expect(
      await updateCategory(dairy.id, dairy.version, draft("חלב וביצים", { color: "sky" })),
    ).toEqual({ ok: true });
    expect(await byName("חלב וביצים")).toMatchObject({
      id: dairy.id,
      color: "sky",
      icon: "🎉",
      version: dairy.version + 1,
    });
    expect(await revision()).toBe(before + 1);
  });

  it("can rename the system category", async () => {
    const general = await byName("כללי");
    expect(await updateCategory(general.id, general.version, draft("שונות"))).toEqual({
      ok: true,
    });
    expect(await byName("שונות")).toMatchObject({ isSystem: true });
  });

  it("refuses a save based on an older version", async () => {
    const dairy = await byName("מוצרי חלב");
    await updateCategory(dairy.id, dairy.version, draft("first"));
    expect(await updateCategory(dairy.id, dairy.version, draft("second"))).toEqual({
      ok: false,
      reason: "stale",
    });
    expect((await listCategories())[0].name).toBe("first");
  });

  it("reports a deleted category", async () => {
    const dairy = await byName("מוצרי חלב");
    await deleteCategory(dairy.id, dairy.version, 0);
    expect(await updateCategory(dairy.id, dairy.version, draft("x"))).toEqual({
      ok: false,
      reason: "notFound",
    });
  });

  it("refuses another category's name, but allows keeping its own", async () => {
    const dairy = await byName("מוצרי חלב");
    expect(
      await updateCategory(dairy.id, dairy.version, draft("משקאות", { normalizedName: "משקאות" })),
    ).toEqual({ ok: false, reason: "nameTaken" });
    expect(
      await updateCategory(
        dairy.id,
        dairy.version,
        draft("מוצרי חלב", { normalizedName: "מוצרי חלב" }),
      ),
    ).toEqual({ ok: true });
  });
});

describe("deleteCategory", () => {
  it("deletes the category with its products, and leaves history alone", async () => {
    const dairy = await byName("מוצרי חלב");
    const drinks = await byName("משקאות");
    await createProduct(dairy.id, { name: "חלב" });
    await createProduct(dairy.id, { name: "גבינה" });
    await createProduct(drinks.id, { name: "מים" });
    await prisma.purchaseRecord.create({
      data: {
        items: {
          create: {
            productName: "חלב",
            normalizedName: "חלב",
            quantity: 1,
            categoryId: dairy.id,
            categoryName: dairy.name,
            categoryColor: dairy.color,
            categoryIcon: dairy.icon,
          },
        },
      },
    });
    const before = await revision();

    expect(await deleteCategory(dairy.id, dairy.version, 2)).toEqual({ ok: true });
    expect((await listCategories()).map((c) => c.name)).not.toContain("מוצרי חלב");
    expect(await prisma.product.findMany({ select: { name: true } })).toEqual([{ name: "מים" }]);
    expect(await prisma.purchaseRecordItem.count({ where: { categoryId: dairy.id } })).toBe(1);
    expect(await revision()).toBe(before + 1);
  });

  it("never deletes the system category", async () => {
    const general = await byName("כללי");
    expect(await deleteCategory(general.id, general.version, 0)).toEqual({
      ok: false,
      reason: "system",
    });
    expect(await byName("כללי")).toBeDefined();
  });

  it("deletes nothing when the product count changed since the confirmation", async () => {
    const dairy = await byName("מוצרי חלב");
    await createProduct(dairy.id, { name: "חלב" });
    expect(await deleteCategory(dairy.id, dairy.version, 0)).toEqual({
      ok: false,
      reason: "productsChanged",
    });
    expect(await prisma.product.count()).toBe(1);
  });

  it("deletes nothing when the category was edited meanwhile", async () => {
    const dairy = await byName("מוצרי חלב");
    await updateCategory(dairy.id, dairy.version, draft("renamed"));
    expect(await deleteCategory(dairy.id, dairy.version, 0)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("reports a category that is already gone", async () => {
    expect(await deleteCategory(crypto.randomUUID(), 1, 0)).toEqual({
      ok: false,
      reason: "notFound",
    });
  });
});

describe("reorderCategories", () => {
  it("saves the new order and raises the revision", async () => {
    const ids = (await listCategories()).map((c) => c.id);
    const reversed = [...ids].reverse();
    const before = await revision();
    expect(await reorderCategories(reversed)).toEqual({ ok: true });
    expect((await listCategories()).map((c) => c.id)).toEqual(reversed);
    expect(await revision()).toBe(before + 1);
  });

  it("changes nothing unless the ids are exactly the current categories", async () => {
    const ids = (await listCategories()).map((c) => c.id);
    const extra = await createCategory(draft("new"));
    if (!extra.ok) throw new Error("create failed");
    const before = await revision();

    for (const attempt of [
      ids, // missing the new one
      [...ids, extra.category.id, ids[0]], // a duplicate
      [...ids, crypto.randomUUID()], // an unknown id
      [],
    ]) {
      expect(await reorderCategories(attempt)).toEqual({ ok: false, reason: "orderChanged" });
    }
    expect((await listCategories()).map((c) => c.id)).toEqual([...ids, extra.category.id]);
    expect(await revision()).toBe(before);
  });
});
