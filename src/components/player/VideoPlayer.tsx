import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import {
  usePlayerStore,
  useQueueStore,
  useSessionStore,
  getStreamUrlWithCache,
  invalidatePrefetchIfStale,
  PREFETCH_THRESHOLD_SECONDS,
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
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // Handle detach button click
  const handleDetach = useCallback(async () => {
    if (isDetached) return;

    log.info("Detaching player window");
    const playerState = {
      streamUrl: currentVideo?.streamUrl || null,
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
  }, [isDetached, currentVideo, isPlaying, currentTime, duration, volume, isMuted, setIsDetached, setIsLoading]);

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

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.play().catch((e) => {
      log.error("Failed to play video", e);
      notify("error", "Failed to play video");
      setIsPlaying(false);
    });
  }, [setIsPlaying]);

  // Handle play/pause state changes (only for pause, play is handled by canplay)
  // Also pause when detached (video plays in separate window)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isDetached || !isPlaying) {
      video.pause();
    } else if (video.readyState >= 3) {
      // Video is ready, play it
      tryPlay();
    }
    // If isPlaying but video not ready, handleCanPlay will trigger play
  }, [isPlaying, isDetached, tryPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Handle seeking
  useEffect(() => {
    const video = videoRef.current;
    if (!video || seekTime === null) return;

    video.currentTime = seekTime;
    clearSeek();
  }, [seekTime, clearSeek]);

  // Seek to stored currentTime when reattaching from detached window
  useEffect(() => {
    const video = videoRef.current;
    // Detect reattachment: was detached, now not detached
    if (wasDetachedRef.current && !isDetached && video && currentTime > MIN_RESTORE_POSITION_SECONDS) {
      video.currentTime = currentTime;
    }
    // Update ref for next render
    wasDetachedRef.current = isDetached;
  }, [isDetached, currentTime]);

  // Keyboard shortcuts for seeking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const video = videoRef.current;
      if (!video || !currentVideo) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          break;
        case " ":
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentVideo, isPlaying, setIsPlaying]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const currentTime = video.currentTime;
    const duration = video.duration;
    setCurrentTime(currentTime);

    // Prefetch next video before end (or immediately if video is short)
    if (duration > 0) {
      const timeRemaining = duration - currentTime;
      const shouldPrefetch = timeRemaining <= PREFETCH_THRESHOLD_SECONDS || duration <= PREFETCH_THRESHOLD_SECONDS;

      if (shouldPrefetch) {
        const nextItem = useQueueStore.getState().queue[0];
        const nextVideoId = nextItem?.video.youtubeId;
        if (nextVideoId && prefetchTriggeredRef.current !== nextVideoId) {
          prefetchTriggeredRef.current = nextVideoId;
          const videoIdToFetch = nextVideoId; // Capture to avoid race condition
          log.debug(`Prefetching next video: ${nextItem?.video.title}`);
          youtubeService.getStreamUrl(videoIdToFetch)
            .then(info => {
              // Only cache if this is still the next video in queue
              if (useQueueStore.getState().queue[0]?.video.youtubeId === videoIdToFetch) {
                usePlayerStore.getState().setPrefetchedStreamUrl(videoIdToFetch, info.url);
                log.debug(`Prefetch complete for: ${nextItem?.video.title}`);
              }
            })
            .catch((err) => log.debug(`Prefetch failed for ${videoIdToFetch}`, err));
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleCanPlay = () => {
    setIsLoading(false);
    usedCachedUrlRef.current = false; // Reset on successful load
    // Auto-play when video is ready and isPlaying is true
    if (isPlaying) {
      tryPlay();
    }
  };

  const handleEnded = useCallback(async () => {
    log.info("Video ended");
    // Use playNextFromQueue to always take from queue when song ends naturally.
    // This ensures songs played from Search or History don't cause the player
    // to continue through history - it always goes to the queue next.
    const { playNextFromQueue } = useQueueStore.getState();
    const nextItem = playNextFromQueue();

    if (nextItem && nextItem.video.youtubeId) {
      // Play next from queue
      log.info(`Auto-playing next: "${nextItem.video.title}"`);
      setIsLoading(true);
      try {
        // Check if we have a cached URL
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
      log.info("Queue empty, playback stopped");
      setIsPlaying(false);
    }
  }, [setCurrentVideo, setIsPlaying, setIsLoading]);

  // Listen for video ended event from detached player
  // Note: We use a ref pattern to avoid re-registering the listener when handleEnded changes
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
        // Cleanup immediately if effect was already cancelled
        unlisten();
      }
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [isDetached]);

  const handleError = useCallback(async (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const mediaError = video.error;

    // Log detailed error information
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
    log.error(`Video src: ${video.src?.substring(0, 100)}...`);
    log.error(`Network state: ${video.networkState}, Ready state: ${video.readyState}`);

    // If we used a cached URL that might be stale, retry with fresh fetch
    if (usedCachedUrlRef.current && currentVideo?.youtubeId) {
      log.debug("Cached URL failed, retrying with fresh fetch");
      usedCachedUrlRef.current = false;
      setIsLoading(true);
      try {
        const streamInfo = await youtubeService.getStreamUrl(currentVideo.youtubeId);
        setCurrentVideo({ ...currentVideo, streamUrl: streamInfo.url });
        return; // Don't show error, we're retrying
      } catch (err) {
        log.error("Fresh fetch also failed", err);
      }
    }
    log.error("Failed to load video");
    notify("error", "Failed to load video");
    setIsLoading(false);
  }, [currentVideo, setCurrentVideo, setIsLoading]);

  const handleLoadStart = () => {
    setIsLoading(true);
  };

  // Show placeholder when no video or when detached (video plays in separate window)
  if (!currentVideo?.streamUrl || isDetached) {
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
      <video
        ref={videoRef}
        src={currentVideo.streamUrl}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onEnded={handleEnded}
        onError={handleError}
        onLoadStart={handleLoadStart}
        playsInline
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">Loading...</div>
        </div>
      )}
      {/* Detach button - appears on hover */}
      {!isDetached && isHovered && (
        <button
          onClick={handleDetach}
          className="absolute bottom-3 right-3 p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-all duration-200 text-white"
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
      />
    </div>
  );
}

// Separate component to handle singer loading for next song overlay
function NextSongOverlayWithSingers({
  nextQueueItem,
  duration,
  currentTime,
}: {
  nextQueueItem: ReturnType<typeof useQueueStore.getState>["queue"][0] | undefined;
  duration: number;
  currentTime: number;
}) {
  const { session, singers, queueSingerAssignments, getQueueItemSingerIds, getSingerById, loadQueueItemSingers } = useSessionStore();

  // Load singers for next queue item when it changes
  useEffect(() => {
    if (session && nextQueueItem) {
      loadQueueItemSingers(nextQueueItem.id);
    }
  }, [session, nextQueueItem?.id, loadQueueItemSingers]);

  // Get singers for next queue item
  // Include queueSingerAssignments and singers in deps to ensure reactivity
  const nextSingers = useMemo(() => {
    if (!session || !nextQueueItem) return undefined;
    const singerIds = getQueueItemSingerIds(nextQueueItem.id);
    return singerIds.map((id) => getSingerById(id)).filter(Boolean) as NonNullable<
      ReturnType<typeof getSingerById>
    >[];
  }, [session, nextQueueItem, queueSingerAssignments, singers, getQueueItemSingerIds, getSingerById]);

  if (!nextQueueItem || duration <= 0) return null;
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
