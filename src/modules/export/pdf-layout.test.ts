import { describe, expect, it } from "vitest";
import {
  FONT,
  layoutPages,
  PAGE,
  wrap,
  type DrawText,
  type Measure,
  type Page,
  type PdfCategory,
} from "./pdf-layout";

// Every character is half the font size wide.
const measure: Measure = (text, font) => Array.from(text).length * font.size * 0.5;

const texts = (page: Page) =>
  page.filter((op): op is DrawText => op.kind === "text").map((op) => op.text);

function content(categories: PdfCategory[]) {
  return {
    title: "OurBasket — רשימת קניות",
    created: "נוצר: היום",
    empty: "אין מה לקנות",
    categories,
  };
}

function category(name: string, count: number): PdfCategory {
  return {
    icon: "🥛",
    name,
    products: Array.from({ length: count }, (_, index) => ({
      name: `${name} ${index + 1}`,
      quantity: `כמות: ${index + 1}`,
    })),
  };
}

describe("wrap", () => {
  it("keeps a short text on one line", () => {
    expect(wrap("חלב 3%", 200, FONT.item, measure)).toEqual(["חלב 3%"]);
  });

  it("breaks between words", () => {
    // 6 characters (36pt) fit in 40pt.
    expect(wrap("אבג דהו זחט", 40, FONT.item, measure)).toEqual(["אבג", "דהו", "זחט"]);
  });

  it("breaks a word longer than a line, keeping an emoji whole", () => {
    expect(wrap("אבגד👍🏽הו", 24, FONT.item, measure)).toEqual(["אבגד", "👍🏽הו"]);
  });
});

describe("layoutPages", () => {
  it("puts the title, the date and every product on one page for a short list", () => {
    const pages = layoutPages(content([category("חלב", 2), category("לחם", 1)]), measure);
    expect(pages).toHaveLength(1);
    expect(texts(pages[0])).toEqual([
      "OurBasket — רשימת קניות",
      "נוצר: היום",
      "🥛 חלב",
      "חלב 1",
      "כמות: 1",
      "חלב 2",
      "כמות: 2",
      "🥛 לחם",
      "לחם 1",
      "כמות: 1",
    ]);
    // A box to check off for each product.
    expect(pages[0].filter((op) => op.kind === "box")).toHaveLength(3);
  });

  it("says there is nothing to buy when no category is left", () => {
    const [page] = layoutPages(content([]), measure);
    expect(texts(page)).toEqual(["OurBasket — רשימת קניות", "נוצר: היום", "אין מה לקנות"]);
  });

  it("continues on more pages, with the title on the first page only", () => {
    const pages = layoutPages(content([category("פירות", 80)]), measure);
    expect(pages.length).toBeGreaterThan(1);
    expect(texts(pages[1])).not.toContain("OurBasket — רשימת קניות");
    // Every product is there, once.
    const all = pages.flatMap(texts).filter((text) => text.startsWith("פירות "));
    expect(all).toHaveLength(80);
    expect(new Set(all).size).toBe(80);
  });

  it("keeps everything inside the margins", () => {
    const pages = layoutPages(content([category("פירות", 80), category("ירקות", 30)]), measure);
    for (const page of pages) {
      for (const op of page) {
        expect(op.y).toBeGreaterThanOrEqual(42);
        expect(op.y).toBeLessThanOrEqual(PAGE.height - 42);
      }
    }
  });

  it("never leaves a category heading alone at the bottom of a page", () => {
    const pages = layoutPages(
      content([category("א", 10), category("ב", 10), category("ג", 10), category("ד", 10)]),
      measure,
    );
    for (const page of pages) {
      const list = texts(page);
      const last = list.at(-1) ?? "";
      expect(last.startsWith("🥛")).toBe(false);
      // The text after a heading is a product of that category.
      list.forEach((text, index) => {
        if (text.startsWith("🥛 ")) expect(list[index + 1]).toBe(`${text.slice(3)} 1`);
      });
    }
  });

  it("wraps a long product name inside its row", () => {
    const long = "שם ארוך מאוד של מוצר ".repeat(8).trim();
    const [page] = layoutPages(
      content([{ icon: "🧴", name: "ניקיון", products: [{ name: long, quantity: "כמות: 1" }] }]),
      measure,
    );
    // After the title, the date and the heading; the quantity comes last.
    const lines = texts(page).slice(3, -1);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(long);
  });
});
