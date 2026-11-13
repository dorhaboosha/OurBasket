// Product and category names (spec 7.1, 8.2).

/**
 * The name as stored and shown: Unicode-normalized (NFC), trimmed, and with every run
 * of whitespace (including non-breaking spaces and tabs) collapsed to one space.
 */
export function cleanName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/**
 * The key that decides whether two names are the same product or category: the clean
 * name, lower-cased. Hebrew has no case, so this only folds English letters
 * ("Coca Cola" = "coca  cola").
 */
export function normalizeName(name: string): string {
  return cleanName(name).toLowerCase();
}
