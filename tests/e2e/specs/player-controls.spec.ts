import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage, PlayerControls } from "../pages";

test.describe("Player Controls", () => {
  let mainPage: MainPage;
  let playerControls: PlayerControls;

  test.beforeEach(async ({ page }) => {
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(3),
      ytdlpAvailable: true,
    });

    mainPage = new MainPage(page);
    playerControls = new PlayerControls(page);
    await mainPage.goto();
    await mainPage.waitForAppReady();
  });

  test("should display player controls container", async () => {
    await expect(playerControls.controlsContainer).toBeVisible();
  });

  test("controls should be disabled without a video", async () => {
    const isDisabled = await playerControls.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("controls should be enabled with a video", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    const isDisabled = await playerControls.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("should show play button when paused", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Pause the video
    await playerControls.pause();
    await page.waitForTimeout(100);

    // Should show play button (not pause)
    const isPlaying = await playerControls.isPlaying();
    expect(isPlaying).toBe(false);
  });

  test("should show pause button when playing", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Should be playing
    const isPlaying = await playerControls.isPlaying();
    expect(isPlaying).toBe(true);
  });

  test("volume slider should reflect current volume", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Set volume to specific value
    await playerControls.setVolume(0.7);
    const volume = await playerControls.getVolume();
    expect(volume).toBeCloseTo(0.7, 1);
  });

  test("mute button should toggle mute state", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Set non-zero volume
    await playerControls.setVolume(0.8);

    // Initially not muted
    let isMuted = await playerControls.isMuted();
    expect(isMuted).toBe(false);

    // Mute
    await playerControls.toggleMute();
    await page.waitForTimeout(100);
    isMuted = await playerControls.isMuted();
    expect(isMuted).toBe(true);
  });

  test("progress bar should be clickable when video is loaded", async ({
    page,
  }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Progress bar should be visible
    await expect(playerControls.progressBar).toBeVisible();

    // Should have pointer cursor (indicating clickable)
    // This is a basic check - actual seek testing would need video playback
  });

  test("reload button should be disabled without a video", async () => {
    // Without loading a video, reload should be disabled
    await expect(playerControls.reloadButton).toBeDisabled();
  });

  test("reload button should be enabled with a video", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Reload button should now be enabled
    await expect(playerControls.reloadButton).toBeEnabled();
  });

  test("video title should update when video changes", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();
    let title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 1");

    // Add second video and play it
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(100);
    await playerControls.clickNext();
    await page.waitForTimeout(200);
    await playerControls.waitForVideoLoaded();

    // Title should change
    title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 2");
  });

  test("detach button should be disabled without a video", async () => {
    await expect(playerControls.detachButton).toBeDisabled();
  });

  test("detach button should be enabled with a video", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    await expect(playerControls.detachButton).toBeEnabled();
  });

  test("should show video artist when available", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    const artist = await playerControls.getVideoArtist();
    expect(artist).toBeTruthy();
    expect(artist).toContain("Karaoke Channel");
  });

  test("play/pause should work multiple times", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Toggle multiple times
    for (let i = 0; i < 3; i++) {
      const initialState = await playerControls.isPlaying();
      await playerControls.togglePlayPause();
      await page.waitForTimeout(100);
      const newState = await playerControls.isPlaying();
      expect(newState).toBe(!initialState);
    }
  });

  test("volume changes should persist", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Set volume
    await playerControls.setVolume(0.3);
    await page.waitForTimeout(100);

    // Toggle play/pause (shouldn't affect volume)
    await playerControls.togglePlayPause();
    await page.waitForTimeout(100);
    await playerControls.togglePlayPause();
    await page.waitForTimeout(100);

    // Volume should still be 0.3
    const volume = await playerControls.getVolume();
    expect(volume).toBeCloseTo(0.3, 1);
  });
});
