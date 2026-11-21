import { describe, expect, it } from "vitest";
import type { ListCategory } from "@/modules/list/snapshot";
import { exportText, toExport } from "./export";

const RTL_MARK = String.fromCharCode(0x200f);

function category(name: string, icon: string, products: [string, number, boolean?][]) {
  return {
    id: name,
    name,
    color: "blue",
    icon,
    isSystem: false,
    products: products.map(([productName, quantity, isChecked = false]) => ({
      id: `${name}/${productName}`,
      categoryId: name,
      name: productName,
      quantity,
      isChecked,
      version: 1,
    })),
  } satisfies ListCategory;
}

describe("toExport", () => {
  it("keeps only unchecked products, in order, and drops categories left empty", () => {
    const exported = toExport([
      category("מוצרי חלב", "🥛", [
        ["חלב", 2],
        ["יוגורט", 1, true],
        ["גבינה צהובה", 1],
      ]),
      category("משקאות", "🥤", [["מים", 6, true]]),
      category("קפואים", "❄️", []),
      category("פירות וירקות", "🥬", [["מלפפונים", 6]]),
    ]);
    expect(exported.map((c) => [c.name, c.products.map((p) => [p.name, p.quantity])])).toEqual([
      [
        "מוצרי חלב",
        [
          ["חלב", 2],
          ["גבינה צהובה", 1],
        ],
      ],
      ["פירות וירקות", [["מלפפונים", 6]]],
    ]);
  });

  it("is empty when everything is checked off", () => {
    expect(toExport([category("משקאות", "🥤", [["מים", 6, true]])])).toEqual([]);
  });
});

describe("exportText", () => {
  it("has a title, then each category with its emoji and products with quantities", () => {
    const text = exportText(
      "OurBasket — רשימת קניות",
      toExport([
        category("מוצרי חלב", "🥛", [
          ["חלב", 2],
          ["גבינה צהובה", 1],
        ]),
        category("פירות וירקות", "🥬", [
          ["מלפפונים", 6],
          ["עגבניות", 4],
        ]),
      ]),
    );
    expect(text.replaceAll(RTL_MARK, "")).toBe(
      [
        "OurBasket — רשימת קניות",
        "",
        "🥛 מוצרי חלב",
        "• חלב — 2",
        "• גבינה צהובה — 1",
        "",
        "🥬 פירות וירקות",
        "• מלפפונים — 6",
        "• עגבניות — 4",
      ].join("\n"),
    );
  });

  it("starts every non-empty line right to left, for Latin names", () => {
    const text = exportText("OurBasket", toExport([category("כללי", "📦", [["Coca Cola", 2]])]));
    expect(text.split("\n")).toEqual([
      `${RTL_MARK}OurBasket`,
      "",
      `${RTL_MARK}📦 כללי`,
      `${RTL_MARK}• Coca Cola — 2`,
    ]);
  });
});
