import { useRef, useEffect, useCallback, useState } from "react";
import { createLogger } from "../../services";

const log = createLogger("NativePlayer");

/**
 * Validates that a stream URL is safe to use in a video element.
 * Prevents XSS by ensuring the URL is a valid HTTP(S) URL.
 */
function isValidStreamUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export interface NativePlayerProps {
  streamUrl: string;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  seekTime: number | null;
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: MediaError | null) => void;
  onDurationChange?: (duration: number) => void;
  onClearSeek?: () => void;
  className?: string;
}

/**
 * Native HTML5 video player component.
 * Used for playing videos via yt-dlp stream URLs.
 */
export function NativePlayer({
  streamUrl,
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
  className,
}: NativePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to play video
  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.play().catch((e) => {
      log.error("Failed to play video", e);
    });
  }, []);

  // Handle play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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
    setIsLoading(false);
    onReady?.();
    // Auto-play when video is ready and isPlaying is true
    if (isPlaying) {
      tryPlay();
    }
  }, [isPlaying, tryPlay, onReady]);

  const handleEnded = useCallback(() => {
    log.info("Video ended");
    onEnded?.();
  }, [onEnded]);

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
    setIsLoading(true);
  }, []);

  // Validate stream URL for security
  const isUrlValid = isValidStreamUrl(streamUrl);

  if (!isUrlValid) {
    log.error(`Invalid stream URL: ${streamUrl}`);
    return (
      <div className={`relative w-full h-full bg-black ${className || ""}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white p-4">
            <p className="text-red-400 mb-2">Invalid Stream URL</p>
            <p className="text-sm text-gray-400">The stream URL is not a valid HTTP(S) URL.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full bg-black ${className || ""}`}>
      <video
        ref={videoRef}
        src={streamUrl}
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
          <div className="text-center text-white">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p>Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}
