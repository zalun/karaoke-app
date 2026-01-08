import type { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the player controls.
 * Provides methods for controlling video playback.
 */
export class PlayerControls {
  readonly page: Page;

  // Control buttons
  readonly playPauseButton: Locator;
  readonly previousButton: Locator;
  readonly nextButton: Locator;
  readonly reloadButton: Locator;
  readonly volumeButton: Locator;
  readonly volumeSlider: Locator;
  readonly detachButton: Locator;

  // Progress
  readonly progressBar: Locator;

  // Video info
  readonly videoTitle: Locator;
  readonly videoArtist: Locator;

  // Loading state
  readonly loadingOverlay: Locator;
  readonly loadingSpinner: Locator;

  // Container
  readonly controlsContainer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Container
    this.controlsContainer = page.locator('[data-testid="player-controls"]');

    // Control buttons (using title attributes since that's what the component uses)
    this.playPauseButton = this.controlsContainer.locator(
      'button:has-text("▶"), button:has-text("⏸")'
    ).first();
    this.previousButton = this.controlsContainer.locator('button[title="Previous"]');
    this.nextButton = this.controlsContainer.locator('button[title="Next"]');
    // Use first() to avoid strict mode violation with loading overlay reload button
    this.reloadButton = this.controlsContainer.locator('button[title="Reload video"]').last();
    this.volumeButton = this.controlsContainer.locator(
      'button:has-text("🔊"), button:has-text("🔉"), button:has-text("🔇")'
    );
    this.volumeSlider = this.controlsContainer.locator('input[type="range"]');
    this.detachButton = this.controlsContainer.locator(
      'button[title="Detach player"], button[title="Reattach player"]'
    );

    // Progress bar
    this.progressBar = page.locator('[data-testid="progress-bar"]');

    // Video info
    this.videoTitle = this.controlsContainer.locator("p.font-medium");
    this.videoArtist = this.controlsContainer.locator("p.text-gray-400");

    // Loading state
    this.loadingOverlay = page.locator('[data-testid="loading-overlay"]');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
  }

  /**
   * Check if video is currently playing (pause button visible).
   */
  async isPlaying(): Promise<boolean> {
    const buttonText = await this.playPauseButton.textContent();
    return buttonText === "⏸";
  }

  /**
   * Toggle play/pause state.
   */
  async togglePlayPause(): Promise<void> {
    await this.playPauseButton.click();
  }

  /**
   * Click play button (only if currently paused).
   */
  async play(): Promise<void> {
    const playing = await this.isPlaying();
    if (!playing) {
      await this.playPauseButton.click();
    }
  }

  /**
   * Click pause button (only if currently playing).
   */
  async pause(): Promise<void> {
    const playing = await this.isPlaying();
    if (playing) {
      await this.playPauseButton.click();
    }
  }

  /**
   * Click next button.
   */
  async clickNext(): Promise<void> {
    await this.nextButton.click();
  }

  /**
   * Click previous button.
   */
  async clickPrevious(): Promise<void> {
    await this.previousButton.click();
  }

  /**
   * Click reload button.
   */
  async clickReload(): Promise<void> {
    await this.reloadButton.click();
  }

  /**
   * Set volume to a specific value (0-1).
   */
  async setVolume(value: number): Promise<void> {
    await this.volumeSlider.fill(String(value));
  }

  /**
   * Get current volume value.
   */
  async getVolume(): Promise<number> {
    const value = await this.volumeSlider.inputValue();
    return parseFloat(value);
  }

  /**
   * Toggle mute.
   */
  async toggleMute(): Promise<void> {
    await this.volumeButton.click();
  }

  /**
   * Check if muted.
   */
  async isMuted(): Promise<boolean> {
    const text = await this.volumeButton.textContent();
    return text === "🔇";
  }

  /**
   * Seek to a percentage of the video duration.
   * @param percent - Value between 0 and 1
   */
  async seekToPercent(percent: number): Promise<void> {
    const box = await this.progressBar.boundingBox();
    if (!box) {
      throw new Error("Progress bar not visible");
    }

    const x = box.x + box.width * percent;
    const y = box.y + box.height / 2;
    await this.page.mouse.click(x, y);
  }

  /**
   * Wait for a video to be loaded (video title is not "No video selected").
   */
  async waitForVideoLoaded(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const title = document.querySelector('[data-testid="player-controls"] p.font-medium');
        return title && title.textContent !== "No video selected";
      },
      { timeout: 15000 }
    );
  }

  /**
   * Wait for the video title to change to a different value.
   * @param previousTitle - The previous title to wait to change from
   */
  async waitForTitleChange(previousTitle: string): Promise<void> {
    await this.page.waitForFunction(
      (prevTitle) => {
        const title = document.querySelector('[data-testid="player-controls"] p.font-medium');
        return title && title.textContent !== prevTitle && title.textContent !== "No video selected";
      },
      previousTitle,
      { timeout: 15000 }
    );
  }

  /**
   * Wait for loading to complete.
   */
  async waitForLoadingComplete(): Promise<void> {
    await this.loadingOverlay.waitFor({ state: "hidden", timeout: 15000 });
  }

  /**
   * Get the current video title.
   */
  async getVideoTitle(): Promise<string> {
    return (await this.videoTitle.textContent()) ?? "";
  }

  /**
   * Get the current video artist.
   */
  async getVideoArtist(): Promise<string | null> {
    const isVisible = await this.videoArtist.isVisible();
    if (!isVisible) return null;
    return await this.videoArtist.textContent();
  }

  /**
   * Check if controls are disabled (no video loaded).
   */
  async isDisabled(): Promise<boolean> {
    const classes = await this.controlsContainer.getAttribute("class");
    return classes?.includes("opacity-60") ?? false;
  }

  /**
   * Check if loading is in progress.
   */
  async isLoading(): Promise<boolean> {
    return this.loadingOverlay.isVisible();
  }

  /**
   * Check if previous button is enabled.
   */
  async canGoPrevious(): Promise<boolean> {
    const disabled = await this.previousButton.isDisabled();
    return !disabled;
  }

  /**
   * Check if next button is enabled.
   */
  async canGoNext(): Promise<boolean> {
    const disabled = await this.nextButton.isDisabled();
    return !disabled;
  }

  /**
   * Click detach/reattach button.
   */
  async toggleDetach(): Promise<void> {
    await this.detachButton.click();
  }

  /**
   * Check if player is currently detached.
   */
  async isDetached(): Promise<boolean> {
    const title = await this.detachButton.getAttribute("title");
    return title === "Reattach player";
  }
}
