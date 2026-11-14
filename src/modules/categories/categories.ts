import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { bumpRevision } from "@/modules/list/revision";
import type { CategoryDraft } from "./validation";

// Category management (spec 7). Both users may change any category. Every change runs
// in a transaction that also raises the list revision.

/** A category as the screens need it. */
export type CategoryItem = {
  id: string;
  name: string;
  color: string;
  icon: string;
  isSystem: boolean;
  version: number;
  /** Products on the active list in this category. */
  productCount: number;
};

export type CategoryFailureReason =
  /** Another category already has this name (after normalizing). */
  | "nameTaken"
  /** Deleted meanwhile. */
  | "notFound"
  /** Changed by someone else since it was loaded (optimistic locking). */
  | "stale"
  /** The system category can't be deleted. */
  | "system"
  /** Products were added or removed since the delete confirmation was shown. */
  | "productsChanged"
  /** Categories were added or deleted since the order was loaded. */
  | "orderChanged";

export type CategoryFailure = { ok: false; reason: CategoryFailureReason };

const SELECT = {
  id: true,
  name: true,
  color: true,
  icon: true,
  isSystem: true,
  version: true,
  _count: { select: { products: true } },
} as const;

function toItem({
  _count,
  ...category
}: Prisma.CategoryGetPayload<{ select: typeof SELECT }>): CategoryItem {
  return { ...category, productCount: _count.products };
}

/** All categories in the users' order. Ties (two created at once) go by creation time. */
export async function listCategories(): Promise<CategoryItem[]> {
  const rows = await prisma.category.findMany({
    select: SELECT,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toItem);
}

/** Adds a category at the end of the order. */
export async function createCategory(
  draft: CategoryDraft,
): Promise<{ ok: true; category: CategoryItem } | CategoryFailure> {
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.category.aggregate({ _max: { sortOrder: true } });
      const created = await tx.category.create({
        data: { ...draft, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select: SELECT,
      });
      await bumpRevision(tx);
      return { ok: true as const, category: toItem(created) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "nameTaken" };
    throw error;
  }
}

/**
 * Saves a new name, color and emoji. expectedVersion is the version the form loaded: if
 * someone saved the category since, nothing is changed (spec 12.4).
 */
export async function updateCategory(
  id: string,
  expectedVersion: number,
  draft: CategoryDraft,
): Promise<{ ok: true } | CategoryFailure> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.category.updateMany({
        where: { id, version: expectedVersion },
        data: { ...draft, version: { increment: 1 } },
      });
      if (count === 0) return missingOrStale(tx, id);
      await bumpRevision(tx);
      return { ok: true as const };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "nameTaken" };
    throw error;
  }
}

/**
 * Deletes a regular category together with its products on the active list (spec 7.3).
 * History keeps its own copy of the category, so it doesn't change.
 * expectedProductCount is the number the confirmation showed: if products were added or
 * removed since, nothing is deleted, so the user never deletes more than they agreed to.
 */
export async function deleteCategory(
  id: string,
  expectedVersion: number,
  expectedProductCount: number,
): Promise<{ ok: true } | CategoryFailure> {
  return prisma.$transaction(async (tx) => {
    // Locks the category until the transaction ends. Adding a product to it takes a
    // share lock on this row (its foreign key), so no product can sneak in meanwhile.
    const [row] = await tx.$queryRaw<{ version: number; isSystem: boolean }[]>`
      SELECT version, "isSystem" FROM category WHERE id = ${id} FOR UPDATE`;
    if (!row) return { ok: false as const, reason: "notFound" as const };
    if (row.isSystem) return { ok: false as const, reason: "system" as const };
    if (row.version !== expectedVersion) return { ok: false as const, reason: "stale" as const };

    const products = await tx.product.count({ where: { categoryId: id } });
    if (products !== expectedProductCount) {
      return { ok: false as const, reason: "productsChanged" as const };
    }
    await tx.product.deleteMany({ where: { categoryId: id } });
    await tx.category.delete({ where: { id } });
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

/**
 * Saves a new order: orderedIds must be exactly the current categories, each once. If a
 * category was added or deleted since the screen loaded, nothing is changed.
 */
export async function reorderCategories(
  orderedIds: readonly string[],
): Promise<{ ok: true } | CategoryFailure> {
  return prisma.$transaction(async (tx) => {
    // Locks every category, so a concurrent create or delete waits for this order.
    const current = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM category FOR UPDATE`;
    const currentIds = new Set(current.map((row) => row.id));
    const sameSet =
      orderedIds.length === currentIds.size &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id) => currentIds.has(id));
    if (!sameSet) return { ok: false as const, reason: "orderChanged" as const };

    // One at a time: a transaction runs on one connection.
    for (const [sortOrder, id] of orderedIds.entries()) {
      await tx.category.update({ where: { id }, data: { sortOrder } });
    }
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

async function missingOrStale(tx: Prisma.TransactionClient, id: string): Promise<CategoryFailure> {
  const exists = await tx.category.count({ where: { id } });
  return { ok: false, reason: exists ? "stale" : "notFound" };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
