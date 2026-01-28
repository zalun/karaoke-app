import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

test.describe("Fair Queue", () => {
  let mainPage: MainPage;

  test.describe("Setting Persistence (PRD-010)", () => {
    test("Fair Queue toggle should show OFF state when disabled", async ({ page }) => {
      await injectTauriMocks(page, {
        fairQueueEnabled: false,
        searchResults: createMockSearchResults(3),
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Search and add an item to queue
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickAddToQueueOnResult(0);

      // Switch to Queue tab to see the Fair Queue toggle
      await mainPage.switchToQueueTab();

      // Fair Queue button should show OFF state
      await expect(async () => {
        const fairQueueButton = page.getByRole("button", { name: /Fair Queue disabled/ });
        await expect(fairQueueButton).toBeVisible();

        // Verify the button has the "off" styling (text-gray-400, no bg-blue-400/20)
        const buttonClasses = await fairQueueButton.getAttribute("class");
        expect(buttonClasses).toContain("text-gray-400");
        expect(buttonClasses).not.toContain("bg-blue-400/20");
      }).toPass({ timeout: 10000 });
    });

    test("Fair Queue toggle should show ON state when enabled", async ({ page }) => {
      await injectTauriMocks(page, {
        fairQueueEnabled: true,
        searchResults: createMockSearchResults(3),
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Search and add an item to queue
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickAddToQueueOnResult(0);

      // Switch to Queue tab
      await mainPage.switchToQueueTab();

      // Fair Queue button should show ON state
      await expect(async () => {
        const fairQueueButton = page.getByRole("button", { name: /Fair Queue enabled/ });
        await expect(fairQueueButton).toBeVisible();

        // Verify the button has the "on" styling
        const buttonClasses = await fairQueueButton.getAttribute("class");
        expect(buttonClasses).toContain("text-blue-400");
        expect(buttonClasses).toContain("bg-blue-400/20");
      }).toPass({ timeout: 10000 });
    });

    test("Fair Queue setting should persist when toggled", async ({ page }) => {
      await injectTauriMocks(page, {
        fairQueueEnabled: false,
        searchResults: createMockSearchResults(3),
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Search and add an item to queue
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickAddToQueueOnResult(0);

      // Switch to Queue tab
      await mainPage.switchToQueueTab();

      // Initially OFF - use toPass for reliability
      await expect(async () => {
        const fairQueueButtonOff = page.getByRole("button", { name: /Fair Queue disabled/ });
        await expect(fairQueueButtonOff).toBeVisible();
      }).toPass({ timeout: 10000 });

      // Click to toggle ON
      const fairQueueButtonOff = page.getByRole("button", { name: /Fair Queue disabled/ });
      await fairQueueButtonOff.click();

      // Should now show ON state
      await expect(async () => {
        const fairQueueButtonOn = page.getByRole("button", { name: /Fair Queue enabled/ });
        await expect(fairQueueButtonOn).toBeVisible();
        const buttonClasses = await fairQueueButtonOn.getAttribute("class");
        expect(buttonClasses).toContain("bg-blue-400/20");
      }).toPass({ timeout: 5000 });
    });

    test("Fair Queue toggle updates visual state immediately when clicked", async ({ page }) => {
      await injectTauriMocks(page, {
        fairQueueEnabled: true,
        searchResults: createMockSearchResults(3),
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Search and add an item to queue
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickAddToQueueOnResult(0);

      // Switch to Queue tab
      await mainPage.switchToQueueTab();

      // Initially ON
      await expect(async () => {
        const fairQueueButtonOn = page.getByRole("button", { name: /Fair Queue enabled/ });
        await expect(fairQueueButtonOn).toBeVisible();
      }).toPass({ timeout: 10000 });

      // Click to toggle OFF
      const fairQueueButtonOn = page.getByRole("button", { name: /Fair Queue enabled/ });
      await fairQueueButtonOn.click();

      // Should now show OFF state immediately
      await expect(async () => {
        const fairQueueButtonOff = page.getByRole("button", { name: /Fair Queue disabled/ });
        await expect(fairQueueButtonOff).toBeVisible();
        const buttonClasses = await fairQueueButtonOff.getAttribute("class");
        expect(buttonClasses).toContain("text-gray-400");
        expect(buttonClasses).not.toContain("bg-blue-400/20");
      }).toPass({ timeout: 5000 });
    });
  });

  test.describe("Queue Behavior (PRD-012)", () => {
    test("Disabling Fair Queue should revert to append-to-end behavior", async ({ page }) => {
      // Start with Fair Queue enabled
      await injectTauriMocks(page, {
        fairQueueEnabled: true,
        searchResults: createMockSearchResults(5),
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Add first song to queue (Song 1)
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickAddToQueueOnResult(0);

      // Add second song to queue (Song 2)
      await mainPage.clickAddToQueueOnResult(1);

      // Switch to Queue tab and verify both songs are in queue
      await mainPage.switchToQueueTab();
      await expect(async () => {
        const queueCount = await mainPage.getQueueItemCount();
        expect(queueCount).toBe(2);
      }).toPass({ timeout: 5000 });

      // Verify Fair Queue is ON
      await expect(async () => {
        const fairQueueButton = page.getByRole("button", { name: /Fair Queue enabled/ });
        await expect(fairQueueButton).toBeVisible();
      }).toPass({ timeout: 5000 });

      // Click to toggle Fair Queue OFF
      const fairQueueButtonOn = page.getByRole("button", { name: /Fair Queue enabled/ });
      await fairQueueButtonOn.click();

      // Verify Fair Queue is now OFF
      await expect(async () => {
        const fairQueueButtonOff = page.getByRole("button", { name: /Fair Queue disabled/ });
        await expect(fairQueueButtonOff).toBeVisible();
      }).toPass({ timeout: 5000 });

      // Go back to search and add a third song (Song 3)
      await mainPage.switchToSearchTab();
      await mainPage.clickAddToQueueOnResult(2);

      // Switch back to Queue tab
      await mainPage.switchToQueueTab();

      // Verify queue now has 3 songs
      await expect(async () => {
        const queueCount = await mainPage.getQueueItemCount();
        expect(queueCount).toBe(3);
      }).toPass({ timeout: 5000 });

      // Verify Song 3 is at the END of the queue (position 3, index 2)
      // When Fair Queue is disabled, new songs should always append to the end
      await expect(async () => {
        const lastQueueItem = page.locator('[data-testid="queue-item"]').last();
        await expect(lastQueueItem).toContainText("Test Karaoke Song 3");
      }).toPass({ timeout: 5000 });

      // Also verify the order: Song 1, Song 2, Song 3 (appended to end)
      await expect(async () => {
        const firstItem = page.locator('[data-testid="queue-item"]').first();
        await expect(firstItem).toContainText("Test Karaoke Song 1");
      }).toPass({ timeout: 5000 });
    });

    test("Songs should append to end when Fair Queue is disabled from the start", async ({ page }) => {
      // Start with Fair Queue disabled
      await injectTauriMocks(page, {
        fairQueueEnabled: false,
        searchResults: createMockSearchResults(5),
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Add songs in order: Song 1, Song 2, Song 3
      await mainPage.search("test");
      await mainPage.waitForSearchResults();
      await mainPage.clickAddToQueueOnResult(0);
      await mainPage.clickAddToQueueOnResult(1);
      await mainPage.clickAddToQueueOnResult(2);

      // Switch to Queue tab
      await mainPage.switchToQueueTab();

      // Verify all 3 songs are in queue
      await expect(async () => {
        const queueCount = await mainPage.getQueueItemCount();
        expect(queueCount).toBe(3);
      }).toPass({ timeout: 5000 });

      // Verify order is preserved: Song 1, Song 2, Song 3
      // Each song should be at its expected position (appended in order)
      await expect(async () => {
        const queueItems = page.locator('[data-testid="queue-item"]');
        await expect(queueItems.nth(0)).toContainText("Test Karaoke Song 1");
        await expect(queueItems.nth(1)).toContainText("Test Karaoke Song 2");
        await expect(queueItems.nth(2)).toContainText("Test Karaoke Song 3");
      }).toPass({ timeout: 5000 });
    });
  });
});
