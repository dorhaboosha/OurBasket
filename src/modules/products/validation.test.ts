import { describe, expect, it } from "vitest";
import { isQuantity, parseQuantity, validateProduct } from "./validation";

const valid = { name: "חלב", quantity: 1, categoryId: "c1" };

describe("validateProduct", () => {
  it("accepts a valid product and cleans the name", () => {
    expect(validateProduct({ ...valid, name: "  Coca   Cola ", quantity: 6 })).toEqual({
      ok: true,
      draft: { name: "Coca Cola", normalizedName: "coca cola", quantity: 6, categoryId: "c1" },
    });
  });

  it("treats a missing or junk category as none (General)", () => {
    for (const categoryId of [undefined, null, "", 5, "x".repeat(65)]) {
      const result = validateProduct({ ...valid, categoryId });
      expect(result.ok && result.draft.categoryId).toBeNull();
    }
  });

  it("requires a name of up to 60 characters", () => {
    expect(validateProduct({ ...valid, name: "  " })).toEqual({
      ok: false,
      errors: { name: "nameRequired" },
    });
    expect(validateProduct({ ...valid, name: "א".repeat(60) }).ok).toBe(true);
    expect(validateProduct({ ...valid, name: "א".repeat(61) })).toEqual({
      ok: false,
      errors: { name: "nameTooLong" },
    });
  });

  it.each([0, -1, 1000, 1.5, Number.NaN, "2", null])("refuses the quantity %j", (quantity) => {
    expect(validateProduct({ ...valid, quantity })).toEqual({
      ok: false,
      errors: { quantity: "quantityInvalid" },
    });
  });

  it("allows quantities 1 to 999", () => {
    expect(validateProduct({ ...valid, quantity: 1 }).ok).toBe(true);
    expect(validateProduct({ ...valid, quantity: 999 }).ok).toBe(true);
  });
});

describe("isQuantity", () => {
  it("allows 0 only when asked (a typed 0 deletes)", () => {
    expect(isQuantity(0)).toBe(false);
    expect(isQuantity(0, 0)).toBe(true);
    expect(isQuantity(999, 0)).toBe(true);
    expect(isQuantity(1000, 0)).toBe(false);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["0", 0],
    ["7", 7],
    [" 12 ", 12],
    ["999", 999],
    ["1000", 1000],
  ])("reads %j as %i", (text, value) => {
    expect(parseQuantity(text)).toBe(value);
  });

  it.each(["", " ", "2.5", "-1", "+1", "1e3", "abc", "12345", "١٢"])("refuses %j", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});
