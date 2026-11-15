"use server";

import { getTranslations } from "next-intl/server";
import { appConfig } from "@/config/app.config";
import { requireUser } from "@/modules/auth/current-user";
import { type ListSnapshot, getListSnapshot } from "@/modules/list/snapshot";
import {
  type AddOutcome,
  type DeletedProduct,
  type ProductFailure,
  addProduct,
  changeQuantity,
  clearList,
  deleteProduct,
  moveProduct,
  restoreProduct,
  setChecked,
  setQuantity,
  updateProduct,
} from "@/modules/products/products";
import {
  type ProductErrorCode,
  type ProductField,
  isId,
  isQuantity,
  validateProduct,
} from "@/modules/products/validation";

// The list screen's actions (spec 8, 9.3, 17). Each checks the session on the server
// first (they are reachable by direct POST), and answers with the whole list at its
// latest revision: the screen shows it only if it isn't older than what it shows (12.2).

export type ListActionResult =
  | {
      ok: true;
      list: ListSnapshot;
      /** Something to tell the user (merged, capped, deleted...). */
      message?: string;
      /** A deleted product, for the "undo" button. */
      undo?: DeletedProduct;
    }
  | {
      ok: false;
      /** The latest list, so the screen shows what changed meanwhile. */
      list: ListSnapshot;
      message: string;
      reason?: ProductFailure["reason"];
      fieldErrors?: Partial<Record<ProductField, string>>;
    };

/** Loads the list (and, from step 8, after a real-time "list changed" event). */
export async function getListAction(): Promise<ListSnapshot> {
  await requireUser();
  return getListSnapshot();
}

export async function addProductAction(input: unknown): Promise<ListActionResult> {
  await requireUser();
  const validation = validateProduct(input);
  if (!validation.ok) return fieldErrors(validation.errors);
  const outcome = await addProduct(validation.draft);
  return success(await addedMessage(validation.draft.name, outcome, "added"));
}

export async function updateProductAction(
  id: unknown,
  expectedVersion: unknown,
  input: unknown,
): Promise<ListActionResult> {
  await requireUser();
  if (!isId(id) || !isVersion(expectedVersion)) return failure("notFound");
  const validation = validateProduct(input);
  if (!validation.ok) return fieldErrors(validation.errors);
  const result = await updateProduct(id, expectedVersion, validation.draft);
  return result.ok ? success() : failure(result.reason);
}

/** The + and - buttons. */
export async function changeQuantityAction(id: unknown, delta: unknown): Promise<ListActionResult> {
  await requireUser();
  if (!isId(id) || (delta !== 1 && delta !== -1)) return failure("notFound");
  const result = await changeQuantity(id, delta);
  if (!result.ok) return failure(result.reason);
  const t = await getTranslations("productMessages");
  if (result.deleted) return success(t("deleted", { name: result.deleted.name }), result.deleted);
  if (result.atMax) return success(t("atMax", { max: appConfig.limits.quantityMax }));
  return success();
}

/** A typed quantity; 0 deletes the product. */
export async function setQuantityAction(
  id: unknown,
  expectedVersion: unknown,
  quantity: unknown,
): Promise<ListActionResult> {
  await requireUser();
  if (!isId(id) || !isVersion(expectedVersion)) return failure("notFound");
  if (!isQuantity(quantity, 0)) {
    const t = await getTranslations("productErrors");
    return {
      ok: false,
      list: await getListSnapshot(),
      message: t("quantityTyped", { max: appConfig.limits.quantityMax }),
    };
  }
  const result = await setQuantity(id, expectedVersion, quantity);
  if (!result.ok) return failure(result.reason === "stale" ? "quantityStale" : result.reason);
  if (result.deleted) {
    const t = await getTranslations("productMessages");
    return success(t("deleted", { name: result.deleted.name }), result.deleted);
  }
  return success();
}

export async function setCheckedAction(id: unknown, isChecked: unknown): Promise<ListActionResult> {
  await requireUser();
  if (!isId(id) || typeof isChecked !== "boolean") return failure("notFound");
  const result = await setChecked(id, isChecked);
  return result.ok ? success() : failure(result.reason);
}

export async function deleteProductAction(id: unknown): Promise<ListActionResult> {
  await requireUser();
  if (!isId(id)) return failure("notFound");
  const result = await deleteProduct(id);
  if (!result.ok) return failure(result.reason);
  const t = await getTranslations("productMessages");
  return success(t("deleted", { name: result.deleted.name }), result.deleted);
}

/** "Undo" after a delete: puts the product back as it was. */
export async function restoreProductAction(deleted: unknown): Promise<ListActionResult> {
  await requireUser();
  const fields = (typeof deleted === "object" && deleted !== null ? deleted : {}) as Record<
    string,
    unknown
  >;
  const validation = validateProduct({
    name: fields.name,
    quantity: fields.quantity,
    categoryId: fields.categoryId,
  });
  if (
    !validation.ok ||
    !validation.draft.categoryId ||
    !Number.isSafeInteger(fields.sortOrder) ||
    typeof fields.isChecked !== "boolean"
  ) {
    return failure("notFound");
  }
  const outcome = await restoreProduct({
    name: validation.draft.name,
    quantity: validation.draft.quantity,
    categoryId: validation.draft.categoryId,
    sortOrder: fields.sortOrder as number,
    isChecked: fields.isChecked,
  });
  return success(await addedMessage(validation.draft.name, outcome, "restored"));
}

/** Drag and drop: a product's new place, in its own category or another. */
export async function moveProductAction(
  id: unknown,
  toCategoryId: unknown,
  orderedIds: unknown,
): Promise<ListActionResult> {
  await requireUser();
  if (
    !isId(id) ||
    !isId(toCategoryId) ||
    !Array.isArray(orderedIds) ||
    orderedIds.length > 1000 ||
    !orderedIds.every(isId)
  ) {
    return failure("orderChanged");
  }
  const result = await moveProduct(id, toCategoryId, orderedIds);
  return result.ok ? success() : failure(result.reason);
}

/** "Clear list": deletes every product, if the list is as it was when asked. */
export async function clearListAction(expectedRevision: unknown): Promise<ListActionResult> {
  await requireUser();
  if (!Number.isSafeInteger(expectedRevision)) return failure("listChanged");
  const result = await clearList(expectedRevision as number);
  if (!result.ok) return failure(result.reason);
  const t = await getTranslations("productMessages");
  return success(t("cleared"));
}

// ---- helpers ----

async function success(message?: string, undo?: DeletedProduct): Promise<ListActionResult> {
  return { ok: true, list: await getListSnapshot(), message, undo };
}

async function failure(
  reason: ProductFailure["reason"] | "quantityStale",
): Promise<ListActionResult> {
  const t = await getTranslations("productErrors");
  return {
    ok: false,
    list: await getListSnapshot(),
    message: t(reason),
    reason: reason === "quantityStale" ? "stale" : reason,
  };
}

async function fieldErrors(
  errors: Partial<Record<ProductField, ProductErrorCode>>,
): Promise<ListActionResult> {
  const t = await getTranslations("productErrors");
  const params = { max: appConfig.limits.nameMaxLength, maxQuantity: appConfig.limits.quantityMax };
  return {
    ok: false,
    list: await getListSnapshot(),
    message: t("checkForm"),
    fieldErrors: Object.fromEntries(
      Object.entries(errors).map(([field, code]) => [field, t(code, params)]),
    ),
  };
}

async function addedMessage(name: string, outcome: AddOutcome, created: "added" | "restored") {
  const t = await getTranslations("productMessages");
  if (outcome.kind === "created") return t(created, { name });
  return t(outcome.capped ? "mergedCapped" : "merged", {
    name,
    category: outcome.categoryName,
    quantity: outcome.quantity,
  });
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}
