import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { appConfig } from "@/config/app.config";
import { normalizeName } from "@/lib/names";
import { prisma } from "@/lib/prisma";
import { bumpRevision } from "@/modules/list/revision";
import type { ProductDraft } from "./validation";

// Products on the active list (spec 8). Both users may change any product. Every change
// runs in a transaction that also raises the list revision.

const MAX = appConfig.limits.quantityMax;

type Tx = Prisma.TransactionClient;

export type ProductFailureReason =
  /** Another product already has this name (after normalizing). */
  | "nameTaken"
  /** Deleted meanwhile. */
  | "notFound"
  /** Changed by someone else since it was loaded (optimistic locking). */
  | "stale"
  /** The chosen category was deleted meanwhile. */
  | "categoryNotFound"
  /** Products were added, moved or deleted since the order was loaded. */
  | "orderChanged"
  /** The list changed since the "clear list" question was shown. */
  | "listChanged";

export type ProductFailure = { ok: false; reason: ProductFailureReason };

/** Everything needed to put a deleted product back as it was ("undo", spec 8.4). */
export type DeletedProduct = {
  name: string;
  quantity: number;
  categoryId: string;
  sortOrder: number;
  isChecked: boolean;
};

/** What an add or a restore did. */
export type AddOutcome =
  | { kind: "created" }
  /** Already on the list: the quantities were added up, in the product's own category. */
  | { kind: "merged"; quantity: number; capped: boolean; categoryName: string };

/**
 * Adds a product (spec 8.1, 8.2). If one with the same normalized name is already on the
 * list, its quantity grows instead (up to 999), and it stays in its own category. With no
 * category, or one deleted meanwhile, the product goes to General.
 */
export async function addProduct(draft: ProductDraft): Promise<AddOutcome> {
  return withRetryOnDuplicate(() =>
    prisma.$transaction(async (tx) => {
      const merged = await mergeIntoExisting(tx, draft.normalizedName, draft.quantity);
      if (merged) return merged;
      const categoryId = await categoryOrGeneral(tx, draft.categoryId);
      await tx.product.create({
        data: {
          name: draft.name,
          normalizedName: draft.normalizedName,
          quantity: draft.quantity,
          categoryId,
          sortOrder: await nextSortOrder(tx, categoryId),
        },
      });
      await bumpRevision(tx);
      return { kind: "created" as const };
    }),
  );
}

/**
 * Puts a deleted product back where it was, with its quantity and check mark ("undo").
 * Merges like an add if a product with that name was added meanwhile.
 */
export async function restoreProduct(deleted: DeletedProduct): Promise<AddOutcome> {
  const normalizedName = normalizeName(deleted.name);
  return withRetryOnDuplicate(() =>
    prisma.$transaction(async (tx) => {
      const merged = await mergeIntoExisting(tx, normalizedName, deleted.quantity);
      if (merged) return merged;
      const categoryId = await categoryOrGeneral(tx, deleted.categoryId);
      const sameCategory = categoryId === deleted.categoryId;
      await tx.product.create({
        data: {
          name: deleted.name,
          normalizedName,
          quantity: deleted.quantity,
          isChecked: deleted.isChecked,
          categoryId,
          sortOrder: sameCategory ? deleted.sortOrder : await nextSortOrder(tx, categoryId),
        },
      });
      await bumpRevision(tx);
      return { kind: "created" as const };
    }),
  );
}

/**
 * Saves the edit form (spec 8.3): name, quantity and category, if the product is still at
 * the version the form loaded. A new category puts the product at the end of it.
 */
export async function updateProduct(
  id: string,
  expectedVersion: number,
  draft: ProductDraft,
): Promise<{ ok: true } | ProductFailure> {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await lockProduct(tx, id);
      if (!current) return { ok: false as const, reason: "notFound" as const };
      if (current.version !== expectedVersion) {
        return { ok: false as const, reason: "stale" as const };
      }
      const categoryId = draft.categoryId ?? (await generalCategoryId(tx));
      if (!(await tx.category.count({ where: { id: categoryId } }))) {
        return { ok: false as const, reason: "categoryNotFound" as const };
      }
      const moved = categoryId !== current.categoryId;
      await tx.product.update({
        where: { id },
        data: {
          name: draft.name,
          normalizedName: draft.normalizedName,
          quantity: draft.quantity,
          categoryId,
          ...(moved ? { sortOrder: await nextSortOrder(tx, categoryId) } : {}),
          version: { increment: 1 },
        },
      });
      await bumpRevision(tx);
      return { ok: true as const };
    });
  } catch (error) {
    // Renaming to another product's name is refused, not merged (spec 8.3).
    if (isUniqueViolation(error)) return { ok: false, reason: "nameTaken" };
    throw error;
  }
}

/**
 * The + and - buttons (spec 8.4): a relative change the database applies atomically, so
 * presses from both users all count. Going below 1 deletes the product; above 999, it
 * stays at 999.
 */
export async function changeQuantity(
  id: string,
  delta: 1 | -1,
): Promise<{ ok: true; deleted?: DeletedProduct; atMax?: boolean } | ProductFailure> {
  return prisma.$transaction(async (tx) => {
    const current = await lockProduct(tx, id);
    if (!current) return { ok: false as const, reason: "notFound" as const };
    const quantity = current.quantity + delta;
    if (quantity < 1) {
      const deleted = await deleteLocked(tx, current);
      return { ok: true as const, deleted };
    }
    if (quantity > MAX) return { ok: true as const, atMax: true };
    await tx.product.update({
      where: { id },
      data: { quantity, version: { increment: 1 } },
    });
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

/**
 * A typed quantity (spec 8.4): an absolute value, saved only if the product is still at
 * the version shown. 0 deletes the product.
 */
export async function setQuantity(
  id: string,
  expectedVersion: number,
  quantity: number,
): Promise<{ ok: true; deleted?: DeletedProduct } | ProductFailure> {
  return prisma.$transaction(async (tx) => {
    const current = await lockProduct(tx, id);
    if (!current) return { ok: false as const, reason: "notFound" as const };
    if (current.version !== expectedVersion) {
      return { ok: false as const, reason: "stale" as const };
    }
    if (quantity === 0) return { ok: true as const, deleted: await deleteLocked(tx, current) };
    await tx.product.update({
      where: { id },
      data: { quantity, version: { increment: 1 } },
    });
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

/**
 * Checks or unchecks a product (spec 8.6). An absolute value, so repeating it is harmless.
 * It doesn't raise the product's version: a check mark never conflicts with an edit.
 */
export async function setChecked(
  id: string,
  isChecked: boolean,
): Promise<{ ok: true } | ProductFailure> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.product.updateMany({ where: { id }, data: { isChecked } });
    if (count === 0) return { ok: false as const, reason: "notFound" as const };
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

/** Deletes a product at once (spec 8.5), and returns what "undo" needs. */
export async function deleteProduct(
  id: string,
): Promise<{ ok: true; deleted: DeletedProduct } | ProductFailure> {
  return prisma.$transaction(async (tx) => {
    const current = await lockProduct(tx, id);
    if (!current) return { ok: false as const, reason: "notFound" as const };
    return { ok: true as const, deleted: await deleteLocked(tx, current) };
  });
}

/**
 * Drag and drop (spec 8.7): moves a product into a category (its own or another) and
 * saves that category's new order. orderedIds must be exactly the category's products
 * after the move; if the list changed meanwhile, nothing is saved.
 */
export async function moveProduct(
  id: string,
  toCategoryId: string,
  orderedIds: readonly string[],
): Promise<{ ok: true } | ProductFailure> {
  return prisma.$transaction(async (tx) => {
    const current = await lockProduct(tx, id);
    if (!current) return { ok: false as const, reason: "notFound" as const };
    const [category] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM category WHERE id = ${toCategoryId} FOR UPDATE`;
    if (!category) return { ok: false as const, reason: "categoryNotFound" as const };

    const others = await tx.product.findMany({
      where: { categoryId: toCategoryId, id: { not: id } },
      select: { id: true },
    });
    const expected = new Set([id, ...others.map((product) => product.id)]);
    const sameSet =
      orderedIds.length === expected.size &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((productId) => expected.has(productId));
    if (!sameSet) return { ok: false as const, reason: "orderChanged" as const };

    if (current.categoryId !== toCategoryId) {
      await tx.product.update({
        where: { id },
        data: { categoryId: toCategoryId, version: { increment: 1 } },
      });
    }
    // One at a time: a transaction runs on one connection.
    for (const [sortOrder, productId] of orderedIds.entries()) {
      await tx.product.update({ where: { id: productId }, data: { sortOrder } });
    }
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

/**
 * Deletes every product on the list (spec 9.3), if the list is still at the revision the
 * question was shown at. History is untouched.
 */
export async function clearList(expectedRevision: number): Promise<{ ok: true } | ProductFailure> {
  return prisma.$transaction(async (tx) => {
    // Locks the revision row: any change to the list waits, or is waited for.
    const [state] = await tx.$queryRaw<{ revision: number }[]>`
      SELECT revision FROM list_state WHERE id = 1 FOR UPDATE`;
    if ((state?.revision ?? 0) !== expectedRevision) {
      return { ok: false as const, reason: "listChanged" as const };
    }
    await tx.product.deleteMany({});
    await bumpRevision(tx);
    return { ok: true as const };
  });
}

// ---- helpers ----

type LockedProduct = {
  id: string;
  name: string;
  quantity: number;
  isChecked: boolean;
  categoryId: string;
  sortOrder: number;
  version: number;
};

/** Reads a product and locks it until the transaction ends. */
async function lockProduct(tx: Tx, id: string): Promise<LockedProduct | undefined> {
  const [row] = await tx.$queryRaw<LockedProduct[]>`
    SELECT id, name, quantity, "isChecked", "categoryId", "sortOrder", version
    FROM product WHERE id = ${id} FOR UPDATE`;
  return row;
}

async function deleteLocked(tx: Tx, product: LockedProduct): Promise<DeletedProduct> {
  await tx.product.delete({ where: { id: product.id } });
  await bumpRevision(tx);
  return {
    name: product.name,
    quantity: product.quantity,
    categoryId: product.categoryId,
    sortOrder: product.sortOrder,
    isChecked: product.isChecked,
  };
}

/** Adds to an existing product with this name, if there is one. */
async function mergeIntoExisting(
  tx: Tx,
  normalizedName: string,
  quantity: number,
): Promise<AddOutcome | null> {
  const [existing] = await tx.$queryRaw<{ id: string; quantity: number; categoryId: string }[]>`
    SELECT id, quantity, "categoryId" FROM product
    WHERE "normalizedName" = ${normalizedName} FOR UPDATE`;
  if (!existing) return null;
  const total = Math.min(existing.quantity + quantity, MAX);
  await tx.product.update({
    where: { id: existing.id },
    data: { quantity: total, version: { increment: 1 } },
  });
  await bumpRevision(tx);
  const category = await tx.category.findUniqueOrThrow({
    where: { id: existing.categoryId },
    select: { name: true },
  });
  return {
    kind: "merged",
    quantity: total,
    capped: existing.quantity + quantity > MAX,
    categoryName: category.name,
  };
}

/** The category, if it still exists; otherwise the system category, General. */
async function categoryOrGeneral(tx: Tx, categoryId: string | null): Promise<string> {
  if (categoryId && (await tx.category.count({ where: { id: categoryId } }))) return categoryId;
  return generalCategoryId(tx);
}

async function generalCategoryId(tx: Tx): Promise<string> {
  const general = await tx.category.findFirstOrThrow({
    where: { isSystem: true },
    select: { id: true },
  });
  return general.id;
}

/** After the last product in the category (checked ones included). */
async function nextSortOrder(tx: Tx, categoryId: string): Promise<number> {
  const last = await tx.product.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  });
  return (last._max.sortOrder ?? -1) + 1;
}

/**
 * Two adds of the same new name at once: the second hits the unique index. Running it
 * again finds the first one's product and merges into it (spec 8.2, 18).
 */
async function withRetryOnDuplicate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return run();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
