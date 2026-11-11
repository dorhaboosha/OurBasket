import { accessibilityViolations, expect, smallTouchTargets, test } from "./fixtures";

test("the app is in Hebrew, right to left @mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page).toHaveTitle("OurBasket");
  await expect(page.getByRole("heading", { level: 1, name: /OurBasket/ })).toBeVisible();
  await expect(page.getByText("רשימת הקניות המשותפת שלנו")).toBeVisible();
});

test("the page has its icon and theme color", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f766e");
});

test("the page passes the accessibility checks @mobile", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await accessibilityViolations(page)).toEqual([]);
});

test("everything tappable is at least 44×44 on a phone @mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone-sized screens only");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(await smallTouchTargets(page)).toEqual([]);
});
