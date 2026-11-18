import type { Page } from "@playwright/test";
import { addProduct, addPurchase, db, expect, seedDefaults, test } from "./fixtures";

test.beforeEach(async ({ signInAs }) => {
  await seedDefaults();
  await signInAs("dor");
});

const cards = (page: Page) => page.getByTestId("purchase-card");

/** 18 Nov 2026, 12:30 UTC: 14:30 in Israel (winter time, UTC+2). */
const NOV_18 = new Date("2026-11-18T12:30:00Z");

async function onList() {
  const { rows } = await db.query<{ name: string; quantity: number; category: string }>(
    `SELECT p.name, p.quantity, c.name AS category FROM product p
     JOIN category c ON c.id = p."categoryId" ORDER BY p.name`,
  );
  return rows;
}

async function openPurchase(page: Page, id: string) {
  await page.goto(`/history/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("with no purchases yet, explains how they get here @mobile", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByTestId("empty-history")).toContainText("עוד אין קניות בהיסטוריה.");
  await page.getByRole("link", { name: "לרשימת הקניות" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("shows purchases newest first, in Israel time, with their counts @mobile", async ({
  page,
}) => {
  await addPurchase(new Date("2026-06-01T09:00:00Z"), [["לחם", 1, "לחמים ומאפים"]]);
  await addPurchase(NOV_18, [
    ["חלב", 2, "מוצרי חלב"],
    ["גבינה", 1, "מוצרי חלב"],
    ["מים", 6, "משקאות"],
  ]);
  await page.goto("/history");

  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText("18 בנובמבר 2026");
  await expect(cards(page).first()).toContainText("14:30");
  await expect(cards(page).first()).toContainText("3 מוצרים · 2 קטגוריות");
  // Summer time: 09:00 UTC is 12:00 in Israel.
  await expect(cards(page).last()).toContainText("1 ביוני 2026");
  await expect(cards(page).last()).toContainText("12:00");
  await expect(cards(page).last()).toContainText("מוצר אחד · קטגוריה אחת");
});

test("a purchase made with update list appears, with its products by category", async ({
  page,
}) => {
  await addProduct("משקאות", "מים");
  await addProduct("מוצרי חלב", "חלב");
  await addProduct("כללי", "סוללות");
  await db.query(`UPDATE product SET "isChecked" = true WHERE name IN ('מים', 'חלב')`);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "עדכון רשימה" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "עדכון רשימה" }).click();
  await expect(page.getByText("נרשמו בהיסטוריית הקניות", { exact: false })).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "היסטוריה" }).click();
  await expect(cards(page)).toHaveCount(1);
  await cards(page).click();
  await expect(page).toHaveURL(/\/history\/.+/);
  const sections = page.getByTestId("purchase-category");
  await expect(sections).toHaveCount(2);
  await expect(sections.first()).toContainText("מוצרי חלב");
  await expect(sections.first()).toContainText("חלב");
  await expect(sections.last()).toContainText("משקאות");
  await expect(sections.last()).toContainText("כמות: 1");

  await page.getByRole("link", { name: "חזרה להיסטוריה" }).click();
  await expect(page).toHaveURL(/\/history$/);
});

test("shows a category as it was, even after it was renamed", async ({ page }) => {
  const id = await addPurchase(NOV_18, [["גלידה", 1, "קפואים"]]);
  await db.query(`UPDATE category SET name = 'מוקפאים', icon = '🍦' WHERE name = 'קפואים'`);
  await openPurchase(page, id);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("🧊קפואים");
});

test("adds a purchase back to the list, merging what's already there", async ({ page }) => {
  const id = await addPurchase(NOV_18, [
    ["חלב", 2, "מוצרי חלב"],
    ["מים", 6, "משקאות"],
  ]);
  await addProduct("כללי", "חלב"); // on the list again, in another category
  await openPurchase(page, id);

  await page.getByRole("button", { name: "הוספה לרשימה" }).click();
  await expect(
    page.getByText("מוצר אחד נוסף לרשימה. הכמות של מוצר אחד שכבר היה ברשימה עודכנה."),
  ).toBeVisible();
  expect(await onList()).toEqual([
    { name: "חלב", quantity: 3, category: "כללי" },
    { name: "מים", quantity: 6, category: "משקאות" },
  ]);
  // The purchase stays in history.
  await expect(page.getByTestId("purchase-item")).toHaveCount(2);

  await page.getByRole("button", { name: "לרשימת הקניות" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("textbox", { name: "כמות של חלב" })).toHaveValue("3");
});

test("deleting asks first, then removes only the history record @mobile", async ({ page }) => {
  const id = await addPurchase(NOV_18, [
    ["חלב", 2, "מוצרי חלב"],
    ["מים", 6, "משקאות"],
  ]);
  await addProduct("כללי", "סוללות");
  await openPurchase(page, id);

  await page.getByRole("button", { name: "מחיקת הרשומה" }).click();
  const dialog = page.getByRole("alertdialog", { name: "למחוק את רשומת הקנייה?" });
  await expect(dialog).toContainText("18 בנובמבר 2026");
  await expect(dialog).toContainText("עם 2 מוצרים, תימחק מההיסטוריה.");
  await expect(dialog).toContainText("המוצרים לא יחזרו לרשימה.");
  await expect(dialog.getByRole("button", { name: "ביטול" })).toBeFocused();
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "מחיקת הרשומה" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "מחיקה" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("רשומת הקנייה נמחקה.")).toBeVisible();
  await expect(page.getByTestId("empty-history")).toBeVisible();
  expect((await db.query(`SELECT 1 FROM purchase_record_item`)).rowCount).toBe(0);
  expect(await onList()).toEqual([{ name: "סוללות", quantity: 1, category: "כללי" }]);
});

test("a purchase that no longer exists says so", async ({ page }) => {
  await page.goto(`/history/${crypto.randomUUID()}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "הקנייה הזו לא נמצאה. אולי היא נמחקה במכשיר אחר.",
  );
  await expect(page.getByRole("link", { name: "חזרה להיסטוריה" })).toBeVisible();
});

test("older purchases load on request", async ({ page }) => {
  for (let day = 1; day <= 23; day += 1) {
    await addPurchase(new Date(Date.UTC(2026, 9, day, 10)), [["לחם", day, "לחמים ומאפים"]]);
  }
  await page.goto("/history");
  await expect(cards(page)).toHaveCount(20);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "קניות קודמות" }).click();
  await expect(cards(page)).toHaveCount(23);
  await expect(cards(page).last()).toContainText("1 באוקטובר 2026");
  await expect(page.getByRole("button", { name: "קניות קודמות" })).toHaveCount(0);
});
