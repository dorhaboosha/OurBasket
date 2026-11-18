// How a purchase's products are shown: by category, as it was when bought.

/** The fields of a history item that grouping needs. */
type GroupableItem = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
};

export type CategoryGroup<T> = {
  key: string;
  name: string;
  color: string;
  icon: string;
  items: T[];
};

/**
 * The items by category (by id), each category once, in the order it first appears; the
 * items keep their order within it. Name, color and emoji are the category's from then.
 */
export function groupByCategory<T extends GroupableItem>(items: readonly T[]): CategoryGroup<T>[] {
  const groups = new Map<string, CategoryGroup<T>>();
  for (const item of items) {
    const group = groups.get(item.categoryId);
    if (group) group.items.push(item);
    else
      groups.set(item.categoryId, {
        key: item.categoryId,
        name: item.categoryName,
        color: item.categoryColor,
        icon: item.categoryIcon,
        items: [item],
      });
  }
  return [...groups.values()];
}
