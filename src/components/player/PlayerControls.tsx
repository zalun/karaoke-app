import { useRef, useCallback } from "react";
import { usePlayerStore, useQueueStore } from "../../stores";
import { youtubeService } from "../../services";

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
    setCurrentVideo,
    setIsPlaying,
    setIsLoading,
    setError,
    setVolume,
    toggleMute,
    seekTo,
  } = usePlayerStore();

  const { hasNext, hasPrevious, playNext, playPrevious } = useQueueStore();

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
        const streamInfo = await youtubeService.getStreamUrl(prevItem.video.youtubeId);
        setCurrentVideo({
          ...prevItem.video,
          streamUrl: streamInfo.url,
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
        const streamInfo = await youtubeService.getStreamUrl(nextItem.video.youtubeId);
        setCurrentVideo({
          ...nextItem.video,
          streamUrl: streamInfo.url,
        });
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play next:", err);
        setError("Failed to play next video");
        setIsLoading(false);
      }
    }
  }, [playNext, setCurrentVideo, setIsPlaying, setIsLoading, setError]);

  if (!currentVideo) {
    return null;
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-gray-800 p-3 rounded-lg mt-2">
      <div className="flex items-center gap-4">
        {/* Previous */}
        <button
          onClick={handlePrevious}
          disabled={!hasPrevious()}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            hasPrevious()
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
          className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={!hasNext()}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            hasNext()
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
            <span>{formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              onClick={handleSeek}
              className="flex-1 h-2 bg-gray-700 rounded-full cursor-pointer hover:h-3 transition-all"
            >
              <div
                className="h-full bg-blue-500 rounded-full pointer-events-none"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <button
          onClick={toggleMute}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-700 rounded transition-colors"
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
          className="w-20"
        />
      </div>

      {/* Video info */}
      <div className="mt-2 text-sm">
        <p className="font-medium truncate">{currentVideo.title}</p>
        {currentVideo.artist && (
          <p className="text-gray-400 truncate">{currentVideo.artist}</p>
        )}
      </div>
    </div>
  );
}
