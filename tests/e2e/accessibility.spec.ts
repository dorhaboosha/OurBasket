import type { Locator, Page } from "@playwright/test";
import { contrastRatio } from "../../src/config/contrast";
import {
  accessibilityViolations,
  addProduct,
  addPurchase,
  db,
  expect,
  openDialog,
  seedDefaults,
  smallTouchTargets,
  test,
} from "./fixtures";

// Every screen and dialog: axe-core (WCAG 2.1 A and AA) on both projects, and 44×44 touch
// targets on the phone-sized one.
const PUBLIC_PAGES = ["/login", "/login?error=not_allowed", "/privacy"];
const SIGNED_IN_PAGES = ["/", "/history", "/settings"];

test.describe("signed out", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} passes the accessibility checks @mobile`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test(`${path} has 44×44 touch targets @mobile`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "phone-sized screens only");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await smallTouchTargets(page)).toEqual([]);
    });
  }
});

test.describe("signed in", () => {
  test.beforeEach(async ({ signInAs }) => {
    await seedDefaults();
    await signInAs("dor");
  });

  for (const path of SIGNED_IN_PAGES) {
    test(`${path} passes the accessibility checks @mobile`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await accessibilityViolations(page)).toEqual([]);
    });

    test(`${path} has 44×44 touch targets @mobile`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile", "phone-sized screens only");
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await smallTouchTargets(page)).toEqual([]);
    });
  }

  const DIALOGS: [string, string][] = [
    ["the new category form", "הוספת קטגוריה"],
    ["the edit category form", "עריכת מוצרי חלב"],
    ["the delete category question", "מחיקת מוצרי חלב"],
  ];

  for (const [name, button] of DIALOGS) {
    test(`${name} passes the accessibility checks, with 44×44 touch targets @mobile`, async ({
      page,
    }, testInfo) => {
      await openSettingsDialog(page, button);
      expect(await accessibilityViolations(page)).toEqual([]);
      if (testInfo.project.name === "mobile") expect(await smallTouchTargets(page)).toEqual([]);
    });
  }

  test("the category form's errors pass the accessibility checks @mobile", async ({ page }) => {
    await openSettingsDialog(page, "הוספת קטגוריה");
    await page.getByRole("dialog").getByRole("button", { name: "הוספה" }).click();
    await expect(page.getByText("צריך לתת לקטגוריה שם.")).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test.describe("the list with products", () => {
  test.beforeEach(async ({ signInAs }) => {
    await seedDefaults();
    await addProduct("מוצרי חלב", "חלב");
    await addProduct("מוצרי חלב", "גבינה");
    await addProduct("כללי", "סוללות");
    await db.query(`UPDATE product SET "isChecked" = true WHERE name = 'גבינה'`);
    await signInAs("dor");
  });

  test("passes the accessibility checks, with 44×44 touch targets @mobile", async ({
    page,
  }, testInfo) => {
    await openList(page);
    expect(await accessibilityViolations(page)).toEqual([]);
    if (testInfo.project.name === "mobile") expect(await smallTouchTargets(page)).toEqual([]);
  });

  const LIST_DIALOGS: [string, string][] = [
    ["the add product form", "הוספת מוצר"],
    ["the edit product form", "עריכת חלב"],
    ["the clear list question", "נקה רשימה"],
    ["the update list question", "עדכון רשימה"],
  ];

  for (const [name, button] of LIST_DIALOGS) {
    test(`${name} passes the accessibility checks, with 44×44 touch targets @mobile`, async ({
      page,
    }, testInfo) => {
      await openList(page);
      await openDialog(page, page.getByRole("button", { name: button }).first());
      expect(await accessibilityViolations(page)).toEqual([]);
      if (testInfo.project.name === "mobile") expect(await smallTouchTargets(page)).toEqual([]);
    });
  }

  test("the undo message passes the accessibility checks, with 44×44 touch targets @mobile", async ({
    page,
  }, testInfo) => {
    await openList(page);
    await page.getByRole("button", { name: "הורדת אחד מסוללות" }).click();
    await expect(page.getByRole("button", { name: "בטל" })).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
    if (testInfo.project.name === "mobile") expect(await smallTouchTargets(page)).toEqual([]);
  });

  test("a success message passes the accessibility checks @mobile", async ({ page }) => {
    await openList(page);
    await page.getByRole("button", { name: "עדכון רשימה" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "עדכון רשימה" }).click();
    const message = page.getByText("נרשם בהיסטוריית הקניות", { exact: false });
    await expect(message).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
    expect(await toastContrast(message)).toBeGreaterThanOrEqual(4.5);
  });

  test("an error message passes the accessibility checks @mobile", async ({ page }) => {
    await openList(page);
    const field = page.getByRole("textbox", { name: "כמות של סוללות" });
    await field.fill("abc");
    await field.press("Enter");
    const message = page.getByText("כמות היא מספר שלם", { exact: false });
    await expect(message).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
    expect(await toastContrast(message)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("the history with purchases", () => {
  let purchaseId = "";

  test.beforeEach(async ({ signInAs }) => {
    await seedDefaults();
    purchaseId = await addPurchase(new Date("2026-11-18T12:30:00Z"), [
      ["חלב", 2, "מוצרי חלב"],
      ["מים", 6, "משקאות"],
    ]);
    await signInAs("dor");
  });

  for (const [name, path] of [
    ["the purchase cards", () => "/history"],
    ["a purchase's details", () => `/history/${purchaseId}`],
  ] as const) {
    test(`${name} pass the accessibility checks, with 44×44 touch targets @mobile`, async ({
      page,
    }, testInfo) => {
      await page.goto(path());
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await accessibilityViolations(page)).toEqual([]);
      if (testInfo.project.name === "mobile") expect(await smallTouchTargets(page)).toEqual([]);
    });
  }

  test("the delete purchase question passes the accessibility checks @mobile", async ({
    page,
  }, testInfo) => {
    await page.goto(`/history/${purchaseId}`);
    await page.waitForLoadState("networkidle");
    await openDialog(page, page.getByRole("button", { name: "מחיקת הרשומה" }));
    expect(await accessibilityViolations(page)).toEqual([]);
    if (testInfo.project.name === "mobile") expect(await smallTouchTargets(page)).toEqual([]);
  });
});

/**
 * The contrast of a toast's text with its background. axe skips toasts ("overlapped by
 * another element"), so this reads the colors the browser actually shows.
 */
async function toastContrast(text: Locator) {
  const [color, background] = await text.evaluate((element) => {
    const toast = element.closest("[data-type]") ?? element;
    return [getComputedStyle(element).color, getComputedStyle(toast).backgroundColor];
  });
  const hex = (rgb: string) =>
    "#" +
    (rgb.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((value) => Number(value).toString(16).padStart(2, "0"))
      .join("");
  return contrastRatio(hex(color), hex(background));
}

async function openList(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("product-row").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function openSettingsDialog(page: Page, button: string) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await openDialog(page, page.getByRole("button", { name: button }));
}
