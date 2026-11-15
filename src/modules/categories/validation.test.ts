import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app.config";
import { isSingleEmoji, validateCategory } from "./validation";

const valid = { name: "מוצרי חלב", color: "blue", icon: "🥛" };

describe("validateCategory", () => {
  it("accepts a valid category and cleans the name", () => {
    expect(validateCategory({ ...valid, name: "  Coca   Cola  " })).toEqual({
      ok: true,
      draft: { name: "Coca Cola", normalizedName: "coca cola", color: "blue", icon: "🥛" },
    });
  });

  it.each(["", "   ", " \t"])("requires a name (%j)", (name) => {
    expect(validateCategory({ ...valid, name })).toEqual({
      ok: false,
      errors: { name: "nameRequired" },
    });
  });

  it("allows 60 characters, not 61, counting emoji as one", () => {
    const max = appConfig.limits.nameMaxLength;
    expect(validateCategory({ ...valid, name: "א".repeat(max) }).ok).toBe(true);
    expect(validateCategory({ ...valid, name: "🍎".repeat(max) }).ok).toBe(true);
    expect(validateCategory({ ...valid, name: "א".repeat(max + 1) })).toEqual({
      ok: false,
      errors: { name: "nameTooLong" },
    });
  });

  it("allows only palette colors", () => {
    for (const { key } of appConfig.colorPalette) {
      expect(validateCategory({ ...valid, color: key }).ok).toBe(true);
    }
    for (const color of ["", "#1d4ed8", "Blue", "magenta"]) {
      expect(validateCategory({ ...valid, color })).toEqual({
        ok: false,
        errors: { color: "colorInvalid" },
      });
    }
  });

  it("reports every bad field at once, and survives junk input", () => {
    expect(validateCategory({ name: 5, color: null, icon: [] })).toEqual({
      ok: false,
      errors: { name: "nameRequired", color: "colorInvalid", icon: "iconInvalid" },
    });
    expect(validateCategory(null).ok).toBe(false);
    expect(validateCategory("text").ok).toBe(false);
  });
});

describe("isSingleEmoji", () => {
  it.each(["🥛", "☕", "👨‍👩‍👧", "👍🏽", "🇮🇱", "❤️", "1️⃣", "#️⃣", "*️⃣", ...appConfig.emojiSuggestions])(
    "accepts %s",
    (emoji) => {
      expect(isSingleEmoji(emoji)).toBe(true);
    },
  );

  it.each(["", "a", "א", "1", "#", "1\u20e3\u20e3", "1️⃣2️⃣", "🥛🥛", "🥛a", " ", "<b>"])(
    "rejects %j",
    (value) => {
      expect(isSingleEmoji(value)).toBe(false);
    },
  );
});
