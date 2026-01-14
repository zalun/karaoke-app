import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

test.describe("Search History", () => {
  let mainPage: MainPage;

  test.beforeEach(async ({ page }) => {
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
    });

    mainPage = new MainPage(page);
    await mainPage.goto();
    await mainPage.waitForAppReady();
  });

  test("should record search and show in dropdown on focus", async ({ page }) => {
    // Inject mocks with pre-populated history (simulating a previous search)
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["queen bohemian"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Focus the search input
    await mainPage.searchInput.focus();

    // Wait for dropdown to appear with the previous search
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible({ timeout: 5000 });
    await expect(dropdown).toContainText("queen bohemian");
  });

  test("should show dropdown with arrow down key", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["test song"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Press down arrow to open dropdown
    await mainPage.searchInput.press("ArrowDown");

    // Dropdown should be visible
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible({ timeout: 3000 });
    await expect(dropdown).toContainText("test song");
  });

  test("should navigate suggestions with arrow keys", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["first search", "second search", "third search"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Focus search and open dropdown
    await mainPage.searchInput.focus();
    await mainPage.searchInput.press("ArrowDown");

    // Verify first item is selected
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible();

    // First item should be highlighted (bg-gray-700)
    const firstItem = dropdown.locator("button").first();
    await expect(firstItem).toHaveClass(/bg-gray-700/);

    // Press down to select second item
    await mainPage.searchInput.press("ArrowDown");
    const secondItem = dropdown.locator("button").nth(1);
    await expect(secondItem).toHaveClass(/bg-gray-700/);

    // Press up to go back to first
    await mainPage.searchInput.press("ArrowUp");
    await expect(firstItem).toHaveClass(/bg-gray-700/);
  });

  test("should select suggestion with Enter", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["my favorite song"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Focus search and open dropdown
    await mainPage.searchInput.focus();
    await mainPage.searchInput.press("ArrowDown");

    // Verify dropdown is visible
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible();

    // Press Enter to select
    await mainPage.searchInput.press("Enter");

    // Input should have the suggestion value
    await expect(mainPage.searchInput).toHaveValue("my favorite song");

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();
  });

  test("should close dropdown with Escape", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["test query"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Focus search and open dropdown
    await mainPage.searchInput.focus();
    await mainPage.searchInput.press("ArrowDown");

    // Verify dropdown is visible
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible();

    // Press Escape to close
    await mainPage.searchInput.press("Escape");

    // Dropdown should be hidden
    await expect(dropdown).not.toBeVisible();
  });

  test("should filter suggestions while typing", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["queen bohemian", "beatles yesterday", "queen we will rock you"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Type partial query
    await mainPage.searchInput.fill("queen");

    // Dropdown should show only matching results
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Should contain queen searches but not beatles
    await expect(dropdown).toContainText("queen bohemian");
    await expect(dropdown).toContainText("queen we will rock you");
    await expect(dropdown).not.toContainText("beatles");
  });

  test("should show ghost text for matching suggestion", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["bohemian rhapsody"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Type partial query that matches history
    await mainPage.searchInput.fill("bohem");

    // Ghost text should show the rest of the suggestion
    const ghostText = page.locator(".text-gray-500.whitespace-pre");
    await expect(ghostText).toBeVisible({ timeout: 3000 });
    await expect(ghostText).toContainText("ian rhapsody");
  });

  test("should accept ghost text with Tab key", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["bohemian rhapsody"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Type partial query
    await mainPage.searchInput.fill("bohem");

    // Verify ghost text is visible
    const ghostText = page.locator(".text-gray-500.whitespace-pre");
    await expect(ghostText).toBeVisible({ timeout: 3000 });

    // Press Tab to accept
    await mainPage.searchInput.press("Tab");

    // Input should have full suggestion
    await expect(mainPage.searchInput).toHaveValue("bohemian rhapsody");
  });

  test("should click suggestion to select and search", async ({ page }) => {
    // Inject mocks with pre-populated history
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
      searchHistory: ["clickable suggestion"],
    });
    await page.goto("/");
    await mainPage.waitForAppReady();

    // Focus to show dropdown
    await mainPage.searchInput.focus();

    // Wait for dropdown
    const dropdown = page.locator(".bg-gray-800.border.border-gray-700.rounded-lg");
    await expect(dropdown).toBeVisible({ timeout: 3000 });

    // Click the suggestion
    await dropdown.locator("button", { hasText: "clickable suggestion" }).click();

    // Should trigger search (wait for results)
    await mainPage.waitForSearchResults();

    // Dropdown should be closed
    await expect(dropdown).not.toBeVisible();
  });
});
