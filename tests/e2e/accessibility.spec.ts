import { accessibilityViolations, expect, smallTouchTargets, test } from "./fixtures";

// Every screen: axe-core (WCAG 2.1 A and AA) on both projects, and 44×44 touch targets
// on the phone-sized one.
const PUBLIC_PAGES = ["/login", "/login?error=not_allowed", "/privacy"];

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
    await signInAs("dor");
  });

  test("the home page passes the accessibility checks @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner")).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
  });

  test("the home page has 44×44 touch targets @mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-sized screens only");
    await page.goto("/");
    await expect(page.getByRole("banner")).toBeVisible();
    expect(await smallTouchTargets(page)).toEqual([]);
  });
});
