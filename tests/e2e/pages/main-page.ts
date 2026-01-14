import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the main HomeKaraoke app page.
 * Provides methods for interacting with search, tabs, and queue.
 */
export class MainPage {
  readonly page: Page;

  // Search elements
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly addKaraokeToggle: Locator;
  readonly searchModeToggle: Locator;

  // Main tabs
  readonly playerTab: Locator;
  readonly searchTab: Locator;
  readonly libraryTab: Locator;

  // Queue/History tabs
  readonly queueTab: Locator;
  readonly historyTab: Locator;

  // Dependency check
  readonly dependencyCheck: Locator;
  readonly ytdlpStatus: Locator;
  readonly continueButton: Locator;

  // Session elements
  readonly startSessionButton: Locator;
  readonly endSessionButton: Locator;
  readonly sessionIndicator: Locator;

  constructor(page: Page) {
    this.page = page;

    // Search bar elements (from SearchBar.tsx)
    this.searchInput = page.locator('input[type="text"]').first();
    this.searchButton = page.getByRole("button", { name: "Search", exact: true });
    this.addKaraokeToggle = page.getByRole("button", { name: /\+"karaoke"/ });
    this.searchModeToggle = page.getByRole("button", { name: /Switch to/ });

    // Main content tabs (role="tab" in App.tsx)
    this.playerTab = page.getByRole("tab", { name: "Player" });
    this.searchTab = page.getByRole("tab", { name: "Search" });
    this.libraryTab = page.getByRole("tab", { name: "Library" });

    // Queue/History tabs
    this.queueTab = page.getByRole("tab", { name: "Queue" });
    this.historyTab = page.getByRole("tab", { name: "History" });

    // Dependency check screen
    this.dependencyCheck = page.locator("text=Checking dependencies");
    this.ytdlpStatus = page.locator("text=yt-dlp").first();
    this.continueButton = page.getByRole("button", { name: "Continue" });

    // Session elements
    this.startSessionButton = page.getByRole("button", { name: "Start Session" });
    this.endSessionButton = page.getByRole("button", { name: "End" });
    // Session indicator is the pulsing green dot (w-2 h-2 rounded-full bg-green-500 animate-pulse)
    this.sessionIndicator = page.locator('[class*="bg-green-500"][class*="animate-pulse"]');
  }

  /**
   * Navigate to the app and wait for it to be ready.
   * Waits for dependency check to complete.
   */
  async goto(): Promise<void> {
    await this.page.goto("/");
    // Wait for the page to load - either dependency check or main app
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Wait for the dependency check to complete and main app to load.
   */
  async waitForAppReady(): Promise<void> {
    // If Continue button is visible, click it
    const continueVisible = await this.continueButton.isVisible().catch(() => false);
    if (continueVisible) {
      await this.continueButton.click();
    }

    // Wait for search input to be available (main app is loaded)
    await this.searchInput.waitFor({ state: "visible", timeout: 15000 });
  }

  /**
   * Perform a YouTube search.
   * @param query - Search query
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }

  /**
   * Wait for search results to appear.
   */
  async waitForSearchResults(): Promise<void> {
    // Wait for search to complete (not showing "Searching...")
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes("Searching..."),
      { timeout: 10000 }
    );

    // Wait for result items or "No results" message
    await Promise.race([
      this.page.waitForSelector('.space-y-2 > div[class*="flex gap-3"]', { timeout: 5000 }),
      this.page.locator("text=No results").waitFor({ state: "visible", timeout: 5000 }),
    ]);
  }

  /**
   * Get the number of search results displayed.
   */
  async getSearchResultCount(): Promise<number> {
    // Search results are div elements with flex gap-3 class pattern
    return this.page.locator('.space-y-2 > div[class*="flex gap-3 p-3"]').count();
  }

  /**
   * Click the "Play now" button on a search result.
   * @param index - Zero-based index of the result
   */
  async clickPlayOnResult(index: number): Promise<void> {
    const result = this.page.locator('.space-y-2 > div[class*="flex gap-3 p-3"]').nth(index);
    const playButton = result.getByRole("button", { name: "Play now" });
    await playButton.click();
  }

  /**
   * Click the "Add to queue" button on a search result.
   * @param index - Zero-based index of the result
   */
  async clickAddToQueueOnResult(index: number): Promise<void> {
    const result = this.page.locator('.space-y-2 > div[class*="flex gap-3 p-3"]').nth(index);
    const addButton = result.getByRole("button", { name: "Add to queue" });
    await addButton.click();
  }

  /**
   * Click the "Play next" button on a search result.
   * @param index - Zero-based index of the result
   */
  async clickPlayNextOnResult(index: number): Promise<void> {
    const result = this.page.locator('.space-y-2 > div[class*="flex gap-3 p-3"]').nth(index);
    const playNextButton = result.getByRole("button", { name: "Play next" });
    await playNextButton.click();
  }

  /**
   * Switch to the Queue tab.
   */
  async switchToQueueTab(): Promise<void> {
    await this.queueTab.click();
  }

  /**
   * Switch to the History tab.
   */
  async switchToHistoryTab(): Promise<void> {
    await this.historyTab.click();
  }

  /**
   * Switch to the Player tab.
   */
  async switchToPlayerTab(): Promise<void> {
    await this.playerTab.click();
  }

  /**
   * Switch to the Search tab.
   */
  async switchToSearchTab(): Promise<void> {
    await this.searchTab.click();
  }

  /**
   * Switch to the Library tab.
   */
  async switchToLibraryTab(): Promise<void> {
    await this.libraryTab.click();
  }

  /**
   * Get the number of items in the queue.
   */
  async getQueueItemCount(): Promise<number> {
    // Queue items have data-testid="queue-item"
    return this.page.locator('[data-testid="queue-item"]').count();
  }

  /**
   * Get the number of items in the history.
   */
  async getHistoryItemCount(): Promise<number> {
    await this.switchToHistoryTab();
    return this.page
      .locator('[class*="bg-gray-700/50 hover:bg-gray-600"], [class*="bg-blue-900/50"]')
      .count();
  }

  /**
   * Check if "No songs in queue" message is displayed.
   */
  async isQueueEmpty(): Promise<boolean> {
    return this.page.locator("text=No songs in queue").isVisible();
  }

  /**
   * Check if "No results" message is displayed.
   */
  async hasNoResults(): Promise<boolean> {
    return this.page.locator("text=No results").isVisible();
  }

  /**
   * Click the Clear Queue button.
   */
  async clearQueue(): Promise<void> {
    const clearButton = this.page.getByRole("button", { name: "Clear queue" });
    await clearButton.click();
  }

  /**
   * Toggle the +karaoke suffix for searches.
   */
  async toggleKaraokeSuffix(): Promise<void> {
    await this.addKaraokeToggle.click();
  }

  /**
   * Check if the +karaoke toggle is active.
   */
  async isKaraokeSuffixActive(): Promise<boolean> {
    const classes = await this.addKaraokeToggle.getAttribute("class");
    return classes?.includes("bg-blue-600") ?? false;
  }

  /**
   * Start a new session.
   */
  async startSession(): Promise<void> {
    await this.startSessionButton.click();
    // Wait for the start button to disappear (indicating session started)
    await this.startSessionButton.waitFor({ state: "hidden", timeout: 10000 });
  }

  /**
   * Check if a session is currently active.
   */
  async hasActiveSession(): Promise<boolean> {
    return this.sessionIndicator.isVisible();
  }

  /**
   * End the current session.
   */
  async endSession(): Promise<void> {
    await this.endSessionButton.click();
  }
}
