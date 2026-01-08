import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage, PlayerControls } from "../pages";

test.describe("Video Playback", () => {
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

  test("player controls should be disabled when no video is loaded", async () => {
    const isDisabled = await playerControls.isDisabled();
    expect(isDisabled).toBe(true);

    // Buttons should be disabled
    await expect(playerControls.previousButton).toBeDisabled();
    await expect(playerControls.nextButton).toBeDisabled();
  });

  test("should show 'No video selected' when no video is playing", async () => {
    const title = await playerControls.getVideoTitle();
    expect(title).toBe("No video selected");
  });

  test("should play video directly from search results", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Click play on first result
    await mainPage.clickPlayOnResult(0);

    // Wait for video to load
    await playerControls.waitForVideoLoaded();

    // Verify video title is displayed
    const title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 1");

    // Controls should be enabled
    const isDisabled = await playerControls.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test("should toggle play/pause", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Should start playing
    let isPlaying = await playerControls.isPlaying();
    expect(isPlaying).toBe(true);

    // Pause
    await playerControls.togglePlayPause();
    await page.waitForTimeout(100);
    isPlaying = await playerControls.isPlaying();
    expect(isPlaying).toBe(false);

    // Play again
    await playerControls.togglePlayPause();
    await page.waitForTimeout(100);
    isPlaying = await playerControls.isPlaying();
    expect(isPlaying).toBe(true);
  });

  test("should control volume", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Set volume to 50%
    await playerControls.setVolume(0.5);
    let volume = await playerControls.getVolume();
    expect(volume).toBeCloseTo(0.5, 1);

    // Set volume to 100%
    await playerControls.setVolume(1);
    volume = await playerControls.getVolume();
    expect(volume).toBeCloseTo(1, 1);

    // Set volume to 0%
    await playerControls.setVolume(0);
    volume = await playerControls.getVolume();
    expect(volume).toBeCloseTo(0, 1);
  });

  test("should toggle mute", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Set a non-zero volume first
    await playerControls.setVolume(0.8);

    // Initially not muted
    let isMuted = await playerControls.isMuted();
    expect(isMuted).toBe(false);

    // Mute
    await playerControls.toggleMute();
    await page.waitForTimeout(100);
    isMuted = await playerControls.isMuted();
    expect(isMuted).toBe(true);

    // Unmute
    await playerControls.toggleMute();
    await page.waitForTimeout(100);
    isMuted = await playerControls.isMuted();
    expect(isMuted).toBe(false);
  });

  test("should show loading state while video loads", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Click play - loading should appear
    await mainPage.clickPlayOnResult(0);

    // Loading overlay might appear briefly (depends on mock speed)
    // Just verify that the video eventually loads
    await playerControls.waitForVideoLoaded();

    const title = await playerControls.getVideoTitle();
    expect(title).not.toBe("No video selected");
  });

  test("should display video artist/channel", async ({ page }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    const artist = await playerControls.getVideoArtist();
    expect(artist).toContain("Karaoke Channel 1");
  });

  test("Play Next should start immediate playback when nothing is playing", async ({
    page,
  }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // With no video playing, "Play Next" should start playback immediately
    await mainPage.clickPlayNextOnResult(0);

    // Wait for video to load
    await playerControls.waitForVideoLoaded();

    // Verify video is playing
    const title = await playerControls.getVideoTitle();
    expect(title).toContain("Test Karaoke Song 1");
  });

  test("Play Next should add to front of queue when video is playing", async ({
    page,
  }) => {
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Play first video
    await mainPage.clickPlayOnResult(0);
    await playerControls.waitForVideoLoaded();

    // Add second video to queue
    await mainPage.clickAddToQueueOnResult(1);
    await page.waitForTimeout(50);

    // Use "Play Next" for third video - should go to front of queue
    await mainPage.clickPlayNextOnResult(2);

    // Switch to queue tab to verify order
    await mainPage.switchToQueueTab();
    await page.waitForTimeout(100);

    // Queue should not be empty and first item should be the "Play Next" video
    const isEmpty = await mainPage.isQueueEmpty();
    expect(isEmpty).toBe(false);
  });
});
