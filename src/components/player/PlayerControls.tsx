import { useRef, useCallback, useEffect } from "react";
import { usePlayerStore, useQueueStore } from "../../stores";
import { youtubeService, windowManager } from "../../services";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerControls() {
  const progressRef = useRef<HTMLDivElement>(null);
  // Flag to prevent sync loops when receiving time updates from detached window
  const isReceivingTimeUpdate = useRef(false);
  const {
    currentVideo,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isDetached,
    seekTime,
    setCurrentVideo,
    setIsPlaying,
    setIsLoading,
    setIsDetached,
    setError,
    setVolume,
    toggleMute,
    seekTo,
  } = usePlayerStore();

  const { hasNext, hasPrevious, playNext, playPrevious } = useQueueStore();

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
        // Set flag to prevent sync loops
        isReceivingTimeUpdate.current = true;
        usePlayerStore.setState({ currentTime: time });
        // Reset flag after state update
        isReceivingTimeUpdate.current = false;
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
      if (isMounted && currentVideo?.streamUrl) {
        windowManager.syncState({
          streamUrl: currentVideo.streamUrl,
          isPlaying,
          currentTime,
          duration,
          volume,
          isMuted,
        });
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
  }, [isDetached, currentVideo?.streamUrl, isPlaying, currentTime, duration, volume, isMuted]);

  // Sync state to detached window when relevant state changes
  // Note: currentTime is intentionally excluded from dependencies to prevent sync loops.
  // Time updates flow one-way: detached window → main window via listenForTimeUpdate.
  useEffect(() => {
    if (!isDetached || !currentVideo?.streamUrl) return;

    windowManager.syncState({
      streamUrl: currentVideo.streamUrl,
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
    });
  }, [isDetached, currentVideo?.streamUrl, isPlaying, volume, isMuted]);

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

    const success = await windowManager.detachPlayer({
      streamUrl: currentVideo.streamUrl,
      isPlaying,
      currentTime,
      duration,
      volume,
      isMuted,
    });

    if (success) {
      setIsDetached(true);
    }
  }, [currentVideo?.streamUrl, isPlaying, currentTime, duration, volume, isMuted, setIsDetached]);

  const handleReattach = useCallback(async () => {
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

      seekTo(Math.max(0, Math.min(newTime, duration)));
    },
    [duration, seekTo]
  );

  const handlePrevious = useCallback(async () => {
    const prevItem = playPrevious();
    if (prevItem && prevItem.video.youtubeId) {
      setIsLoading(true);
      try {
        // Check for prefetched URL first
        const cachedUrl = usePlayerStore.getState().getPrefetchedStreamUrl(prevItem.video.youtubeId);
        let streamUrl: string;

        if (cachedUrl) {
          streamUrl = cachedUrl;
          usePlayerStore.getState().clearPrefetchedStreamUrl();
        } else {
          const streamInfo = await youtubeService.getStreamUrl(prevItem.video.youtubeId);
          streamUrl = streamInfo.url;
        }

        setCurrentVideo({
          ...prevItem.video,
          streamUrl,
        });
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play previous:", err);
        setError("Failed to play previous video");
        setIsLoading(false);
      }
    }
  }, [playPrevious, setCurrentVideo, setIsPlaying, setIsLoading, setError]);

  const handleNext = useCallback(async () => {
    const nextItem = playNext();
    if (nextItem && nextItem.video.youtubeId) {
      setIsLoading(true);
      try {
        // Check for prefetched URL first
        const cachedUrl = usePlayerStore.getState().getPrefetchedStreamUrl(nextItem.video.youtubeId);
        let streamUrl: string;

        if (cachedUrl) {
          streamUrl = cachedUrl;
          usePlayerStore.getState().clearPrefetchedStreamUrl();
        } else {
          const streamInfo = await youtubeService.getStreamUrl(nextItem.video.youtubeId);
          streamUrl = streamInfo.url;
        }

        setCurrentVideo({
          ...nextItem.video,
          streamUrl,
        });
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play next:", err);
        setError("Failed to play next video");
        setIsLoading(false);
      }
    }
  }, [playNext, setCurrentVideo, setIsPlaying, setIsLoading, setError]);

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
          onClick={() => setIsPlaying(!isPlaying)}
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
          onClick={isDisabled ? undefined : toggleMute}
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
          onChange={(e) => setVolume(parseFloat(e.target.value))}
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
