/**
 * The printed list laid out on A4 pages, for the PDF made on an iPhone's home screen app,
 * where the browser's print dialog never opens (spec 11.2). The same content and rules
 * as the print page: a title and the date on the first page, each category with its
 * products and an empty box to check off by hand, a product never cut between pages,
 * and a category heading never alone at the bottom of a page.
 *
 * Units are PDF points (1/72 inch). The drawing (right to left) is done by the browser's
 * canvas, which also measures the text: see `measure`.
 */

export const PAGE = { width: 595.28, height: 841.89 } as const;
/** 15mm, like the print page's `@page` margin. */
const MARGIN = 42.52;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;
const BOTTOM = PAGE.height - MARGIN;

export const FONT = {
  title: { size: 20, bold: true },
  created: { size: 11, bold: false },
  category: { size: 15, bold: true },
  item: { size: 12, bold: false },
} as const;
export type Font = { size: number; bold: boolean };

const LINE_HEIGHT = 1.4;
const BOX = 11;
const GAP = 9;
const ROW_PADDING = 6;
const CATEGORY_GAP = 16;

/** Text right-aligned at `x` (its right edge), or left-aligned at `x`. Baseline at `y`. */
export type DrawText = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  font: Font;
  align: "right" | "left";
};
export type DrawLine = { kind: "line"; x1: number; x2: number; y: number; width: number };
/** An empty square, top-left at (x, y). */
export type DrawBox = { kind: "box"; x: number; y: number; size: number };
export type DrawOp = DrawText | DrawLine | DrawBox;
export type Page = DrawOp[];

/** The width of `text` in `font`, in points. */
export type Measure = (text: string, font: Font) => number;

export type PdfContent = {
  title: string;
  created: string;
  /** Shown instead of the categories when there is nothing to buy. */
  empty: string;
  categories: PdfCategory[];
};

/** A category to print, with its products' quantities already written out ("כמות: 2"). */
export type PdfCategory = {
  icon: string;
  name: string;
  products: { name: string; quantity: string }[];
};

function lineHeight(font: Font) {
  return font.size * LINE_HEIGHT;
}

/** Where the baseline sits in a line that starts at `top`. */
function baseline(top: number, font: Font) {
  return top + font.size * 1.05;
}

/** Characters as people see them (an emoji with its modifiers stays whole). */
function graphemes(text: string): string[] {
  return Array.from(
    new Intl.Segmenter("he", { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );
}

/**
 * Splits `text` into lines no wider than `width`: between words, and inside a word only
 * when the word alone is too wide.
 */
export function wrap(text: string, width: number, font: Font, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, font) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    if (measure(word, font) <= width) {
      line = word;
      continue;
    }
    for (const char of graphemes(word)) {
      if (line && measure(line + char, font) > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

/** The pages to draw. Always at least one. */
export function layoutPages(content: PdfContent, measure: Measure): Page[] {
  const pages: Page[] = [[]];
  let page = pages[0];
  let y = MARGIN;
  const right = PAGE.width - MARGIN;

  function newPage() {
    page = [];
    pages.push(page);
    y = MARGIN;
  }

  // The header, on the first page only.
  for (const line of wrap(content.title, CONTENT_WIDTH, FONT.title, measure)) {
    page.push({
      kind: "text",
      text: line,
      x: right,
      y: baseline(y, FONT.title),
      font: FONT.title,
      align: "right",
    });
    y += lineHeight(FONT.title);
  }
  page.push({
    kind: "text",
    text: content.created,
    x: right,
    y: baseline(y, FONT.created),
    font: FONT.created,
    align: "right",
  });
  y += lineHeight(FONT.created) + 6;
  page.push({ kind: "line", x1: MARGIN, x2: right, y, width: 2 });
  y += CATEGORY_GAP + 4;

  if (content.categories.length === 0) {
    for (const line of wrap(content.empty, CONTENT_WIDTH, FONT.item, measure)) {
      page.push({
        kind: "text",
        text: line,
        x: right,
        y: baseline(y, FONT.item),
        font: FONT.item,
        align: "right",
      });
      y += lineHeight(FONT.item);
    }
    return pages;
  }

  for (const category of content.categories) {
    const headingLines = wrap(
      `${category.icon} ${category.name}`,
      CONTENT_WIDTH,
      FONT.category,
      measure,
    );
    const headingHeight = headingLines.length * lineHeight(FONT.category) + 4;
    const rows = category.products.map((product) => itemRow(product, measure));

    // The heading moves to the next page with its first product, never alone.
    if (y + headingHeight + rows[0].height > BOTTOM && y > MARGIN) newPage();
    for (const line of headingLines) {
      page.push({
        kind: "text",
        text: line,
        x: right,
        y: baseline(y, FONT.category),
        font: FONT.category,
        align: "right",
      });
      y += lineHeight(FONT.category);
    }
    y += 4;
    page.push({ kind: "line", x1: MARGIN, x2: right, y, width: 1 });

    for (const row of rows) {
      if (y + row.height > BOTTOM && y > MARGIN) newPage();
      for (const op of row.ops) page.push(shift(op, y));
      y += row.height;
    }
    y += CATEGORY_GAP;
  }
  return pages;
}

type Row = { height: number; ops: DrawOp[] };

/** A product's row, drawn from y = 0: the box on the right, the name, the quantity on the left. */
function itemRow(product: { name: string; quantity: string }, measure: Measure): Row {
  const right = PAGE.width - MARGIN;
  const quantityText = product.quantity;
  const quantityWidth = measure(quantityText, FONT.item);
  const nameWidth = CONTENT_WIDTH - BOX - 2 * GAP - quantityWidth;
  const lines = wrap(product.name, nameWidth, FONT.item, measure);
  const textHeight = lines.length * lineHeight(FONT.item);
  const height = ROW_PADDING * 2 + Math.max(textHeight, BOX);
  const firstLineTop = ROW_PADDING;

  const ops: DrawOp[] = [
    {
      kind: "box",
      x: right - BOX,
      y: firstLineTop + (lineHeight(FONT.item) - BOX) / 2,
      size: BOX,
    },
    ...lines.map((line, index): DrawText => ({
      kind: "text",
      text: line,
      x: right - BOX - GAP,
      y: baseline(firstLineTop + index * lineHeight(FONT.item), FONT.item),
      font: FONT.item,
      align: "right",
    })),
    {
      kind: "text",
      text: quantityText,
      x: MARGIN,
      y: baseline(firstLineTop, FONT.item),
      font: FONT.item,
      align: "left",
    },
    { kind: "line", x1: MARGIN, x2: right, y: height, width: 0.5 },
  ];
  return { height, ops };
}

function shift(op: DrawOp, dy: number): DrawOp {
  return { ...op, y: op.y + dy };
}
