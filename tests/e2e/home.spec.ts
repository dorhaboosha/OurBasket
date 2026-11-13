import { expect, test } from "./fixtures";

test.describe("signed in", () => {
  test.beforeEach(async ({ signInAs }) => {
    await signInAs("dor");
  });

  test("the app is in Hebrew, right to left @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page).toHaveTitle("OurBasket");
    await expect(page.getByRole("heading", { level: 1, name: "רשימת הקניות" })).toBeVisible();
  });

  test("the page has its icon and theme color", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0f766e");
  });
});
