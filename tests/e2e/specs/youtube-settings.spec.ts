import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults, updateMockConfig } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

test.describe("YouTube API Search", () => {
  let mainPage: MainPage;

  test.describe("With API key configured", () => {
    test.beforeEach(async ({ page }) => {
      // Inject Tauri mocks with API key configured (default)
      await injectTauriMocks(page, {
        searchResults: createMockSearchResults(5),
        hasApiKey: true,
        searchMethod: "api",
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should search using YouTube API and display results", async ({ page }) => {
      await mainPage.search("test karaoke");
      await mainPage.waitForSearchResults();

      const count = await mainPage.getSearchResultCount();
      expect(count).toBe(5);

      // Verify first result displays correctly
      await expect(
        page.locator('.space-y-2 > div[class*="flex gap-3 p-3"]').first()
      ).toContainText("Test Karaoke Song 1");
    });

    test("should add video from API search results to queue", async () => {
      await mainPage.search("test");
      await mainPage.waitForSearchResults();

      // Add first result to queue
      await mainPage.clickAddToQueueOnResult(0);

      // Switch to queue tab and verify queue has one item
      await mainPage.switchToQueueTab();
      await expect(async () => {
        const isEmpty = await mainPage.isQueueEmpty();
        expect(isEmpty).toBe(false);
      }).toPass({ timeout: 5000 });
    });
  });

  test.describe("Without API key configured", () => {
    test.beforeEach(async ({ page }) => {
      // Inject Tauri mocks without API key
      await injectTauriMocks(page, {
        searchResults: [],
        hasApiKey: false,
        ytdlpAvailable: false,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should show setup prompt when no API key configured", async ({ page }) => {
      await mainPage.search("test");

      // Wait for the setup prompt to appear
      await expect(page.locator("text=YouTube Search Not Configured")).toBeVisible({ timeout: 10000 });
      await expect(page.locator("text=Open Advanced Settings")).toBeVisible();
    });

    test("should show setup instructions with Google Cloud link", async ({ page }) => {
      await mainPage.search("test");

      // Verify setup instructions are visible
      await expect(page.locator("text=YouTube Search Not Configured")).toBeVisible({ timeout: 10000 });
      await expect(page.locator('a[href*="console.cloud.google.com"]')).toBeVisible();
    });
  });

  test.describe("With yt-dlp fallback", () => {
    test.beforeEach(async ({ page }) => {
      // Inject Tauri mocks with yt-dlp mode
      await injectTauriMocks(page, {
        searchResults: createMockSearchResults(3),
        hasApiKey: false,
        searchMethod: "ytdlp",
        ytdlpAvailable: true,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should search using yt-dlp when configured", async ({ page }) => {
      await mainPage.search("test karaoke");
      await mainPage.waitForSearchResults();

      const count = await mainPage.getSearchResultCount();
      expect(count).toBe(3);
    });
  });

  test.describe("Search error handling", () => {
    test("should handle API search failure gracefully", async ({ page }) => {
      await injectTauriMocks(page, {
        searchResults: [],
        hasApiKey: true,
        shouldFailSearch: true,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      await mainPage.search("test");

      // Wait for error message to appear
      await expect(page.locator("text=YouTube API search failed")).toBeVisible({ timeout: 10000 });
    });

    test("should recover from search error on retry", async ({ page }) => {
      // Start with failing search
      await injectTauriMocks(page, {
        searchResults: [],
        hasApiKey: true,
        shouldFailSearch: true,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      await mainPage.search("test");
      await expect(page.locator("text=YouTube API search failed")).toBeVisible({ timeout: 10000 });

      // Update config to make search succeed
      await updateMockConfig(page, {
        searchResults: createMockSearchResults(3),
        shouldFailSearch: false,
      });

      // Search again
      await mainPage.search("test again");
      await mainPage.waitForSearchResults();

      const count = await mainPage.getSearchResultCount();
      expect(count).toBe(3);
    });
  });
});
