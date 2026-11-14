"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { appConfig } from "@/config/app.config";
import { requireUser } from "@/modules/auth/current-user";
import {
  type CategoryFailure,
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from "@/modules/categories/categories";
import {
  type CategoryErrorCode,
  type CategoryField,
  validateCategory,
} from "@/modules/categories/validation";

// Create, edit, delete and reorder categories (spec 7, 17). Each action checks the
// session on the server first: they are reachable by direct POST, not only from the UI.

export type CategoryFormResult =
  | { ok: true }
  /** Per-field messages for the form. */
  | { ok: false; fieldErrors: Partial<Record<CategoryField, string>> }
  /** A message for the whole form or list (deleted meanwhile, changed by someone else, ...). */
  | { ok: false; message: string; reason: CategoryFailure["reason"] };

export type CategoryActionResult =
  { ok: true } | { ok: false; message: string; reason: CategoryFailure["reason"] };

export async function createCategoryAction(input: unknown): Promise<CategoryFormResult> {
  await requireUser();
  const validation = validateCategory(input);
  if (!validation.ok) return fieldErrors(validation.errors);
  return done(await createCategory(validation.draft));
}

export async function updateCategoryAction(
  id: unknown,
  expectedVersion: unknown,
  input: unknown,
): Promise<CategoryFormResult> {
  await requireUser();
  if (!isId(id) || !isCount(expectedVersion, 1)) return failure("notFound");
  const validation = validateCategory(input);
  if (!validation.ok) return fieldErrors(validation.errors);
  return done(await updateCategory(id, expectedVersion, validation.draft));
}

export async function deleteCategoryAction(
  id: unknown,
  expectedVersion: unknown,
  expectedProductCount: unknown,
): Promise<CategoryActionResult> {
  await requireUser();
  if (!isId(id) || !isCount(expectedVersion, 1) || !isCount(expectedProductCount, 0)) {
    return failure("notFound");
  }
  return done(await deleteCategory(id, expectedVersion, expectedProductCount));
}

export async function reorderCategoriesAction(orderedIds: unknown): Promise<CategoryActionResult> {
  await requireUser();
  if (!Array.isArray(orderedIds) || orderedIds.length > 500 || !orderedIds.every(isId)) {
    return failure("orderChanged");
  }
  return done(await reorderCategories(orderedIds));
}

/**
 * Re-renders the page after every outcome: on success to show the change, on failure to
 * show what changed meanwhile (the message says the latest data was loaded).
 */
async function done(result: { ok: true } | CategoryFailure) {
  refresh();
  return result.ok ? { ok: true as const } : failure(result.reason);
}

async function failure(reason: CategoryFailure["reason"]) {
  const t = await getTranslations("categoryErrors");
  return { ok: false as const, message: t(reason), reason };
}

async function fieldErrors(errors: Partial<Record<CategoryField, CategoryErrorCode>>) {
  const t = await getTranslations("categoryErrors");
  return {
    ok: false as const,
    fieldErrors: Object.fromEntries(
      Object.entries(errors).map(([field, code]) => [
        field,
        t(code, { max: appConfig.limits.nameMaxLength }),
      ]),
    ),
  };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isCount(value: unknown, min: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min;
}
