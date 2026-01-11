import { create } from "zustand";
import { platform } from "@tauri-apps/plugin-os";
import { youtubeService, createLogger } from "../services";
import { notify } from "./notificationStore";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";

const log = createLogger("PlayerStore");

// LocalStorage key for Windows audio notice (shown only once)
const WINDOWS_AUDIO_NOTICE_SHOWN_KEY = "windows_audio_notice_shown";

/**
 * Show one-time notice about Windows audio issue on first video play.
 * Only shows on Windows platform, and only once (tracked in localStorage).
 */
async function showWindowsAudioNoticeOnce(): Promise<void> {
  // Check if notice was already shown (fast path, before async call)
  if (localStorage.getItem(WINDOWS_AUDIO_NOTICE_SHOWN_KEY)) {
    log.debug("Windows audio notice already shown previously, skipping");
    return;
  }

  // Check if we're on Windows using Tauri's OS plugin
  try {
    const currentPlatform = platform();
    log.debug(`Platform detected: ${currentPlatform}`);
    if (currentPlatform !== "windows") {
      return;
    }
  } catch (err) {
    log.warn("Failed to detect platform:", err);
    return;
  }

  // Mark as shown and display notice
  localStorage.setItem(WINDOWS_AUDIO_NOTICE_SHOWN_KEY, "true");

  notify(
    "info",
    "Windows audio notice: If the first video plays without sound, toggle mute or pause/play to restore audio.",
    {
      label: "Issue #162",
      url: "https://github.com/zalun/karaoke-app/issues/162",
    }
  );
  log.info("Showing one-time Windows audio notice to user");
}

// Cache expiration: 5 hours (YouTube URLs typically expire after 6 hours)
const PREFETCH_CACHE_EXPIRY_MS = 5 * 60 * 60 * 1000;

// YouTube error codes that indicate embedding is disabled
// 101, 150, 153 are all variants of "embedding not allowed"
export const EMBEDDING_ERROR_CODES = [101, 150, 153];

/**
 * Check if a YouTube error code indicates embedding is disabled
 */
export function isEmbeddingError(errorCode: number): boolean {
  return EMBEDDING_ERROR_CODES.includes(errorCode);
}

// Prefetch threshold: start prefetching this many seconds before video ends
// Set to 30s to accommodate slower machines (M1 Mac takes ~7s for yt-dlp)
export const PREFETCH_THRESHOLD_SECONDS = 30;

export interface Video {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnailUrl?: string;
  source: "youtube" | "local" | "external";
  youtubeId?: string;
  filePath?: string;
  streamUrl?: string;
}

interface PlayerState {
  currentVideo: Video | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isLoading: boolean;
  isDetached: boolean;
  seekTime: number | null;
  prefetchedStreamUrl: { videoId: string; url: string; timestamp: number } | null;
  // Track videos that don't allow embedding (error 101/150)
  nonEmbeddableVideoIds: Set<string>;

  // Actions
  setCurrentVideo: (video: Video | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setIsDetached: (detached: boolean) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  reset: () => void;
  setPrefetchedStreamUrl: (videoId: string, url: string) => void;
  getPrefetchedStreamUrl: (videoId: string) => string | null;
  clearPrefetchedStreamUrl: () => void;
  // Non-embeddable video tracking
  markAsNonEmbeddable: (videoId: string) => void;
  isNonEmbeddable: (videoId: string) => boolean;
}

const initialState = {
  currentVideo: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  isFullscreen: false,
  isLoading: false,
  isDetached: false,
  seekTime: null,
  prefetchedStreamUrl: null,
  nonEmbeddableVideoIds: new Set<string>(),
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,

  setCurrentVideo: (video) => {
    log.debug(`setCurrentVideo: ${video?.title ?? "null"}`);
    // Reset duration and currentTime to prevent stale values from previous video
    set({ currentVideo: video, duration: 0, currentTime: 0 });
  },
  setIsPlaying: (isPlaying) => {
    log.debug(`setIsPlaying: ${isPlaying}`);
    set({ isPlaying });
  },
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => {
    log.debug(`setDuration: ${duration}`);
    set({ duration });
  },
  setVolume: (volume) => {
    log.debug(`setVolume: ${volume}`);
    set({ volume, isMuted: volume === 0 });
  },
  toggleMute: () => set((state) => {
    log.debug(`toggleMute: ${!state.isMuted}`);
    return { isMuted: !state.isMuted };
  }),
  setIsFullscreen: (isFullscreen) => {
    log.debug(`setIsFullscreen: ${isFullscreen}`);
    set({ isFullscreen });
  },
  setIsLoading: (isLoading) => {
    log.debug(`setIsLoading: ${isLoading}`);
    set({ isLoading });
  },
  setIsDetached: (isDetached) => {
    log.info(`setIsDetached: ${isDetached}`);
    set({ isDetached });
  },
  seekTo: (time) => {
    log.debug(`seekTo: ${time}`);
    set({ seekTime: time });
  },
  clearSeek: () => set({ seekTime: null }),
  reset: () => {
    log.info("reset: resetting player state");
    set(initialState);
  },
  setPrefetchedStreamUrl: (videoId, url) => {
    log.debug(`setPrefetchedStreamUrl: cached URL for ${videoId}`);
    set({
      prefetchedStreamUrl: { videoId, url, timestamp: Date.now() }
    });
  },
  getPrefetchedStreamUrl: (videoId) => {
    const cached = get().prefetchedStreamUrl;
    if (!cached || cached.videoId !== videoId) {
      log.debug(`getPrefetchedStreamUrl: cache miss for ${videoId}`);
      return null;
    }

    // Check if cache has expired and proactively clear if so
    const age = Date.now() - cached.timestamp;
    if (age > PREFETCH_CACHE_EXPIRY_MS) {
      log.debug(`getPrefetchedStreamUrl: cache expired for ${videoId}`);
      set({ prefetchedStreamUrl: null });
      return null;
    }

    log.debug(`getPrefetchedStreamUrl: cache hit for ${videoId}`);
    return cached.url;
  },
  clearPrefetchedStreamUrl: () => {
    log.debug("clearPrefetchedStreamUrl");
    set({ prefetchedStreamUrl: null });
  },
  markAsNonEmbeddable: (videoId) => {
    log.info(`markAsNonEmbeddable: ${videoId}`);
    set((state) => {
      const newSet = new Set(state.nonEmbeddableVideoIds);
      newSet.add(videoId);
      return { nonEmbeddableVideoIds: newSet };
    });
  },
  isNonEmbeddable: (videoId) => {
    return get().nonEmbeddableVideoIds.has(videoId);
  },
}));

/**
 * Get stream URL for a video, using prefetched cache if available.
 * Falls back to fetching fresh URL if cache miss or on error.
 *
 * @param videoId - YouTube video ID
 * @param clearCache - Whether to clear cache after retrieving (default: true)
 * @returns Promise resolving to the stream URL
 */
export async function getStreamUrlWithCache(
  videoId: string,
  clearCache = true
): Promise<string> {
  const cachedUrl = usePlayerStore.getState().getPrefetchedStreamUrl(videoId);

  if (cachedUrl) {
    log.info(`getStreamUrlWithCache: using cached URL for ${videoId}`);
    if (clearCache) {
      usePlayerStore.getState().clearPrefetchedStreamUrl();
    }
    return cachedUrl;
  }

  log.info(`getStreamUrlWithCache: fetching fresh URL for ${videoId}`);
  const streamInfo = await youtubeService.getStreamUrl(videoId);
  return streamInfo.url;

}

/**
 * Invalidate prefetch cache if it doesn't match the expected video ID.
 * Call this when the queue changes to ensure stale prefetches are cleared.
 *
 * @param expectedVideoId - The video ID that should be prefetched (queue[0])
 */
export function invalidatePrefetchIfStale(expectedVideoId: string | undefined): void {
  const cached = usePlayerStore.getState().prefetchedStreamUrl;
  if (cached && cached.videoId !== expectedVideoId) {
    log.debug(`invalidatePrefetchIfStale: clearing stale cache for ${cached.videoId}`);
    usePlayerStore.getState().clearPrefetchedStreamUrl();
  }
}

/**
 * Play a video by fetching its stream URL (for yt-dlp mode) or directly (for YouTube mode).
 * Shared helper for playback logic used by both PlayerControls and useMediaControls.
 *
 * @param video - The video to play (must have youtubeId)
 * @returns Promise that resolves when playback starts, or rejects on error
 */
export async function playVideo(video: Video): Promise<void> {
  // Show one-time Windows audio notice on first play (fire-and-forget, don't block playback)
  showWindowsAudioNoticeOnce().catch((err) => log.warn("Windows audio notice failed:", err));

  if (!video.youtubeId) {
    log.warn("playVideo: video has no youtubeId, cannot play");
    return;
  }

  const { setIsLoading, setCurrentVideo, setIsPlaying } =
    usePlayerStore.getState();

  const settingsState = useSettingsStore.getState();
  const playbackMode = settingsState.getSetting(SETTINGS_KEYS.PLAYBACK_MODE);
  const ytDlpAvailable = settingsState.ytDlpAvailable;

  // Determine effective playback mode - fall back to YouTube Embed if yt-dlp not available
  const effectiveMode = (playbackMode === "ytdlp" && !ytDlpAvailable) ? "youtube" : playbackMode;
  log.info(`playVideo: mode=${playbackMode}, effective=${effectiveMode}, ytDlpAvailable=${ytDlpAvailable}, video=${video.title}`);

  if (effectiveMode === "youtube" || effectiveMode !== "ytdlp") {
    // YouTube embed mode - no stream URL needed
    log.info(`Playing via YouTube embed: ${video.title}`);
    setCurrentVideo(video);
    setIsPlaying(true);
    return;
  }

  // yt-dlp mode - fetch stream URL (only reached if yt-dlp is available)
  setIsLoading(true);
  try {
    const streamUrl = await getStreamUrlWithCache(video.youtubeId);
    setCurrentVideo({ ...video, streamUrl });
    setIsPlaying(true);
    setIsLoading(false);
    log.info(`Now playing via yt-dlp: ${video.title}`);
  } catch (err) {
    log.error("Failed to play video", err);
    notify("error", "Failed to play video");
    setIsLoading(false);
    throw err;
  }
}
