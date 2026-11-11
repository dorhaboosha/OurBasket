import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCategory, createProduct, resetDatabase } from "./helpers";

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("connection", () => {
  it("uses the test database, not the development one", async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
    expect(row.db).toBe("ourbasket_test");
  });

  it("stores times with their time zone", async () => {
    const [row] = await prisma.$queryRaw<{ type: string }[]>`
      select data_type as type from information_schema.columns
      where table_name = 'purchase_record' and column_name = 'purchasedAt'`;
    expect(row.type).toBe("timestamp with time zone");
  });
});

describe("products", () => {
  it("can't be listed twice under the same normalized name, in any category", async () => {
    const dairy = await createCategory({ name: "מוצרי חלב" });
    const general = await createCategory({ name: "כללי", sortOrder: 1 });
    await createProduct(dairy.id, { name: "חלב", normalizedName: "חלב" });
    await expect(
      createProduct(general.id, { name: "חלב ", normalizedName: "חלב" }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it.each([0, -1, 1000])("rejects a quantity of %i", async (quantity) => {
    const category = await createCategory();
    await expect(createProduct(category.id, { quantity })).rejects.toThrow(
      /product_quantity_check/,
    );
  });

  it.each([1, 999])("accepts a quantity of %i", async (quantity) => {
    const category = await createCategory();
    const product = await createProduct(category.id, { quantity });
    expect(product.quantity).toBe(quantity);
  });

  it("rejects a blank name or one longer than 60 characters", async () => {
    const category = await createCategory();
    await expect(createProduct(category.id, { name: "   ", normalizedName: "x" })).rejects.toThrow(
      /product_name_check/,
    );
    await expect(
      createProduct(category.id, { name: "א".repeat(61), normalizedName: "y" }),
    ).rejects.toThrow(/product_name_check/);
    const longest = await createProduct(category.id, { name: "א".repeat(60) });
    expect(longest.name).toHaveLength(60);
  });

  it("start unchecked, at version 1", async () => {
    const product = await createProduct((await createCategory()).id);
    expect(product).toMatchObject({ isChecked: false, version: 1 });
  });
});

describe("categories", () => {
  it("have unique normalized names", async () => {
    await createCategory({ name: "משקאות", normalizedName: "משקאות" });
    await expect(
      createCategory({ name: "משקאות ", normalizedName: "משקאות", sortOrder: 1 }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("can't be deleted while they still have products", async () => {
    const category = await createCategory();
    await createProduct(category.id);
    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toThrow();
    expect(await prisma.category.count()).toBe(1);
  });

  it("can be deleted together with their products in one transaction", async () => {
    const category = await createCategory();
    await createProduct(category.id);
    await prisma.$transaction([
      prisma.product.deleteMany({ where: { categoryId: category.id } }),
      prisma.category.delete({ where: { id: category.id } }),
    ]);
    expect(await prisma.category.count()).toBe(0);
  });
});

describe("the system category", () => {
  it("can't be deleted", async () => {
    const general = await createCategory({ name: "כללי", isSystem: true });
    await expect(prisma.category.delete({ where: { id: general.id } })).rejects.toThrow(
      /can't be deleted/,
    );
    await expect(prisma.category.deleteMany()).rejects.toThrow(/can't be deleted/);
    expect(await prisma.category.count()).toBe(1);
  });

  it("can be renamed and recolored, but not stop being the system category", async () => {
    const general = await createCategory({ name: "כללי", isSystem: true });
    const renamed = await prisma.category.update({
      where: { id: general.id },
      data: { name: "שונות", normalizedName: "שונות", color: "red", icon: "📦" },
    });
    expect(renamed).toMatchObject({ name: "שונות", isSystem: true });
    await expect(
      prisma.category.update({ where: { id: general.id }, data: { isSystem: false } }),
    ).rejects.toThrow(/can't stop being the system category/);
  });

  it("is the only one", async () => {
    await createCategory({ name: "כללי", isSystem: true });
    await expect(createCategory({ name: "עוד", isSystem: true, sortOrder: 1 })).rejects.toThrow(
      /only one system category/,
    );
    const other = await createCategory({ name: "עוד", sortOrder: 1 });
    await expect(
      prisma.category.update({ where: { id: other.id }, data: { isSystem: true } }),
    ).rejects.toThrow(/only one system category/);
  });

  it("allows other categories to be deleted", async () => {
    await createCategory({ name: "כללי", isSystem: true });
    const other = await createCategory({ name: "קפואים", sortOrder: 1 });
    await prisma.category.delete({ where: { id: other.id } });
    expect(await prisma.category.count()).toBe(1);
  });
});

describe("list_state", () => {
  it("holds a single row with id 1", async () => {
    await prisma.listState.create({ data: {} });
    await expect(prisma.listState.create({ data: { id: 2 } })).rejects.toThrow(
      /list_state_single_row_check/,
    );
  });
});

describe("purchase history", () => {
  async function createRecord(categoryId: string) {
    return prisma.purchaseRecord.create({
      data: {
        items: {
          create: {
            productName: "חלב",
            normalizedName: "חלב",
            quantity: 2,
            categoryId,
            categoryName: "מוצרי חלב",
            categoryColor: "blue",
            categoryIcon: "🥛",
          },
        },
      },
      include: { items: true },
    });
  }

  it("keeps an item's category snapshot after the category is deleted", async () => {
    const category = await createCategory();
    const record = await createRecord(category.id);
    await prisma.category.delete({ where: { id: category.id } });
    const item = await prisma.purchaseRecordItem.findUniqueOrThrow({
      where: { id: record.items[0].id },
    });
    expect(item).toMatchObject({ categoryId: category.id, categoryName: "מוצרי חלב" });
  });

  it("deletes a record's items together with the record", async () => {
    const record = await createRecord((await createCategory()).id);
    await prisma.purchaseRecord.delete({ where: { id: record.id } });
    expect(await prisma.purchaseRecordItem.count()).toBe(0);
  });

  it("rejects an item quantity outside 1–999", async () => {
    const record = await createRecord((await createCategory()).id);
    await expect(
      prisma.purchaseRecordItem.update({
        where: { id: record.items[0].id },
        data: { quantity: 0 },
      }),
    ).rejects.toThrow(/purchase_record_item_quantity_check/);
  });
});
