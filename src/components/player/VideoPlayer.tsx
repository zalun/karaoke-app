import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import {
  usePlayerStore,
  useQueueStore,
  useSessionStore,
  useSettingsStore,
  SETTINGS_KEYS,
  getStreamUrlWithCache,
  invalidatePrefetchIfStale,
  PREFETCH_THRESHOLD_SECONDS,
  isEmbeddingError,
  notify,
} from "../../stores";
import { youtubeService, createLogger, windowManager } from "../../services";
import { useWakeLock } from "../../hooks";
import {
  NextSongOverlay,
  OVERLAY_SHOW_THRESHOLD_SECONDS,
  COUNTDOWN_START_THRESHOLD_SECONDS,
} from "./NextSongOverlay";
import { CurrentSingerOverlay } from "./CurrentSingerOverlay";
import { MIN_RESTORE_POSITION_SECONDS } from "./DetachedPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { NativePlayer } from "./NativePlayer";

const log = createLogger("VideoPlayer");

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

  // Handle detach button click
  const handleDetach = useCallback(async () => {
    if (isDetached) return;

    log.info("Detaching player window");
    const playerState = {
      streamUrl: currentVideo?.streamUrl || null,
      videoId: currentVideo?.youtubeId || null,
      playbackMode,
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
    if (playbackMode !== "ytdlp") return;
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
  }, [currentVideo, nextQueueVideoId, nextQueueItem?.video.title, playbackMode]);

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
    if (playbackMode === "ytdlp" && dur > 0) {
      const timeRemaining = dur - time;
      const shouldPrefetch = timeRemaining <= PREFETCH_THRESHOLD_SECONDS || dur <= PREFETCH_THRESHOLD_SECONDS;

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
  }, [setCurrentTime, setDuration, duration, playbackMode]);

  const handleDurationChange = useCallback((dur: number) => {
    if (dur > 0) {
      setDuration(dur);
    }
  }, [setDuration]);

  const handleReady = useCallback(() => {
    setIsLoading(false);
    usedCachedUrlRef.current = false;
  }, [setIsLoading]);

  const handleEnded = useCallback(async () => {
    log.info("Video ended");
    const { playNextFromQueue } = useQueueStore.getState();
    const nextItem = playNextFromQueue();

    if (nextItem && nextItem.video.youtubeId) {
      log.info(`Auto-playing next: "${nextItem.video.title}"`);
      setIsLoading(true);

      if (playbackMode === "ytdlp") {
        // yt-dlp mode: fetch stream URL
        try {
          const cachedUrl = usePlayerStore.getState().getPrefetchedStreamUrl(nextItem.video.youtubeId);
          usedCachedUrlRef.current = !!cachedUrl;

          const streamUrl = await getStreamUrlWithCache(nextItem.video.youtubeId);
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

        if (nextItem && nextItem.video.youtubeId) {
          log.info(`Auto-skipping to: "${nextItem.video.title}"`);
          if (playbackMode === "ytdlp") {
            try {
              const streamUrl = await getStreamUrlWithCache(nextItem.video.youtubeId);
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
  const canPlayYouTube = playbackMode === "youtube" && hasVideoId;
  const canPlayNative = playbackMode === "ytdlp" && hasStreamUrl;

  // Show placeholder when no video or when detached (video plays in separate window)
  if ((!canPlayYouTube && !canPlayNative) || isDetached) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
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
        ) : (
          <div className="text-center text-gray-400">
            <p className="text-4xl mb-2">🎤</p>
            <p>Search for a song to start</p>
          </div>
        )}
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
          onReady={handleReady}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={(err) => handleError(err)}
          onDurationChange={handleDurationChange}
          onClearSeek={clearSeek}
        />
      )}
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
  duration,
  currentTime,
  isLoading,
}: {
  nextQueueItem: ReturnType<typeof useQueueStore.getState>["queue"][0] | undefined;
  duration: number;
  currentTime: number;
  isLoading: boolean;
}) {
  const { session, singers, queueSingerAssignments, getQueueItemSingerIds, getSingerById, loadQueueItemSingers } = useSessionStore();

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

  // Hide overlay when loading next video (prevents showing wrong "next" song during transition)
  if (!nextQueueItem || duration <= 0 || isLoading) return null;
  const timeRemaining = Math.ceil(duration - currentTime);
  if (timeRemaining > OVERLAY_SHOW_THRESHOLD_SECONDS) return null;

  return (
    <NextSongOverlay
      title={nextQueueItem.video.title}
      artist={nextQueueItem.video.artist}
      countdown={timeRemaining <= COUNTDOWN_START_THRESHOLD_SECONDS ? timeRemaining : undefined}
      singers={nextSingers}
    />
  );
}
