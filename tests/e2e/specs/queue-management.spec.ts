import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage, PlayerControls } from "../pages";

test.describe("Queue Management", () => {
  let mainPage: MainPage;
  let playerControls: PlayerControls;

  test.beforeEach(async ({ page }) => {
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
    });

    mainPage = new MainPage(page);
    playerControls = new PlayerControls(page);
    await mainPage.goto();
    await mainPage.waitForAppReady();
  });

  test("should show empty queue message initially", async () => {
    await mainPage.switchToQueueTab();
    const isEmpty = await mainPage.isQueueEmpty();
    expect(isEmpty).toBe(true);
  });

  test("next button should be disabled when queue is empty and no history", async ({
    page,
  }) => {
    // Play a video first so controls are enabled
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Queue is empty, history only has current item
    const canNext = await playerControls.canGoNext();
    expect(canNext).toBe(false);
  });

  test("next button should be enabled when queue has items", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Add another to queue
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(100);

    // Now next should be enabled
    const canNext = await playerControls.canGoNext();
    expect(canNext).toBe(true);
  });

  test("previous button should be disabled initially", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // No history yet (only current item)
    const canPrev = await playerControls.canGoPrevious();
    expect(canPrev).toBe(false);
  });

  test("should navigate to next song in queue", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    let title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 1");

    // Add second to queue
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(100);

    // Click next - wait for title to change from first song
    await playerControls.clickNext();
    await playerControls.waitForTitleChange(title);

    // Should now show second song
    title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 2");
  });

  // Skip: This test is flaky on CI due to complex timing between Zustand store
  // updates (queue history) and React re-renders. The mocked Tauri IPC layer
  // doesn't perfectly replicate the state management behavior of the real app.
  // The underlying functionality is covered by unit tests and manual testing.
  // See: https://github.com/zalun/karaoke-app/issues/125#navigate-back-flaky
  test.skip("should navigate back to previous song", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();
    const firstTitle = await playerControls.getVideoTitle();

    // Add second to queue
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(100);

    // Go to next (second song) - wait for title change
    await playerControls.clickNext();
    await playerControls.waitForTitleChange(firstTitle);

    let title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 2");

    // Go back to first song - use toPass to handle timing of button becoming enabled
    // The Previous button becomes enabled when the queue store history is updated,
    // which may take a moment to propagate to the React component on slower CI
    await expect(async () => {
      await expect(playerControls.previousButton).toBeEnabled();
      await playerControls.clickPrevious();
    }).toPass({ timeout: 15000 });

    // Verify we're back on the first song
    await expect(async () => {
      const currentTitle = await playerControls.getVideoTitle();
      expect(currentTitle).toContain("Test Karaoke Song 1");
    }).toPass({ timeout: 15000 });
  });

  test("should move played songs to history", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();
    const firstTitle = await playerControls.getVideoTitle();

    // Add second to queue and play it
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(100);
    await playerControls.clickNext();
    await playerControls.waitForTitleChange(firstTitle);

    // Switch to history tab - first song should be there
    await mainPage.switchToHistoryTab();
    await page.waitForTimeout(100);

    // History should not be empty (shows "No songs in history" if empty)
    const noSongsText = page.locator("text=No songs in history");
    await expect(noSongsText).not.toBeVisible();
  });

  test("should clear queue", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Add multiple items to queue
    await mainPage.clickAddToQueueOnResult(0);
    await page.waitForTimeout(50);
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(50);
    await mainPage.clickAddToQueueOnResult(2);

    // Switch to queue tab
    await mainPage.switchToQueueTab();
    await page.waitForTimeout(100);

    // Verify queue is not empty
    let isEmpty = await mainPage.isQueueEmpty();
    expect(isEmpty).toBe(false);

    // Clear queue
    await mainPage.clearQueue();
    await page.waitForTimeout(100);

    // Verify queue is now empty
    isEmpty = await mainPage.isQueueEmpty();
    expect(isEmpty).toBe(true);
  });

  test("queue should persist across tab switches", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Add items to queue
    await mainPage.clickAddToQueueOnResult(0);
    await mainPage.clickAddToQueueOnResult(1);

    // Switch to history tab
    await mainPage.switchToHistoryTab();
    await page.waitForTimeout(100);

    // Switch back to queue tab
    await mainPage.switchToQueueTab();
    await page.waitForTimeout(100);

    // Queue should still have items
    const isEmpty = await mainPage.isQueueEmpty();
    expect(isEmpty).toBe(false);
  });

  test("should add items with Play Next to front of queue", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();
    const firstTitle = await playerControls.getVideoTitle();

    // Add second to end of queue
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(50);

    // Add third with "Play Next" - should go to front
    await mainPage.clickPlayNextOnResult(2);
    await page.waitForTimeout(100);

    // Go to next song - wait for title to change
    await playerControls.clickNext();
    await playerControls.waitForTitleChange(firstTitle);

    // Should be the third song (Play Next), not second (Add to Queue)
    const title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 3");
  });
});
