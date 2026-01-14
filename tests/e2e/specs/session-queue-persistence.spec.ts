import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

/**
 * Tests for queue persistence during session transitions.
 * Verifies fix for issue #179 - queue items lost when starting new session.
 */
test.describe("Session Queue Persistence", () => {
  let mainPage: MainPage;

  test.beforeEach(async ({ page }) => {
    // Setup: Inject mocks first (before navigation)
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
    });

    // Create page objects
    mainPage = new MainPage(page);

    // Navigate and wait for app to be ready
    await mainPage.goto();
    await mainPage.waitForAppReady();
  });

  test("queue items should be preserved when starting a new session", async ({ page }) => {
    // Arrange: Search and add items to queue
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Add multiple items to queue rapidly (simulating the race condition scenario)
    for (let i = 0; i < 3; i++) {
      await mainPage.clickAddToQueueOnResult(i);
    }

    // Verify items are in queue before session start
    await mainPage.switchToQueueTab();
    await expect(async () => {
      const count = await mainPage.getQueueItemCount();
      expect(count).toBe(3);
    }).toPass({ timeout: 10000 });

    // Act: Start a new session immediately after adding items
    await mainPage.startSession();

    // Assert: Verify session is active
    await expect(async () => {
      const hasSession = await mainPage.hasActiveSession();
      expect(hasSession).toBe(true);
    }).toPass({ timeout: 10000 });

    // Assert: All queue items should still be present after session start
    await expect(async () => {
      const count = await mainPage.getQueueItemCount();
      expect(count).toBe(3);
    }).toPass({ timeout: 10000 });
  });

  test("queue items added rapidly should all be preserved on session start", async ({ page }) => {
    // This test specifically targets the race condition where items are added
    // in quick succession and a session is started before all items are persisted

    // Arrange: Search for results
    await mainPage.search("karaoke");
    await mainPage.waitForSearchResults();

    // Add 5 items rapidly (sequential clicks without delays)
    for (let i = 0; i < 5; i++) {
      await mainPage.clickAddToQueueOnResult(i);
    }

    // Immediately start session (before async persistence might complete)
    await mainPage.startSession();

    // Verify session started
    await expect(async () => {
      const hasSession = await mainPage.hasActiveSession();
      expect(hasSession).toBe(true);
    }).toPass({ timeout: 10000 });

    // Switch to queue tab and verify all items are present
    await mainPage.switchToQueueTab();
    await expect(async () => {
      const count = await mainPage.getQueueItemCount();
      expect(count).toBe(5);
    }).toPass({ timeout: 10000 });
  });

  test("queue should be preserved when no session is active initially", async ({ page }) => {
    // Verify that items added without an active session are properly migrated
    // to the new session when one is started

    // Add items without a session
    await mainPage.search("song");
    await mainPage.waitForSearchResults();

    await mainPage.clickAddToQueueOnResult(0);
    await mainPage.clickAddToQueueOnResult(1);

    // Verify queue has items
    await mainPage.switchToQueueTab();
    await expect(async () => {
      const count = await mainPage.getQueueItemCount();
      expect(count).toBe(2);
    }).toPass({ timeout: 10000 });

    // Start session
    await mainPage.startSession();

    // Verify items are still in queue after session starts
    await expect(async () => {
      const count = await mainPage.getQueueItemCount();
      expect(count).toBe(2);
    }).toPass({ timeout: 10000 });

    // Verify session is active
    await expect(async () => {
      const hasSession = await mainPage.hasActiveSession();
      expect(hasSession).toBe(true);
    }).toPass({ timeout: 10000 });
  });
});
