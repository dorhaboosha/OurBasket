import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };

type Fixtures = {
  /** Browser errors collected during the test; the test fails if any remain. */
  pageErrors: string[];
};

// Fixtures rather than beforeEach/afterAll hooks here: hooks declared in a shared
// module only attach to the first test file that imports it.
export const test = base.extend<Fixtures>({
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
