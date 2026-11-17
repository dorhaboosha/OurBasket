import type { Page } from "@playwright/test";
import { addProduct, db, expect, seedDefaults, test } from "./fixtures";

test.beforeEach(async ({ signInAs }) => {
  await seedDefaults();
  await addProduct("מוצרי חלב", "חלב");
  await addProduct("מוצרי חלב", "גבינה");
  await addProduct("כללי", "סוללות");
  await signInAs("dor");
});

const updateButton = (page: Page) => page.getByRole("button", { name: "עדכון רשימה" });

async function openList(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("product-row").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function check(page: Page, name: string) {
  await page.getByRole("checkbox", { name }).check();
  await expect
    .poll(async () => {
      const { rows } = await db.query(`SELECT "isChecked" FROM product WHERE name = $1`, [name]);
      return rows[0]?.isChecked;
    })
    .toBe(true);
}

async function history() {
  const { rows } = await db.query<{ name: string; quantity: number; category: string }>(
    `SELECT i."productName" AS name, i.quantity, i."categoryName" AS category
     FROM purchase_record_item i ORDER BY i.position`,
  );
  return rows;
}

test("is off until a product is checked off @mobile", async ({ page }) => {
  await openList(page);
  await expect(updateButton(page)).toBeDisabled();
  await check(page, "חלב");
  await expect(updateButton(page)).toBeEnabled();
});

test("asks first, then records the checked products and removes them @mobile", async ({ page }) => {
  await openList(page);
  await check(page, "חלב");
  await check(page, "סוללות");

  await updateButton(page).click();
  const dialog = page.getByRole("alertdialog", { name: "לעדכן את הרשימה?" });
  await expect(dialog).toContainText(
    "2 המוצרים המסומנים יירשמו בהיסטוריית הקניות ויימחקו מהרשימה.",
  );
  await expect(dialog).toContainText("מוצרים שלא סומנו יישארו ברשימה.");
  await expect(dialog.getByRole("button", { name: "ביטול" })).toBeFocused();
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(page.getByTestId("product-row")).toHaveCount(3);
  expect(await history()).toEqual([]);

  await updateButton(page).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "עדכון רשימה" }).click();
  await expect(page.getByText("2 מוצרים נרשמו בהיסטוריית הקניות והוסרו מהרשימה.")).toBeVisible();
  await expect(page.getByTestId("product-row")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "גבינה" })).not.toBeChecked();
  await expect(updateButton(page)).toBeDisabled();
  expect(await history()).toEqual([
    { name: "חלב", quantity: 1, category: "מוצרי חלב" },
    { name: "סוללות", quantity: 1, category: "כללי" },
  ]);
});

test("a product unchecked on the other phone meanwhile stays on the list", async ({ page }) => {
  await openList(page);
  await check(page, "חלב");
  await check(page, "גבינה");
  await updateButton(page).click();
  // Meanwhile, on the other phone:
  await db.query(`UPDATE product SET "isChecked" = false WHERE name = 'גבינה'`);

  await page.getByRole("alertdialog").getByRole("button", { name: "עדכון רשימה" }).click();
  await expect(
    page.getByText(
      "מוצר אחד נרשם בהיסטוריית הקניות והוסר מהרשימה. מוצר אחד לא נרשם, כי כבר לא היה מסומן או כבר לא היה ברשימה.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "גבינה" })).not.toBeChecked();
  expect((await history()).map((item) => item.name)).toEqual(["חלב"]);
});

test("nothing is recorded when nothing is checked anymore", async ({ page }) => {
  await openList(page);
  await check(page, "חלב");
  await updateButton(page).click();
  await db.query(`UPDATE product SET "isChecked" = false`);

  await page.getByRole("alertdialog").getByRole("button", { name: "עדכון רשימה" }).click();
  await expect(page.getByText("אף מוצר לא נרשם", { exact: false })).toBeVisible();
  await expect(page.getByTestId("product-row")).toHaveCount(3);
  expect((await db.query(`SELECT 1 FROM purchase_record`)).rowCount).toBe(0);
});
