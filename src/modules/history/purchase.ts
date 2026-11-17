import "server-only";
import { prisma } from "@/lib/prisma";
import { bumpRevision } from "@/modules/list/revision";

/** What "update list" did. */
export type PurchaseOutcome = {
  /** Products bought: recorded in history and removed from the list. */
  purchased: number;
  /** Products the user saw checked that weren't anymore (unchecked or deleted meanwhile). */
  skipped: number;
  /** The new history record, if anything was bought. */
  recordId: string | null;
};

/**
 * "Update list" (spec 9.1): buys the products the user saw checked, and only those still
 * checked. In one transaction it records them in a new history record, as they are now
 * (names, quantities and categories copied, spec 9.2), and removes them from the list.
 * Nothing else changes. With nothing left to buy, no record is created.
 */
export async function updateList(seenIds: readonly string[]): Promise<PurchaseOutcome> {
  const seen = [...new Set(seenIds)];
  return prisma.$transaction(async (tx) => {
    // Locks the products by id (the app's lock order; categories aren't locked, their
    // names, colors and emoji are only copied). Unchecked meanwhile: not taken.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM product
      WHERE id = ANY(${seen}::text[]) AND "isChecked"
      ORDER BY id FOR UPDATE`;
    // Then reads them in the list's order, for the record.
    const products = await tx.$queryRaw<
      {
        id: string;
        name: string;
        normalizedName: string;
        quantity: number;
        categoryId: string;
        categoryName: string;
        categoryColor: string;
        categoryIcon: string;
      }[]
    >`
      SELECT p.id, p.name, p."normalizedName", p.quantity, p."categoryId",
             c.name AS "categoryName", c.color AS "categoryColor", c.icon AS "categoryIcon"
      FROM product p JOIN category c ON c.id = p."categoryId"
      WHERE p.id = ANY(${locked.map((row) => row.id)}::text[])
      ORDER BY c."sortOrder", c."createdAt", p."sortOrder", p."createdAt"`;

    if (products.length === 0) {
      return { purchased: 0, skipped: seen.length, recordId: null };
    }

    const record = await tx.purchaseRecord.create({
      data: {
        items: {
          create: products.map((product, position) => ({
            productName: product.name,
            normalizedName: product.normalizedName,
            quantity: product.quantity,
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            categoryColor: product.categoryColor,
            categoryIcon: product.categoryIcon,
            position,
          })),
        },
      },
      select: { id: true },
    });
    await tx.product.deleteMany({ where: { id: { in: products.map((product) => product.id) } } });
    await bumpRevision(tx);
    return {
      purchased: products.length,
      skipped: seen.length - products.length,
      recordId: record.id,
    };
  });
}
