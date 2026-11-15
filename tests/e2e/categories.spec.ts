import type { Page } from "@playwright/test";
import { addProduct, db, expect, savedCategoryNames, seedDefaults, test } from "./fixtures";

const DEFAULT_NAMES = [
  "מוצרי חלב",
  "פירות וירקות",
  "בשר, עוף ודגים",
  "לחמים ומאפים",
  "מוצרי מזווה",
  "קפואים",
  "חטיפים ומתוקים",
  "משקאות",
  "מוצרי ניקיון",
  "מוצרי טיפוח והיגיינה",
  "ציוד לבית",
  "כללי",
];

test.beforeEach(async ({ signInAs }) => {
  await seedDefaults();
  await signInAs("dor");
});

const list = (page: Page) => page.getByRole("list", { name: "הקטגוריות לפי הסדר" });
// By test id, not inside the list's role: while a dialog is open, the page behind it is
// hidden from the accessibility tree, but these tests still check it.
const rows = (page: Page) => page.getByTestId("category-row");

/** Opens the settings, once React has hydrated (buttons do nothing before that). */
async function openSettings(page: Page) {
  await page.goto("/settings");
  await expect(rows(page)).toHaveCount(DEFAULT_NAMES.length);
  await page.waitForLoadState("networkidle");
}

/** Clicks a button that opens a dialog, retrying until React has hydrated it. */
async function openDialog(page: Page, button: string) {
  await expect(async () => {
    await page.getByRole("button", { name: button }).click({ timeout: 1000 });
    await expect(page.getByRole("dialog").or(page.getByRole("alertdialog"))).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
}

test("lists the default categories in order, with General marked and not deletable @mobile", async ({
  page,
}) => {
  await addProduct("מוצרי חלב", "חלב");
  await addProduct("מוצרי חלב", "גבינה");
  await openSettings(page);

  await expect(rows(page)).toContainText(DEFAULT_NAMES.map((name) => name));
  await expect(rows(page).first()).toContainText("🥛");
  await expect(rows(page).first()).toContainText("2 מוצרים");
  await expect(rows(page).nth(1)).toContainText("אין מוצרים");

  const general = rows(page).last();
  await expect(general).toContainText("קטגוריית מערכת");
  await expect(general.getByRole("button", { name: "עריכת כללי" })).toBeVisible();
  await expect(general.getByRole("button", { name: "מחיקת כללי" })).toHaveCount(0);
});

test("adds a category with a name, color and emoji, at the end", async ({ page }) => {
  await openSettings(page);
  await openDialog(page, "הוספת קטגוריה");
  const dialog = page.getByRole("dialog", { name: "קטגוריה חדשה" });

  await expect(dialog.getByLabel("שם")).toBeFocused();
  await dialog.getByLabel("שם").fill("  ציוד   למסיבה ");
  await dialog.getByRole("radio", { name: "ורוד" }).click();
  await dialog.getByRole("radio", { name: "🎉" }).click();
  await expect(dialog.getByRole("radio", { name: "ורוד" })).toBeChecked();
  await expect(dialog.getByTestId("category-preview")).toContainText("🎉");
  await dialog.getByRole("button", { name: "הוספה" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(rows(page)).toHaveCount(13);
  await expect(rows(page).last()).toContainText("ציוד למסיבה");
  await expect(rows(page).last()).toContainText("🎉");

  const { rows: saved } = await db.query(
    `SELECT name, color, icon, "sortOrder" FROM category WHERE name = 'ציוד למסיבה'`,
  );
  expect(saved).toEqual([{ name: "ציוד למסיבה", color: "pink", icon: "🎉", sortOrder: 12 }]);
});

test("explains what's wrong with a name, and keeps the form open", async ({ page }) => {
  await openSettings(page);
  await openDialog(page, "הוספת קטגוריה");
  const dialog = page.getByRole("dialog", { name: "קטגוריה חדשה" });
  const name = dialog.getByLabel("שם");

  await dialog.getByRole("button", { name: "הוספה" }).click();
  await expect(dialog.getByText("צריך לתת לקטגוריה שם.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");

  await name.fill(" משקאות ");
  // The error goes away as soon as the field changes.
  await expect(dialog.getByText("צריך לתת לקטגוריה שם.")).toHaveCount(0);
  await dialog.getByRole("button", { name: "הוספה" }).click();
  await expect(dialog.getByText("כבר יש קטגוריה בשם הזה.")).toBeVisible();
  await expect(name).toBeFocused();
  await expect(rows(page)).toHaveCount(12);
});

test("a typed emoji works, and anything else is refused", async ({ page }) => {
  await openSettings(page);
  await openDialog(page, "הוספת קטגוריה");
  const dialog = page.getByRole("dialog", { name: "קטגוריה חדשה" });
  await dialog.getByLabel("שם").fill("מאפייה");
  const custom = dialog.getByLabel("אימוג'י אחר");

  await custom.fill("abc");
  await expect(dialog.getByTestId("category-preview")).toContainText("📦");
  await expect(dialog.getByTestId("category-preview")).not.toContainText("abc");
  await dialog.getByRole("button", { name: "הוספה" }).click();
  await expect(dialog.getByText("בחרו אימוג'י אחד.")).toBeVisible();

  await custom.fill("🥨");
  await expect(dialog.getByText("בחרו אימוג'י אחד.")).toHaveCount(0);
  await expect(dialog.getByTestId("category-preview")).toContainText("🥨");
  await expect(dialog.getByRole("radio", { checked: true, name: "📦" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "הוספה" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows(page).last()).toContainText("🥨");
});

test("edits a category, including the system one", async ({ page }) => {
  await openSettings(page);
  await openDialog(page, "עריכת כללי");
  const dialog = page.getByRole("dialog", { name: "עריכת קטגוריה" });

  await expect(dialog.getByLabel("שם")).toHaveValue("כללי");
  await expect(dialog.getByRole("radio", { name: "אפור" })).toBeChecked();
  await dialog.getByLabel("שם").fill("שונות");
  await dialog.getByRole("radio", { name: "סגול" }).click();
  await dialog.getByRole("button", { name: "שמירה" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(rows(page).last()).toContainText("שונות");
  await expect(rows(page).last()).toContainText("קטגוריית מערכת");
  const { rows: saved } = await db.query(`SELECT name, color FROM category WHERE "isSystem"`);
  expect(saved).toEqual([{ name: "שונות", color: "purple" }]);
});

test("a save after someone else's edit is refused, then works with the latest", async ({
  page,
}) => {
  await openSettings(page);
  await openDialog(page, "עריכת משקאות");
  const dialog = page.getByRole("dialog", { name: "עריכת קטגוריה" });
  // Meanwhile, on another device:
  await db.query(`UPDATE category SET icon = '🧃', version = version + 1 WHERE name = 'משקאות'`);

  await dialog.getByLabel("שם").fill("שתייה");
  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(
    dialog.getByText("הקטגוריה השתנתה בינתיים במכשיר אחר", { exact: false }),
  ).toBeVisible();
  await expect(rows(page).nth(7)).toContainText("🧃");
  // The form now has the other device's emoji (untouched here), and still this name.
  await expect(dialog.getByLabel("אימוג'י אחר")).toHaveValue("🧃");
  await expect(dialog.getByLabel("שם")).toHaveValue("שתייה");

  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows(page).nth(7)).toContainText("שתייה");
  // Saving again didn't undo the other device's change.
  const { rows: saved } = await db.query(`SELECT name, icon FROM category WHERE name = 'שתייה'`);
  expect(saved).toEqual([{ name: "שתייה", icon: "🧃" }]);
});

test("each picker is one Tab stop, and the arrow keys choose within it", async ({ page }) => {
  await openSettings(page);
  await openDialog(page, "הוספת קטגוריה");
  const dialog = page.getByRole("dialog", { name: "קטגוריה חדשה" });

  await dialog.getByLabel("שם").press("Tab");
  await expect(dialog.getByRole("radio", { name: "כחול" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("radio", { name: "תכלת" })).toBeFocused();
  await expect(dialog.getByRole("radio", { name: "תכלת" })).toBeChecked();

  // One Tab leaves the 12 colors for the chosen emoji.
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("radio", { name: "📦" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(dialog.getByRole("radio", { name: "🛒" })).toBeChecked();
  await expect(dialog.getByTestId("category-preview")).toContainText("🛒");
});

test("deleting asks first, says how many products go too, and can be cancelled", async ({
  page,
}) => {
  await addProduct("מוצרי חלב", "חלב");
  await addProduct("מוצרי חלב", "גבינה");
  await addProduct("משקאות", "מים");
  await openSettings(page);

  await openDialog(page, "מחיקת מוצרי חלב");
  const dialog = page.getByRole("alertdialog", { name: "למחוק את הקטגוריה?" });
  await expect(dialog).toContainText('הקטגוריה "🥛 מוצרי חלב" תימחק.');
  await expect(dialog).toContainText("גם 2 המוצרים שבה יימחקו מהרשימה.");
  await expect(dialog.getByRole("button", { name: "ביטול" })).toBeFocused();
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows(page)).toHaveCount(12);

  await openDialog(page, "מחיקת מוצרי חלב");
  await page.getByRole("alertdialog").getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(11);
  await expect(list(page)).not.toContainText("מוצרי חלב");
  // Keyboard focus isn't lost with the deleted row.
  await expect(page.getByRole("button", { name: "הוספת קטגוריה" })).toBeFocused();
  const { rows: products } = await db.query(`SELECT name FROM product`);
  expect(products).toEqual([{ name: "מים" }]);
});

test("a delete is refused when products were added since the question", async ({ page }) => {
  await openSettings(page);
  await openDialog(page, "מחיקת קפואים");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).not.toContainText("יימחק");
  await addProduct("קפואים", "גלידה");

  await dialog.getByRole("button", { name: "מחיקה" }).click();
  await expect(dialog).toContainText("מספר המוצרים בקטגוריה השתנה בינתיים");
  // The question now shows the current count; confirming again deletes.
  await expect(dialog).toContainText("גם המוצר שבה יימחק מהרשימה.");
  await dialog.getByRole("button", { name: "מחיקה" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(list(page)).not.toContainText("קפואים");
});

test("moves a category with the keyboard, and the order is saved", async ({ page }) => {
  await openSettings(page);
  const handle = page.getByRole("button", { name: "הזזת מוצרי חלב" });
  await handle.focus();
  // Each key waits for the screen reader announcement: moves animate, and a key pressed
  // mid-move is measured against the old positions.
  const announced = (text: string | RegExp) => expect(page.getByText(text)).toBeAttached();
  await page.keyboard.press("Space");
  // "Picked up", soon replaced by "in place 1": the live region keeps only the latest.
  await announced(/מוצרי חלב.* 1 מתוך 12\./);
  await page.keyboard.press("ArrowDown");
  await announced("מוצרי חלב במקום 2 מתוך 12.");
  await page.keyboard.press("ArrowDown");
  await announced("מוצרי חלב במקום 3 מתוך 12.");
  await page.keyboard.press("Space");
  await announced("מוצרי חלב הונחה במקום 3 מתוך 12.");

  const expected = ["פירות וירקות", "בשר, עוף ודגים", "מוצרי חלב", ...DEFAULT_NAMES.slice(3)];
  await expect(rows(page)).toContainText(expected);
  await expect.poll(savedCategoryNames).toEqual(expected);

  await page.reload();
  await expect(rows(page)).toContainText(expected);
});

test("moves a category by dragging its handle", async ({ page }) => {
  await openSettings(page);
  const handle = page.getByRole("button", { name: "הזזת בשר, עוף ודגים" });
  const from = (await handle.boundingBox())!;
  const to = (await rows(page).first().boundingBox())!;
  const x = from.x + from.width / 2;

  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, from.y + from.height / 2 - 10, { steps: 5 });
  await page.mouse.move(x, to.y + to.height / 4, { steps: 20 });
  await page.mouse.up();

  await expect(rows(page).first()).toContainText("בשר, עוף ודגים");
  await expect.poll(async () => (await savedCategoryNames())[0]).toBe("בשר, עוף ודגים");
});

test("a long name wraps on a phone instead of being cut off @mobile", async ({ page }) => {
  await openSettings(page);
  const row = rows(page).filter({ hasText: "מוצרי טיפוח והיגיינה" });
  const name = row.getByText("מוצרי טיפוח והיגיינה", { exact: true });
  // Fully shown: nothing hidden past the element's edge.
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
