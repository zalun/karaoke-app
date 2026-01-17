import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  usePlayerStore,
  useQueueStore,
  useSessionStore,
  useSettingsStore,
  SETTINGS_KEYS,
  parseOverlaySeconds,
  getStreamUrlWithCache,
  invalidatePrefetchIfStale,
  isEmbeddingError,
  notify,
} from "../../stores";
import { youtubeService, createLogger, windowManager } from "../../services";
import { useWakeLock } from "../../hooks";
import {
  NextSongOverlay,
  COUNTDOWN_START_THRESHOLD_SECONDS,
} from "./NextSongOverlay";
import { CurrentSingerOverlay } from "./CurrentSingerOverlay";
import { MIN_RESTORE_POSITION_SECONDS } from "./DetachedPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { NativePlayer, type NativePlayerRef } from "./NativePlayer";
import { Z_INDEX_PRIMING_OVERLAY } from "../../styles/zIndex";

const log = createLogger("VideoPlayer");

// Key for localStorage to track if video playback has been enabled
const PLAYBACK_ENABLED_KEY = "videoPlayer.playbackEnabled";

/** Safely get a value from localStorage (handles private browsing / quota errors) */
function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    log.debug(`localStorage read failed for key ${key}:`, error);
    return null;
  }
}

/** Safely set a value in localStorage (handles private browsing / quota errors) */
function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    log.debug(`localStorage write failed for key ${key}:`, error);
  }
}

// Detach/pop-out icon - two overlapping rectangles
function DetachIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Back rectangle */}
      <rect x="3" y="3" width="13" height="13" rx="2" />
      {/* Front rectangle (offset) */}
      <path d="M8 8h13v13H8z" />
      <rect x="8" y="8" width="13" height="13" rx="2" fill="black" fillOpacity="0.5" />
      <rect x="8" y="8" width="13" height="13" rx="2" fill="none" />
    </svg>
  );
}

export function VideoPlayer() {
  const prefetchTriggeredRef = useRef<string | null>(null);
  const usedCachedUrlRef = useRef<boolean>(false);
  // Track previous detached state to detect reattachment
  const wasDetachedRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  // Track if playback has been enabled via user click (persisted in localStorage)
  const [isPlaybackEnabled, setIsPlaybackEnabled] = useState(() => {
    return safeLocalStorageGet(PLAYBACK_ENABLED_KEY) === "true";
  });
  // Ref to NativePlayer for priming
  const nativePlayerRef = useRef<NativePlayerRef | null>(null);
  const {
    currentVideo,
    isPlaying,
    isLoading,
    isDetached,
    volume,
    isMuted,
    seekTime,
    currentTime,
    duration,
    setCurrentVideo,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setIsLoading,
    clearSeek,
    setIsDetached,
  } = usePlayerStore();

  // Get playback mode from settings with runtime validation
  const rawPlaybackMode = useSettingsStore((state) =>
    state.getSetting(SETTINGS_KEYS.PLAYBACK_MODE)
  );
  // Validate and default to 'youtube' if invalid value in database
  const playbackMode: "youtube" | "ytdlp" = rawPlaybackMode === "ytdlp" ? "ytdlp" : "youtube";

  // Get prefetch setting (in seconds, "0" = disabled)
  const rawPrefetch = useSettingsStore((state) =>
    state.getSetting(SETTINGS_KEYS.PREFETCH_SECONDS)
  ) || "20";
  const parsedPrefetch = parseInt(rawPrefetch, 10);
  const prefetchSeconds = isNaN(parsedPrefetch) ? 20 : parsedPrefetch;

  // Handle detach button click
  const handleDetach = useCallback(async () => {
    if (isDetached) return;

    log.info("Detaching player window");

    // For local files, convert the file path to a URL for the detached player
    let streamUrl = currentVideo?.streamUrl || null;
    if (currentVideo?.source === "local" && currentVideo?.filePath) {
      streamUrl = convertFileSrc(currentVideo.filePath);
    }

    const playerState = {
      streamUrl,
      videoId: currentVideo?.youtubeId || null,
      playbackMode: currentVideo?.source === "local" ? "ytdlp" : playbackMode, // Local files use native player
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
    };

    try {
      await windowManager.detachPlayer(playerState);
      setIsDetached(true);
      // Clear loading state - loading now happens in detached window
      setIsLoading(false);
    } catch (err) {
      log.error("Failed to detach player", err);
    }
  }, [isDetached, currentVideo, playbackMode, isPlaying, currentTime, duration, volume, isMuted, setIsDetached, setIsLoading]);

  // Prevent screen from sleeping while playing (only when not detached)
  useWakeLock(isPlaying && !isDetached);

  // Reset prefetch tracking when video changes
  useEffect(() => {
    prefetchTriggeredRef.current = null;
  }, [currentVideo?.id]);

  // Subscribe to first queue item for overlay and prefetch cache invalidation
  const nextQueueItem = useQueueStore((state) => state.queue[0]);
  const nextQueueVideoId = nextQueueItem?.video.youtubeId;
  useEffect(() => {
    invalidatePrefetchIfStale(nextQueueVideoId);
    // Also reset prefetch trigger if queue's first item changed
    if (prefetchTriggeredRef.current && prefetchTriggeredRef.current !== nextQueueVideoId) {
      prefetchTriggeredRef.current = null;
    }
  }, [nextQueueVideoId]);

  // Prefetch first queue item when no video is loaded (idle state) - only for yt-dlp mode
  useEffect(() => {
    if (playbackMode !== "ytdlp" || prefetchSeconds === 0) return;
    if (currentVideo || !nextQueueVideoId || prefetchTriggeredRef.current === nextQueueVideoId) {
      return;
    }

    prefetchTriggeredRef.current = nextQueueVideoId;
    log.debug(`Prefetching first queue item (idle): ${nextQueueItem?.video.title}`);

    youtubeService.getStreamUrl(nextQueueVideoId)
      .then(info => {
        // Only cache if this is still the first item in queue
        if (useQueueStore.getState().queue[0]?.video.youtubeId === nextQueueVideoId) {
          usePlayerStore.getState().setPrefetchedStreamUrl(nextQueueVideoId, info.url);
          log.debug(`Prefetch complete (idle): ${nextQueueItem?.video.title}`);
        }
      })
      .catch((err) => log.debug(`Prefetch failed (idle) for ${nextQueueVideoId}`, err));
  }, [currentVideo, nextQueueVideoId, nextQueueItem?.video.title, playbackMode, prefetchSeconds]);

  // Handle play/pause when detached
  useEffect(() => {
    if (!isDetached) return;
    // When detached, send play/pause commands to the detached window
    if (isPlaying) {
      windowManager.sendCommand("play");
    } else {
      windowManager.sendCommand("pause");
    }
  }, [isPlaying, isDetached]);

  // Note: State syncing to detached window is handled by PlayerControls.tsx
  // which includes full song info (currentSong, nextSong with singers).
  // Removed redundant sync from here to avoid race conditions with incomplete state.

  // Handle seeking when detached
  useEffect(() => {
    if (!isDetached || seekTime === null) return;
    windowManager.sendCommand("seek", seekTime);
    clearSeek();
  }, [seekTime, isDetached, clearSeek]);

  // Seek to stored currentTime when reattaching from detached window
  useEffect(() => {
    // Detect reattachment: was detached, now not detached
    if (wasDetachedRef.current && !isDetached && currentTime > MIN_RESTORE_POSITION_SECONDS) {
      // Will be handled by the player component via seekTime
      usePlayerStore.getState().seekTo(currentTime);
    }
    // Update ref for next render
    wasDetachedRef.current = isDetached;
  }, [isDetached, currentTime]);

  // Handle time update from player components
  const handleTimeUpdate = useCallback((time: number, dur: number) => {
    setCurrentTime(time);
    if (dur > 0 && dur !== duration) {
      setDuration(dur);
    }

    // Prefetch next video before end (or immediately if video is short) - only for yt-dlp mode
    if (playbackMode === "ytdlp" && prefetchSeconds > 0 && dur > 0) {
      const timeRemaining = dur - time;
      const shouldPrefetch = timeRemaining <= prefetchSeconds || dur <= prefetchSeconds;

      if (shouldPrefetch) {
        const nextItem = useQueueStore.getState().queue[0];
        const nextVideoId = nextItem?.video.youtubeId;
        if (nextVideoId && prefetchTriggeredRef.current !== nextVideoId) {
          prefetchTriggeredRef.current = nextVideoId;
          const videoIdToFetch = nextVideoId;
          log.debug(`Prefetching next video: ${nextItem?.video.title}`);
          youtubeService.getStreamUrl(videoIdToFetch)
            .then(info => {
              if (useQueueStore.getState().queue[0]?.video.youtubeId === videoIdToFetch) {
                usePlayerStore.getState().setPrefetchedStreamUrl(videoIdToFetch, info.url);
                log.debug(`Prefetch complete for: ${nextItem?.video.title}`);
              }
            })
            .catch((err) => log.debug(`Prefetch failed for ${videoIdToFetch}`, err));
        }
      }
    }
  }, [setCurrentTime, setDuration, duration, playbackMode, prefetchSeconds]);

  const handleDurationChange = useCallback((dur: number) => {
    if (dur > 0) {
      setDuration(dur);
    }
  }, [setDuration]);

  const handleReady = useCallback(() => {
    setIsLoading(false);
    usedCachedUrlRef.current = false;
  }, [setIsLoading]);

  // Handle enabling playback via user click
  const handleEnablePlayback = useCallback(() => {
    log.info("User clicked to enable playback");
    // Prime the NativePlayer video element if available
    nativePlayerRef.current?.primeVideo();
    // Mark playback as enabled
    setIsPlaybackEnabled(true);
    safeLocalStorageSet(PLAYBACK_ENABLED_KEY, "true");
    log.info("Playback enabled for YouTube and local files");
  }, []);

  const handleEnded = useCallback(async () => {
    log.info("Video ended");

    // Stop playback immediately to prevent the ended video from restarting
    // during async operations (e.g., fetching next stream URL)
    setIsPlaying(false);

    // Check autoplay setting
    const autoplayNext = useSettingsStore.getState().getSetting(SETTINGS_KEYS.AUTOPLAY_NEXT);
    if (autoplayNext !== "true") {
      log.info("Autoplay disabled, stopping playback");
      return;
    }
    log.debug("Autoplay enabled, advancing to next song");

    const { playNextFromQueue } = useQueueStore.getState();
    const nextItem = playNextFromQueue();

    if (nextItem) {
      const isLocalFile = nextItem.video.source === "local" && nextItem.video.filePath;
      const isYouTubeVideo = !!nextItem.video.youtubeId;

      if (isLocalFile) {
        // Local file: play directly
        log.info(`Auto-playing next local file: "${nextItem.video.title}"`);
        setCurrentVideo(nextItem.video);
        setIsPlaying(true);
      } else if (isYouTubeVideo) {
        log.info(`Auto-playing next: "${nextItem.video.title}"`);
        setIsLoading(true);

        if (playbackMode === "ytdlp") {
          // yt-dlp mode: fetch stream URL
          try {
            const cachedUrl = usePlayerStore.getState().getPrefetchedStreamUrl(nextItem.video.youtubeId!);
            usedCachedUrlRef.current = !!cachedUrl;

            const streamUrl = await getStreamUrlWithCache(nextItem.video.youtubeId!);
            setCurrentVideo({ ...nextItem.video, streamUrl });
            setIsPlaying(true);
          } catch (err) {
            log.error("Failed to play next", err);
            notify("error", "Failed to play next video");
            setIsLoading(false);
          }
        } else {
          // YouTube mode: just set the video, no stream URL needed
          setCurrentVideo(nextItem.video);
          setIsPlaying(true);
        }
      } else {
        log.info("Next item has no playable source, stopping");
        setIsPlaying(false);
      }
    } else {
      log.info("Queue empty, playback stopped");
      setIsPlaying(false);
    }
  }, [setCurrentVideo, setIsPlaying, setIsLoading, playbackMode]);

  // Listen for video ended event from detached player
  const handleEndedRef = useRef(handleEnded);
  handleEndedRef.current = handleEnded;

  useEffect(() => {
    if (!isDetached) return;

    let unlistenFn: (() => void) | undefined;
    let cancelled = false;

    windowManager.listenForVideoEnded(() => {
      log.info("Video ended in detached player, advancing queue");
      handleEndedRef.current();
    }).then((unlisten) => {
      if (!cancelled) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [isDetached]);

  const handleError = useCallback(async (errorOrCode: MediaError | number | null, message?: string) => {
    if (typeof errorOrCode === "number") {
      // YouTube player error
      log.error(`YouTube player error: ${errorOrCode} - ${message}`);

      // Check if this is an embedding error (101/150)
      if (isEmbeddingError(errorOrCode) && currentVideo?.youtubeId) {
        log.info(`Video "${currentVideo.title}" does not allow embedding, marking and skipping`);

        // Mark as non-embeddable
        usePlayerStore.getState().markAsNonEmbeddable(currentVideo.youtubeId);

        // Show brief notification
        notify("warning", `"${currentVideo.title}" doesn't allow embedding, skipping...`);

        // Auto-skip to next video
        setIsLoading(true);
        const { playNextFromQueue } = useQueueStore.getState();
        const nextItem = playNextFromQueue();

        if (nextItem) {
          const isLocalFile = nextItem.video.source === "local" && nextItem.video.filePath;
          const isYouTubeVideo = !!nextItem.video.youtubeId;

          if (isLocalFile) {
            log.info(`Auto-skipping to local file: "${nextItem.video.title}"`);
            setCurrentVideo(nextItem.video);
            setIsPlaying(true);
            setIsLoading(false);
          } else if (isYouTubeVideo) {
            log.info(`Auto-skipping to: "${nextItem.video.title}"`);
            if (playbackMode === "ytdlp") {
              try {
                const streamUrl = await getStreamUrlWithCache(nextItem.video.youtubeId!);
                setCurrentVideo({ ...nextItem.video, streamUrl });
                setIsPlaying(true);
              } catch (err) {
                log.error("Failed to play next after skip", err);
                notify("error", "Failed to play next video");
                setIsLoading(false);
              }
            } else {
              setCurrentVideo(nextItem.video);
              setIsPlaying(true);
            }
          } else {
            log.info("Next item has no playable source after skip");
            setCurrentVideo(null);
            setIsPlaying(false);
            setIsLoading(false);
          }
        } else {
          log.info("No more videos in queue after skip");
          setCurrentVideo(null);
          setIsPlaying(false);
          setIsLoading(false);
        }
        return;
      }

      // Non-embedding error - show error
      notify("error", message || "Video playback error");
      setIsLoading(false);
      return;
    }

    // Native player error (MediaError)
    const mediaError = errorOrCode;
    const errorCodes: Record<number, string> = {
      1: "MEDIA_ERR_ABORTED - Fetching was aborted",
      2: "MEDIA_ERR_NETWORK - Network error during download",
      3: "MEDIA_ERR_DECODE - Error decoding media (codec issue)",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED - Media format not supported",
    };

    const errorCode = mediaError?.code || 0;
    const errorMessage = mediaError?.message || "Unknown error";
    const errorDescription = errorCodes[errorCode] || `Unknown error code: ${errorCode}`;

    log.error(`Video error: ${errorDescription}`);
    log.error(`Error message: ${errorMessage}`);

    // If we used a cached URL that might be stale, retry with fresh fetch
    if (usedCachedUrlRef.current && currentVideo?.youtubeId) {
      log.debug("Cached URL failed, retrying with fresh fetch");
      usedCachedUrlRef.current = false;
      setIsLoading(true);
      try {
        const streamInfo = await youtubeService.getStreamUrl(currentVideo.youtubeId);
        setCurrentVideo({ ...currentVideo, streamUrl: streamInfo.url });
        return;
      } catch (err) {
        log.error("Fresh fetch also failed", err);
      }
    }
    log.error("Failed to load video");
    notify("error", "Failed to load video");
    setIsLoading(false);
  }, [currentVideo, setCurrentVideo, setIsLoading, setIsPlaying, playbackMode]);

  // Determine what to show
  const hasVideoId = !!currentVideo?.youtubeId;
  const hasStreamUrl = !!currentVideo?.streamUrl;
  const hasLocalFile = currentVideo?.source === "local" && !!currentVideo?.filePath;
  const canPlayYouTube = playbackMode === "youtube" && hasVideoId;
  const canPlayNative = playbackMode === "ytdlp" && hasStreamUrl;
  const canPlayLocal = hasLocalFile;

  // Get the URL for local files (convert file path to URL that webview can access)
  // Also check next queue item to preload and keep video element mounted
  const nextLocalFilePath = nextQueueItem?.video.source === "local" ? nextQueueItem.video.filePath : null;

  const localFileUrl = useMemo(() => {
    if (hasLocalFile && currentVideo?.filePath) {
      return convertFileSrc(currentVideo.filePath);
    }
    // If next item is local, preload it to keep video element mounted
    if (nextLocalFilePath) {
      return convertFileSrc(nextLocalFilePath);
    }
    // No local file - return undefined to enable "dummy mode" for priming
    return undefined;
  }, [hasLocalFile, currentVideo?.filePath, nextLocalFilePath]);

  // Show placeholder when no video or when detached (video plays in separate window)
  if ((!canPlayYouTube && !canPlayNative && !canPlayLocal) || isDetached) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg relative overflow-hidden">
        {/* Always render NativePlayer in background for priming (dummy mode) */}
        <div className="absolute inset-0">
          <NativePlayer
            ref={nativePlayerRef}
            streamUrl={undefined}
            isPlaying={false}
            volume={volume}
            isMuted={isMuted}
            seekTime={null}
          />
        </div>
        {/* Click to Start overlay - shown on first load to enable playback */}
        {!isPlaybackEnabled && !isDetached && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80" style={{ zIndex: Z_INDEX_PRIMING_OVERLAY }}>
            <button
              onClick={handleEnablePlayback}
              className="flex flex-col items-center gap-4 p-8 rounded-xl bg-gray-800/90 hover:bg-gray-700/90 transition-colors cursor-pointer border border-gray-600"
            >
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                <span className="text-blue-400 text-3xl">🎤</span>
              </div>
              <p className="text-white text-lg font-medium">Click to Start</p>
              <p className="text-gray-400 text-sm text-center max-w-xs">
                Click here to enable video playback
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Web and local videos require separate activation
              </p>
            </button>
          </div>
        )}
        {/* Overlay content on top of NativePlayer */}
        <div className="relative z-10">
          {isLoading ? (
            <div className="text-center text-white">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p>Loading video...</p>
            </div>
          ) : isDetached ? (
            <div className="text-center text-gray-400">
              <DetachIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Video playing in separate window</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full bg-black rounded-lg overflow-hidden relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {canPlayYouTube && currentVideo?.youtubeId && (
        <YouTubePlayer
          videoId={currentVideo.youtubeId}
          isPlaying={isPlaying}
          volume={volume}
          isMuted={isMuted}
          seekTime={seekTime}
          onReady={handleReady}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={(code, msg) => handleError(code, msg)}
          onDurationChange={handleDurationChange}
          onClearSeek={clearSeek}
        />
      )}
      {canPlayNative && currentVideo?.streamUrl && (
        <NativePlayer
          streamUrl={currentVideo.streamUrl}
          isPlaying={isPlaying}
          volume={volume}
          isMuted={isMuted}
          seekTime={seekTime}
          playbackKey={currentVideo.id}
          onReady={handleReady}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={(err) => handleError(err)}
          onDurationChange={handleDurationChange}
          onClearSeek={clearSeek}
        />
      )}
      {/* Always render NativePlayer to preserve user interaction context for autoplay */}
      {/* In dummy mode (no URL), it shows a priming overlay; otherwise plays local files */}
      {/* Hide when YouTube/yt-dlp is playing, but keep mounted for priming */}
      <div className={canPlayLocal ? "" : "hidden"}>
        <NativePlayer
          ref={nativePlayerRef}
          streamUrl={localFileUrl}
          isPlaying={canPlayLocal && isPlaying}
          volume={volume}
          isMuted={isMuted}
          seekTime={canPlayLocal ? seekTime : null}
          playbackKey={currentVideo?.id}
          onReady={canPlayLocal ? handleReady : undefined}
          onTimeUpdate={canPlayLocal ? handleTimeUpdate : undefined}
          onEnded={canPlayLocal ? handleEnded : undefined}
          onError={canPlayLocal ? (err) => handleError(err) : undefined}
          onDurationChange={canPlayLocal ? handleDurationChange : undefined}
          onClearSeek={canPlayLocal ? clearSeek : undefined}
        />
      </div>
      {/* Detach button - appears on hover */}
      {!isDetached && isHovered && (
        <button
          onClick={handleDetach}
          className="absolute bottom-3 right-3 p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-all duration-200 text-white z-10"
          title="Detach video to separate window"
        >
          <DetachIcon className="w-5 h-5" />
        </button>
      )}
      <CurrentSingerOverlay key={currentVideo?.id} />
      <NextSongOverlayWithSingers
        nextQueueItem={nextQueueItem}
        currentVideo={currentVideo}
        duration={duration}
        currentTime={currentTime}
        isLoading={isLoading}
      />
    </div>
  );
}

// Separate component to handle singer loading for next song overlay
function NextSongOverlayWithSingers({
  nextQueueItem,
  currentVideo,
  duration,
  currentTime,
  isLoading,
}: {
  nextQueueItem: ReturnType<typeof useQueueStore.getState>["queue"][0] | undefined;
  currentVideo: ReturnType<typeof usePlayerStore.getState>["currentVideo"];
  duration: number;
  currentTime: number;
  isLoading: boolean;
}) {
  const { session, singers, queueSingerAssignments, getQueueItemSingerIds, getSingerById, loadQueueItemSingers } = useSessionStore();

  // Get overlay setting from store (0 = Off, 10/20/30 = seconds before end)
  const rawOverlaySeconds = useSettingsStore((state) =>
    state.getSetting(SETTINGS_KEYS.NEXT_SONG_OVERLAY_SECONDS)
  );
  const overlaySeconds = parseOverlaySeconds(rawOverlaySeconds);
  const overlayEnabled = overlaySeconds > 0;

  // Load singers for next queue item when it changes
  useEffect(() => {
    if (session && nextQueueItem) {
      loadQueueItemSingers(nextQueueItem.id);
    }
  }, [session, nextQueueItem?.id, loadQueueItemSingers]);

  // Get singers for next queue item
  const nextSingers = useMemo(() => {
    if (!session || !nextQueueItem) return undefined;
    const singerIds = getQueueItemSingerIds(nextQueueItem.id);
    return singerIds.map((id) => getSingerById(id)).filter(Boolean) as NonNullable<
      ReturnType<typeof getSingerById>
    >[];
  }, [session, nextQueueItem, queueSingerAssignments, singers, getQueueItemSingerIds, getSingerById]);

  // Hide overlay when disabled (overlaySeconds = 0), loading, or not within threshold
  // Only show when timeRemaining <= overlaySeconds (e.g., last 20 seconds of the song)
  if (!overlayEnabled || !nextQueueItem || duration <= 0 || isLoading) return null;

  // Don't show overlay if next song is the same as currently playing video
  // This can happen in edge cases like queue state not being properly synced
  if (nextQueueItem.video.id === currentVideo?.id) return null;

  const timeRemaining = Math.ceil(duration - currentTime);
  if (timeRemaining > overlaySeconds) return null;

  return (
    <NextSongOverlay
      title={nextQueueItem.video.title}
      artist={nextQueueItem.video.artist}
      countdown={timeRemaining <= COUNTDOWN_START_THRESHOLD_SECONDS ? timeRemaining : undefined}
      singers={nextSingers}
    />
  );
}
