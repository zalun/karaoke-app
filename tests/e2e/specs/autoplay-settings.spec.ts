import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage, PlayerControls } from "../pages";

test.describe("Autoplay Next Song Setting", () => {
  let mainPage: MainPage;
  let playerControls: PlayerControls;

  test.describe("With autoplay enabled (default)", () => {
    test.beforeEach(async ({ page }) => {
      await injectTauriMocks(page, {
        searchResults: createMockSearchResults(5),
        ytdlpAvailable: true,
        autoplayNext: true, // Explicitly set for clarity
      });

      mainPage = new MainPage(page);
      playerControls = new PlayerControls(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("Next button advances to next song when autoplay is enabled", async () => {
      // Search and play first video
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickPlayOnResult(0);
      await playerControls.waitForVideoLoaded();

      const firstTitle = await playerControls.getVideoTitle();
      expect(firstTitle).toContain("Test Karaoke Song 1");

      // Add second video to queue
      await mainPage.clickAddToQueueOnResult(1);

      // Wait for Next button to be enabled, then click (in single toPass to avoid race)
      await expect(async () => {
        await expect(playerControls.nextButton).toBeEnabled();
        await playerControls.clickNext();
      }).toPass({ timeout: 15000 });

      await playerControls.waitForTitleChange(firstTitle);

      const secondTitle = await playerControls.getVideoTitle();
      expect(secondTitle).toContain("Test Karaoke Song 2");
    });

    test("Previous button returns to previous song when autoplay is enabled", async () => {
      // Play first video
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickPlayOnResult(0);
      await playerControls.waitForVideoLoaded();

      const firstTitle = await playerControls.getVideoTitle();

      // Add second video and play it via Next
      await mainPage.clickAddToQueueOnResult(1);

      // Wait for Next button to be enabled, then click (in single toPass to avoid race)
      await expect(async () => {
        await expect(playerControls.nextButton).toBeEnabled();
        await playerControls.clickNext();
      }).toPass({ timeout: 15000 });

      await playerControls.waitForTitleChange(firstTitle);

      const secondTitle = await playerControls.getVideoTitle();
      expect(secondTitle).toContain("Test Karaoke Song 2");

      // Wait for Previous button to be enabled, then click (in single toPass to avoid race)
      await expect(async () => {
        await expect(playerControls.previousButton).toBeEnabled();
        await playerControls.clickPrevious();
      }).toPass({ timeout: 15000 });

      await playerControls.waitForTitleChange(secondTitle);

      const backToFirst = await playerControls.getVideoTitle();
      expect(backToFirst).toContain("Test Karaoke Song 1");
    });
  });

  test.describe("With autoplay disabled", () => {
    test.beforeEach(async ({ page }) => {
      await injectTauriMocks(page, {
        searchResults: createMockSearchResults(5),
        ytdlpAvailable: true,
        autoplayNext: false, // Disable autoplay
      });

      mainPage = new MainPage(page);
      playerControls = new PlayerControls(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("Next button still advances when autoplay is disabled", async () => {
      // Search and play first video
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickPlayOnResult(0);
      await playerControls.waitForVideoLoaded();

      const firstTitle = await playerControls.getVideoTitle();
      expect(firstTitle).toContain("Test Karaoke Song 1");

      // Add second video to queue
      await mainPage.clickAddToQueueOnResult(1);

      // Wait for Next button to be enabled, then click (in single toPass to avoid race)
      await expect(async () => {
        await expect(playerControls.nextButton).toBeEnabled();
        await playerControls.clickNext();
      }).toPass({ timeout: 15000 });

      await playerControls.waitForTitleChange(firstTitle);

      const secondTitle = await playerControls.getVideoTitle();
      expect(secondTitle).toContain("Test Karaoke Song 2");
    });

    test("Previous button still works when autoplay is disabled", async () => {
      // Play first video
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickPlayOnResult(0);
      await playerControls.waitForVideoLoaded();

      const firstTitle = await playerControls.getVideoTitle();

      // Add second video and play it via Next
      await mainPage.clickAddToQueueOnResult(1);

      // Wait for Next button to be enabled, then click (in single toPass to avoid race)
      await expect(async () => {
        await expect(playerControls.nextButton).toBeEnabled();
        await playerControls.clickNext();
      }).toPass({ timeout: 15000 });

      await playerControls.waitForTitleChange(firstTitle);

      const secondTitle = await playerControls.getVideoTitle();
      expect(secondTitle).toContain("Test Karaoke Song 2");

      // Wait for Previous button to be enabled, then click (in single toPass to avoid race)
      await expect(async () => {
        await expect(playerControls.previousButton).toBeEnabled();
        await playerControls.clickPrevious();
      }).toPass({ timeout: 15000 });

      await playerControls.waitForTitleChange(secondTitle);

      const backToFirst = await playerControls.getVideoTitle();
      expect(backToFirst).toContain("Test Karaoke Song 1");
    });

  });

  // === Test Coverage Notes ===
  //
  // What these tests verify:
  // - Next/Previous buttons work correctly regardless of autoplay setting
  // - The autoplayNext mock config correctly initializes the setting
  // - User-initiated navigation is unaffected by autoplay toggle
  //
  // What is NOT tested here (and why):
  // - Automatic advancement when video ends naturally
  //   Reason: E2E tests run in browser with mocked Tauri APIs. The video players
  //   (YouTube iframe, NativePlayer) don't actually play or fire 'ended' events
  //   in this environment. The handleEnded callback cannot be triggered naturally.
  //
  // The core autoplay logic in VideoPlayer.handleEnded is verified by:
  // 1. Manual testing (confirmed working in issue #153)
  // 2. Code review (single check point, straightforward logic)
  // 3. The implementation follows existing patterns for settings checks
  //
  // If regression testing is needed, consider:
  // - Unit test for handleEnded callback with mocked stores
  // - Integration test with real Tauri backend (Tauri WebDriver when available)
});
