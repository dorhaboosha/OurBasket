import { defineConfig, devices } from "@playwright/test";

// Not 3100: Our Calendar's end-to-end tests use it, and both can run at the same time.
const PORT = 3200;
export const E2E_BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [
    // The installed Google Chrome (also preinstalled on GitHub's Ubuntu runners),
    // so no browser download is needed.
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    {
      // Phone-sized; runs only the tests tagged @mobile.
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: "chrome" },
      grep: /@mobile/,
    },
  ],
  webServer: {
    // A production build: what Vercel runs, without dev-only overlays.
    command: `npm run build && npx next start -p ${PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
