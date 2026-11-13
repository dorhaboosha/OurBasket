import { E2E_BASE_URL } from "../../playwright.config";
import { db, expect, test } from "./fixtures";

test.describe("signed out", () => {
  test("app pages redirect to the Hebrew, right-to-left login page @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page).toHaveTitle("OurBasket");
    await expect(page.getByRole("heading", { name: /ברוכים הבאים ל-OurBasket/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "התחברות עם Google" })).toBeVisible();
  });

  test("the login page says what the site is and that Google handles the password", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByText("רשימת הקניות המשותפת של דור ומעיין.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("האתר הזה לא מבקש ולא שומר סיסמאות", { exact: false }),
    ).toBeVisible();
  });

  test("the privacy policy is public and linked from the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "מדיניות פרטיות" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "מדיניות פרטיות" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "איזה מידע נשמר" })).toBeVisible();
    await page.getByRole("link", { name: "חזרה לדף הכניסה" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  for (const [code, message] of [
    ["not_allowed", "החשבון הזה אינו מורשה להיכנס ל-OurBasket."],
    [
      "email_not_verified",
      "כתובת האימייל של החשבון הזה לא אומתה ב-Google, ולכן אי אפשר להיכנס איתו.",
    ],
    ["something_else", "ההתחברות נכשלה. נסו שוב."],
  ]) {
    test(`shows the right message for ?error=${code}`, async ({ page }) => {
      await page.goto(`/login?error=${code}`);
      // Scoped to the page content: Next.js's route announcer is also role="alert".
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(message);
    });
  }

  test("shows no error without ?error", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "התחברות עם Google" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("a forged session cookie does not get in", async ({ page, context }) => {
    await context.addCookies([
      { name: "better-auth.session_token", value: "forged.value", url: E2E_BASE_URL },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("banner")).toHaveCount(0);
  });

  test("the Google button starts sign-in at Google", async ({ page }) => {
    await page.goto("/login");
    // Stop at Google: only check that the app sent the browser there with our callback.
    let googleUrl: URL | undefined;
    await page.route("https://accounts.google.com/**", (route) => {
      googleUrl = new URL(route.request().url());
      return route.abort();
    });
    // Retried: a click before React has hydrated the button does nothing. Once a click
    // has worked, the page is on its way to Google and the button is gone.
    await expect(async () => {
      if (!googleUrl) {
        await page.getByRole("button", { name: "התחברות עם Google" }).click({ timeout: 1000 });
      }
      await expect.poll(() => googleUrl, { timeout: 3000 }).toBeDefined();
    }).toPass();
    expect(googleUrl!.searchParams.get("redirect_uri")).toBe(
      `${E2E_BASE_URL}/api/auth/callback/google`,
    );
    expect(googleUrl!.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
  });
});

test.describe("signed in", () => {
  test("shows the header with the user's name @mobile", async ({ page, signInAs }) => {
    await signInAs("dor");
    await page.goto("/");
    await expect(page.getByRole("banner")).toContainText("שלום, דור");
  });

  test("the login page sends a signed-in user home", async ({ page, signInAs }) => {
    await signInAs("maayan");
    await page.goto("/login");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByRole("banner")).toContainText("שלום, מעיין");
  });

  test("a user whose email is no longer allowed is signed out", async ({ page, signInAs }) => {
    await signInAs("dor");
    // The stored email no longer matches USER_EMAIL_DOR, as after changing the env var.
    await db.query(`UPDATE "user" SET email = 'old-address@e2e.test' WHERE "configKey" = 'dor'`);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sign out ends the session", async ({ page, signInAs }) => {
    await signInAs("dor");
    await page.goto("/");
    // Retried: a click before React has hydrated the button does nothing.
    await expect(async () => {
      await page.getByRole("button", { name: "התנתקות" }).click({ timeout: 1000 });
      await expect(page).toHaveURL(/\/login$/, { timeout: 2000 });
    }).toPass();

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a failed sign out stays signed in, and can be tried again", async ({
    page,
    pageErrors,
    signInAs,
  }) => {
    await signInAs("dor");
    await page.route("**/api/auth/sign-out", (route) => route.fulfill({ status: 500 }));
    await page.goto("/");
    let leftForLogin = false;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.url().includes("/login")) leftForLogin = true;
    });
    const signOut = page.getByRole("button", { name: "התנתקות" });
    // Retried, as above: a click before React has hydrated the button does nothing.
    await expect(async () => {
      const request = page.waitForRequest("**/api/auth/sign-out", { timeout: 1000 });
      await signOut.click({ timeout: 1000 });
      await request;
    }).toPass();

    await expect(signOut).toBeEnabled();
    expect(leftForLogin).toBe(false);
    await expect(page.getByRole("banner")).toContainText("שלום, דור");
    // The browser logs the simulated 500; that error is the point of this test.
    pageErrors.splice(
      0,
      pageErrors.length,
      ...pageErrors.filter((error) => !error.includes("500")),
    );
  });
});
