import type { ListCategory } from "@/modules/list/snapshot";

/** A category as exported: only what is still to buy. */
export type ExportCategory = {
  id: string;
  name: string;
  icon: string;
  products: { id: string; name: string; quantity: number }[];
};

/**
 * What the export includes (spec 11): the products not checked off yet, in list order,
 * by category; categories with nothing left to buy are left out.
 */
export function toExport(categories: ListCategory[]): ExportCategory[] {
  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      products: category.products
        .filter((product) => !product.isChecked)
        .map(({ id, name, quantity }) => ({ id, name, quantity })),
    }))
    .filter((category) => category.products.length > 0);
}

/**
 * Starts a line right to left. Without it, a line that begins with a Latin word (the
 * title "OurBasket", a product named "Coca Cola") would show left to right in WhatsApp.
 */
const RTL_MARK = String.fromCharCode(0x200f);

/**
 * The list as text for WhatsApp (spec 11.1): a title, then each category with its emoji,
 * and its products with their quantities, one per line.
 */
export function exportText(title: string, categories: ExportCategory[]): string {
  const lines = [title];
  for (const category of categories) {
    lines.push("", `${category.icon} ${category.name}`);
    for (const product of category.products) {
      lines.push(`• ${product.name} — ${product.quantity}`);
    }
  }
  return lines.map((line) => (line ? RTL_MARK + line : line)).join("\n");
}
