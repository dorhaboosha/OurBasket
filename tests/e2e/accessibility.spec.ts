import type { Page } from "@playwright/test";
import { accessibilityViolations, expect, seedDefaults, smallTouchTargets, test } from "./fixtures";

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

async function openSettingsDialog(page: Page, button: string) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  // Retried: a click before React has hydrated the button does nothing.
  await expect(async () => {
    await page.getByRole("button", { name: button }).click({ timeout: 1000 });
    await expect(page.getByRole("dialog").or(page.getByRole("alertdialog"))).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
}
