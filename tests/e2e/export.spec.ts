import type { Page } from "@playwright/test";
import { addProduct, db, expect, openMenu, seedDefaults, test } from "./fixtures";

const RTL_MARK = String.fromCharCode(0x200f);

test.beforeEach(async ({ signInAs }) => {
  await seedDefaults();
  await addProduct("מוצרי חלב", "חלב");
  await addProduct("מוצרי חלב", "יוגורט");
  await addProduct("מוצרי חלב", "גבינה צהובה");
  await addProduct("פירות וירקות", "מלפפונים");
  await addProduct("משקאות", "מים");
  await db.query(`UPDATE product SET quantity = 2 WHERE name = 'חלב'`);
  await db.query(`UPDATE product SET quantity = 6 WHERE name = 'מלפפונים'`);
  // Checked off: not exported (spec 11).
  await db.query(`UPDATE product SET "isChecked" = true WHERE name IN ('יוגורט', 'מים')`);
  await signInAs("dor");
});

async function openList(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "רשימת הקניות" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

function openExport(page: Page) {
  return openMenu(page, page.getByRole("button", { name: "ייצוא" }));
}

const EXPECTED_TEXT = [
  "OurBasket — רשימת קניות",
  "",
  "🥛 מוצרי חלב",
  "• חלב — 2",
  "• גבינה צהובה — 1",
  "",
  "🥬 פירות וירקות",
  "• מלפפונים — 6",
].join("\n");

test.describe("copying for WhatsApp", () => {
  test("copies what is still to buy, by category, and says so @mobile", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openList(page);
    await (await openExport(page)).getByRole("menuitem", { name: "העתקה ל-WhatsApp" }).click();
    await expect(page.getByText("הרשימה הועתקה. אפשר להדביק אותה ב-WhatsApp.")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // Windows' clipboard gives the lines back ending in CR LF.
    expect(copied.replaceAll(RTL_MARK, "").replace(/\r\n/g, "\n")).toBe(EXPECTED_TEXT);
  });

  test("when copying fails, shows the text to copy by hand", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("blocked")) },
      });
    });
    await openList(page);
    await (await openExport(page)).getByRole("menuitem", { name: "העתקה ל-WhatsApp" }).click();

    const dialog = page.getByRole("dialog", { name: "העתקת הרשימה" });
    await expect(dialog).toBeVisible();
    const text = dialog.getByRole("textbox", { name: "הרשימה כטקסט" });
    expect((await text.inputValue()).replaceAll(RTL_MARK, "")).toBe(EXPECTED_TEXT);
    // Focused and selected, ready to copy.
    await expect(text).toBeFocused();
    expect(
      await text.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart),
    ).toBe((await text.inputValue()).length);

    await dialog.getByRole("button", { name: "סגירה" }).first().click();
    await expect(dialog).toHaveCount(0);
  });

  test("is disabled when everything is checked off", async ({ page }) => {
    await db.query(`UPDATE product SET "isChecked" = true`);
    await openList(page);
    await expect(page.getByRole("button", { name: "ייצוא" })).toBeDisabled();
  });
});

test.describe("printing", () => {
  test("opens the print page, which opens the print dialog once @mobile", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await openList(page);
    await (await openExport(page)).getByRole("menuitem", { name: "הדפסה / PDF" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "OurBasket — רשימת קניות" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
      .toBe(1);
    // A reload of the page doesn't print again.
    await expect(page).toHaveURL(/\/print$/);
  });

  test("lists what is still to buy, by category, with boxes to check by hand", async ({ page }) => {
    await page.goto("/print");
    await expect(
      page.getByRole("heading", { level: 1, name: "OurBasket — רשימת קניות" }),
    ).toBeVisible();
    await expect(page.getByText(/^נוצר: יום .+ \d{4} בשעה \d{1,2}:\d{2}$/)).toBeVisible();

    const categories = page.getByTestId("print-category");
    await expect(categories.getByRole("heading", { level: 2 })).toHaveText([
      "🥛מוצרי חלב",
      "🥬פירות וירקות",
    ]);
    await expect(page.getByTestId("print-item")).toHaveText([
      "חלבכמות: 2",
      "גבינה צהובהכמות: 1",
      "מלפפוניםכמות: 6",
    ]);
  });

  test("never cuts a product or a category heading between pages", async ({ page }) => {
    await page.goto("/print");
    const item = page.getByTestId("print-item").first();
    const heading = page.getByTestId("print-category").first().getByRole("heading");
    await expect(item).toHaveCSS("break-inside", "avoid");
    await expect(heading).toHaveCSS("break-inside", "avoid");
    await expect(heading).toHaveCSS("break-after", "avoid");
  });

  test("hides the buttons when printing", async ({ page }) => {
    await page.goto("/print");
    const print = page.getByRole("button", { name: "הדפסה / שמירה כ-PDF" });
    await expect(print).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(print).toBeHidden();
    await expect(page.getByRole("link", { name: "חזרה לרשימה" })).toBeHidden();
  });

  test("says when there is nothing to buy", async ({ page }) => {
    await db.query(`UPDATE product SET "isChecked" = true`);
    await page.goto("/print");
    await expect(page.getByTestId("print-empty")).toHaveText(
      "אין מה לקנות: כל המוצרים ברשימה סומנו, או שהרשימה ריקה.",
    );
  });

  test("goes back to the list", async ({ page }) => {
    await page.goto("/print");
    await page.getByRole("link", { name: "חזרה לרשימה" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "רשימת הקניות" })).toBeVisible();
  });
});

test("the print page needs a signed-in user", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/print");
  await expect(page).toHaveURL(/\/login/);
});
