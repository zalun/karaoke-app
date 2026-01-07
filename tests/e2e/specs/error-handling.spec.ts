import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults, updateMockConfig } from "../fixtures/tauri-mocks";
import { MainPage, PlayerControls } from "../pages";

test.describe("Error Handling", () => {
  let mainPage: MainPage;
  let playerControls: PlayerControls;

  test.beforeEach(async ({ page }) => {
    mainPage = new MainPage(page);
    playerControls = new PlayerControls(page);
  });

  test("app loads normally in youtube mode even if yt-dlp is not available", async ({
    page,
  }) => {
    await injectTauriMocks(page, {
      ytdlpAvailable: false,
      playbackMode: "youtube", // Default mode doesn't require yt-dlp
    });

    await page.goto("/");

    // App should load and show search input (dependency check doesn't block)
    await expect(mainPage.searchInput).toBeVisible({ timeout: 15000 });
  });

  test("app loads when yt-dlp mode is set but yt-dlp is not available", async ({
    page,
  }) => {
    await injectTauriMocks(page, {
      ytdlpAvailable: false,
      playbackMode: "ytdlp", // Mode requires yt-dlp but it's not available
    });

    await page.goto("/");

    // App should still load (dependency check runs but doesn't block)
    await expect(mainPage.searchInput).toBeVisible({ timeout: 15000 });
  });

  test("should show error when search fails", async ({ page }) => {
    await injectTauriMocks(page, {
      shouldFailSearch: true,
      ytdlpAvailable: true,
    });

    await page.goto("/");
    await mainPage.waitForAppReady();

    await mainPage.search("test query");

    // Should show error message
    await expect(
      page.locator("text=Search failed - yt-dlp not available")
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show error when stream URL fetch fails", async ({ page }) => {
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(1),
      shouldFailStreamUrl: true,
      ytdlpAvailable: true,
    });

    await page.goto("/");
    await mainPage.waitForAppReady();

    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Try to play - should fail when fetching stream URL
    await mainPage.clickPlayOnResult(0);

    // Wait for error to be processed - check for error notification or unchanged player state
    await expect(async () => {
      const title = await playerControls.getVideoTitle();
      // Video should not be loaded - title should still be default
      expect(title).toBe("No video selected");
    }).toPass({ timeout: 2000 });
  });

  test("should handle search with no results gracefully", async ({ page }) => {
    await injectTauriMocks(page, {
      searchResults: [],
      ytdlpAvailable: true,
    });

    await page.goto("/");
    await mainPage.waitForAppReady();

    await mainPage.search("xyz123nonexistent");
    await mainPage.waitForSearchResults();

    // Should show "No results" message
    await expect(page.locator("text=No results")).toBeVisible();
  });

  test("should recover from error and allow new search", async ({ page }) => {
    // First search fails
    await injectTauriMocks(page, {
      shouldFailSearch: true,
      ytdlpAvailable: true,
    });

    await page.goto("/");
    await mainPage.waitForAppReady();

    await mainPage.search("failing query");
    await expect(
      page.locator("text=Search failed")
    ).toBeVisible({ timeout: 5000 });

    // Update mock config dynamically to allow successful search
    await updateMockConfig(page, {
      searchResults: createMockSearchResults(3),
      shouldFailSearch: false,
    });

    // New search should work
    await mainPage.search("working query");
    await mainPage.waitForSearchResults();

    const count = await mainPage.getSearchResultCount();
    expect(count).toBe(3);
  });

  test("player controls remain functional after playback error", async ({
    page,
  }) => {
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(3),
      shouldFailStreamUrl: true,
      ytdlpAvailable: true,
    });

    await page.goto("/");
    await mainPage.waitForAppReady();

    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // First play attempt fails
    await mainPage.clickPlayOnResult(0);

    // Wait for error to be processed - player should still show no video
    await expect(async () => {
      const title = await playerControls.getVideoTitle();
      expect(title).toBe("No video selected");
    }).toPass({ timeout: 2000 });

    // Update mock config dynamically to allow successful playback
    await updateMockConfig(page, {
      shouldFailStreamUrl: false,
    });

    // Re-search to get fresh results with new mock
    await mainPage.search("test again");
    await mainPage.waitForSearchResults();

    // Second play attempt should work
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    const title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song");
  });
});
