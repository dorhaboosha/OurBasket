import { describe, expect, it } from "vitest";
import { groupByCategory } from "./group";

const item = (name: string, categoryId: string, categoryName = categoryId) => ({
  name,
  categoryId,
  categoryName,
  categoryColor: "blue",
  categoryIcon: "🥛",
});

describe("groupByCategory", () => {
  it("groups by category id, in first-appearance order, keeping item order", () => {
    const groups = groupByCategory([
      item("חלב", "dairy"),
      item("מים", "drinks"),
      item("גבינה", "dairy"),
    ]);
    expect(groups.map((group) => [group.key, group.items.map((i) => i.name)])).toEqual([
      ["dairy", ["חלב", "גבינה"]],
      ["drinks", ["מים"]],
    ]);
  });

  it("keeps two categories that had the same name apart", () => {
    const groups = groupByCategory([item("א", "c1", "כללי"), item("ב", "c2", "כללי")]);
    expect(groups).toHaveLength(2);
  });

  it("is empty for no items", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
