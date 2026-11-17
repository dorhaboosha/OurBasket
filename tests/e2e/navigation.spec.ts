import { expect, seedDefaults, test } from "./fixtures";

test.beforeEach(async ({ signInAs }) => {
  await seedDefaults();
  await signInAs("dor");
});

test("a sidebar links the three screens and marks the current one", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole("link")).toHaveText(["רשימה", "היסטוריה", "הגדרות"]);
  await expect(nav.getByRole("link", { name: "רשימה" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "הגדרות" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "הגדרות" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "הגדרות" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "היסטוריה" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { level: 1, name: "היסטוריית קניות" })).toBeVisible();
});

test("on a phone, the navigation is a bar at the bottom of the screen @mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone-sized screens only");
  await page.goto("/");
  // Only one navigation is visible (and in the accessibility tree) at a time.
  const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(nav).toHaveCount(1);
  const box = await nav.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.round(box!.y + box!.height)).toBe(viewport.height);
  expect(Math.round(box!.width)).toBe(viewport.width);

  await nav.getByRole("link", { name: "הגדרות" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // The last part of the page isn't hidden behind the bar. Waits for the parts that load
  // later (the categories, the account), which make the page longer.
  await expect(page.getByTestId("category-row")).toHaveCount(12);
  await expect(page.getByRole("button", { name: "התנתקות" })).toBeVisible();
  const privacy = page.getByRole("link", { name: "מדיניות פרטיות" });
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const linkBox = await privacy.boundingBox();
      const navBox = await nav.boundingBox();
      return linkBox!.y + linkBox!.height <= navBox!.y;
    })
    .toBe(true);
});
