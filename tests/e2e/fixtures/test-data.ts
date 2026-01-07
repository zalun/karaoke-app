import type { MockSearchResult, MockStreamInfo } from "./tauri-mocks";

/**
 * Pre-defined mock search results for common test scenarios
 * Video IDs must be exactly 11 characters (YouTube format)
 */
export const mockSearchResults: MockSearchResult[] = [
  {
    id: "dQw4w9WgXcQ", // 11 chars - valid YouTube ID format
    title: "Bohemian Rhapsody - Karaoke Version",
    channel: "Karaoke Queen",
    duration: 354,
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    view_count: 5000000,
  },
  {
    id: "jNQXAC9IVRw", // 11 chars
    title: "Don't Stop Believin' - Karaoke",
    channel: "SingKing",
    duration: 251,
    thumbnail: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
    view_count: 3000000,
  },
  {
    id: "kJQP7kiw5Fk", // 11 chars
    title: "Sweet Caroline - Karaoke",
    channel: "Karaoke Hits",
    duration: 212,
    thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
    view_count: 2500000,
  },
  {
    id: "9bZkp7q19f0", // 11 chars
    title: "Livin' on a Prayer - Karaoke",
    channel: "Rock Karaoke",
    duration: 249,
    thumbnail: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg",
    view_count: 2000000,
  },
  {
    id: "RgKAFK5djSk", // 11 chars
    title: "I Will Survive - Karaoke",
    channel: "Disco Karaoke",
    duration: 198,
    thumbnail: "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg",
    view_count: 1800000,
  },
];

/**
 * Mock stream info for yt-dlp mode testing
 */
export const mockStreamInfo: MockStreamInfo = {
  url: "https://mock-stream.example.com/video.mp4",
  format: "mp4",
  quality: "720p",
};

/**
 * Format duration in seconds to MM:SS string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Create a mock queue item from a search result
 */
export function createMockQueueItem(result: MockSearchResult, index: number) {
  return {
    id: `queue-item-${index}`,
    video_id: result.id,
    title: result.title,
    artist: result.channel,
    duration: result.duration,
    thumbnail_url: result.thumbnail,
    source: "youtube" as const,
    youtube_id: result.id,
    position: index,
    added_at: new Date().toISOString(),
  };
}

/**
 * Test IDs used throughout the app for E2E testing
 * These should match the data-testid attributes in components
 */
export const testIds = {
  // Search
  searchInput: "search-input",
  searchButton: "search-button",
  searchResults: "search-results",
  searchResultItem: "search-result-item",
  addKaraokeToggle: "add-karaoke-toggle",

  // Player
  playerControls: "player-controls",
  playPauseButton: "play-pause-button",
  previousButton: "previous-button",
  nextButton: "next-button",
  volumeButton: "volume-button",
  volumeSlider: "volume-slider",
  progressBar: "progress-bar",
  currentTime: "current-time",
  duration: "duration",
  videoTitle: "video-title",
  videoArtist: "video-artist",
  detachButton: "detach-button",
  reloadButton: "reload-button",
  loadingOverlay: "loading-overlay",

  // Queue
  queuePanel: "queue-panel",
  queueItem: "queue-item",
  queueTab: "queue-tab",
  historyTab: "history-tab",
  historyItem: "history-item",
  clearQueueButton: "clear-queue-button",

  // Tabs
  playerTab: "player-tab",
  searchTab: "search-tab",
  libraryTab: "library-tab",

  // Notifications
  notification: "notification",
  notificationError: "notification-error",

  // Dependency check
  dependencyCheck: "dependency-check",
  ytdlpStatus: "ytdlp-status",
};
