import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { createLogger } from "../../services";

const log = createLogger("NativePlayer");

/**
 * Validates that a stream URL is safe to use in a video element.
 * Prevents XSS by ensuring the URL is a valid HTTP(S) URL or Tauri asset URL.
 */
function isValidStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Allow HTTP(S) for remote streams and asset:// for local files (Tauri's convertFileSrc)
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "asset:";
  } catch {
    return false;
  }
}

// Key for localStorage to track if video element has been primed
const VIDEO_PRIMED_KEY = "nativePlayer.videoPrimed";

export interface NativePlayerProps {
  /** Stream URL to play. If empty/undefined, renders video element for priming only. */
  streamUrl?: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekTime: number | null;
  /** Key to force reload even when streamUrl is the same (e.g., replay same video) */
  playbackKey?: string | number;
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: MediaError | null) => void;
  onDurationChange?: (duration: number) => void;
  onClearSeek?: () => void;
  onAutoplayBlocked?: () => void;
  /** Called when video element is primed (user interaction enabled autoplay) */
  onPrimed?: () => void;
  className?: string;
}

/** Ref handle for NativePlayer component */
export interface NativePlayerRef {
  /** Prime the video element for autoplay by triggering a play/pause with user gesture */
  primeVideo: () => void;
}

/**
 * Native HTML5 video player component.
 * Used for playing videos via yt-dlp stream URLs.
 */
export const NativePlayer = forwardRef<NativePlayerRef, NativePlayerProps>(function NativePlayer({
  streamUrl,
  isPlaying,
  volume,
  isMuted,
  seekTime,
  playbackKey,
  onReady,
  onTimeUpdate,
  onEnded,
  onError,
  onDurationChange,
  onClearSeek,
  onAutoplayBlocked,
  onPrimed,
  className,
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPlayButton, setShowPlayButton] = useState(false);
  // Track if video element has been primed for autoplay
  const [isPrimed, setIsPrimed] = useState(() => {
    // Check localStorage to persist priming across page reloads
    return localStorage.getItem(VIDEO_PRIMED_KEY) === "true";
  });
  const shouldPlayOnLoadRef = useRef(false);
  // Track if we're currently loading a new source to prevent play/pause interference
  const isLoadingSourceRef = useRef(false);
  // Track if we need to unmute after muted autoplay succeeds
  const pendingUnmuteRef = useRef(false);
  // Store target volume for unmuting
  const targetVolumeRef = useRef(volume);
  targetVolumeRef.current = volume;
  // Track if user has interacted with this video element
  const hasUserInteractionRef = useRef(isPrimed);

  // Track isPlaying in a ref for source change effect
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Expose primeVideo method via ref for parent components
  useImperativeHandle(ref, () => ({
    primeVideo: () => {
      const video = videoRef.current;
      if (!video) return;

      log.info("Priming video element via ref");

      // User interaction - try to "activate" the video element
      video.muted = true;
      video.play().then(() => {
        video.pause();
        video.currentTime = 0;
        hasUserInteractionRef.current = true;
        setIsPrimed(true);
        localStorage.setItem(VIDEO_PRIMED_KEY, "true");
        log.info("Video element primed successfully");
        onPrimed?.();
      }).catch((e) => {
        // Even if play fails, the user gesture should enable future plays
        hasUserInteractionRef.current = true;
        setIsPrimed(true);
        localStorage.setItem(VIDEO_PRIMED_KEY, "true");
        log.info(`Video priming completed (play failed: ${e.message}), user gesture registered`);
        onPrimed?.();
      });
    },
  }), [onPrimed]);

  // Handle source changes - reload when streamUrl or playbackKey changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // If no streamUrl (dummy mode), don't try to load anything
    if (!streamUrl) {
      setIsLoading(false);
      return;
    }

    log.info(`Source changed (key=${playbackKey}), loading: ${streamUrl.substring(0, 50)}...`);
    isLoadingSourceRef.current = true;
    setIsLoading(true);
    setShowPlayButton(false); // Reset play button for new video
    // Remember if we should auto-play after load
    shouldPlayOnLoadRef.current = isPlayingRef.current;
    // Reset to beginning when replaying same video
    video.currentTime = 0;
    video.load(); // Force reload with new source
  }, [streamUrl, playbackKey]);

  // Try to play video with muted autoplay fallback
  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    log.debug(`tryPlay: readyState=${video.readyState}, paused=${video.paused}, muted=${video.muted}`);

    video.play().catch((e: DOMException) => {
      if (e.name === "NotAllowedError") {
        // Autoplay blocked - try muted autoplay (browsers usually allow this)
        log.info("Autoplay blocked, trying muted autoplay");
        video.muted = true;
        pendingUnmuteRef.current = true;

        video.play().catch((e2: DOMException) => {
          // Even muted autoplay failed
          log.error(`Muted autoplay also failed: ${e2.name} - ${e2.message}`);
          pendingUnmuteRef.current = false;
          // Show play button as last resort
          setShowPlayButton(true);
          onAutoplayBlocked?.();
        });
      } else {
        log.error(`Failed to play video: ${e.name} - ${e.message}`);
      }
    });
  }, [onAutoplayBlocked]);

  // Handle play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Don't interfere while loading a new source - handleCanPlay will handle playback
    if (isLoadingSourceRef.current) {
      log.debug(`Play/pause effect skipped: loading new source`);
      return;
    }

    if (!isPlaying) {
      video.pause();
    } else if (video.readyState >= 3) {
      tryPlay();
    }
    // If isPlaying but video not ready, handleCanPlay will trigger play
  }, [isPlaying, tryPlay]);

  // Handle volume changes
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
    onClearSeek?.();
  }, [seekTime, onClearSeek]);

  // Event handlers
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    onTimeUpdate?.(video.currentTime, video.duration || 0);
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    log.debug(`Video duration: ${video.duration}`);
    onDurationChange?.(video.duration);
  }, [onDurationChange]);

  const handleCanPlay = useCallback(() => {
    log.debug(`handleCanPlay: isPlaying=${isPlaying}, shouldPlayOnLoad=${shouldPlayOnLoadRef.current}`);
    isLoadingSourceRef.current = false;
    setIsLoading(false);
    onReady?.();
    // Auto-play when video is ready and isPlaying is true (or was playing when source changed)
    if (isPlaying || shouldPlayOnLoadRef.current) {
      shouldPlayOnLoadRef.current = false;
      tryPlay();
    }
  }, [isPlaying, tryPlay, onReady]);

  const handleEnded = useCallback(() => {
    log.info("Video ended");
    onEnded?.();
  }, [onEnded]);

  // Unmute after muted autoplay succeeds
  const handlePlaying = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (pendingUnmuteRef.current) {
      log.info("Video playing, unmuting now");
      pendingUnmuteRef.current = false;
      // Restore volume after a small delay to ensure playback is stable
      setTimeout(() => {
        if (videoRef.current && !isMuted) {
          videoRef.current.muted = false;
          videoRef.current.volume = targetVolumeRef.current;
        }
      }, 100);
    }
  }, [isMuted]);

  // Manual play when autoplay is blocked
  const handleManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    log.info("Manual play triggered by user click");
    setShowPlayButton(false);

    // User interaction allows unmuted playback
    video.muted = false;
    video.volume = isMuted ? 0 : volume;
    video.play().catch((e) => {
      log.error(`Manual play failed: ${e.name} - ${e.message}`);
    });
  }, [isMuted, volume]);

  const handleError = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
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

      setIsLoading(false);
      onError?.(mediaError);
    },
    [onError]
  );

  const handleLoadStart = useCallback(() => {
    log.debug(`handleLoadStart called`);
    setIsLoading(true);
  }, []);

  // Validate stream URL for security (skip if no URL - dummy mode)
  const isUrlValid = !streamUrl || isValidStreamUrl(streamUrl);
  const isDummyMode = !streamUrl;

  if (!isUrlValid) {
    log.error(`Invalid stream URL: ${streamUrl}`);
    return (
      <div className={`relative w-full h-full bg-black ${className || ""}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white p-4">
            <p className="text-red-400 mb-2">Invalid Stream URL</p>
            <p className="text-sm text-gray-400">The stream URL is not a valid URL.</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle click on container - acts as user interaction to enable playback
  const handleContainerClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // If video is paused and should be playing, start it
    if (video.paused && isPlaying) {
      log.info("Container clicked, triggering play");
      setShowPlayButton(false);
      video.muted = false;
      video.volume = isMuted ? 0 : volume;
      video.play().catch((e) => {
        log.error(`Click-to-play failed: ${e.name}`);
      });
    }
  }, [isPlaying, isMuted, volume]);

  return (
    <div
      className={`relative w-full h-full bg-black ${className || ""}`}
      onClick={isDummyMode ? undefined : handleContainerClick}
    >
      <video
        ref={videoRef}
        src={streamUrl || undefined}
        className="w-full h-full object-contain"
        onTimeUpdate={isDummyMode ? undefined : handleTimeUpdate}
        onLoadedMetadata={isDummyMode ? undefined : handleLoadedMetadata}
        onCanPlay={isDummyMode ? undefined : handleCanPlay}
        onPlaying={isDummyMode ? undefined : handlePlaying}
        onEnded={isDummyMode ? undefined : handleEnded}
        onError={isDummyMode ? undefined : handleError}
        onLoadStart={isDummyMode ? undefined : handleLoadStart}
        playsInline
      />
      {/* Loading spinner - only show when loading real content */}
      {isLoading && !isDummyMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center text-white">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p>Loading...</p>
          </div>
        </div>
      )}
      {/* Autoplay blocked overlay - show when autoplay fails on real content */}
      {/* z-50 ensures it appears above other overlays like singer overlay */}
      {showPlayButton && !isLoading && !isDummyMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
          <button
            onClick={handleManualPlay}
            className="flex flex-col items-center gap-4 p-8 rounded-xl bg-black/50 hover:bg-black/70 transition-colors cursor-pointer"
          >
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
              <span className="text-white text-4xl ml-1">▶</span>
            </div>
            <p className="text-white text-lg">Click to Play</p>
            <p className="text-gray-400 text-sm">Autoplay was blocked by the browser</p>
            <p className="text-gray-500 text-xs mt-2">Web and local videos require separate activation</p>
          </button>
        </div>
      )}
    </div>
  );
});
