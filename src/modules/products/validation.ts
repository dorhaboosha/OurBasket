// Validates product input (spec 8.1, 8.3, 8.4) on the server. Errors are codes; the UI
// shows messages.productErrors.<code>. Uniqueness and categories are checked on save.

import { appConfig } from "@/config/app.config";
import { cleanName, normalizeName } from "@/lib/names";
import { nameLength } from "@/modules/categories/validation";

export type ProductField = "name" | "quantity" | "categoryId";

export type ProductErrorCode = "nameRequired" | "nameTooLong" | "quantityInvalid";

/** A valid product, ready to store. categoryId null means "no category": General. */
export type ProductDraft = {
  name: string;
  normalizedName: string;
  quantity: number;
  categoryId: string | null;
};

export type ProductValidation =
  | { ok: true; draft: ProductDraft }
  | { ok: false; errors: Partial<Record<ProductField, ProductErrorCode>> };

const { quantityMin, quantityMax, nameMaxLength } = appConfig.limits;

/** A whole number from min to max (1–999 by default; 0–999 where 0 means delete). */
export function isQuantity(value: unknown, min: number = quantityMin): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= quantityMax;
}

/**
 * Reads a typed quantity: digits only (no signs, decimals or exponents). Returns null
 * for anything else, so "2.5", "-1", "1e3" and "" are all refused, not rounded.
 */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[0-9]{1,4}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

/** The add and edit forms: name, quantity (1–999), and an optional category. */
export function validateProduct(input: unknown): ProductValidation {
  const fields = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const errors: Partial<Record<ProductField, ProductErrorCode>> = {};

  const name = typeof fields.name === "string" ? cleanName(fields.name) : "";
  if (!name) errors.name = "nameRequired";
  else if (nameLength(name) > nameMaxLength) errors.name = "nameTooLong";

  const quantity = fields.quantity;
  if (!isQuantity(quantity)) errors.quantity = "quantityInvalid";

  const categoryId = isId(fields.categoryId) ? fields.categoryId : null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    draft: { name, normalizedName: normalizeName(name), quantity: quantity as number, categoryId },
  };
}
