import { useRef, useCallback, useEffect } from "react";
import { usePlayerStore, useQueueStore, useSessionStore, playVideo } from "../../stores";
import { windowManager, youtubeService, createLogger } from "../../services";

const log = createLogger("PlayerControls");

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerControls() {
  const progressRef = useRef<HTMLDivElement>(null);
  const {
    currentVideo,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isDetached,
    seekTime,
    setIsPlaying,
    setIsDetached,
    setVolume,
    toggleMute,
    seekTo,
  } = usePlayerStore();

  const { hasNext, hasPrevious, playNext, playPrevious, getCurrentItem } = useQueueStore();
  const nextQueueItem = useQueueStore((state) => state.queue[0]);
  const currentQueueItem = getCurrentItem();

  // Subscribe to session singer state for reactive updates
  const { session, queueSingerAssignments, singers, loadQueueItemSingers } = useSessionStore();

  // Load singers for current and next queue items when detached
  // Only load if singers aren't already loaded to avoid redundant queries
  useEffect(() => {
    if (!isDetached || !session) return;
    if (currentQueueItem && !queueSingerAssignments.has(currentQueueItem.id)) {
      loadQueueItemSingers(currentQueueItem.id);
    }
    if (nextQueueItem && !queueSingerAssignments.has(nextQueueItem.id)) {
      loadQueueItemSingers(nextQueueItem.id);
    }
  }, [isDetached, session, currentQueueItem?.id, nextQueueItem?.id, queueSingerAssignments, loadQueueItemSingers]);

  // Build player state object for syncing to detached window
  // Uses fresh values from store to avoid stale closures
  const buildPlayerState = useCallback(() => {
    const state = usePlayerStore.getState();
    const queueState = useQueueStore.getState();
    const next = queueState.queue[0];
    const current = queueState.getCurrentItem();
    const sessionState = useSessionStore.getState();

    // Helper to get singers for a queue item
    const getSingers = (itemId: string | undefined) => {
      if (!itemId || !sessionState.session) return undefined;
      const singerIds = sessionState.getQueueItemSingerIds(itemId);
      if (singerIds.length === 0) return undefined;
      return singerIds
        .map((id) => sessionState.getSingerById(id))
        .filter(Boolean)
        .map((s) => ({ id: s!.id, name: s!.name, color: s!.color }));
    };

    return {
      streamUrl: state.currentVideo?.streamUrl ?? null,
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      duration: state.duration,
      volume: state.volume,
      isMuted: state.isMuted,
      currentSong: current
        ? { title: current.video.title, artist: current.video.artist, singers: getSingers(current.id) }
        : undefined,
      nextSong: next
        ? { title: next.video.title, artist: next.video.artist, singers: getSingers(next.id) }
        : undefined,
    };
  }, []);

  // Listen for reattachment from detached window
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    windowManager.listenForReattach(() => {
      if (isMounted) setIsDetached(false);
    }).then((unlisten) => {
      if (isMounted) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [setIsDetached]);

  // Listen for final state from detached window before it closes
  useEffect(() => {
    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    windowManager.listenForFinalState((finalState) => {
      if (isMounted) {
        // Update store with final state from detached window
        usePlayerStore.setState({
          currentTime: finalState.currentTime,
          isPlaying: finalState.isPlaying,
        });
        // Seek to the final time
        seekTo(finalState.currentTime);
      }
    }).then((unlisten) => {
      if (isMounted) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [seekTo]);

  // Listen for time updates from detached window
  useEffect(() => {
    if (!isDetached) return;

    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    windowManager.listenForTimeUpdate((time) => {
      if (isMounted) {
        usePlayerStore.setState({ currentTime: time });
      }
    }).then((unlisten) => {
      if (isMounted) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [isDetached]);

  // Listen for video loaded event from detached window to clear loading state
  useEffect(() => {
    if (!isDetached) return;

    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    windowManager.listenForVideoLoaded(() => {
      if (isMounted) {
        usePlayerStore.setState({ isLoading: false });
      }
    }).then((unlisten) => {
      if (isMounted) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [isDetached]);

  // Listen for state requests from detached window and respond with current state
  useEffect(() => {
    if (!isDetached) return;

    let isMounted = true;
    let unlistenFn: (() => void) | undefined;

    windowManager.listenForStateRequest(() => {
      if (isMounted) {
        const state = buildPlayerState();
        if (state.streamUrl) {
          windowManager.syncState(state);
        }
      }
    }).then((unlisten) => {
      if (isMounted) {
        unlistenFn = unlisten;
      } else {
        unlisten();
      }
    });

    return () => {
      isMounted = false;
      unlistenFn?.();
    };
  }, [isDetached, buildPlayerState]);

  // Sync state to detached window when relevant state changes
  // Note: currentTime is intentionally excluded from dependencies to prevent sync loops.
  // Time updates flow one-way: detached window → main window via listenForTimeUpdate.
  // queueSingerAssignments.size and singers.length are included to trigger re-sync when singers load.
  // buildPlayerState is called inline (not in deps) since it reads fresh state via getState().
  useEffect(() => {
    if (!isDetached || !currentVideo?.streamUrl) return;
    windowManager.syncState(buildPlayerState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetached, currentVideo?.streamUrl, isPlaying, volume, isMuted, nextQueueItem, currentQueueItem, queueSingerAssignments.size, singers.length]);

  // Send play/pause commands to detached window
  useEffect(() => {
    if (!isDetached) return;
    windowManager.sendCommand(isPlaying ? "play" : "pause");
  }, [isDetached, isPlaying]);

  // Send seek commands to detached window
  useEffect(() => {
    if (!isDetached || seekTime === null) return;
    windowManager.sendCommand("seek", seekTime);
  }, [isDetached, seekTime]);

  const handleDetach = useCallback(async () => {
    if (!currentVideo?.streamUrl) return;

    log.info("Detaching player");
    // Pause before detaching - detached window will start paused
    // Explicitly set isPlaying: false since setIsPlaying is async and buildPlayerState
    // might capture the old value before React processes the state update
    setIsPlaying(false);
    const stateToDetach = { ...buildPlayerState(), isPlaying: false };

    const success = await windowManager.detachPlayer(stateToDetach);

    if (success) {
      setIsDetached(true);
      log.info("Player detached successfully");
    } else {
      log.error("Failed to detach player");
    }
  }, [currentVideo?.streamUrl, setIsDetached, setIsPlaying, buildPlayerState]);

  const handleReattach = useCallback(async () => {
    log.info("Reattaching player");
    await windowManager.reattachPlayer();
    setIsDetached(false);
  }, [setIsDetached]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !duration) return;

      const rect = progressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * duration;

      log.debug(`Seeking to ${formatTime(newTime)}`);
      seekTo(Math.max(0, Math.min(newTime, duration)));
    },
    [duration, seekTo]
  );

  const handlePrevious = useCallback(async () => {
    log.info("Playing previous");
    const prevItem = playPrevious();
    if (prevItem) {
      try {
        await playVideo(prevItem.video);
      } catch {
        // Error already logged and state updated by playVideo
      }
    }
  }, [playPrevious]);

  const handleNext = useCallback(async () => {
    log.info("Playing next");
    const nextItem = playNext();
    if (nextItem) {
      try {
        await playVideo(nextItem.video);
      } catch {
        // Error already logged and state updated by playVideo
      }
    }
  }, [playNext]);

  const handlePlayPause = useCallback(() => {
    const newState = !isPlaying;
    log.info(newState ? "Playing" : "Pausing");
    setIsPlaying(newState);
  }, [isPlaying, setIsPlaying]);

  const { setIsLoading, setCurrentVideo, setError } = usePlayerStore();

  const handleReload = useCallback(async () => {
    if (!currentVideo?.youtubeId) return;

    log.info("Reloading current video");
    setIsLoading(true);
    setError(null);

    try {
      // Always fetch fresh URL (bypass cache)
      const streamInfo = await youtubeService.getStreamUrl(currentVideo.youtubeId);
      setCurrentVideo({ ...currentVideo, streamUrl: streamInfo.url });
      setIsPlaying(true);
      // Reset to beginning
      seekTo(0);
      log.info("Video reloaded successfully");
    } catch (err) {
      log.error("Failed to reload video", err);
      setError("Failed to reload video");
    } finally {
      setIsLoading(false);
    }
  }, [currentVideo, setIsLoading, setCurrentVideo, setIsPlaying, setError, seekTo]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    log.debug(`Volume: ${Math.round(newVolume * 100)}%`);
    setVolume(newVolume);
  }, [setVolume]);

  const handleMuteToggle = useCallback(() => {
    log.info(isMuted ? "Unmuting" : "Muting");
    toggleMute();
  }, [isMuted, toggleMute]);

  const { isLoading } = usePlayerStore();
  const isDisabled = !currentVideo;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`bg-gray-800 p-3 rounded-lg relative ${isDisabled ? "opacity-60" : ""}`}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center z-10">
          <div className="w-8 h-8 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      <div className="flex items-center gap-4">
        {/* Previous */}
        <button
          onClick={handlePrevious}
          disabled={isDisabled || !hasPrevious()}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            !isDisabled && hasPrevious()
              ? "hover:bg-gray-700 text-white"
              : "text-gray-600 cursor-not-allowed"
          }`}
          title="Previous"
        >
          ⏮
        </button>

        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          disabled={isDisabled}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
            isDisabled
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={isDisabled || !hasNext()}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            !isDisabled && hasNext()
              ? "hover:bg-gray-700 text-white"
              : "text-gray-600 cursor-not-allowed"
          }`}
          title="Next"
        >
          ⏭
        </button>

        {/* Reload */}
        <button
          onClick={handleReload}
          disabled={isDisabled || isLoading}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            !isDisabled && !isLoading
              ? "hover:bg-gray-700 text-white"
              : "text-gray-600 cursor-not-allowed"
          }`}
          title="Reload video"
        >
          ↻
        </button>

        {/* Progress */}
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>{isDisabled ? "--:--" : formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              onClick={isDisabled || isLoading ? undefined : handleSeek}
              className={`flex-1 h-2 bg-gray-700 rounded-full transition-all ${
                isDisabled || isLoading ? "cursor-not-allowed" : "cursor-pointer hover:h-3"
              }`}
            >
              <div
                className="h-full bg-blue-500 rounded-full pointer-events-none"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span>
              {isDisabled
                ? "--:--"
                : duration > 0
                  ? formatTime(duration)
                  : currentVideo?.duration
                    ? formatTime(currentVideo.duration)
                    : "--:--"}
            </span>
          </div>
        </div>

        {/* Volume */}
        <button
          onClick={isDisabled ? undefined : handleMuteToggle}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            isDisabled ? "cursor-not-allowed" : "hover:bg-gray-700"
          }`}
        >
          {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          disabled={isDisabled}
          className="w-20"
        />

        {/* Detach/Reattach */}
        <button
          onClick={isDetached ? handleReattach : handleDetach}
          disabled={isDisabled}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            isDisabled ? "cursor-not-allowed text-gray-600" : "hover:bg-gray-700"
          }`}
          title={isDetached ? "Reattach player" : "Detach player"}
        >
          {isDetached ? "⊡" : "⧉"}
        </button>
      </div>

      {/* Video info */}
      <div className="mt-2 text-sm">
        <p className="font-medium truncate">
          {currentVideo?.title || "No video selected"}
        </p>
        {currentVideo?.artist && (
          <p className="text-gray-400 truncate">{currentVideo.artist}</p>
        )}
      </div>
    </div>
  );
}
