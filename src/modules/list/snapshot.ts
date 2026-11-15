import "server-only";
import { prisma } from "@/lib/prisma";

/** A product on the active list. */
export type ListProduct = {
  id: string;
  categoryId: string;
  name: string;
  quantity: number;
  isChecked: boolean;
  version: number;
};

/** A category with its products: unchecked ones in the users' order, then checked ones. */
export type ListCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  isSystem: boolean;
  products: ListProduct[];
};

/**
 * The whole active list at one revision (spec 12.2). Every list action returns one, and
 * the screen shows it only if its revision isn't older than the one already shown.
 */
export type ListSnapshot = {
  revision: number;
  /** All categories in order, including empty ones (the forms offer them). */
  categories: ListCategory[];
};

/**
 * Reads the list and its revision in one repeatable-read transaction, so the revision
 * always describes exactly the data returned with it.
 */
export async function getListSnapshot(): Promise<ListSnapshot> {
  const [state, categories] = await prisma.$transaction(
    [
      prisma.listState.findUnique({ where: { id: 1 }, select: { revision: true } }),
      prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          isSystem: true,
          products: {
            // A checked product goes to the bottom of its category (spec 8.6); unchecking
            // brings it back to its place in the order.
            orderBy: [{ isChecked: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              categoryId: true,
              name: true,
              quantity: true,
              isChecked: true,
              version: true,
            },
          },
        },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return { revision: state?.revision ?? 0, categories };
}
