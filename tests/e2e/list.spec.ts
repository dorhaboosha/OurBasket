import type { Page } from "@playwright/test";
import { addProduct, db, expect, seedDefaults, test } from "./fixtures";

test.beforeEach(async ({ signInAs }) => {
  await seedDefaults();
  await signInAs("dor");
});

const rows = (page: Page) => page.getByTestId("product-row");
const row = (page: Page, name: string) =>
  rows(page).filter({ has: page.getByText(name, { exact: true }) });
const section = (page: Page, category: string) =>
  page.getByRole("region", { name: new RegExp(`^${category}`) });
const quantity = (page: Page, name: string) =>
  page.getByRole("textbox", { name: `כמות של ${name}` });

/** The products shown in a category, top to bottom. */
async function namesIn(page: Page, category: string) {
  return section(page, category).locator("label").allInnerTexts();
}

async function saved(name: string) {
  const { rows: found } = await db.query<{
    quantity: number;
    isChecked: boolean;
    category: string;
  }>(
    `SELECT p.quantity, p."isChecked", c.name AS category
     FROM product p JOIN category c ON c.id = p."categoryId" WHERE p.name = $1`,
    [name],
  );
  return found;
}

/** Opens the list once React has hydrated (buttons do nothing before that). */
async function openList(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "רשימת הקניות" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function openAddDialog(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "הוספת מוצר" }).first().click({ timeout: 1000 });
    await expect(page.getByRole("dialog", { name: "מוצר חדש" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  return page.getByRole("dialog", { name: "מוצר חדש" });
}

async function addThroughForm(page: Page, name: string, qty?: string, category?: string) {
  const dialog = await openAddDialog(page);
  await dialog.getByLabel("שם המוצר").fill(name);
  if (qty) await dialog.getByLabel("כמות").fill(qty);
  if (category) await dialog.getByLabel("קטגוריה").selectOption({ label: category });
  await dialog.getByRole("button", { name: "הוספה" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("adding", () => {
  test("an empty list invites the first product, which goes to General @mobile", async ({
    page,
  }) => {
    await openList(page);
    await expect(page.getByTestId("empty-list")).toContainText("הרשימה ריקה.");
    await expect(page.getByRole("button", { name: "נקה רשימה" })).toHaveCount(0);

    const dialog = await openAddDialog(page);
    await expect(dialog.getByLabel("שם המוצר")).toBeFocused();
    await expect(dialog.getByLabel("כמות")).toHaveValue("1");
    await expect(dialog.getByLabel("קטגוריה").locator("option:checked")).toHaveText("🛒 כללי");
    await expect(dialog.getByLabel("קטגוריה").getByRole("option")).toHaveCount(12);
    await dialog.getByLabel("שם המוצר").fill("סוללות");
    await dialog.getByRole("button", { name: "הוספה" }).click();

    await expect(page.getByText("סוללות נוסף לרשימה.")).toBeVisible();
    await expect(row(page, "סוללות")).toBeVisible();
    expect(await saved("סוללות")).toEqual([{ quantity: 1, isChecked: false, category: "כללי" }]);
  });

  test("adds with a quantity and a category, at the end of it", async ({ page }) => {
    await addProduct("מוצרי חלב", "חלב");
    await openList(page);
    await addThroughForm(page, "גבינה", "3", "🥛 מוצרי חלב");
    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["חלב", "גבינה"]);
    await expect(quantity(page, "גבינה")).toHaveValue("3");
  });

  test("adding a product that's already listed adds up the quantities, in its own category", async ({
    page,
  }) => {
    await addProduct("משקאות", "Coca Cola");
    await openList(page);
    await addThroughForm(page, "  coca   COLA ", "2", "🥛 מוצרי חלב");

    // The name as listed, not as typed.
    await expect(page.getByText("Coca Cola כבר ברשימה, במשקאות: הכמות עודכנה ל-3.")).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    expect(await saved("Coca Cola")).toEqual([
      { quantity: 3, isChecked: false, category: "משקאות" },
    ]);
  });

  test("a merge stops at 999, and says so", async ({ page }) => {
    await addProduct("משקאות", "מים");
    await db.query(`UPDATE product SET quantity = 995 WHERE name = 'מים'`);
    await openList(page);
    await addThroughForm(page, "מים", "10");
    await expect(page.getByText("הכמות הוגבלה ל-999, המקסימום", { exact: false })).toBeVisible();
    await expect(quantity(page, "מים")).toHaveValue("999");
  });

  test("explains what's wrong in the form, and keeps it open", async ({ page }) => {
    await openList(page);
    const dialog = await openAddDialog(page);
    await dialog.getByLabel("כמות").fill("2.5");
    let requests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") requests += 1;
    });
    await dialog.getByRole("button", { name: "הוספה" }).click();
    await expect(dialog.getByText("צריך לתת למוצר שם.")).toBeVisible();
    // Caught in the form: no request, and no toast over the dialog's buttons.
    expect(requests).toBe(0);
    await expect(page.getByText("יש שדות שצריך לתקן.")).toHaveCount(0);
    await expect(dialog.getByText("כמות היא מספר שלם מ-1 עד 999.")).toBeVisible();
    await expect(dialog.getByLabel("שם המוצר")).toBeFocused();

    await dialog.getByLabel("כמות").fill("1000");
    await dialog.getByLabel("שם המוצר").fill("לחם");
    await expect(dialog.getByText("צריך לתת למוצר שם.")).toHaveCount(0);
    await dialog.getByRole("button", { name: "הוספה" }).click();
    await expect(dialog.getByText("כמות היא מספר שלם מ-1 עד 999.")).toBeVisible();
    expect(await saved("לחם")).toEqual([]);
  });
});

test.describe("quantities", () => {
  test("+ and - change the quantity, and every press counts @mobile", async ({ page }) => {
    await addProduct("פירות וירקות", "עגבניות");
    await openList(page);
    const plus = page.getByRole("button", { name: "הוספת אחד לעגבניות" });
    await plus.click();
    await plus.click();
    await plus.click();
    await expect(quantity(page, "עגבניות")).toHaveValue("4");
    await page.getByRole("button", { name: "הורדת אחד מעגבניות" }).click();
    await expect.poll(async () => (await saved("עגבניות"))[0]?.quantity).toBe(3);
    await expect(quantity(page, "עגבניות")).toHaveValue("3");
    // Keyboard focus stays on the button between presses.
    await expect(page.getByRole("button", { name: "הורדת אחד מעגבניות" })).toBeFocused();
  });

  test("- at 1 deletes the product, and undo brings it back in its place", async ({ page }) => {
    for (const name of ["חלב", "גבינה", "יוגורט"]) await addProduct("מוצרי חלב", name);
    await openList(page);
    await page.getByRole("button", { name: "הורדת אחד מגבינה" }).click();

    await expect(page.getByText("גבינה נמחק מהרשימה.")).toBeVisible();
    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["חלב", "יוגורט"]);
    // Deleting isn't buying: no history.
    expect((await db.query(`SELECT 1 FROM purchase_record`)).rowCount).toBe(0);

    await page.getByRole("button", { name: "בטל" }).click();
    await expect(page.getByText("גבינה הוחזר לרשימה.")).toBeVisible();
    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["חלב", "גבינה", "יוגורט"]);
    expect(await saved("גבינה")).toEqual([
      { quantity: 1, isChecked: false, category: "מוצרי חלב" },
    ]);
  });

  test("a typed quantity is saved; 0 deletes; anything else is refused", async ({ page }) => {
    await addProduct("כללי", "סוללות");
    await openList(page);
    const field = quantity(page, "סוללות");

    await field.fill("7");
    await field.press("Enter");
    await expect.poll(async () => (await saved("סוללות"))[0]?.quantity).toBe(7);

    await field.fill("2.5");
    await field.press("Enter");
    await expect(page.getByText("כמות היא מספר שלם מ-0 עד 999. 0 מוחק את המוצר.")).toBeVisible();
    await expect(field).toHaveValue("7");

    await field.fill("0");
    await field.press("Enter");
    await expect(page.getByText("סוללות נמחק מהרשימה.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await page.getByRole("button", { name: "בטל" }).click();
    await expect.poll(async () => (await saved("סוללות"))[0]?.quantity).toBe(7);
    await expect(page.getByText("סוללות הוחזר לרשימה.")).toBeVisible();

    // One message at a time: deleting again replaces "put back".
    await quantity(page, "סוללות").fill("0");
    await quantity(page, "סוללות").press("Enter");
    await expect(page.getByText("סוללות נמחק מהרשימה.")).toBeVisible();
    await expect(page.getByText("סוללות הוחזר לרשימה.")).toHaveCount(0);
  });

  test("a typed quantity after a change elsewhere shows the latest one", async ({ page }) => {
    await addProduct("כללי", "סוללות");
    await openList(page);
    await db.query(`UPDATE product SET quantity = 5, version = version + 1 WHERE name = 'סוללות'`);
    const field = quantity(page, "סוללות");
    await field.fill("9");
    await field.press("Enter");
    await expect(page.getByText("הכמות השתנתה בינתיים במכשיר אחר", { exact: false })).toBeVisible();
    await expect(field).toHaveValue("5");
    expect((await saved("סוללות"))[0].quantity).toBe(5);
  });

  test("a refused 0 shows the quantity again, not 0", async ({ page }) => {
    await addProduct("כללי", "סוללות");
    await openList(page);
    await db.query(`UPDATE product SET version = version + 1 WHERE name = 'סוללות'`);
    const field = quantity(page, "סוללות");
    await field.fill("0");
    await field.press("Enter");
    await expect(page.getByText("הכמות השתנתה בינתיים במכשיר אחר", { exact: false })).toBeVisible();
    await expect(field).toHaveValue("1");
    expect(await saved("סוללות")).toHaveLength(1);
  });
});

test.describe("checking off", () => {
  test("a checked product is crossed out and goes to the bottom; unchecking brings it back @mobile", async ({
    page,
  }) => {
    for (const name of ["חלב", "גבינה", "יוגורט"]) await addProduct("מוצרי חלב", name);
    await openList(page);
    const milk = page.getByRole("checkbox", { name: "חלב" });

    await milk.check();
    await expect(milk).toBeChecked();
    await expect(row(page, "חלב").getByText("חלב")).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["גבינה", "יוגורט", "חלב"]);
    await expect(section(page, "מוצרי חלב")).toContainText("1 מתוך 3 סומנו");
    await expect.poll(async () => (await saved("חלב"))[0]?.isChecked).toBe(true);

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "חלב" })).toBeChecked();
    await page.getByRole("checkbox", { name: "חלב" }).uncheck();
    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["חלב", "גבינה", "יוגורט"]);
  });

  test("tapping the name checks the product too", async ({ page }) => {
    await addProduct("כללי", "סוללות");
    await openList(page);
    await row(page, "סוללות").getByText("סוללות", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "סוללות" })).toBeChecked();
    await expect.poll(async () => (await saved("סוללות"))[0]?.isChecked).toBe(true);
  });
});

test.describe("editing", () => {
  async function openEdit(page: Page, name: string) {
    await expect(async () => {
      await page.getByRole("button", { name: `עריכת ${name}` }).click({ timeout: 1000 });
      await expect(page.getByRole("dialog", { name: "עריכת מוצר" })).toBeVisible({
        timeout: 1000,
      });
    }).toPass();
    return page.getByRole("dialog", { name: "עריכת מוצר" });
  }

  test("changes the name, quantity and category, which moves it", async ({ page }) => {
    await addProduct("מוצרי חלב", "חלב");
    await addProduct("משקאות", "מים");
    await openList(page);
    const dialog = await openEdit(page, "חלב");
    await expect(dialog.getByLabel("קטגוריה")).toHaveValue(/.+/);

    await dialog.getByLabel("שם המוצר").fill("חלב שקדים");
    await dialog.getByLabel("כמות").fill("2");
    await dialog.getByLabel("קטגוריה").selectOption({ label: "🥤 משקאות" });
    await dialog.getByRole("button", { name: "שמירה" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("השינויים בחלב שקדים נשמרו.")).toBeVisible();
    await expect.poll(() => namesIn(page, "משקאות")).toEqual(["מים", "חלב שקדים"]);
    await expect(section(page, "מוצרי חלב")).toHaveCount(0);
    expect(await saved("חלב שקדים")).toEqual([
      { quantity: 2, isChecked: false, category: "משקאות" },
    ]);
  });

  test("renaming to another product's name is refused", async ({ page }) => {
    await addProduct("מוצרי חלב", "חלב");
    await addProduct("מוצרי חלב", "גבינה");
    await openList(page);
    const dialog = await openEdit(page, "גבינה");
    await dialog.getByLabel("שם המוצר").fill(" חלב ");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("המוצר כבר קיים ברשימה.")).toBeVisible();
    await expect(page.getByText("המוצר כבר קיים ברשימה.")).toHaveCount(1);
    await expect(dialog.getByLabel("שם המוצר")).toBeFocused();
    expect(await saved("גבינה")).toHaveLength(1);
  });

  test("a save after someone else's edit is refused, then keeps their change", async ({ page }) => {
    await addProduct("מוצרי חלב", "חלב");
    await openList(page);
    const dialog = await openEdit(page, "חלב");
    // Meanwhile, on another device: the quantity changes.
    await db.query(`UPDATE product SET quantity = 4, version = version + 1 WHERE name = 'חלב'`);

    await dialog.getByLabel("שם המוצר").fill("חלב 3%");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(
      dialog.getByText("המוצר השתנה בינתיים במכשיר אחר", { exact: false }),
    ).toBeVisible();
    await expect(dialog.getByLabel("כמות")).toHaveValue("4");
    await expect(dialog.getByLabel("שם המוצר")).toHaveValue("חלב 3%");

    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await saved("חלב 3%")).toEqual([
      { quantity: 4, isChecked: false, category: "מוצרי חלב" },
    ]);
  });

  test("deletes from the edit form, with undo", async ({ page }) => {
    await addProduct("כללי", "סוללות");
    await openList(page);
    const dialog = await openEdit(page, "סוללות");
    await dialog.getByRole("button", { name: "מחיקת המוצר" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("empty-list")).toBeVisible();
    await page.getByRole("button", { name: "בטל" }).click();
    await expect(row(page, "סוללות")).toBeVisible();
  });
});

test.describe("search and categories", () => {
  test.beforeEach(async () => {
    await addProduct("מוצרי חלב", "חלב");
    await addProduct("מוצרי חלב", "גבינה צהובה");
    await addProduct("משקאות", "Coca Cola");
  });

  test("filters as you type, by category, even closed ones @mobile", async ({ page }) => {
    await openList(page);
    const dairyToggle = section(page, "מוצרי חלב").getByRole("button", { expanded: true });
    await dairyToggle.click();
    await expect(row(page, "חלב")).toBeHidden();

    await page.getByRole("searchbox", { name: "חיפוש מוצר" }).fill("צהוב");
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "גבינה צהובה")).toBeVisible();
    await expect(section(page, "מוצרי חלב")).toBeVisible();
    await expect(section(page, "משקאות")).toHaveCount(0);

    await page.getByRole("searchbox", { name: "חיפוש מוצר" }).fill("COCA");
    await expect(row(page, "Coca Cola")).toBeVisible();

    await page.getByRole("searchbox", { name: "חיפוש מוצר" }).fill("אין כזה");
    await expect(page.getByText('אין מוצרים שמתאימים ל"אין כזה".')).toBeVisible();
    await page.getByRole("button", { name: "ניקוי החיפוש" }).last().click();
    await expect(page.getByRole("searchbox", { name: "חיפוש מוצר" })).toHaveValue("");
    await expect(page.getByRole("searchbox", { name: "חיפוש מוצר" })).toBeFocused();
    // Closed again after the search: the choice is kept.
    await expect(row(page, "חלב")).toBeHidden();
  });

  test("a closed category stays closed on this device", async ({ page }) => {
    await openList(page);
    await section(page, "משקאות").getByRole("button", { expanded: true }).click();
    await expect(row(page, "Coca Cola")).toBeHidden();
    await page.reload();
    await expect(section(page, "משקאות").getByRole("button", { expanded: false })).toBeVisible();
    await expect(row(page, "Coca Cola")).toBeHidden();
    await expect(row(page, "חלב")).toBeVisible();
  });
});

test.describe("clearing the list", () => {
  test("asks first, then deletes every product and leaves history alone", async ({ page }) => {
    await addProduct("מוצרי חלב", "חלב");
    await addProduct("כללי", "סוללות");
    await db.query(`UPDATE product SET "isChecked" = true WHERE name = 'חלב'`);
    await db.query(`INSERT INTO purchase_record (id) VALUES (gen_random_uuid())`);
    await openList(page);

    await page.getByRole("button", { name: "נקה רשימה" }).click();
    const dialog = page.getByRole("alertdialog", { name: "לנקות את הרשימה?" });
    await expect(dialog).toContainText("כל 2 המוצרים שברשימה יימחקו");
    await expect(dialog.getByRole("button", { name: "ביטול" })).toBeFocused();
    await dialog.getByRole("button", { name: "ביטול" }).click();
    await expect(rows(page)).toHaveCount(2);

    await page.getByRole("button", { name: "נקה רשימה" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ניקוי הרשימה" }).click();
    await expect(page.getByTestId("empty-list")).toBeVisible();
    await expect(page.getByText("הרשימה נוקתה.")).toBeVisible();
    expect((await db.query(`SELECT 1 FROM product`)).rowCount).toBe(0);
    expect((await db.query(`SELECT 1 FROM purchase_record`)).rowCount).toBe(1);
  });

  test("clears nothing if the list changed since the question", async ({ page }) => {
    await addProduct("כללי", "סוללות");
    await openList(page);
    await page.getByRole("button", { name: "נקה רשימה" }).click();
    await addProduct("כללי", "נורות"); // on another device
    await db.query(`UPDATE list_state SET revision = revision + 1`);

    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "ניקוי הרשימה" }).click();
    await expect(dialog).toContainText("הרשימה השתנתה מאז השאלה");
    await expect(dialog).toContainText("כל 2 המוצרים שברשימה יימחקו");
    expect((await db.query(`SELECT 1 FROM product`)).rowCount).toBe(2);

    // Asked again about the list as it is now: confirming clears it.
    await dialog.getByRole("button", { name: "ניקוי הרשימה" }).click();
    await expect(page.getByTestId("empty-list")).toBeVisible();
    expect((await db.query(`SELECT 1 FROM product`)).rowCount).toBe(0);
  });
});

test.describe("ordering", () => {
  test("moves a product within its category with the keyboard", async ({ page }) => {
    for (const name of ["חלב", "גבינה", "יוגורט"]) await addProduct("מוצרי חלב", name);
    await openList(page);
    await page.getByRole("button", { name: "הזזת חלב" }).focus();
    await page.keyboard.press("Space");
    // "Picked up", soon replaced by "over itself": the live region keeps only the latest.
    await expect(page.getByText(/^(הרמתם את חלב\.|חלב מעל חלב)/)).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("חלב מעל גבינה", { exact: false })).toBeAttached();
    await page.keyboard.press("Space");

    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["גבינה", "חלב", "יוגורט"]);
    await expect
      .poll(async () => {
        const { rows: order } = await db.query(`SELECT name FROM product ORDER BY "sortOrder"`);
        return order.map((r) => r.name);
      })
      .toEqual(["גבינה", "חלב", "יוגורט"]);
  });

  test("drags a product into another category", async ({ page }) => {
    await addProduct("מוצרי חלב", "חלב");
    await addProduct("מוצרי חלב", "גבינה");
    await addProduct("כללי", "שמנת");
    await openList(page);

    const handle = page.getByRole("button", { name: "הזזת שמנת" });
    const target = row(page, "גבינה");
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    const x = from.x + from.width / 2;
    await page.mouse.move(x, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, from.y + from.height / 2 - 10, { steps: 5 });
    await page.mouse.move(x, to.y + to.height / 3, { steps: 25 });
    await page.mouse.up();

    await expect.poll(async () => (await saved("שמנת"))[0]?.category).toBe("מוצרי חלב");
    await expect.poll(() => namesIn(page, "מוצרי חלב")).toEqual(["חלב", "שמנת", "גבינה"]);
    await expect(section(page, "כללי")).toHaveCount(0);
  });
});
