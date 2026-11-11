import type { PrismaClient } from "@/generated/prisma/client";
import { appConfig } from "@/config/app.config";
import { cleanName, normalizeName } from "@/lib/names";
import messages from "../../../messages/he.json";

export type SeedResult = { createdCategories: number };

/** The default categories from app.config.ts, with their Hebrew names, in order. */
export function defaultCategoryRows() {
  const names: Record<string, string> = messages.categories;
  return appConfig.defaultCategories.map((category, index) => {
    const name = cleanName(names[category.key] ?? "");
    if (!name) throw new Error(`No Hebrew name for category "${category.key}"`);
    return {
      name,
      normalizedName: normalizeName(name),
      color: category.color,
      icon: category.emoji,
      sortOrder: index,
      isSystem: "isSystem" in category && category.isSystem,
    };
  });
}

/**
 * Prepares an empty database (spec 6.2): the list_state row, and the default
 * categories. Safe to run again: it creates the categories only while there are none,
 * so it never brings back a category the users deleted or undoes a rename.
 */
export async function seedDatabase(db: PrismaClient): Promise<SeedResult> {
  return db.$transaction(async (tx) => {
    await tx.listState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    if ((await tx.category.count()) > 0) return { createdCategories: 0 };
    const { count } = await tx.category.createMany({ data: defaultCategoryRows() });
    return { createdCategories: count };
  });
}
