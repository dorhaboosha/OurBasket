import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { appConfig } from "@/config/app.config";
import { prisma } from "@/lib/prisma";
import { bumpRevision } from "@/modules/list/revision";

// The purchase history (spec 10): records created by "update list" (purchase.ts), read,
// added back to the list, and deleted. History never changes otherwise: its items are
// snapshots, not links to products or categories.

const MAX = appConfig.limits.quantityMax;

/** One purchase, as a card on the history screen (spec 10.2). */
export type HistoryCard = {
  id: string;
  purchasedAt: Date;
  productCount: number;
  categoryCount: number;
  /** The categories' emoji, in the list's order then, once each. */
  icons: string[];
};

/** A page of cards, newest first, and where the next page starts (null: no more). */
export type HistoryPage = { cards: HistoryCard[]; nextCursor: string | null };

/** One product of a purchase, as it was bought (spec 9.2). */
export type HistoryItem = {
  id: string;
  productName: string;
  quantity: number;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
};

export type HistoryRecord = {
  id: string;
  purchasedAt: Date;
  /** In the list's order when bought: categories, then products. */
  items: HistoryItem[];
};

export const HISTORY_PAGE_SIZE = 20;

/**
 * The newest purchases first, a page at a time (spec 19: history isn't loaded all at
 * once). cursor is the last card's id from the previous page.
 */
export async function listHistory(cursor?: string): Promise<HistoryPage> {
  const records = await prisma.purchaseRecord.findMany({
    orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    take: HISTORY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      purchasedAt: true,
      items: {
        orderBy: { position: "asc" },
        select: { categoryId: true, categoryIcon: true },
      },
    },
  });
  const page = records.slice(0, HISTORY_PAGE_SIZE);
  return {
    cards: page.map((record) => {
      const categories = new Map<string, string>();
      for (const item of record.items) categories.set(item.categoryId, item.categoryIcon);
      return {
        id: record.id,
        purchasedAt: record.purchasedAt,
        productCount: record.items.length,
        categoryCount: categories.size,
        icons: [...categories.values()],
      };
    }),
    nextCursor: records.length > HISTORY_PAGE_SIZE ? page[page.length - 1].id : null,
  };
}

/** One purchase with its products, or null if it doesn't exist (deleted meanwhile). */
export async function getHistoryRecord(id: string): Promise<HistoryRecord | null> {
  return prisma.purchaseRecord.findUnique({
    where: { id },
    select: {
      id: true,
      purchasedAt: true,
      items: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          productName: true,
          quantity: true,
          categoryId: true,
          categoryName: true,
          categoryColor: true,
          categoryIcon: true,
        },
      },
    },
  });
}

/** What "add to list" did (spec 10.4). */
export type AddToListOutcome =
  { ok: true; added: number; merged: number; capped: number } | { ok: false; reason: "notFound" };

/**
 * "Add to list" (spec 10.4): puts a purchase's products back on the list. A product that
 * is already listed gets the quantity added (up to 999) and keeps its category. Another
 * goes to its category from then, found by id (so a renamed category still counts, and a
 * new one with the old name doesn't), or to General if that category was deleted.
 */
export async function addRecordToList(recordId: string): Promise<AddToListOutcome> {
  try {
    return await addRecordToListOnce(recordId);
  } catch (error) {
    // The same product added at the same moment (by the other phone, or another record):
    // running again merges into it instead (as for a single add, spec 18).
    if (!isUniqueViolation(error)) throw error;
    return addRecordToListOnce(recordId);
  }
}

async function addRecordToListOnce(recordId: string): Promise<AddToListOutcome> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.purchaseRecord.findUnique({
      where: { id: recordId },
      select: {
        items: {
          orderBy: { position: "asc" },
          select: { productName: true, normalizedName: true, quantity: true, categoryId: true },
        },
      },
    });
    if (!record) return { ok: false as const, reason: "notFound" as const };

    // The app's lock order: categories first (kept until the end, so none is deleted
    // midway), then the products to add to, by id; list_state last.
    const categoryIds = [...new Set(record.items.map((item) => item.categoryId))];
    const categories = await tx.$queryRaw<{ id: string; isSystem: boolean }[]>`
      SELECT id, "isSystem" FROM category
      WHERE id = ANY(${categoryIds}::text[]) OR "isSystem"
      ORDER BY id FOR KEY SHARE`;
    const existingCategories = new Set(categories.map((category) => category.id));
    const general = categories.find((category) => category.isSystem);
    if (!general) throw new Error("The system category is missing");

    const names = record.items.map((item) => item.normalizedName);
    const listed = await tx.$queryRaw<{ id: string; normalizedName: string; quantity: number }[]>`
      SELECT id, "normalizedName", quantity FROM product
      WHERE "normalizedName" = ANY(${names}::text[])
      ORDER BY id FOR UPDATE`;
    const byName = new Map(listed.map((product) => [product.normalizedName, product]));

    let added = 0;
    let merged = 0;
    let capped = 0;
    const nextOrder = new Map<string, number>();
    for (const item of record.items) {
      const existing = byName.get(item.normalizedName);
      if (existing) {
        const total = existing.quantity + item.quantity;
        if (total > MAX) capped += 1;
        await tx.product.update({
          where: { id: existing.id },
          data: { quantity: Math.min(total, MAX), version: { increment: 1 } },
        });
        merged += 1;
        continue;
      }
      const categoryId = existingCategories.has(item.categoryId) ? item.categoryId : general.id;
      if (!nextOrder.has(categoryId)) {
        const last = await tx.product.aggregate({
          where: { categoryId },
          _max: { sortOrder: true },
        });
        nextOrder.set(categoryId, (last._max.sortOrder ?? -1) + 1);
      }
      const sortOrder = nextOrder.get(categoryId)!;
      nextOrder.set(categoryId, sortOrder + 1);
      await tx.product.create({
        data: {
          name: item.productName,
          normalizedName: item.normalizedName,
          quantity: item.quantity,
          categoryId,
          sortOrder,
        },
      });
      added += 1;
    }
    if (added + merged > 0) await bumpRevision(tx);
    return { ok: true as const, added, merged, capped };
  });
}

/**
 * Deletes a purchase and its items (spec 10.5), for example after "update list" by
 * mistake. It doesn't put anything back on the list.
 */
export async function deleteHistoryRecord(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.purchaseRecord.deleteMany({ where: { id } });
    if (count === 0) return false;
    // History is shared too: the other phone reloads on this revision (step 8).
    await bumpRevision(tx);
    return true;
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
