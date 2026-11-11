import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appConfig } from "@/config/app.config";
import { prisma } from "@/lib/prisma";
import { seedDatabase } from "@/modules/categories/seed";
import { resetDatabase } from "./helpers";

beforeEach(resetDatabase);

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

function categoriesInOrder() {
  return prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
}

describe("seedDatabase", () => {
  it("creates the 12 default categories in order, with names, emoji and colors", async () => {
    expect(await seedDatabase(prisma)).toEqual({ createdCategories: 12 });
    const categories = await categoriesInOrder();
    expect(categories.map((category) => category.name)).toEqual([
      "מוצרי חלב",
      "פירות וירקות",
      "בשר, עוף ודגים",
      "לחמים ומאפים",
      "מוצרי מזווה",
      "קפואים",
      "חטיפים ומתוקים",
      "משקאות",
      "מוצרי ניקיון",
      "מוצרי טיפוח והיגיינה",
      "ציוד לבית",
      "כללי",
    ]);
    expect(categories.map((category) => category.icon)).toEqual(
      appConfig.defaultCategories.map((category) => category.emoji),
    );
    expect(categories.map((category) => category.color)).toEqual(
      appConfig.defaultCategories.map((category) => category.color),
    );
    expect(categories.map((category) => category.sortOrder)).toEqual([...Array(12).keys()]);
    expect(categories.every((category) => category.version === 1)).toBe(true);
  });

  it("makes General, and only General, the system category", async () => {
    await seedDatabase(prisma);
    const system = await prisma.category.findMany({ where: { isSystem: true } });
    expect(system.map((category) => category.name)).toEqual(["כללי"]);
  });

  it("creates the list_state row at revision 0", async () => {
    await seedDatabase(prisma);
    expect(await prisma.listState.findMany()).toEqual([{ id: 1, revision: 0 }]);
  });

  it("does nothing the second time", async () => {
    await seedDatabase(prisma);
    expect(await seedDatabase(prisma)).toEqual({ createdCategories: 0 });
    expect(await prisma.category.count()).toBe(12);
    expect(await prisma.listState.count()).toBe(1);
  });

  it("doesn't bring back a deleted category or undo a rename", async () => {
    await seedDatabase(prisma);
    await prisma.category.delete({ where: { normalizedName: "קפואים" } });
    await prisma.category.update({
      where: { normalizedName: "משקאות" },
      data: { name: "שתייה", normalizedName: "שתייה" },
    });
    await seedDatabase(prisma);
    const names = (await categoriesInOrder()).map((category) => category.name);
    expect(names).toHaveLength(11);
    expect(names).not.toContain("קפואים");
    expect(names).toContain("שתייה");
    expect(names).not.toContain("משקאות");
  });

  it("keeps the list revision when run again", async () => {
    await seedDatabase(prisma);
    await prisma.listState.update({ where: { id: 1 }, data: { revision: 7 } });
    await seedDatabase(prisma);
    expect((await prisma.listState.findUniqueOrThrow({ where: { id: 1 } })).revision).toBe(7);
  });
});
