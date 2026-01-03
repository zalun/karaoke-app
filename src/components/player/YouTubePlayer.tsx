import { useRef, useEffect, useCallback, useState } from "react";
import {
  loadYouTubeAPI,
  YouTubePlayerState,
  getYouTubeErrorMessage,
  createAutoplayRetryHandler,
} from "../../services/youtubeIframe";
import { createLogger } from "../../services";

const log = createLogger("YouTubePlayer");

// Polling interval for time updates (YouTube API doesn't have continuous time events)
// Using 500ms to reduce CPU usage while maintaining smooth progress bar updates
const TIME_UPDATE_INTERVAL_MS = 500;

export interface YouTubePlayerProps {
  videoId: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekTime: number | null;
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (errorCode: number, message: string) => void;
  onDurationChange?: (duration: number) => void;
  onClearSeek?: () => void;
  onAutoplayBlocked?: () => void;
  className?: string;
}

export function YouTubePlayer({
  videoId,
  isPlaying,
  volume,
  isMuted,
  seekTime,
  onReady,
  onTimeUpdate,
  onEnded,
  onError,
  onDurationChange,
  onClearSeek,
  onAutoplayBlocked,
  className,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const timeUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVideoIdRef = useRef<string | null>(null);
  const isReadyRef = useRef(false);
  // Track current isPlaying value via ref for use in callbacks (avoids stale closure)
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  // Track whether we need to unmute after playback starts (for autoplay workaround)
  const pendingUnmuteRef = useRef(false);
  // Track current volume/mute settings via refs for use in callbacks
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Show "Click to Play" fallback when autoplay fails
  const [showPlayButton, setShowPlayButton] = useState(false);

  // Autoplay retry handler using utility
  const autoplayRetryRef = useRef(createAutoplayRetryHandler({
    maxRetries: 3,
    baseDelayMs: 200,
    onRetry: (attempt, delay) => {
      log.info(`Autoplay retry attempt ${attempt}/3, delay: ${delay}ms`);
    },
    onMaxRetriesExceeded: () => {
      log.warn("Autoplay failed after max retries, showing play button");
      setShowPlayButton(true);
      setIsLoading(false);
      onAutoplayBlocked?.();
    },
  }));

  // Clear time update interval
  const clearTimeUpdateInterval = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  }, []);

  // Start time update polling
  const startTimeUpdateInterval = useCallback(() => {
    clearTimeUpdateInterval();
    timeUpdateIntervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isReadyRef.current) return;

      try {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        if (currentTime >= 0 && duration > 0) {
          onTimeUpdate?.(currentTime, duration);
        }
      } catch {
        // Player might be destroyed, ignore
      }
    }, TIME_UPDATE_INTERVAL_MS);
  }, [clearTimeUpdateInterval, onTimeUpdate]);

  // Initialize YouTube player
  useEffect(() => {
    let mounted = true;
    let player: YT.Player | null = null;

    const initPlayer = async () => {
      if (!containerRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        const YT = await loadYouTubeAPI();

        if (!mounted || !containerRef.current) return;

        // Create a unique div for the player
        const playerId = `youtube-player-${Date.now()}`;
        const playerDiv = document.createElement("div");
        playerDiv.id = playerId;
        // Clear container using DOM methods (safer than innerHTML = "")
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
        containerRef.current.appendChild(playerDiv);

        player = new YT.Player(playerId, {
          width: "100%",
          height: "100%",
          videoId: videoId,
          playerVars: {
            autoplay: 1, // Always request autoplay
            mute: 1, // Start muted for autoplay compliance (will unmute after playback starts)
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            enablejsapi: 1,
            // Note: origin is set automatically by YouTube API
          },
          events: {
            onReady: (event) => {
              if (!mounted) return;
              log.info(`Player ready for video: ${videoId}`);
              isReadyRef.current = true;
              lastVideoIdRef.current = videoId;
              setIsLoading(false);

              const p = event.target;

              // Get duration
              const duration = p.getDuration();
              if (duration > 0) {
                onDurationChange?.(duration);
              }

              // Ensure playback starts if isPlaying is true
              // Use ref to get current value (avoids stale closure from initial render)
              log.info(`onReady: isPlayingRef.current=${isPlayingRef.current}, isMutedRef.current=${isMutedRef.current}`);
              if (isPlayingRef.current) {
                log.info("Starting playback on ready (isPlaying=true)");
                // Player starts muted for autoplay compliance
                // Mark that we need to unmute when playback actually starts
                if (!isMutedRef.current) {
                  pendingUnmuteRef.current = true;
                  log.info("Marked pendingUnmute=true (will unmute when PLAYING)");
                }
                p.playVideo();
              }

              onReady?.();
              startTimeUpdateInterval();
            },
            onStateChange: (event) => {
              if (!mounted) return;
              const state = event.data;
              const stateNames: Record<number, string> = {
                [-1]: "UNSTARTED",
                [0]: "ENDED",
                [1]: "PLAYING",
                [2]: "PAUSED",
                [3]: "BUFFERING",
                [5]: "CUED",
              };
              log.info(`Player state changed: ${state} (${stateNames[state] || "UNKNOWN"})`);

              if (state === YouTubePlayerState.ENDED) {
                log.info("Video ended");
                onEnded?.();
              } else if (state === YouTubePlayerState.PLAYING) {
                // Clear loading when video starts playing
                setIsLoading(false);
                // Autoplay succeeded, reset retry handler and hide play button
                autoplayRetryRef.current.reset();
                setShowPlayButton(false);

                // Handle pending unmute (autoplay workaround)
                if (pendingUnmuteRef.current) {
                  log.info("Playback started, unmuting now");
                  pendingUnmuteRef.current = false;
                  try {
                    event.target.unMute();
                    event.target.setVolume(volumeRef.current * 100);
                  } catch (err) {
                    log.error("Failed to unmute:", err);
                  }
                }

                // Call onReady for subsequent videos (not just initial load)
                // This ensures parent components know the video is ready to play
                onReady?.();
                // Update duration when playing starts (may not be available at onReady)
                const duration = event.target.getDuration();
                if (duration > 0) {
                  onDurationChange?.(duration);
                }
              } else if (state === YouTubePlayerState.CUED) {
                // Clear loading when video is cued (paused state)
                setIsLoading(false);
                // Also call onReady for cued state (video loaded but paused)
                onReady?.();
              } else if (state === YouTubePlayerState.UNSTARTED) {
                // Video is cued but not playing - autoplay might have been blocked
                if (isPlayingRef.current && isReadyRef.current) {
                  // Use retry handler to schedule retry with exponential backoff
                  autoplayRetryRef.current.scheduleRetry(() => {
                    if (!mounted || !playerRef.current) return;
                    try {
                      playerRef.current.mute();
                      playerRef.current.playVideo();
                      if (!isMutedRef.current) {
                        pendingUnmuteRef.current = true;
                      }
                    } catch (err) {
                      log.error("Retry playVideo() failed:", err);
                    }
                  });
                }
              }
            },
            onError: (event) => {
              if (!mounted) return;
              const errorCode = event.data;
              const message = getYouTubeErrorMessage(errorCode);
              log.error(`Player error: ${errorCode} - ${message}`);
              setError(message);
              setIsLoading(false);
              onError?.(errorCode, message);
            },
            onAutoplayBlocked: () => {
              if (!mounted) return;
              log.warn("Autoplay was blocked by the browser - showing play button");
              // Mark retries as exhausted and show play button immediately
              autoplayRetryRef.current.cleanup();
              setShowPlayButton(true);
              setIsLoading(false);
              onAutoplayBlocked?.();
            },
          },
        });

        playerRef.current = player;
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load YouTube player";
        log.error("Failed to initialize YouTube player", err);
        setError(message);
        setIsLoading(false);
        onError?.(0, message);
      }
    };

    initPlayer();

    return () => {
      mounted = false;
      clearTimeUpdateInterval();
      autoplayRetryRef.current.cleanup();
      if (player) {
        try {
          player.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      playerRef.current = null;
      isReadyRef.current = false;
    };
  }, []); // Only run once on mount

  // Style the YouTube iframe to prevent z-index issues
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Watch for iframe being added and style it
    const observer = new MutationObserver(() => {
      const iframe = container.querySelector("iframe");
      if (iframe) {
        iframe.style.position = "relative";
        iframe.style.zIndex = "0";
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    // Also style any existing iframe
    const existingIframe = container.querySelector("iframe");
    if (existingIframe) {
      existingIframe.style.position = "relative";
      existingIframe.style.zIndex = "0";
    }

    return () => observer.disconnect();
  }, []);

  // Handle video ID changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;

    if (videoId !== lastVideoIdRef.current) {
      log.info(`Loading new video: ${videoId}, isPlaying=${isPlaying}, isMuted=${isMuted}`);
      setIsLoading(true);
      setError(null);
      setShowPlayButton(false);
      autoplayRetryRef.current.reset();
      lastVideoIdRef.current = videoId;

      try {
        if (isPlaying) {
          // Mute before loading for autoplay compliance
          player.mute();
          // Mark pending unmute if user doesn't want muted
          if (!isMuted) {
            pendingUnmuteRef.current = true;
            log.info("Marked pendingUnmute=true for new video");
          }
          player.loadVideoById(videoId);
        } else {
          player.cueVideoById(videoId);
        }
      } catch (err) {
        log.error("Failed to load video", err);
        setError("Failed to load video");
        setIsLoading(false);
      }
    }
  }, [videoId, isPlaying, isMuted]);

  // Handle play/pause changes
  useEffect(() => {
    const player = playerRef.current;
    log.info(`Play/pause effect: isPlaying=${isPlaying}, playerRef=${!!player}, isReadyRef=${isReadyRef.current}`);

    if (!player || !isReadyRef.current) {
      log.info("Play/pause effect: player not ready, skipping");
      return;
    }

    try {
      const state = player.getPlayerState();
      log.info(`Play/pause effect: current player state=${state}, isMuted=${isMuted}`);
      if (isPlaying && state !== YouTubePlayerState.PLAYING && state !== YouTubePlayerState.BUFFERING) {
        log.info("Calling playVideo()");
        // Mute before playing for autoplay compliance
        player.mute();
        // Mark pending unmute if user doesn't want muted
        if (!isMuted) {
          pendingUnmuteRef.current = true;
          log.info("Marked pendingUnmute=true for play resume");
        }
        player.playVideo();
      } else if (!isPlaying && state === YouTubePlayerState.PLAYING) {
        log.info("Calling pauseVideo()");
        player.pauseVideo();
      }
    } catch (err) {
      log.error("Play/pause effect error:", err);
    }
  }, [isPlaying, isMuted]);

  // Handle volume changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;

    try {
      if (isMuted) {
        player.mute();
      } else {
        player.unMute();
        player.setVolume(volume * 100);
      }
    } catch {
      // Player might not be ready yet
    }
  }, [volume, isMuted]);

  // Handle seeking
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current || seekTime === null) return;

    try {
      log.debug(`Seeking to ${seekTime}s`);
      player.seekTo(seekTime, true);
      onClearSeek?.();
    } catch {
      // Player might not be ready yet
    }
  }, [seekTime, onClearSeek]);

  // Manual play handler for when autoplay fails
  /**
   * Handle manual play when user clicks the "Click to Play" button.
   * This is triggered after autoplay was blocked by the browser.
   */
  const handleManualPlay = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;

    log.info("Manual play triggered by user click");
    setShowPlayButton(false);
    autoplayRetryRef.current.reset();

    try {
      // User interaction allows unmuted playback
      if (!isMuted) {
        player.unMute();
        player.setVolume(volume * 100);
      }
      player.playVideo();
    } catch (err) {
      log.error("Manual play failed:", err);
    }
  }, [isMuted, volume]);

  return (
    <div className={`relative w-full h-full bg-black ${className || ""}`} style={{ isolation: "isolate", zIndex: 0 }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ pointerEvents: "none", position: "relative", zIndex: 0 }} // Prevent clicks on iframe, contain z-index
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p>Loading...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white p-4">
            <p className="text-red-400 mb-2">Video Error</p>
            <p className="text-sm text-gray-400">{error}</p>
          </div>
        </div>
      )}
      {showPlayButton && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <button
            onClick={handleManualPlay}
            className="flex flex-col items-center gap-4 p-8 rounded-xl bg-black/50 hover:bg-black/70 transition-colors cursor-pointer"
            style={{ pointerEvents: "auto" }}
          >
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
              <span className="text-white text-4xl ml-1">▶</span>
            </div>
            <p className="text-white text-lg">Click to Play</p>
            <p className="text-gray-400 text-sm">Autoplay was blocked by the browser</p>
          </button>
        </div>
      )}
    </div>
  );
}
