import { createHmac, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_ENV } from "../../playwright.config";
import { defaultCategoryRows } from "../../src/modules/categories/seed";

export { expect };

export type UserKey = "dor" | "maayan";

// Plain SQL rather than the app's Prisma client: the generated client is an ES module,
// which Playwright's CommonJS test loader cannot import. One pool per worker process;
// allowExitOnIdle lets the worker exit without an explicit end().
export const db = new pg.Pool({
  connectionString: E2E_ENV.DATABASE_URL,
  max: 2,
  allowExitOnIdle: true,
});

/**
 * Empties every table, so each test starts clean. TRUNCATE skips the category trigger.
 * The tables are locked in the app's order (category, product, ..., list_state last), so
 * a request the last test left running is waited for, not deadlocked with; a deadlock that
 * still happens is retried.
 */
export async function resetDatabase() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await db.query(
        `TRUNCATE "category", "product", "purchase_record_item", "purchase_record", "list_state",
          "verification", "account", "session", "user" CASCADE`,
      );
      return;
    } catch (error) {
      const deadlock = (error as { code?: string }).code === "40P01";
      if (!deadlock || attempt === 3) throw error;
    }
  }
}

/** What the database seed creates: the list_state row and the 12 default categories. */
export async function seedDefaults() {
  await db.query(`INSERT INTO list_state (id, revision) VALUES (1, 0) ON CONFLICT DO NOTHING`);
  for (const row of defaultCategoryRows()) {
    await db.query(
      `INSERT INTO category (id, name, "normalizedName", color, icon, "sortOrder", "isSystem", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        randomUUID(),
        row.name,
        row.normalizedName,
        row.color,
        row.icon,
        row.sortOrder,
        row.isSystem,
      ],
    );
  }
}

/** Adds a product at the end of the category with this name, as the app does. */
export async function addProduct(categoryName: string, name: string) {
  await db.query(
    `INSERT INTO product (id, "categoryId", name, "normalizedName", quantity, "sortOrder", "updatedAt")
     SELECT $1, c.id, $2, $3, 1,
       (SELECT coalesce(max("sortOrder") + 1, 0) FROM product WHERE "categoryId" = c.id), now()
     FROM category c WHERE c.name = $4`,
    [randomUUID(), name, name.toLowerCase(), categoryName],
  );
}

/**
 * Records a purchase, as "update list" would: items are [product, quantity, category],
 * copied from the category as it is now. Returns the record's id.
 */
export async function addPurchase(purchasedAt: Date, items: [string, number, string][]) {
  const id = randomUUID();
  await db.query(`INSERT INTO purchase_record (id, "purchasedAt") VALUES ($1, $2)`, [
    id,
    purchasedAt,
  ]);
  for (const [position, [name, quantity, category]] of items.entries()) {
    await db.query(
      `INSERT INTO purchase_record_item (id, "purchaseRecordId", "productName", "normalizedName",
         quantity, "categoryId", "categoryName", "categoryColor", "categoryIcon", position)
       SELECT $1, $2, $3, $4, $5, c.id, c.name, c.color, c.icon, $6 FROM category c WHERE c.name = $7`,
      [randomUUID(), id, name, name.toLowerCase(), quantity, position, category],
    );
  }
  return id;
}

/** The category names in their saved order. */
export async function savedCategoryNames() {
  const { rows } = await db.query<{ name: string }>(
    `SELECT name FROM category ORDER BY "sortOrder", "createdAt"`,
  );
  return rows.map((row) => row.name);
}

/** The value of a Better Auth session cookie: the token, signed with the app secret. */
function signedCookieValue(token: string) {
  const signature = createHmac("sha256", E2E_ENV.BETTER_AUTH_SECRET).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/**
 * Signs the page in as a user without going through Google: creates the user and a
 * session in the test database, and sets the session cookie in the browser.
 */
async function signInAs(page: Page, key: UserKey) {
  const email = key === "dor" ? E2E_ENV.USER_EMAIL_DOR : E2E_ENV.USER_EMAIL_MAAYAN;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO "user" (id, name, email, "emailVerified", "configKey", "updatedAt")
     VALUES ($1, $2, $3, true, $4, now())
     ON CONFLICT ("configKey") DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [randomUUID(), key, email, key],
  );
  const userId = rows[0].id;
  const token = randomUUID().replaceAll("-", "");
  await db.query(
    `INSERT INTO session (id, token, "userId", "expiresAt", "updatedAt")
     VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
    [randomUUID(), token, userId],
  );
  await page
    .context()
    .addCookies([
      { name: "better-auth.session_token", value: signedCookieValue(token), url: E2E_BASE_URL },
    ]);
  return { id: userId };
}

type Fixtures = {
  /** Every test starts with an empty database. */
  cleanDatabase: void;
  /** Browser errors collected during the test; the test fails if any remain. */
  pageErrors: string[];
  signInAs: (key: UserKey) => ReturnType<typeof signInAs>;
};

// Fixtures rather than beforeEach/afterAll hooks here: hooks declared in a shared
// module only attach to the first test file that imports it.
export const test = base.extend<Fixtures>({
  cleanDatabase: [
    async ({}, use) => {
      await resetDatabase();
      await use();
    },
    { auto: true },
  ],
  signInAs: async ({ page }, use) => {
    await use((key) => signInAs(page, key));
  },
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await use(errors);
      // Hydration mismatches and other runtime errors fail the test.
      expect(errors, "browser errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Accessibility violations on the current page (axe-core, WCAG 2.1 A and AA). They catch
 * contrast, names, labels and ARIA mistakes; keyboard use is covered by the other tests.
 */
export async function accessibilityViolations(page: Page) {
  // Let dialogs finish fading in and out first: half-transparent text fails contrast.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => ({
      target: node.target.join(" "),
      html: node.html,
      failure: node.failureSummary,
    })),
  }));
}

/** Minimum size of anything tappable on a phone (spec 5.2). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Visible tappable elements (links, buttons, form fields, ARIA widgets) smaller than
 * 44×44 pixels. Run it on the phone-sized project.
 */
export async function smallTouchTargets(page: Page) {
  return page.evaluate((min) => {
    const selector = [
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "summary",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="switch"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
    ].join(",");
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.width < min || box.height < min)
      .map(({ element, box }) => ({
        html: element.outerHTML.slice(0, 120),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }));
  }, MIN_TOUCH_TARGET);
}
