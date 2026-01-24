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

      // Search and add an item to queue (toggle only shows when queue has items)
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

      // Search and add an item to queue (toggle only shows when queue has items)
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
});
