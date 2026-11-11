// Non-secret application settings. Secrets and user emails live in environment
// variables (see .env.example). UI text lives in messages/<locale>.json.

export type UserConfig = {
  /** Stable id. The user's email comes from env var USER_EMAIL_<KEY in upper case>. */
  key: string;
  displayName: string;
};

export type PaletteColor = {
  /** Stable id stored in the database (Category.color). */
  key: string;
  /** Hex color. Must reach 4.5:1 contrast with white, for white text on it. */
  value: string;
};

export type DefaultCategory = {
  /** Stable id used by the seed. The Hebrew name is messages: categories.<key>. */
  key: string;
  emoji: string;
  /** A key from colorPalette. */
  color: string;
  /** The system category ("General"): can't be deleted, catches products with no category. */
  isSystem?: boolean;
};

export type AppConfig = {
  locale: string;
  /** BCP 47 tag for date/number formatting and the Chakra (Ark UI) locale. */
  intlLocale: string;
  direction: "rtl" | "ltr";
  timeZone: string;
  /** Main brand color: theme, browser toolbar and installed-app color. */
  themeColor: string;
  users: readonly UserConfig[];
  /** The colors a category can have. */
  colorPalette: readonly PaletteColor[];
  /** Created by the database seed, in this order. */
  defaultCategories: readonly DefaultCategory[];
  limits: {
    /** Product and category names, after trimming. */
    nameMaxLength: number;
    quantityMin: number;
    quantityMax: number;
  };
};

export const appConfig = {
  locale: "he",
  intlLocale: "he-IL",
  direction: "rtl",
  timeZone: "Asia/Jerusalem",
  themeColor: "#0f766e",
  users: [
    { key: "dor", displayName: "דור" },
    { key: "maayan", displayName: "מעיין" },
  ],
  colorPalette: [
    { key: "blue", value: "#1d4ed8" },
    { key: "sky", value: "#0369a1" },
    { key: "teal", value: "#0f766e" },
    { key: "green", value: "#15803d" },
    { key: "lime", value: "#4d7c0f" },
    { key: "amber", value: "#b45309" },
    { key: "orange", value: "#c2410c" },
    { key: "red", value: "#b91c1c" },
    { key: "pink", value: "#be185d" },
    { key: "purple", value: "#7e22ce" },
    { key: "indigo", value: "#4338ca" },
    { key: "slate", value: "#334155" },
  ],
  defaultCategories: [
    { key: "dairy", emoji: "🥛", color: "blue" },
    { key: "produce", emoji: "🥬", color: "green" },
    { key: "meat", emoji: "🍗", color: "red" },
    { key: "bakery", emoji: "🍞", color: "amber" },
    { key: "pantry", emoji: "🥫", color: "orange" },
    { key: "frozen", emoji: "🧊", color: "sky" },
    { key: "snacks", emoji: "🍫", color: "pink" },
    { key: "drinks", emoji: "🥤", color: "indigo" },
    { key: "cleaning", emoji: "🧽", color: "teal" },
    { key: "personalCare", emoji: "🧴", color: "purple" },
    { key: "household", emoji: "🏠", color: "lime" },
    { key: "general", emoji: "🛒", color: "slate", isSystem: true },
  ],
  limits: {
    nameMaxLength: 60,
    quantityMin: 1,
    quantityMax: 999,
  },
} as const satisfies AppConfig;

export function getUserConfig(key: string): UserConfig | undefined {
  return appConfig.users.find((user) => user.key === key);
}

export function getPaletteColor(key: string): PaletteColor | undefined {
  return appConfig.colorPalette.find((color) => color.key === key);
}
