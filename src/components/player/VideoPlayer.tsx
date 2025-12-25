import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore, useQueueStore } from "../../stores";
import { youtubeService } from "../../services";
import { useWakeLock } from "../../hooks";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefetchTriggeredRef = useRef<string | null>(null);
  const {
    currentVideo,
    isPlaying,
    isLoading,
    isDetached,
    volume,
    isMuted,
    seekTime,
    setCurrentVideo,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setIsLoading,
    setError,
    clearSeek,
  } = usePlayerStore();

  // Prevent screen from sleeping while playing (only when not detached)
  useWakeLock(isPlaying && !isDetached);

  // Reset prefetch tracking when video changes
  useEffect(() => {
    prefetchTriggeredRef.current = null;
  }, [currentVideo?.id]);

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.play().catch((e) => {
      console.error("Failed to play video:", e);
      setError("Failed to play video");
      setIsPlaying(false);
    });
  }, [setError, setIsPlaying]);

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

    // Prefetch next video 20s before end (or immediately if video <= 20s)
    if (duration > 0) {
      const timeRemaining = duration - currentTime;
      const shouldPrefetch = timeRemaining <= 20 || duration <= 20;

      if (shouldPrefetch) {
        const nextItem = useQueueStore.getState().queue[0];
        const nextVideoId = nextItem?.video.youtubeId;
        if (nextVideoId && prefetchTriggeredRef.current !== nextVideoId) {
          prefetchTriggeredRef.current = nextVideoId;
          youtubeService.getStreamUrl(nextVideoId)
            .then(info => usePlayerStore.getState().setPrefetchedStreamUrl(nextVideoId, info.url))
            .catch(() => {}); // Silent fail - prefetch is opportunistic
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
    // Auto-play when video is ready and isPlaying is true
    if (isPlaying) {
      tryPlay();
    }
  };

  const handleEnded = useCallback(async () => {
    const { playNext } = useQueueStore.getState();
    const nextItem = playNext();

    if (nextItem && nextItem.video.youtubeId) {
      // Play next from queue
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
    } else {
      setIsPlaying(false);
    }
  }, [setCurrentVideo, setIsPlaying, setIsLoading, setError]);

  const handleError = () => {
    setError("Failed to load video");
    setIsLoading(false);
  };

  const handleLoadStart = () => {
    setIsLoading(true);
  };

  if (!currentVideo?.streamUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
        {isLoading ? (
          <div className="text-center text-white">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p>Loading video...</p>
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
    <div className="w-full h-full bg-black rounded-lg overflow-hidden relative">
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
    </div>
  );
}
