import { prisma } from "@/lib/prisma";

/**
 * Empties every table. TRUNCATE skips row triggers, so this also removes the system
 * category, which a DELETE can't.
 */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "purchase_record_item", "purchase_record", "product", "category", "list_state" CASCADE',
  );
}

/** Creates a category with sensible defaults. */
export function createCategory(
  data: Partial<{
    name: string;
    normalizedName: string;
    isSystem: boolean;
    sortOrder: number;
  }> = {},
) {
  const name = data.name ?? "מוצרי חלב";
  return prisma.category.create({
    data: {
      name,
      normalizedName: data.normalizedName ?? name,
      color: "blue",
      icon: "🥛",
      sortOrder: data.sortOrder ?? 0,
      isSystem: data.isSystem ?? false,
    },
  });
}

/** Creates a product in a category, with sensible defaults. */
export function createProduct(
  categoryId: string,
  data: Partial<{ name: string; normalizedName: string; quantity: number }> = {},
) {
  const name = data.name ?? "חלב";
  return prisma.product.create({
    data: {
      categoryId,
      name,
      normalizedName: data.normalizedName ?? name,
      quantity: data.quantity ?? 1,
      sortOrder: 0,
    },
  });
}
