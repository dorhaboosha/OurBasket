import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as historyActions from "@/app/(app)/history/actions";
import * as listActions from "@/app/(app)/list-actions";
import * as settingsActions from "@/app/(app)/settings/actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCategory, createProduct, createUser, resetDatabase } from "./helpers";

// Acceptance (spec 20): a direct request to the server without permission is refused.
// Server actions are reachable by a direct POST, not only from the app's screens, so each
// one must check the session first. Every exported action is called here with arguments
// that would succeed, by a caller who isn't allowed in: each must send them to /login and
// change nothing.

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
// Messages are looked up inside a Next.js request only; their text doesn't matter here.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
// No real-time events from a test.
vi.mock("@/modules/realtime/server", () => ({ notifyListChanged: vi.fn() }));

vi.stubEnv("USER_EMAIL_DOR", "dor@example.com");
vi.stubEnv("USER_EMAIL_MAAYAN", "maayan@example.com");

type Ids = {
  general: string;
  dairy: string;
  milk: string;
  cheese: string;
  record: string;
};

async function seed(): Promise<Ids> {
  const general = await createCategory({ name: "כללי", isSystem: true, sortOrder: 0 });
  const dairy = await createCategory({ name: "מוצרי חלב", sortOrder: 1 });
  const milk = await createProduct(dairy.id, { name: "חלב", quantity: 2 });
  const cheese = await createProduct(dairy.id, { name: "גבינה", quantity: 1 });
  await prisma.product.update({ where: { id: milk.id }, data: { isChecked: true } });
  await prisma.listState.create({ data: { id: 1, revision: 3 } });
  const record = await prisma.purchaseRecord.create({
    data: {
      items: {
        create: {
          productName: "לחם",
          normalizedName: "לחם",
          quantity: 1,
          categoryId: general.id,
          categoryName: "כללי",
          categoryColor: "gray",
          categoryIcon: "🛒",
        },
      },
    },
  });
  return {
    general: general.id,
    dairy: dairy.id,
    milk: milk.id,
    cheese: cheese.id,
    record: record.id,
  };
}

/** Each action with arguments that would change the data if it ran. */
function calls(ids: Ids): Record<string, () => Promise<unknown>> {
  return {
    getListAction: () => listActions.getListAction(),
    addProductAction: () =>
      listActions.addProductAction({ name: "ביצים", quantity: 1, categoryId: ids.dairy }),
    updateProductAction: () =>
      listActions.updateProductAction(ids.cheese, 1, {
        name: "גבינה לבנה",
        quantity: 3,
        categoryId: ids.general,
      }),
    changeQuantityAction: () => listActions.changeQuantityAction(ids.cheese, 1),
    setQuantityAction: () => listActions.setQuantityAction(ids.cheese, 1, 5),
    setCheckedAction: () => listActions.setCheckedAction(ids.cheese, true),
    deleteProductAction: () => listActions.deleteProductAction(ids.cheese),
    restoreProductAction: () =>
      listActions.restoreProductAction({
        name: "יוגורט",
        quantity: 1,
        categoryId: ids.dairy,
        sortOrder: 0,
        isChecked: false,
      }),
    moveProductAction: () => listActions.moveProductAction(ids.cheese, ids.general, [ids.cheese]),
    clearListAction: () => listActions.clearListAction(3),
    updateListAction: () => listActions.updateListAction([ids.milk]),
    loadHistoryAction: () => historyActions.loadHistoryAction(null),
    addRecordToListAction: () => historyActions.addRecordToListAction(ids.record),
    deleteHistoryRecordAction: () => historyActions.deleteHistoryRecordAction(ids.record),
    createCategoryAction: () =>
      settingsActions.createCategoryAction({ name: "ניקיון", color: "teal", icon: "🧽" }),
    updateCategoryAction: () =>
      settingsActions.updateCategoryAction(ids.dairy, 1, {
        name: "חלבי",
        color: "blue",
        icon: "🥛",
      }),
    deleteCategoryAction: () => settingsActions.deleteCategoryAction(ids.dairy, 1, 2),
    reorderCategoriesAction: () =>
      settingsActions.reorderCategoriesAction([ids.dairy, ids.general]),
  };
}

/** Everything an action could change. */
async function everything() {
  return {
    categories: await prisma.category.findMany({ orderBy: { id: "asc" } }),
    products: await prisma.product.findMany({ orderBy: { id: "asc" } }),
    records: await prisma.purchaseRecord.findMany({ include: { items: true } }),
    listState: await prisma.listState.findMany(),
  };
}

/** Makes Better Auth report this user as signed in. */
function signIn(user: Awaited<ReturnType<typeof createUser>>) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user,
    session: { id: randomUUID(), userId: user.id, token: "t", expiresAt: new Date() },
  } as never);
}

let ids: Ids;

beforeEach(async () => {
  await resetDatabase();
  ids = await seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

/** Every file in src that declares server actions: a whole file, or inside a function. */
function serverActionFiles() {
  const src = path.resolve("src");
  return readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !file.startsWith(`generated${path.sep}`))
    .filter((file) =>
      // The directive on its own line, maybe followed by a comment.
      /^\s*["']use server["'];?\s*(\/\/.*|\/\*.*\*\/\s*)?$/m.test(
        readFileSync(path.join(src, file), "utf8"),
      ),
    )
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

describe("every server action", () => {
  it("lives in one of the files imported here, so none is missed", () => {
    expect(serverActionFiles()).toEqual([
      "app/(app)/history/actions.ts",
      "app/(app)/list-actions.ts",
      "app/(app)/settings/actions.ts",
    ]);
  });

  it("is in this test, so a new one can't skip it", () => {
    const exported = [listActions, historyActions, settingsActions].flatMap((module) =>
      Object.entries(module)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name),
    );
    expect(Object.keys(calls(ids)).sort()).toEqual(exported.sort());
  });

  const callers = {
    "a signed-out caller": () => {},
    "a Google user who isn't on the allowlist": async () =>
      signIn(await createUser("stranger", "stranger@example.com")),
    "a user whose email was removed from the allowlist": async () => {
      signIn(await createUser("dor", "dor@example.com"));
      vi.stubEnv("USER_EMAIL_DOR", "someone-else@example.com");
    },
  };

  for (const [caller, signInAs] of Object.entries(callers)) {
    it(`sends ${caller} to /login and changes nothing`, async () => {
      try {
        await signInAs();
        const before = await everything();
        for (const [name, call] of Object.entries(calls(ids))) {
          await expect(call(), name).rejects.toThrow("REDIRECT:/login");
        }
        expect(await everything()).toEqual(before);
      } finally {
        vi.stubEnv("USER_EMAIL_DOR", "dor@example.com");
      }
    });
  }

  it("runs for an allowed user: the arguments above are ones that work", async () => {
    signIn(await createUser("dor", "dor@example.com"));
    for (const name of Object.keys(calls(ids))) {
      // Each on the data as seeded.
      await prisma.$executeRawUnsafe(
        `TRUNCATE "category", "product", "purchase_record_item", "purchase_record", "list_state" CASCADE`,
      );
      ids = await seed();
      const result = await calls(ids)[name]();
      expect(result, name).not.toMatchObject({ ok: false });
    }
  });
});
