import type { Page, Request } from "@playwright/test";
import { addProduct, addPurchase, db, expect, seedDefaults, test } from "./fixtures";

// Real-time events need the real Pusher, which tests never use (see E2E_ENV). These tests
// cover what doesn't: reloading on return to the app, the offline notice, and the
// permission check for the private channel.

test.beforeEach(async () => {
  await seedDefaults();
});

/** Fires the browser's "app is visible again" event, as when returning to the tab. */
async function returnToApp(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

/** A page data reload: a Next.js data request that isn't a link prefetch. */
function isReload(request: Request) {
  const headers = request.headers();
  return headers["rsc"] === "1" && !headers["next-router-prefetch"];
}

/** Counts the page's data reloads from now on. */
function countReloads(page: Page) {
  let count = 0;
  page.on("request", (request) => {
    if (isReload(request)) count += 1;
  });
  return () => count;
}

async function openList(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "רשימת הקניות" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.describe("coming back to the app", () => {
  test.beforeEach(async ({ signInAs }) => {
    await signInAs("dor");
  });

  test("shows changes made on the other phone meanwhile @mobile", async ({ page }) => {
    await openList(page);
    await expect(page.getByTestId("empty-list")).toBeVisible();
    await addProduct("מוצרי חלב", "חלב"); // on the other phone
    await returnToApp(page);
    await expect(page.getByRole("checkbox", { name: "חלב" })).toBeVisible();
  });

  test("updates the history too", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByTestId("empty-history")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await addPurchase(new Date(), [["חלב", 1, "מוצרי חלב"]]);
    await returnToApp(page);
    await expect(page.getByTestId("purchase-card")).toHaveCount(1);
  });

  test("reloads once when visible again and back online together", async ({ page }) => {
    await openList(page);
    const reloads = countReloads(page);
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    await page.waitForTimeout(1_500);
    expect(reloads()).toBe(1);
  });

  test("still catches up when coming back again soon after a reload", async ({ page }) => {
    await openList(page);
    const reloads: number[] = [];
    page.on("request", (request) => {
      if (isReload(request)) reloads.push(Date.now());
    });
    const first = page.waitForResponse((response) => isReload(response.request()));
    await returnToApp(page);
    // That reload is done, data included (it streams): the change below isn't in it.
    await (await first).finished();
    await addProduct("מוצרי חלב", "חלב"); // on the other phone, right after that reload
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    // Back again within the gap after the first reload...
    expect(Date.now() - reloads[0]).toBeLessThan(1_000);

    // ...so it waited for the gap to end, then reloaded once more.
    await expect(page.getByRole("checkbox", { name: "חלב" })).toBeVisible();
    expect(reloads).toHaveLength(2);
    expect(reloads[1] - reloads[0]).toBeGreaterThanOrEqual(900);
  });

  test("keeps an open form and what was typed in it", async ({ page }) => {
    await openList(page);
    await page.getByRole("button", { name: "הוספת מוצר" }).first().click();
    const dialog = page.getByRole("dialog", { name: "מוצר חדש" });
    await dialog.getByLabel("שם המוצר").fill("לחם מחמצת");
    await addProduct("כללי", "סוללות"); // on the other phone
    await returnToApp(page);

    // Behind the open dialog (hidden from the accessibility tree), the list has it.
    await expect(page.getByTestId("product-row").getByText("סוללות")).toBeAttached();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("שם המוצר")).toHaveValue("לחם מחמצת");
  });
});

test.describe("offline", () => {
  test("says the app needs a connection, and catches up when it's back @mobile", async ({
    page,
    signInAs,
  }) => {
    await signInAs("dor");
    await openList(page);
    await page.context().setOffline(true);
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toHaveText(
      "אין חיבור לאינטרנט. כדי לראות את הרשימה העדכנית ולשמור שינויים צריך חיבור.",
    );

    await addProduct("כללי", "סוללות"); // on the other phone, meanwhile
    await page.context().setOffline(false);
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "סוללות" })).toBeVisible();
  });

  test("saves nothing offline, and doesn't send it later @mobile", async ({
    page,
    signInAs,
    pageErrors,
  }) => {
    await addProduct("כללי", "סוללות");
    await signInAs("dor");
    await openList(page);
    await page.context().setOffline(true);

    await page.getByRole("checkbox", { name: "סוללות" }).click();
    await expect(page.getByText("משהו השתבש. בדקו את החיבור לאינטרנט ונסו שוב.")).toBeVisible();
    // Not checked on the screen once the attempt failed, nor in the database.
    await expect(page.getByRole("checkbox", { name: "סוללות" })).not.toBeChecked();
    const checked = async () =>
      (await db.query(`SELECT "isChecked" FROM product WHERE name = 'סוללות'`)).rows[0]?.isChecked;
    expect(await checked()).toBe(false);

    // Back online: nothing was kept to send later.
    await page.context().setOffline(false);
    await expect(page.getByTestId("offline-banner")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(await checked()).toBe(false);
    await expect(page.getByRole("checkbox", { name: "סוללות" })).not.toBeChecked();
    // The browser reports the request that couldn't go out, as expected.
    pageErrors.splice(
      0,
      pageErrors.length,
      ...pageErrors.filter((error) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(error)),
    );
  });
});

test.describe("the private channel's permission", () => {
  const form = (channel: string) => ({ socket_id: "1234.5678", channel_name: channel });

  test("is refused when signed out", async ({ page }) => {
    const response = await page.request.post("/api/pusher/auth", {
      form: form("private-ourbasket"),
    });
    expect(response.status()).toBe(403);
  });

  test("is given to a signed-in user, for the app's channel only", async ({ page, signInAs }) => {
    await signInAs("maayan");
    const ok = await page.request.post("/api/pusher/auth", { form: form("private-ourbasket") });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).auth).toMatch(/^e2e-pusher-key:[0-9a-f]{64}$/);

    const other = await page.request.post("/api/pusher/auth", { form: form("private-other") });
    expect(other.status()).toBe(403);
  });
});
