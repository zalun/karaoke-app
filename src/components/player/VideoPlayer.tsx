import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../stores";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    currentVideo,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setIsLoading,
    setError,
  } = usePlayerStore();

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
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isPlaying) {
      video.pause();
    } else if (video.readyState >= 3) {
      // Video is ready, play it
      tryPlay();
    }
    // If isPlaying but video not ready, handleCanPlay will trigger play
  }, [isPlaying, tryPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
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

  const handleEnded = () => {
    setIsPlaying(false);
    // TODO: Trigger queue next
  };

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
        <div className="text-center text-gray-400">
          <p className="text-4xl mb-2">🎤</p>
          <p>Search for a song to start</p>
        </div>
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
