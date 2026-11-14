// Validates the category form (spec 7.1) on the server. Errors are codes; the UI shows
// messages.categoryErrors.<code>. No database access: uniqueness is checked on save.

import { appConfig, getPaletteColor } from "@/config/app.config";
import { cleanName, normalizeName } from "@/lib/names";

export type CategoryField = "name" | "color" | "icon";

export type CategoryErrorCode = "nameRequired" | "nameTooLong" | "colorInvalid" | "iconInvalid";

/** A valid category, ready to store. */
export type CategoryDraft = {
  name: string;
  normalizedName: string;
  color: string;
  icon: string;
};

export type CategoryValidation =
  | { ok: true; draft: CategoryDraft }
  | { ok: false; errors: Partial<Record<CategoryField, CategoryErrorCode>> };

/** Longest stored emoji, in UTF-16 units: family and flag sequences are long. */
const ICON_MAX_LENGTH = 32;

const graphemes = new Intl.Segmenter(appConfig.intlLocale, { granularity: "grapheme" });

/** The length the database checks (char_length counts code points, not UTF-16 units). */
export function nameLength(name: string): number {
  return [...name].length;
}

/** One emoji: a single visible character that is a pictograph (or a flag). */
export function isSingleEmoji(value: string): boolean {
  if (!value || value.length > ICON_MAX_LENGTH) return false;
  if ([...graphemes.segment(value)].length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}

export function validateCategory(input: unknown): CategoryValidation {
  const fields = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const errors: Partial<Record<CategoryField, CategoryErrorCode>> = {};

  const name = typeof fields.name === "string" ? cleanName(fields.name) : "";
  if (!name) errors.name = "nameRequired";
  else if (nameLength(name) > appConfig.limits.nameMaxLength) errors.name = "nameTooLong";

  const color = typeof fields.color === "string" ? fields.color : "";
  if (!getPaletteColor(color)) errors.color = "colorInvalid";

  const icon = typeof fields.icon === "string" ? fields.icon.normalize("NFC").trim() : "";
  if (!isSingleEmoji(icon)) errors.icon = "iconInvalid";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, draft: { name, normalizedName: normalizeName(name), color, icon } };
}
