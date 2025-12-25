import { create } from "zustand";
import { youtubeService } from "../services";

// Cache expiration: 5 hours (YouTube URLs typically expire after 6 hours)
const PREFETCH_CACHE_EXPIRY_MS = 5 * 60 * 60 * 1000;

// Prefetch threshold: start prefetching this many seconds before video ends
export const PREFETCH_THRESHOLD_SECONDS = 20;

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
  error: string | null;
  seekTime: number | null;
  prefetchedStreamUrl: { videoId: string; url: string; timestamp: number } | null;

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
  setError: (error: string | null) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  reset: () => void;
  setPrefetchedStreamUrl: (videoId: string, url: string) => void;
  getPrefetchedStreamUrl: (videoId: string) => string | null;
  clearPrefetchedStreamUrl: () => void;
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
  error: null,
  seekTime: null,
  prefetchedStreamUrl: null,
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...initialState,

  setCurrentVideo: (video) => set({ currentVideo: video, error: null }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsDetached: (isDetached) => set({ isDetached }),
  setError: (error) => set({ error, isLoading: false }),
  seekTo: (time) => set({ seekTime: time }),
  clearSeek: () => set({ seekTime: null }),
  reset: () => set(initialState),
  setPrefetchedStreamUrl: (videoId, url) => set({
    prefetchedStreamUrl: { videoId, url, timestamp: Date.now() }
  }),
  getPrefetchedStreamUrl: (videoId) => {
    const cached = get().prefetchedStreamUrl;
    if (!cached || cached.videoId !== videoId) return null;

    // Check if cache has expired and proactively clear if so
    const age = Date.now() - cached.timestamp;
    if (age > PREFETCH_CACHE_EXPIRY_MS) {
      set({ prefetchedStreamUrl: null });
      return null;
    }

    return cached.url;
  },
  clearPrefetchedStreamUrl: () => set({ prefetchedStreamUrl: null }),
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
    if (clearCache) {
      usePlayerStore.getState().clearPrefetchedStreamUrl();
    }
    return cachedUrl;
  }

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
    usePlayerStore.getState().clearPrefetchedStreamUrl();
  }
}
