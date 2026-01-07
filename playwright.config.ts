import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E testing.
 *
 * Note: Tauri WebDriver does not support macOS, so we test the web layer
 * with mocked Tauri APIs using Playwright standalone mode.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

const PORT = process.env.VITE_PORT || "1420";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // WebKit for Safari-like behavior (closest to Tauri's WKWebView on macOS)
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
