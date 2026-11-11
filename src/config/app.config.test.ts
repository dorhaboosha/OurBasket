import { describe, expect, it } from "vitest";
import messages from "../../messages/he.json";
import { appConfig, getPaletteColor, getUserConfig } from "./app.config";
import { contrastRatio } from "./contrast";

const WHITE = "#ffffff";

describe("users", () => {
  it("are Dor and Maayan, with keys that work in env var names", () => {
    expect(appConfig.users.map((user) => user.key)).toEqual(["dor", "maayan"]);
    for (const user of appConfig.users) expect(user.key).toMatch(/^[a-z]+$/);
  });

  it("are found by key", () => {
    expect(getUserConfig("maayan")?.displayName).toBe("מעיין");
    expect(getUserConfig("nobody")).toBeUndefined();
  });
});

describe("color palette", () => {
  it("has 12 colors with unique keys and values", () => {
    const keys = appConfig.colorPalette.map((color) => color.key);
    const values = appConfig.colorPalette.map((color) => color.value.toLowerCase());
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    expect(new Set(values).size).toBe(12);
  });

  it.each(appConfig.colorPalette)("$key is readable with white text (4.5:1)", ({ value }) => {
    expect(contrastRatio(value, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("is found by key", () => {
    expect(getPaletteColor("teal")?.value).toBe("#0f766e");
    expect(getPaletteColor("nope")).toBeUndefined();
  });
});

describe("theme color", () => {
  it("is readable with white text (4.5:1)", () => {
    expect(contrastRatio(appConfig.themeColor, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("default categories", () => {
  const categories = appConfig.defaultCategories;

  it("are the 12 from the spec, ending with General", () => {
    expect(categories).toHaveLength(12);
    expect(categories.at(-1)?.key).toBe("general");
  });

  it("have unique keys", () => {
    expect(new Set(categories.map((category) => category.key)).size).toBe(categories.length);
  });

  it("have exactly one system category: General", () => {
    const system = categories.filter((category) => "isSystem" in category && category.isSystem);
    expect(system.map((category) => category.key)).toEqual(["general"]);
  });

  it.each(categories)("$key has a palette color, an emoji and a Hebrew name", (category) => {
    expect(getPaletteColor(category.color)).toBeDefined();
    expect(category.emoji).toMatch(/\p{Extended_Pictographic}/u);
    const names: Record<string, string> = messages.categories;
    expect(names[category.key]?.trim()).toBeTruthy();
  });

  it("have names within the length limit", () => {
    for (const name of Object.values(messages.categories)) {
      expect(name.length).toBeLessThanOrEqual(appConfig.limits.nameMaxLength);
    }
  });
});

describe("limits", () => {
  it("match the spec", () => {
    expect(appConfig.limits).toEqual({ nameMaxLength: 60, quantityMin: 1, quantityMax: 999 });
  });
});
