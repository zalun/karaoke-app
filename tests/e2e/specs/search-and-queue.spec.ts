import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

test.describe("Search and Queue Flow", () => {
  let mainPage: MainPage;

  test.beforeEach(async ({ page }) => {
    // Inject Tauri mocks with default search results
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
    });

    mainPage = new MainPage(page);
    await mainPage.goto();
    await mainPage.waitForAppReady();
  });

  test("should display search input and search button", async ({ page }) => {
    await expect(mainPage.searchInput).toBeVisible();
    await expect(mainPage.searchButton).toBeVisible();
  });

  test("should search for videos and display results", async ({ page }) => {
    await mainPage.search("queen bohemian");
    await mainPage.waitForSearchResults();

    const count = await mainPage.getSearchResultCount();
    expect(count).toBe(5);

    // Verify first result displays correctly
    await expect(
      page.locator('.space-y-2 > div[class*="flex gap-3 p-3"]').first()
    ).toContainText("Test Karaoke Song 1");
  });

  test("should have +karaoke toggle active by default", async () => {
    const isActive = await mainPage.isKaraokeSuffixActive();
    expect(isActive).toBe(true);
  });

  test("should toggle +karaoke suffix", async () => {
    // Initially active
    let isActive = await mainPage.isKaraokeSuffixActive();
    expect(isActive).toBe(true);

    // Toggle off
    await mainPage.toggleKaraokeSuffix();
    isActive = await mainPage.isKaraokeSuffixActive();
    expect(isActive).toBe(false);

    // Toggle back on
    await mainPage.toggleKaraokeSuffix();
    isActive = await mainPage.isKaraokeSuffixActive();
    expect(isActive).toBe(true);
  });

  test("should add video to queue from search results", async () => {
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

  test("should add multiple videos to queue", async () => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Add multiple results to queue
    await mainPage.clickAddToQueueOnResult(0);
    await mainPage.clickAddToQueueOnResult(1);
    await mainPage.clickAddToQueueOnResult(2);

    // Switch to queue tab and verify queue is not empty
    await mainPage.switchToQueueTab();
    await expect(async () => {
      const isEmpty = await mainPage.isQueueEmpty();
      expect(isEmpty).toBe(false);
    }).toPass({ timeout: 5000 });
  });

  test("should handle empty search results", async ({ page }) => {
    // Re-inject mocks with empty results
    await injectTauriMocks(page, {
      searchResults: [],
      ytdlpAvailable: true,
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    await mainPage.search("nonexistent video that doesnt exist");
    await mainPage.waitForSearchResults();

    // Verify empty state is shown
    await expect(page.locator("text=No results")).toBeVisible();
  });

  test("should clear queue", async () => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Add items to queue
    await mainPage.clickAddToQueueOnResult(0);
    await mainPage.clickAddToQueueOnResult(1);

    // Switch to queue tab and verify queue is not empty
    await mainPage.switchToQueueTab();
    await expect(async () => {
      const isEmpty = await mainPage.isQueueEmpty();
      expect(isEmpty).toBe(false);
    }).toPass({ timeout: 5000 });

    // Clear queue and verify it's now empty
    await mainPage.clearQueue();
    await expect(async () => {
      const isEmpty = await mainPage.isQueueEmpty();
      expect(isEmpty).toBe(true);
    }).toPass({ timeout: 5000 });
  });

  test("should switch between tabs", async () => {
    // Start on Search tab (default)
    await expect(mainPage.searchTab).toHaveAttribute("aria-selected", "true");

    // Switch to Player tab
    await mainPage.switchToPlayerTab();
    await expect(mainPage.playerTab).toHaveAttribute("aria-selected", "true");

    // Switch to Library tab
    await mainPage.switchToLibraryTab();
    await expect(mainPage.libraryTab).toHaveAttribute("aria-selected", "true");

    // Switch back to Search tab
    await mainPage.switchToSearchTab();
    await expect(mainPage.searchTab).toHaveAttribute("aria-selected", "true");
  });

  test("should switch between Queue and History tabs", async () => {
    // Start on Queue tab
    await expect(mainPage.queueTab).toHaveAttribute("aria-selected", "true");

    // Switch to History tab
    await mainPage.switchToHistoryTab();
    await expect(mainPage.historyTab).toHaveAttribute("aria-selected", "true");

    // Switch back to Queue tab
    await mainPage.switchToQueueTab();
    await expect(mainPage.queueTab).toHaveAttribute("aria-selected", "true");
  });
});
